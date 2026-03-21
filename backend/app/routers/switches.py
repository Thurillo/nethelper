from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.audit_log import log_action
from app.crud.cable import crud_cable
from app.crud.device import crud_device
from app.crud.interface import crud_interface
from app.database import get_db
from app.dependencies import get_current_user, require_admin
from app.models.device import Device, DeviceType
from app.models.interface import Interface
from app.schemas.cable import CableRead, InterfaceMinimal
from app.schemas.interface import InterfaceRead, InterfaceUpdate

router = APIRouter(prefix="/switches", tags=["switches"])


class PortLinkRequest(BaseModel):
    target_interface_id: int


class SwitchPortDetail(BaseModel):
    interface: InterfaceRead
    linked_interface: InterfaceMinimal | None = None
    cable_id: int | None = None


@router.get("/{switch_id}/ports", response_model=list[SwitchPortDetail])
async def get_switch_ports(
    switch_id: int,
    _: Annotated[object, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[SwitchPortDetail]:
    device = await crud_device.get(db, switch_id)
    if device is None or device.device_type != DeviceType.switch:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Switch not found.")

    interfaces = await crud_interface.get_by_device(db, switch_id)
    details = []

    for iface in interfaces:
        cable = await crud_cable.get_cable_for_interface(db, iface.id)
        linked_iface_detail = None
        cable_id = None

        if cable:
            cable_id = cable.id
            other_iface_id = (
                cable.interface_b_id
                if cable.interface_a_id == iface.id
                else cable.interface_a_id
            )
            other_result = await db.execute(
                select(Interface, Device)
                .join(Device, Interface.device_id == Device.id)
                .where(Interface.id == other_iface_id)
            )
            other_row = other_result.first()
            if other_row:
                linked_iface_detail = InterfaceMinimal(
                    id=other_row.Interface.id,
                    name=other_row.Interface.name,
                    label=other_row.Interface.label,
                    device_id=other_row.Device.id,
                    device_name=other_row.Device.name,
                )

        details.append(
            SwitchPortDetail(
                interface=InterfaceRead.model_validate(iface),
                linked_interface=linked_iface_detail,
                cable_id=cable_id,
            )
        )

    return details


@router.patch("/{switch_id}/ports/{port_id}", response_model=InterfaceRead)
async def update_switch_port(
    switch_id: int,
    port_id: int,
    body: InterfaceUpdate,
    request: Request,
    current_user: Annotated[object, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> InterfaceRead:
    device = await crud_device.get(db, switch_id)
    if device is None or device.device_type != DeviceType.switch:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Switch not found.")

    iface = await crud_interface.get(db, port_id)
    if iface is None or iface.device_id != switch_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Port not found on this switch.")

    updated = await crud_interface.update(db, iface, body)
    client_ip = getattr(request.state, "client_ip", None)
    await log_action(db, user_id=current_user.id, action="update", entity_table="interface",
                     entity_id=port_id, client_ip=client_ip,
                     description=f"Updated switch port '{updated.name}' on switch {switch_id}.")
    return InterfaceRead.model_validate(updated)


@router.post("/{switch_id}/ports/{port_id}/link", response_model=CableRead, status_code=status.HTTP_201_CREATED)
async def link_switch_port(
    switch_id: int,
    port_id: int,
    body: PortLinkRequest,
    request: Request,
    current_user: Annotated[object, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CableRead:
    device = await crud_device.get(db, switch_id)
    if device is None or device.device_type != DeviceType.switch:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Switch not found.")

    iface = await crud_interface.get(db, port_id)
    if iface is None or iface.device_id != switch_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Port not found on this switch.")

    existing_cable = await crud_cable.get_cable_for_interface(db, port_id)
    if existing_cable:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Port is already linked. Remove existing link first.",
        )

    target_iface = await crud_interface.get(db, body.target_interface_id)
    if target_iface is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Target interface not found.")

    from app.schemas.cable import CableCreate
    a_id = min(port_id, body.target_interface_id)
    b_id = max(port_id, body.target_interface_id)
    cable_in = CableCreate(interface_a_id=a_id, interface_b_id=b_id, cable_type="copper")
    cable = await crud_cable.create(db, cable_in)

    client_ip = getattr(request.state, "client_ip", None)
    await log_action(db, user_id=current_user.id, action="link_port", entity_table="cable",
                     entity_id=cable.id, client_ip=client_ip,
                     description=f"Linked switch port {port_id} to interface {body.target_interface_id}.")

    target_result = await db.execute(
        select(Device).where(Device.id == target_iface.device_id)
    )
    target_device = target_result.scalar_one_or_none()

    iface_a_min = InterfaceMinimal(id=iface.id, name=iface.name, label=iface.label,
                                   device_id=iface.device_id, device_name=device.name)
    iface_b_min = InterfaceMinimal(id=target_iface.id, name=target_iface.name, label=target_iface.label,
                                   device_id=target_iface.device_id,
                                   device_name=target_device.name if target_device else None)
    return CableRead(
        id=cable.id,
        interface_a_id=cable.interface_a_id,
        interface_b_id=cable.interface_b_id,
        cable_type=cable.cable_type,
        label=cable.label,
        length_m=cable.length_m,
        color=cable.color,
        notes=cable.notes,
        interface_a=iface_a_min,
        interface_b=iface_b_min,
    )


@router.delete("/{switch_id}/ports/{port_id}/link", status_code=status.HTTP_204_NO_CONTENT)
async def unlink_switch_port(
    switch_id: int,
    port_id: int,
    request: Request,
    current_user: Annotated[object, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    device = await crud_device.get(db, switch_id)
    if device is None or device.device_type != DeviceType.switch:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Switch not found.")

    iface = await crud_interface.get(db, port_id)
    if iface is None or iface.device_id != switch_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Port not found on this switch.")

    cable = await crud_cable.get_cable_for_interface(db, port_id)
    if cable is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No cable found on this port.")

    client_ip = getattr(request.state, "client_ip", None)
    await log_action(db, user_id=current_user.id, action="unlink_port", entity_table="cable",
                     entity_id=cable.id, client_ip=client_ip,
                     description=f"Unlinked switch port {port_id}.")
    await crud_cable.remove(db, cable.id)
