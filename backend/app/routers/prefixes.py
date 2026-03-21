from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.audit_log import log_action
from app.crud.ip_address import crud_ip_address
from app.crud.ip_prefix import crud_ip_prefix
from app.database import get_db
from app.dependencies import get_current_user, require_admin
from app.schemas.ip_address import IpAddressRead
from app.schemas.ip_prefix import (
    IpPrefixCreate,
    IpPrefixRead,
    IpPrefixUpdate,
    PrefixUtilization,
)
from app.schemas.pagination import PaginatedResponse

router = APIRouter(prefix="/prefixes", tags=["prefixes"])


@router.get("/", response_model=PaginatedResponse[IpPrefixRead])
async def list_prefixes(
    _: Annotated[object, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    site_id: int | None = None,
    page: int = 1,
    size: int = 100,
) -> PaginatedResponse[IpPrefixRead]:
    kwargs = {}
    if site_id is not None:
        kwargs["site_id"] = site_id
    prefixes = await crud_ip_prefix.get_multi(db, skip=(page-1)*size, limit=size, **kwargs)
    _total = await crud_ip_prefix.count(db)
    return PaginatedResponse.build([IpPrefixRead.model_validate(p) for p in prefixes], total=_total, page=page, size=size)


@router.post("/", response_model=IpPrefixRead, status_code=status.HTTP_201_CREATED)
async def create_prefix(
    body: IpPrefixCreate,
    request: Request,
    current_user: Annotated[object, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> IpPrefixRead:
    existing = await crud_ip_prefix.get_by_prefix(db, body.prefix)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Prefix '{body.prefix}' already exists.",
        )
    prefix = await crud_ip_prefix.create(db, body)
    client_ip = getattr(request.state, "client_ip", None)
    await log_action(db, user_id=current_user.id, action="create", entity_table="ip_prefix",
                     entity_id=prefix.id, client_ip=client_ip,
                     description=f"Created prefix '{prefix.prefix}'.")
    return IpPrefixRead.model_validate(prefix)


@router.get("/{prefix_id}", response_model=IpPrefixRead)
async def get_prefix(
    prefix_id: int,
    _: Annotated[object, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> IpPrefixRead:
    prefix = await crud_ip_prefix.get(db, prefix_id)
    if prefix is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Prefix not found.")
    return IpPrefixRead.model_validate(prefix)


@router.patch("/{prefix_id}", response_model=IpPrefixRead)
async def update_prefix(
    prefix_id: int,
    body: IpPrefixUpdate,
    request: Request,
    current_user: Annotated[object, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> IpPrefixRead:
    prefix = await crud_ip_prefix.get(db, prefix_id)
    if prefix is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Prefix not found.")
    updated = await crud_ip_prefix.update(db, prefix, body)
    client_ip = getattr(request.state, "client_ip", None)
    await log_action(db, user_id=current_user.id, action="update", entity_table="ip_prefix",
                     entity_id=updated.id, client_ip=client_ip,
                     description=f"Updated prefix '{updated.prefix}'.")
    return IpPrefixRead.model_validate(updated)


@router.delete("/{prefix_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_prefix(
    prefix_id: int,
    request: Request,
    current_user: Annotated[object, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    prefix = await crud_ip_prefix.get(db, prefix_id)
    if prefix is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Prefix not found.")
    client_ip = getattr(request.state, "client_ip", None)
    await log_action(db, user_id=current_user.id, action="delete", entity_table="ip_prefix",
                     entity_id=prefix_id, client_ip=client_ip,
                     description=f"Deleted prefix '{prefix.prefix}'.")
    await crud_ip_prefix.remove(db, prefix_id)


@router.get("/{prefix_id}/utilization", response_model=PrefixUtilization)
async def get_prefix_utilization(
    prefix_id: int,
    _: Annotated[object, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PrefixUtilization:
    util = await crud_ip_prefix.get_utilization(db, prefix_id)
    if util is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Prefix not found.")
    return util


@router.get("/{prefix_id}/available-ips", response_model=list[str])
async def get_available_ips(
    prefix_id: int,
    _: Annotated[object, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    size: int = 100,
) -> PaginatedResponse[str]:
    prefix = await crud_ip_prefix.get(db, prefix_id)
    if prefix is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Prefix not found.")
    return await crud_ip_prefix.get_available_ips(db, prefix_id, limit=limit)


@router.get("/{prefix_id}/ip-addresses", response_model=list[IpAddressRead])
async def get_prefix_ip_addresses(
    prefix_id: int,
    _: Annotated[object, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    page: int = 1,
    size: int = 100,
) -> PaginatedResponse[IpAddressRead]:
    prefix = await crud_ip_prefix.get(db, prefix_id)
    if prefix is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Prefix not found.")
    ips = await crud_ip_address.get_by_prefix(db, prefix_id, skip=skip, limit=limit)
    return [IpAddressRead.model_validate(ip) for ip in ips]
