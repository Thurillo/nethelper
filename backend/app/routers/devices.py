from __future__ import annotations

from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.audit_log import log_action
from app.crud.device import crud_device
from app.crud.interface import crud_interface
from app.crud.ip_address import crud_ip_address
from app.crud.mac_entry import crud_mac_entry
from app.crud.scan_job import crud_scan_job
from app.database import get_db
from app.dependencies import get_current_user, require_admin
from app.models.scan_job import ScanStatus
from app.schemas.device import DeviceCreate, DeviceRead, DeviceScanRequest, DeviceUpdate
from app.schemas.interface import InterfaceRead
from app.schemas.ip_address import IpAddressRead
from app.schemas.mac_entry import MacEntryRead
from app.schemas.scan_job import ScanJobCreate, ScanJobRead

router = APIRouter(prefix="/devices", tags=["devices"])


@router.get("/", response_model=list[DeviceRead])
async def list_devices(
    skip: int = 0,
    limit: int = 100,
    site_id: Optional[int] = None,
    cabinet_id: Optional[int] = None,
    device_type: Optional[str] = None,
    status_filter: Optional[str] = None,
    q: Optional[str] = None,
    _: Annotated[object, Depends(get_current_user)] = None,
    db: Annotated[AsyncSession, Depends(get_db)] = None,
) -> list[DeviceRead]:
    devices = await crud_device.search(
        db,
        skip=skip,
        limit=limit,
        site_id=site_id,
        cabinet_id=cabinet_id,
        device_type=device_type,
        status=status_filter,
        q=q,
    )
    return [DeviceRead.model_validate(d) for d in devices]


@router.post("/", response_model=DeviceRead, status_code=status.HTTP_201_CREATED)
async def create_device(
    body: DeviceCreate,
    request: Request,
    current_user: Annotated[object, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> DeviceRead:
    device = await crud_device.create(db, body)
    client_ip = getattr(request.state, "client_ip", None)
    await log_action(db, user_id=current_user.id, action="create", entity_table="device",
                     entity_id=device.id, client_ip=client_ip,
                     description=f"Created device '{device.name}'.")
    return DeviceRead.model_validate(device)


@router.get("/{device_id}", response_model=DeviceRead)
async def get_device(
    device_id: int,
    _: Annotated[object, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> DeviceRead:
    device = await crud_device.get(db, device_id)
    if device is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found.")
    return DeviceRead.model_validate(device)


@router.patch("/{device_id}", response_model=DeviceRead)
async def update_device(
    device_id: int,
    body: DeviceUpdate,
    request: Request,
    current_user: Annotated[object, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> DeviceRead:
    device = await crud_device.get(db, device_id)
    if device is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found.")
    updated = await crud_device.update(db, device, body)
    client_ip = getattr(request.state, "client_ip", None)
    await log_action(db, user_id=current_user.id, action="update", entity_table="device",
                     entity_id=updated.id, client_ip=client_ip,
                     description=f"Updated device '{updated.name}'.")
    return DeviceRead.model_validate(updated)


@router.delete("/{device_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_device(
    device_id: int,
    request: Request,
    current_user: Annotated[object, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    device = await crud_device.get(db, device_id)
    if device is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found.")
    client_ip = getattr(request.state, "client_ip", None)
    await log_action(db, user_id=current_user.id, action="delete", entity_table="device",
                     entity_id=device_id, client_ip=client_ip,
                     description=f"Deleted device '{device.name}'.")
    await crud_device.remove(db, device_id)


@router.get("/{device_id}/interfaces", response_model=list[InterfaceRead])
async def get_device_interfaces(
    device_id: int,
    _: Annotated[object, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[InterfaceRead]:
    device = await crud_device.get(db, device_id)
    if device is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found.")
    interfaces = await crud_interface.get_by_device(db, device_id)
    return [InterfaceRead.model_validate(i) for i in interfaces]


@router.get("/{device_id}/ip-addresses", response_model=list[IpAddressRead])
async def get_device_ip_addresses(
    device_id: int,
    _: Annotated[object, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[IpAddressRead]:
    device = await crud_device.get(db, device_id)
    if device is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found.")
    ips = await crud_ip_address.get_by_device(db, device_id)
    return [IpAddressRead.model_validate(ip) for ip in ips]


@router.get("/{device_id}/mac-entries", response_model=list[MacEntryRead])
async def get_device_mac_entries(
    device_id: int,
    _: Annotated[object, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[MacEntryRead]:
    device = await crud_device.get(db, device_id)
    if device is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found.")
    entries = await crud_mac_entry.get_by_device(db, device_id)
    return [MacEntryRead.model_validate(e) for e in entries]


@router.get("/{device_id}/scan-jobs", response_model=list[ScanJobRead])
async def get_device_scan_jobs(
    device_id: int,
    skip: int = 0,
    limit: int = 20,
    _: Annotated[object, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[ScanJobRead]:
    device = await crud_device.get(db, device_id)
    if device is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found.")
    jobs = await crud_scan_job.get_by_device(db, device_id, skip=skip, limit=limit)
    return [ScanJobRead.model_validate(j) for j in jobs]


@router.post("/{device_id}/scan", response_model=ScanJobRead, status_code=status.HTTP_202_ACCEPTED)
async def trigger_device_scan(
    device_id: int,
    body: DeviceScanRequest,
    request: Request,
    current_user: Annotated[object, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ScanJobRead:
    device = await crud_device.get(db, device_id)
    if device is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found.")

    job_in = ScanJobCreate(
        device_id=device_id,
        scan_type=body.scan_type,
        triggered_by_user_id=current_user.id,
        is_scheduled=False,
    )
    job = await crud_scan_job.create_job(db, job_in)

    # Trigger Celery task
    try:
        from app.tasks.scan_tasks import run_device_scan
        task = run_device_scan.delay(device_id, job.id, body.scan_type.value)
        await crud_scan_job.update_status(
            db, job.id, ScanStatus.running, celery_task_id=task.id
        )
    except Exception as exc:
        await crud_scan_job.update_status(
            db, job.id, ScanStatus.failed, error_message=str(exc)
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to enqueue scan task: {exc}",
        )

    client_ip = getattr(request.state, "client_ip", None)
    await log_action(db, user_id=current_user.id, action="scan", entity_table="device",
                     entity_id=device_id, client_ip=client_ip,
                     description=f"Triggered {body.scan_type.value} scan on '{device.name}'.")

    await db.refresh(job)
    return ScanJobRead.model_validate(job)
