from __future__ import annotations

import asyncio
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.audit_log import log_action
from app.crud.scan_job import crud_scan_job
from app.database import get_db
from app.dependencies import get_current_user, require_admin
from app.models.scan_job import ScanStatus
from app.schemas.scan_job import IpRangeScanRequest, ScanJobCreate, ScanJobRead
from app.schemas.pagination import PaginatedResponse

router = APIRouter(prefix="/scan-jobs", tags=["scan-jobs"])


@router.get("/", response_model=PaginatedResponse[ScanJobRead])
async def list_scan_jobs(
    _: Annotated[object, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    device_id: Optional[int] = None,
    status_filter: Optional[str] = None,
    scan_type: Optional[str] = None,
    page: int = 1,
    size: int = 100,
) -> PaginatedResponse[ScanJobRead]:
    jobs = await crud_scan_job.get_multi_filtered(
        db,
        skip=(page-1)*size,
        limit=size,
        device_id=device_id,
        status=status_filter,
        scan_type=scan_type,
    )
    _total = await crud_scan_job.count(db)
    return PaginatedResponse.build([ScanJobRead.model_validate(j) for j in jobs], total=_total, page=page, size=size)


@router.get("/{job_id}", response_model=ScanJobRead)
async def get_scan_job(
    job_id: int,
    _: Annotated[object, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ScanJobRead:
    job = await crud_scan_job.get(db, job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scan job not found.")
    return ScanJobRead.model_validate(job)


@router.post("/ip-range", response_model=ScanJobRead, status_code=status.HTTP_202_ACCEPTED)
async def start_ip_range_scan(
    body: IpRangeScanRequest,
    request: Request,
    current_user: Annotated[object, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ScanJobRead:
    from app.models.scan_job import ScanType

    job_in = ScanJobCreate(
        scan_type=ScanType.ip_range,
        range_start_ip=body.start_ip,
        range_end_ip=body.end_ip,
        range_ports=body.ports,
        triggered_by_user_id=current_user.id,
        is_scheduled=False,
    )
    job = await crud_scan_job.create_job(db, job_in)

    try:
        from app.tasks.scan_tasks import run_ip_range_scan
        task = run_ip_range_scan.delay(job.id)
        await crud_scan_job.update_status(
            db, job.id, ScanStatus.running, celery_task_id=task.id
        )
    except Exception as exc:
        await crud_scan_job.update_status(
            db, job.id, ScanStatus.failed, error_message=str(exc)
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to enqueue scan: {exc}",
        )

    client_ip = getattr(request.state, "client_ip", None)
    await log_action(
        db,
        user_id=current_user.id,
        action="ip_range_scan",
        client_ip=client_ip,
        description=f"IP range scan {body.start_ip} - {body.end_ip}.",
    )

    await db.refresh(job)
    return ScanJobRead.model_validate(job)


@router.post("/{job_id}/cancel", response_model=ScanJobRead)
async def cancel_scan_job(
    job_id: int,
    request: Request,
    current_user: Annotated[object, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ScanJobRead:
    job = await crud_scan_job.get(db, job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scan job not found.")

    if job.status not in (ScanStatus.pending, ScanStatus.running):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot cancel job in status '{job.status.value}'.",
        )

    # Revoke celery task if possible
    if job.celery_task_id:
        try:
            from app.tasks.celery_app import celery_app
            celery_app.control.revoke(job.celery_task_id, terminate=True)
        except Exception:
            pass

    updated = await crud_scan_job.update_status(db, job_id, ScanStatus.cancelled)
    client_ip = getattr(request.state, "client_ip", None)
    await log_action(db, user_id=current_user.id, action="cancel", entity_table="scan_job",
                     entity_id=job_id, client_ip=client_ip,
                     description=f"Cancelled scan job {job_id}.")
    return ScanJobRead.model_validate(updated)


@router.get("/{job_id}/events")
async def stream_scan_job_logs(
    job_id: int,
    _: Annotated[object, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Stream scan job log_output as Server-Sent Events."""
    from sse_starlette.sse import EventSourceResponse

    job = await crud_scan_job.get(db, job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scan job not found.")

    async def event_generator():
        last_pos = 0
        poll_interval = 1.0
        max_polls = 300  # 5 minutes max

        for _ in range(max_polls):
            # Re-fetch job from DB to get latest log_output
            from app.database import AsyncSessionLocal
            async with AsyncSessionLocal() as session:
                from sqlalchemy import select
                from app.models.scan_job import ScanJob
                result = await session.execute(
                    select(ScanJob).where(ScanJob.id == job_id)
                )
                current_job = result.scalar_one_or_none()

            if current_job is None:
                break

            log = current_job.log_output or ""
            if len(log) > last_pos:
                new_data = log[last_pos:]
                last_pos = len(log)
                for line in new_data.splitlines():
                    yield {"data": line}

            if current_job.status in (
                ScanStatus.completed,
                ScanStatus.failed,
                ScanStatus.cancelled,
            ):
                yield {"event": "done", "data": current_job.status.value}
                break

            await asyncio.sleep(poll_interval)

    return EventSourceResponse(event_generator())
