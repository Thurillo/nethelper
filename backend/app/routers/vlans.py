from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.audit_log import log_action
from app.crud.ip_prefix import crud_ip_prefix
from app.crud.vlan import crud_vlan
from app.database import get_db
from app.dependencies import get_current_user, require_admin
from app.schemas.interface import InterfaceRead
from app.schemas.ip_prefix import IpPrefixRead
from app.schemas.vlan import VlanCreate, VlanRead, VlanUpdate

router = APIRouter(prefix="/vlans", tags=["vlans"])


@router.get("/", response_model=list[VlanRead])
async def list_vlans(
    site_id: int | None = None,
    skip: int = 0,
    limit: int = 200,
    _: Annotated[object, Depends(get_current_user)] = None,
    db: Annotated[AsyncSession, Depends(get_db)] = None,
) -> list[VlanRead]:
    kwargs = {}
    if site_id is not None:
        kwargs["site_id"] = site_id
    vlans = await crud_vlan.get_multi(db, skip=skip, limit=limit, **kwargs)
    return [VlanRead.model_validate(v) for v in vlans]


@router.post("/", response_model=VlanRead, status_code=status.HTTP_201_CREATED)
async def create_vlan(
    body: VlanCreate,
    request: Request,
    current_user: Annotated[object, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> VlanRead:
    existing = await crud_vlan.get_by_vid(db, body.vid, body.site_id)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"VLAN {body.vid} already exists for this site.",
        )
    vlan = await crud_vlan.create(db, body)
    client_ip = getattr(request.state, "client_ip", None)
    await log_action(db, user_id=current_user.id, action="create", entity_table="vlan",
                     entity_id=vlan.id, client_ip=client_ip,
                     description=f"Created VLAN {vlan.vid} '{vlan.name}'.")
    return VlanRead.model_validate(vlan)


@router.get("/{vlan_id}", response_model=VlanRead)
async def get_vlan(
    vlan_id: int,
    _: Annotated[object, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> VlanRead:
    vlan = await crud_vlan.get(db, vlan_id)
    if vlan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="VLAN not found.")
    return VlanRead.model_validate(vlan)


@router.patch("/{vlan_id}", response_model=VlanRead)
async def update_vlan(
    vlan_id: int,
    body: VlanUpdate,
    request: Request,
    current_user: Annotated[object, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> VlanRead:
    vlan = await crud_vlan.get(db, vlan_id)
    if vlan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="VLAN not found.")
    updated = await crud_vlan.update(db, vlan, body)
    client_ip = getattr(request.state, "client_ip", None)
    await log_action(db, user_id=current_user.id, action="update", entity_table="vlan",
                     entity_id=updated.id, client_ip=client_ip,
                     description=f"Updated VLAN {updated.vid}.")
    return VlanRead.model_validate(updated)


@router.delete("/{vlan_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_vlan(
    vlan_id: int,
    request: Request,
    current_user: Annotated[object, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    vlan = await crud_vlan.get(db, vlan_id)
    if vlan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="VLAN not found.")
    client_ip = getattr(request.state, "client_ip", None)
    await log_action(db, user_id=current_user.id, action="delete", entity_table="vlan",
                     entity_id=vlan_id, client_ip=client_ip,
                     description=f"Deleted VLAN {vlan.vid}.")
    await crud_vlan.remove(db, vlan_id)


@router.get("/{vlan_id}/interfaces", response_model=list[InterfaceRead])
async def get_vlan_interfaces(
    vlan_id: int,
    _: Annotated[object, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[InterfaceRead]:
    from app.crud.interface import crud_interface
    from sqlalchemy import select
    from app.models.interface import Interface

    vlan = await crud_vlan.get(db, vlan_id)
    if vlan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="VLAN not found.")
    result = await db.execute(
        select(Interface).where(Interface.vlan_id == vlan_id)
    )
    interfaces = result.scalars().all()
    return [InterfaceRead.model_validate(i) for i in interfaces]


@router.get("/{vlan_id}/prefixes", response_model=list[IpPrefixRead])
async def get_vlan_prefixes(
    vlan_id: int,
    _: Annotated[object, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[IpPrefixRead]:
    from sqlalchemy import select
    from app.models.ip_prefix import IpPrefix

    vlan = await crud_vlan.get(db, vlan_id)
    if vlan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="VLAN not found.")
    result = await db.execute(
        select(IpPrefix).where(IpPrefix.vlan_id == vlan_id)
    )
    prefixes = result.scalars().all()
    return [IpPrefixRead.model_validate(p) for p in prefixes]
