from __future__ import annotations

from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.crud.audit_log import log_action
from app.crud.ip_address import crud_ip_address
from app.database import get_db
from app.dependencies import get_current_user, require_admin
from app.models.device import Device
from app.models.ip_address import IpAddress
from app.schemas.ip_address import IpAddressCreate, IpAddressRead, IpAddressUpdate
from app.schemas.pagination import PaginatedResponse

router = APIRouter(prefix="/ip-addresses", tags=["ip-addresses"])


@router.get("/", response_model=PaginatedResponse[IpAddressRead])
async def list_ip_addresses(
    _: Annotated[object, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    device_id: Optional[int] = None,
    interface_id: Optional[int] = None,
    prefix_id: Optional[int] = None,
    page: int = 1,
    size: int = 100,
) -> PaginatedResponse[IpAddressRead]:
    opts = [
        selectinload(IpAddress.device).selectinload(Device.vendor),
        selectinload(IpAddress.device).selectinload(Device.site),
    ]
    if device_id is not None:
        result = await db.execute(
            select(IpAddress).options(*opts).where(IpAddress.device_id == device_id)
        )
        ips = list(result.scalars().all())
    elif interface_id is not None:
        result = await db.execute(
            select(IpAddress).options(*opts).where(IpAddress.interface_id == interface_id)
        )
        ips = list(result.scalars().all())
    elif prefix_id is not None:
        ips = await crud_ip_address.get_by_prefix(db, prefix_id, skip=(page - 1) * size, limit=size)
    else:
        result = await db.execute(
            select(IpAddress).options(*opts).order_by(IpAddress.id).offset((page - 1) * size).limit(size)
        )
        ips = list(result.scalars().all())
    _total = await crud_ip_address.count(db)
    return PaginatedResponse.build([IpAddressRead.model_validate(ip) for ip in ips], total=_total, page=page, size=size)


@router.post("/", response_model=IpAddressRead, status_code=status.HTTP_201_CREATED)
async def create_ip_address(
    body: IpAddressCreate,
    request: Request,
    current_user: Annotated[object, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> IpAddressRead:
    ip = await crud_ip_address.create(db, body)
    client_ip = getattr(request.state, "client_ip", None)
    await log_action(db, user_id=current_user.id, action="create", entity_table="ip_address",
                     entity_id=ip.id, client_ip=client_ip,
                     description=f"Created IP address '{ip.address}'.")
    # Reload with selectinload to avoid MissingGreenlet on device relationship
    result = await db.execute(
        select(IpAddress)
        .options(
            selectinload(IpAddress.device).selectinload(Device.vendor),
            selectinload(IpAddress.device).selectinload(Device.site),
        )
        .where(IpAddress.id == ip.id)
    )
    return IpAddressRead.model_validate(result.scalar_one())


@router.get("/{ip_id}", response_model=IpAddressRead)
async def get_ip_address(
    ip_id: int,
    _: Annotated[object, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> IpAddressRead:
    result = await db.execute(
        select(IpAddress)
        .options(
            selectinload(IpAddress.device).selectinload(Device.vendor),
            selectinload(IpAddress.device).selectinload(Device.site),
        )
        .where(IpAddress.id == ip_id)
    )
    ip = result.scalar_one_or_none()
    if ip is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="IP address not found.")
    return IpAddressRead.model_validate(ip)


@router.patch("/{ip_id}", response_model=IpAddressRead)
async def update_ip_address(
    ip_id: int,
    body: IpAddressUpdate,
    request: Request,
    current_user: Annotated[object, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> IpAddressRead:
    ip = await crud_ip_address.get(db, ip_id)
    if ip is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="IP address not found.")
    updated = await crud_ip_address.update(db, ip, body)
    client_ip = getattr(request.state, "client_ip", None)
    await log_action(db, user_id=current_user.id, action="update", entity_table="ip_address",
                     entity_id=updated.id, client_ip=client_ip,
                     description=f"Updated IP address '{updated.address}'.")
    # Reload with selectinload to avoid MissingGreenlet on device relationship
    result = await db.execute(
        select(IpAddress)
        .options(
            selectinload(IpAddress.device).selectinload(Device.vendor),
            selectinload(IpAddress.device).selectinload(Device.site),
        )
        .where(IpAddress.id == ip_id)
    )
    ip_reloaded = result.scalar_one()
    return IpAddressRead.model_validate(ip_reloaded)


@router.delete("/{ip_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_ip_address(
    ip_id: int,
    request: Request,
    current_user: Annotated[object, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    ip = await crud_ip_address.get(db, ip_id)
    if ip is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="IP address not found.")
    client_ip = getattr(request.state, "client_ip", None)
    await log_action(db, user_id=current_user.id, action="delete", entity_table="ip_address",
                     entity_id=ip_id, client_ip=client_ip,
                     description=f"Deleted IP address '{ip.address}'.")
    await crud_ip_address.remove(db, ip_id)
