from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.audit_log import log_action
from app.crud.cable import crud_cable
from app.crud.interface import crud_interface
from app.crud.mac_entry import crud_mac_entry
from app.database import get_db
from app.dependencies import get_current_user, require_admin
from app.schemas.cable import CableRead, InterfaceMinimal
from app.schemas.interface import InterfaceCreate, InterfaceRead, InterfaceUpdate
from app.schemas.mac_entry import MacEntryRead

router = APIRouter(prefix="/interfaces", tags=["interfaces"])


@router.get("/", response_model=list[InterfaceRead])
async def list_interfaces(
    device_id: int | None = None,
    skip: int = 0,
    limit: int = 200,
    _: Annotated[object, Depends(get_current_user)] = None,
    db: Annotated[AsyncSession, Depends(get_db)] = None,
) -> list[InterfaceRead]:
    if device_id is not None:
        interfaces = await crud_interface.get_by_device(db, device_id)
    else:
        interfaces = await crud_interface.get_multi(db, skip=skip, limit=limit)
    return [InterfaceRead.model_validate(i) for i in interfaces]


@router.post("/", response_model=InterfaceRead, status_code=status.HTTP_201_CREATED)
async def create_interface(
    body: InterfaceCreate,
    request: Request,
    current_user: Annotated[object, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> InterfaceRead:
    iface = await crud_interface.create(db, body)
    client_ip = getattr(request.state, "client_ip", None)
    await log_action(db, user_id=current_user.id, action="create", entity_table="interface",
                     entity_id=iface.id, client_ip=client_ip,
                     description=f"Created interface '{iface.name}' on device {iface.device_id}.")
    return InterfaceRead.model_validate(iface)


@router.get("/{interface_id}", response_model=InterfaceRead)
async def get_interface(
    interface_id: int,
    _: Annotated[object, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> InterfaceRead:
    iface = await crud_interface.get(db, interface_id)
    if iface is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interface not found.")
    return InterfaceRead.model_validate(iface)


@router.patch("/{interface_id}", response_model=InterfaceRead)
async def update_interface(
    interface_id: int,
    body: InterfaceUpdate,
    request: Request,
    current_user: Annotated[object, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> InterfaceRead:
    iface = await crud_interface.get(db, interface_id)
    if iface is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interface not found.")
    updated = await crud_interface.update(db, iface, body)
    client_ip = getattr(request.state, "client_ip", None)
    await log_action(db, user_id=current_user.id, action="update", entity_table="interface",
                     entity_id=updated.id, client_ip=client_ip,
                     description=f"Updated interface '{updated.name}'.")
    return InterfaceRead.model_validate(updated)


@router.delete("/{interface_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_interface(
    interface_id: int,
    request: Request,
    current_user: Annotated[object, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    iface = await crud_interface.get(db, interface_id)
    if iface is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interface not found.")
    client_ip = getattr(request.state, "client_ip", None)
    await log_action(db, user_id=current_user.id, action="delete", entity_table="interface",
                     entity_id=interface_id, client_ip=client_ip,
                     description=f"Deleted interface '{iface.name}'.")
    await crud_interface.remove(db, interface_id)


@router.get("/{interface_id}/cable", response_model=CableRead | None)
async def get_interface_cable(
    interface_id: int,
    _: Annotated[object, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CableRead | None:
    iface = await crud_interface.get(db, interface_id)
    if iface is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interface not found.")
    cable = await crud_cable.get_cable_for_interface(db, interface_id)
    if cable is None:
        return None
    return CableRead.model_validate(cable)


@router.get("/{interface_id}/mac-entries", response_model=list[MacEntryRead])
async def get_interface_mac_entries(
    interface_id: int,
    _: Annotated[object, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[MacEntryRead]:
    iface = await crud_interface.get(db, interface_id)
    if iface is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interface not found.")
    entries = await crud_mac_entry.get_multi(db, limit=500, interface_id=interface_id)
    return [MacEntryRead.model_validate(e) for e in entries]
