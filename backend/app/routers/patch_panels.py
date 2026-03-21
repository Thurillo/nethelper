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
from app.models.cable import Cable
from app.models.device import Device, DeviceType
from app.models.interface import Interface
from app.schemas.cable import CableRead, InterfaceMinimal
from app.schemas.device import DeviceRead
from app.schemas.interface import InterfaceRead, InterfaceUpdate
from app.schemas.pagination import PaginatedResponse

router = APIRouter(prefix="/patch-panels", tags=["patch-panels"])


class PortLinkRequest(BaseModel):
    target_interface_id: int


class PatchPortDetail(BaseModel):
    interface: InterfaceRead
    linked_interface: InterfaceMinimal | None = None
    cable_id: int | None = None


@router.get("/", response_model=PaginatedResponse[DeviceRead])
async def list_patch_panels(
    _: Annotated[object, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    site_id: int | None = None,
    page: int = 1,
    size: int = 100,
) -> PaginatedResponse[DeviceRead]:
    stmt = select(Device).where(Device.device_type == DeviceType.patch_panel)
    if site_id is not None:
        stmt = stmt.where(Device.site_id == site_id)
    stmt = stmt.offset(skip).limit(limit)
    result = await db.execute(stmt)
    devices = result.scalars().all()
    _total = len(devices)
    return PaginatedResponse.build([DeviceRead.model_validate(d) for d in devices], total=_total, page=1, size=_total or 1)


@router.get("/{panel_id}/ports", response_model=list[PatchPortDetail])
async def get_patch_panel_ports(
    panel_id: int,
    _: Annotated[object, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PaginatedResponse[PatchPortDetail]:
    device = await crud_device.get(db, panel_id)
    if device is None or device.device_type != DeviceType.patch_panel:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patch panel not found.")

    interfaces = await crud_interface.get_by_device(db, panel_id)
    details = []

    for iface in interfaces:
        cable = await crud_cable.get_cable_for_interface(db, iface.id)
        linked_iface_detail = None
        cable_id = None

        if cable:
            cable_id = cable.id
            # Find the other end
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
            PatchPortDetail(
                interface=InterfaceRead.model_validate(iface),
                linked_interface=linked_iface_detail,
                cable_id=cable_id,
            )
        )

    return details


@router.patch("/{panel_id}/ports/{port_id}", response_model=InterfaceRead)
async def update_patch_port(
    panel_id: int,
    port_id: int,
    body: InterfaceUpdate,
    request: Request,
    current_user: Annotated[object, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> InterfaceRead:
    device = await crud_device.get(db, panel_id)
    if device is None or device.device_type != DeviceType.patch_panel:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patch panel not found.")

    iface = await crud_interface.get(db, port_id)
    if iface is None or iface.device_id != panel_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Port not found on this panel.")

    updated = await crud_interface.update(db, iface, body)
    client_ip = getattr(request.state, "client_ip", None)
    await log_action(db, user_id=current_user.id, action="update", entity_table="interface",
                     entity_id=port_id, client_ip=client_ip,
                     description=f"Updated patch panel port '{updated.name}' on panel {panel_id}.")
    return InterfaceRead.model_validate(updated)


@router.post("/{panel_id}/ports/{port_id}/link", response_model=CableRead, status_code=status.HTTP_201_CREATED)
async def link_patch_port(
    panel_id: int,
    port_id: int,
    body: PortLinkRequest,
    request: Request,
    current_user: Annotated[object, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CableRead:
    device = await crud_device.get(db, panel_id)
    if device is None or device.device_type != DeviceType.patch_panel:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patch panel not found.")

    iface = await crud_interface.get(db, port_id)
    if iface is None or iface.device_id != panel_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Port not found on this panel.")

    # Check if port is already cabled
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
    cable_in = CableCreate(
        interface_a_id=port_id,
        interface_b_id=body.target_interface_id,
        cable_type="patch",
    )
    cable = await crud_cable.create(db, cable_in)

    client_ip = getattr(request.state, "client_ip", None)
    await log_action(db, user_id=current_user.id, action="link_port", entity_table="cable",
                     entity_id=cable.id, client_ip=client_ip,
                     description=f"Linked patch panel port {port_id} to interface {body.target_interface_id}.")

    # Return enriched cable
    from sqlalchemy import select as sa_select

    iface_a_min = InterfaceMinimal(
        id=iface.id,
        name=iface.name,
        label=iface.label,
        device_id=iface.device_id,
        device_name=device.name,
    )
    iface_b_min = InterfaceMinimal(
        id=target_iface.id,
        name=target_iface.name,
        label=target_iface.label,
        device_id=target_iface.device_id,
        device_name=None,
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
        interface_a=iface_a_min,
        interface_b=iface_b_min,
    )


@router.delete("/{panel_id}/ports/{port_id}/link", status_code=status.HTTP_204_NO_CONTENT)
async def unlink_patch_port(
    panel_id: int,
    port_id: int,
    request: Request,
    current_user: Annotated[object, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    device = await crud_device.get(db, panel_id)
    if device is None or device.device_type != DeviceType.patch_panel:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patch panel not found.")

    iface = await crud_interface.get(db, port_id)
    if iface is None or iface.device_id != panel_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Port not found on this panel.")

    cable = await crud_cable.get_cable_for_interface(db, port_id)
    if cable is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No cable found on this port.")

    client_ip = getattr(request.state, "client_ip", None)
    await log_action(db, user_id=current_user.id, action="unlink_port", entity_table="cable",
                     entity_id=cable.id, client_ip=client_ip,
                     description=f"Unlinked patch panel port {port_id}.")
    await crud_cable.remove(db, cable.id)
