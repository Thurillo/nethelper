from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.audit_log import log_action
from app.crud.vendor import crud_vendor
from app.database import get_db
from app.dependencies import get_current_user, require_admin
from app.schemas.vendor import VendorCreate, VendorRead, VendorUpdate
from app.schemas.pagination import PaginatedResponse

router = APIRouter(prefix="/vendors", tags=["vendors"])


def _to_read(vendor) -> VendorRead:
    return VendorRead(
        id=vendor.id,
        name=vendor.name,
        slug=vendor.slug,
        snmp_default_community=vendor.snmp_default_community,
        snmp_default_version=vendor.snmp_default_version,
        ssh_default_username=vendor.ssh_default_username,
        has_password=vendor.ssh_default_password_enc is not None,
        ssh_default_port=vendor.ssh_default_port,
        driver_class=vendor.driver_class,
        notes=vendor.notes,
    )


@router.get("/", response_model=PaginatedResponse[VendorRead])
async def list_vendors(
    _: Annotated[object, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    page: int = 1,
    size: int = 100,
) -> PaginatedResponse[VendorRead]:
    skip = (page - 1) * size
    vendors = await crud_vendor.get_multi(db, skip=skip, limit=size)
    total = await crud_vendor.count(db)
    return PaginatedResponse.build([_to_read(v) for v in vendors], total=total, page=page, size=size)


@router.post("/", response_model=VendorRead, status_code=status.HTTP_201_CREATED)
async def create_vendor(
    body: VendorCreate,
    request: Request,
    current_user: Annotated[object, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> VendorRead:
    existing = await crud_vendor.get_by_slug(db, body.slug)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Vendor with slug '{body.slug}' already exists.",
        )
    vendor = await crud_vendor.create(db, body)
    client_ip = getattr(request.state, "client_ip", None)
    await log_action(db, user_id=current_user.id, action="create", entity_table="vendor",
                     entity_id=vendor.id, client_ip=client_ip,
                     description=f"Created vendor '{vendor.name}'.")
    return _to_read(vendor)


@router.get("/{vendor_id}", response_model=VendorRead)
async def get_vendor(
    vendor_id: int,
    _: Annotated[object, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> VendorRead:
    vendor = await crud_vendor.get(db, vendor_id)
    if vendor is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor not found.")
    return _to_read(vendor)


@router.patch("/{vendor_id}", response_model=VendorRead)
async def update_vendor(
    vendor_id: int,
    body: VendorUpdate,
    request: Request,
    current_user: Annotated[object, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> VendorRead:
    vendor = await crud_vendor.get(db, vendor_id)
    if vendor is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor not found.")
    updated = await crud_vendor.update(db, vendor, body)
    client_ip = getattr(request.state, "client_ip", None)
    await log_action(db, user_id=current_user.id, action="update", entity_table="vendor",
                     entity_id=updated.id, client_ip=client_ip,
                     description=f"Updated vendor '{updated.name}'.")
    return _to_read(updated)


@router.delete("/{vendor_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_vendor(
    vendor_id: int,
    request: Request,
    current_user: Annotated[object, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    vendor = await crud_vendor.get(db, vendor_id)
    if vendor is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor not found.")
    client_ip = getattr(request.state, "client_ip", None)
    await log_action(db, user_id=current_user.id, action="delete", entity_table="vendor",
                     entity_id=vendor_id, client_ip=client_ip,
                     description=f"Deleted vendor '{vendor.name}'.")
    await crud_vendor.remove(db, vendor_id)
