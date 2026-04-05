from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.audit_log import log_action
from app.crud.cable import crud_cable
from app.database import get_db
from app.dependencies import get_current_user, require_admin
from app.models.cable import Cable
from app.schemas.cable import CableCreate, CableRead, CableUpdate, InterfaceMinimal
from app.schemas.pagination import PaginatedResponse

router = APIRouter(prefix="/cables", tags=["cables"])


async def _enrich_cable(db: AsyncSession, cable: Cable) -> CableRead:
    """Load interface+device info and return enriched CableRead."""
    from app.models.interface import Interface
    from app.models.device import Device

    iface_a = None
    iface_b = None

    if cable.interface_a_id:
        res_a = await db.execute(
            select(Interface, Device)
            .join(Device, Interface.device_id == Device.id)
            .where(Interface.id == cable.interface_a_id)
        )
        row_a = res_a.first()
        if row_a:
            iface_a = InterfaceMinimal(
                id=row_a.Interface.id,
                name=row_a.Interface.name,
                label=row_a.Interface.label,
                device_id=row_a.Device.id,
                device_name=row_a.Device.name,
            )

    if cable.interface_b_id:
        res_b = await db.execute(
            select(Interface, Device)
            .join(Device, Interface.device_id == Device.id)
            .where(Interface.id == cable.interface_b_id)
        )
        row_b = res_b.first()
        if row_b:
            iface_b = InterfaceMinimal(
                id=row_b.Interface.id,
                name=row_b.Interface.name,
                label=row_b.Interface.label,
                device_id=row_b.Device.id,
                device_name=row_b.Device.name,
            )

    return CableRead(
        id=cable.id,
        interface_a_id=cable.interface_a_id,
        interface_b_id=cable.interface_b_id,
        cable_type=cable.cable_type,
        label=cable.label,
        length_m=cable.length_m,
        color=cable.color,
        notes=cable.notes,
        interface_a=iface_a,
        interface_b=iface_b,
    )


@router.get("/", response_model=PaginatedResponse[CableRead])
async def list_cables(
    _: Annotated[object, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    page: int = 1,
    size: int = 100,
) -> PaginatedResponse[CableRead]:
    cables = await crud_cable.get_multi(db, skip=(page-1)*size, limit=size)
    _total = await crud_cable.count(db)
    return PaginatedResponse.build([await _enrich_cable(db, c) for c in cables], total=_total, page=page, size=size)


@router.post("/", response_model=CableRead, status_code=status.HTTP_201_CREATED)
async def create_cable(
    body: CableCreate,
    request: Request,
    current_user: Annotated[object, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CableRead:
    if body.interface_a_id == body.interface_b_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Both ends of a cable must be different interfaces.",
        )
    # Check that neither interface is already connected to any other cable
    from app.models.interface import Interface as IfaceModel
    from sqlalchemy import or_
    existing = await db.execute(
        select(Cable).where(
            or_(
                Cable.interface_a_id == body.interface_a_id,
                Cable.interface_b_id == body.interface_a_id,
                Cable.interface_a_id == body.interface_b_id,
                Cable.interface_b_id == body.interface_b_id,
            )
        )
    )
    conflict = existing.scalars().first()
    if conflict:
        # Find which interface is the conflict
        busy_ids = {conflict.interface_a_id, conflict.interface_b_id}
        req_ids  = {body.interface_a_id, body.interface_b_id}
        occupied = busy_ids & req_ids
        iface_id = next(iter(occupied))
        res = await db.execute(
            select(IfaceModel).where(IfaceModel.id == iface_id)
        )
        iface = res.scalar_one_or_none()
        name = iface.name if iface else f"id={iface_id}"
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Interfaccia '{name}' è già collegata a un altro cavo.",
        )
    cable = await crud_cable.create(db, body)
    client_ip = getattr(request.state, "client_ip", None)
    await log_action(db, user_id=current_user.id, action="create", entity_table="cable",
                     entity_id=cable.id, client_ip=client_ip,
                     description=f"Created cable between interfaces {cable.interface_a_id} and {cable.interface_b_id}.")
    return await _enrich_cable(db, cable)


@router.get("/{cable_id}", response_model=CableRead)
async def get_cable(
    cable_id: int,
    _: Annotated[object, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CableRead:
    cable = await crud_cable.get(db, cable_id)
    if cable is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cable not found.")
    return await _enrich_cable(db, cable)


@router.patch("/{cable_id}", response_model=CableRead)
async def update_cable(
    cable_id: int,
    body: CableUpdate,
    request: Request,
    current_user: Annotated[object, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CableRead:
    cable = await crud_cable.get(db, cable_id)
    if cable is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cable not found.")
    updated = await crud_cable.update(db, cable, body)
    client_ip = getattr(request.state, "client_ip", None)
    await log_action(db, user_id=current_user.id, action="update", entity_table="cable",
                     entity_id=updated.id, client_ip=client_ip,
                     description=f"Updated cable {updated.id}.")
    return await _enrich_cable(db, updated)


@router.delete("/{cable_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_cable(
    cable_id: int,
    request: Request,
    current_user: Annotated[object, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    cable = await crud_cable.get(db, cable_id)
    if cable is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cable not found.")
    client_ip = getattr(request.state, "client_ip", None)
    await log_action(db, user_id=current_user.id, action="delete", entity_table="cable",
                     entity_id=cable_id, client_ip=client_ip,
                     description=f"Deleted cable {cable_id}.")
    await crud_cable.remove(db, cable_id)
