from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.audit_log import log_action
from app.database import get_db
from app.dependencies import get_current_user, require_admin
from app.models.scheduled_scan import ScheduledScan
from app.models.scan_job import ScanType

router = APIRouter(prefix="/scheduled-scans", tags=["scheduled-scans"])


class ScheduledScanCreate(BaseModel):
    device_id: int
    cron_expression: str
    scan_type: ScanType
    enabled: bool = True


class ScheduledScanUpdate(BaseModel):
    cron_expression: Optional[str] = None
    scan_type: Optional[ScanType] = None
    enabled: Optional[bool] = None


class ScheduledScanRead(BaseModel):
    id: int
    device_id: int
    scan_type: str
    cron_expression: str
    enabled: bool
    last_run: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


@router.get("/", response_model=list[ScheduledScanRead])
async def list_scheduled_scans(
    device_id: Optional[int] = None,
    enabled: Optional[bool] = None,
    _: Annotated[object, Depends(get_current_user)] = None,
    db: Annotated[AsyncSession, Depends(get_db)] = None,
) -> list[ScheduledScanRead]:
    stmt = select(ScheduledScan)
    if device_id is not None:
        stmt = stmt.where(ScheduledScan.device_id == device_id)
    if enabled is not None:
        stmt = stmt.where(ScheduledScan.enabled == enabled)
    result = await db.execute(stmt)
    scans = result.scalars().all()
    return [ScheduledScanRead.model_validate(s) for s in scans]


@router.post("/", response_model=ScheduledScanRead, status_code=status.HTTP_201_CREATED)
async def create_scheduled_scan(
    body: ScheduledScanCreate,
    request: Request,
    current_user: Annotated[object, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ScheduledScanRead:
    from app.models.device import Device
    device_result = await db.execute(
        select(Device).where(Device.id == body.device_id)
    )
    device = device_result.scalar_one_or_none()
    if device is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found.")

    scheduled = ScheduledScan(
        device_id=body.device_id,
        scan_type=body.scan_type.value,
        cron_expression=body.cron_expression,
        enabled=body.enabled,
    )
    db.add(scheduled)
    await db.flush()
    await db.refresh(scheduled)

    client_ip = getattr(request.state, "client_ip", None)
    await log_action(db, user_id=current_user.id, action="create", entity_table="scheduled_scan",
                     entity_id=scheduled.id, client_ip=client_ip,
                     description=f"Created scheduled scan for device {body.device_id}.")
    return ScheduledScanRead.model_validate(scheduled)


@router.get("/{scan_id}", response_model=ScheduledScanRead)
async def get_scheduled_scan(
    scan_id: int,
    _: Annotated[object, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ScheduledScanRead:
    result = await db.execute(
        select(ScheduledScan).where(ScheduledScan.id == scan_id)
    )
    scheduled = result.scalar_one_or_none()
    if scheduled is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scheduled scan not found.")
    return ScheduledScanRead.model_validate(scheduled)


@router.patch("/{scan_id}", response_model=ScheduledScanRead)
async def update_scheduled_scan(
    scan_id: int,
    body: ScheduledScanUpdate,
    request: Request,
    current_user: Annotated[object, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ScheduledScanRead:
    result = await db.execute(
        select(ScheduledScan).where(ScheduledScan.id == scan_id)
    )
    scheduled = result.scalar_one_or_none()
    if scheduled is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scheduled scan not found.")

    update_data = body.model_dump(exclude_unset=True)
    if "scan_type" in update_data and update_data["scan_type"] is not None:
        update_data["scan_type"] = update_data["scan_type"].value
    for field, value in update_data.items():
        setattr(scheduled, field, value)
    db.add(scheduled)
    await db.flush()
    await db.refresh(scheduled)

    client_ip = getattr(request.state, "client_ip", None)
    await log_action(db, user_id=current_user.id, action="update", entity_table="scheduled_scan",
                     entity_id=scan_id, client_ip=client_ip,
                     description=f"Updated scheduled scan {scan_id}.")
    return ScheduledScanRead.model_validate(scheduled)


@router.delete("/{scan_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_scheduled_scan(
    scan_id: int,
    request: Request,
    current_user: Annotated[object, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    result = await db.execute(
        select(ScheduledScan).where(ScheduledScan.id == scan_id)
    )
    scheduled = result.scalar_one_or_none()
    if scheduled is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scheduled scan not found.")

    client_ip = getattr(request.state, "client_ip", None)
    await log_action(db, user_id=current_user.id, action="delete", entity_table="scheduled_scan",
                     entity_id=scan_id, client_ip=client_ip,
                     description=f"Deleted scheduled scan {scan_id}.")
    await db.delete(scheduled)
    await db.flush()
