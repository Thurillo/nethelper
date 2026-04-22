from __future__ import annotations

from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import case, or_, select
from sqlalchemy.orm import aliased
from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy.orm import selectinload

from app.crud.audit_log import log_action
from app.crud.cabinet import crud_cabinet
from app.crud.cable import crud_cable
from app.crud.device import crud_device
from app.crud.interface import crud_interface
from app.crud.ip_address import crud_ip_address
from app.crud.mac_entry import crud_mac_entry
from app.crud.scan_job import crud_scan_job
from app.database import get_db
from app.dependencies import get_current_user, require_admin
from app.models.cable import Cable
from app.models.device import Device
from app.models.interface import Interface
from app.models.scan_job import ScanStatus
from app.schemas.cable import InterfaceMinimal
from app.schemas.device import (
    DeviceBulkCreateRequest, DeviceBulkCreateResponse,
    DeviceBulkUpdateRequest, DeviceBulkUpdateResponse,
    DeviceBulkDeleteRequest, DeviceBulkDeleteResponse,
    DeviceConnectionsPreview, DeviceCreate, DeviceRead, DeviceScanRequest, DeviceUpdate,
    PortMapEntry, PortMapMacEntry,
)
from app.schemas.interface import InterfaceRead
from app.schemas.ip_address import IpAddressRead
from app.schemas.mac_entry import MacEntryRead
from app.schemas.scan_job import ScanJobCreate, ScanJobRead
from app.schemas.pagination import PaginatedResponse


class DevicePortDetail(BaseModel):
    interface: InterfaceRead
    linked_interface: InterfaceMinimal | None = None
    cable_id: int | None = None

router = APIRouter(prefix="/devices", tags=["devices"])


async def _reload_device(db: AsyncSession, device_id: int) -> Device:
    """Reload a Device with all relationships needed for DeviceRead serialization."""
    from app.models.vendor import Vendor
    from app.models.cabinet import Cabinet as CabinetModel
    result = await db.execute(
        select(Device)
        .options(
            selectinload(Device.vendor),
            selectinload(Device.cabinet),
        )
        .where(Device.id == device_id)
    )
    return result.scalar_one()


@router.get("/", response_model=PaginatedResponse[DeviceRead])
async def list_devices(
    _: Annotated[object, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    page: int = 1,
    size: int = 100,
    site_id: Optional[int] = None,
    cabinet_id: Optional[int] = None,
    device_type: Optional[str] = None,
    exclude_device_type: Optional[str] = None,
    status_filter: Optional[str] = None,
    q: Optional[str] = None,
    not_connected_to_pp: bool = False,
    no_cables: bool = False,
) -> PaginatedResponse[DeviceRead]:
    filter_kwargs = dict(
        site_id=site_id,
        cabinet_id=cabinet_id,
        device_type=device_type,
        exclude_device_type=exclude_device_type,
        status=status_filter,
        q=q,
        not_connected_to_pp=not_connected_to_pp,
        no_cables=no_cables,
    )
    devices = await crud_device.search(db, skip=(page - 1) * size, limit=size, **filter_kwargs)
    total = await crud_device.count_filtered(db, **filter_kwargs)
    return PaginatedResponse.build([DeviceRead.model_validate(d) for d in devices], total=total, page=page, size=size)


@router.post("/bulk", response_model=DeviceBulkCreateResponse, status_code=status.HTTP_200_OK)
async def bulk_create_devices(
    body: DeviceBulkCreateRequest,
    request: Request,
    current_user: Annotated[object, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> DeviceBulkCreateResponse:
    created = 0
    skipped = 0
    errors: list[str] = []
    client_ip = getattr(request.state, "client_ip", None)
    for item in body.devices:
        try:
            if item.primary_ip and body.skip_duplicates:
                existing = await crud_device.get_by_ip(db, item.primary_ip)
                if existing:
                    skipped += 1
                    continue
            device_data = DeviceCreate(
                name=item.name,
                primary_ip=item.primary_ip,
                device_type=item.device_type,
                status=item.status,
                cabinet_id=item.cabinet_id,
                vendor_id=item.vendor_id,
                model=item.model,
                mac_address=item.mac_address,
            )
            device = await crud_device.create(db, device_data)
            await log_action(db, user_id=current_user.id, action="create", entity_table="device",
                             entity_id=device.id, client_ip=client_ip,
                             description=f"Bulk created device '{device.name}'.")
            created += 1
        except Exception as e:
            errors.append(f"{item.name} ({item.primary_ip}): {str(e)[:100]}")
    return DeviceBulkCreateResponse(created=created, skipped=skipped, errors=errors)


@router.post("/", response_model=DeviceRead, status_code=status.HTTP_201_CREATED)
async def create_device(
    body: DeviceCreate,
    request: Request,
    current_user: Annotated[object, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> DeviceRead:
    # Auto-assign u_position if cabinet_id is set but u_position is not provided
    if body.cabinet_id and body.u_position is None:
        free_u = await crud_cabinet.find_next_free_u(db, body.cabinet_id, u_height=body.u_height or 1)
        if free_u is not None:
            body = body.model_copy(update={"u_position": free_u})
    device = await crud_device.create(db, body)

    if body.port_count:
        from app.models.interface import Interface, InterfaceType
        from app.models.device import DeviceType as DType
        iface_type = (
            InterfaceType.patch_panel_port
            if device.device_type == DType.patch_panel
            else InterfaceType.ethernet
        )
        for i in range(1, body.port_count + 1):
            db.add(Interface(device_id=device.id, name=f"Port {i}", if_type=iface_type))
        await db.flush()

    client_ip = getattr(request.state, "client_ip", None)
    await log_action(db, user_id=current_user.id, action="create", entity_table="device",
                     entity_id=device.id, client_ip=client_ip,
                     description=f"Created device '{device.name}'" + (f" con {body.port_count} porte." if body.port_count else "."))
    return DeviceRead.model_validate(await _reload_device(db, device.id))


@router.get("/{device_id}", response_model=DeviceRead)
async def get_device(
    device_id: int,
    _: Annotated[object, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> DeviceRead:
    device = await crud_device.get(db, device_id)
    if device is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found.")
    return DeviceRead.model_validate(await _reload_device(db, device_id))


@router.get("/{device_id}/connections-preview", response_model=DeviceConnectionsPreview)
async def get_connections_preview(
    device_id: int,
    _: Annotated[object, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> DeviceConnectionsPreview:
    from sqlalchemy import select
    from sqlalchemy.orm import aliased
    from app.models.interface import Interface
    from app.models.cable import Cable
    from app.models.device import Device as DeviceModel

    device = await crud_device.get(db, device_id)
    if device is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found.")

    # Aliases for the two interface sides
    IfaceA = aliased(Interface)
    IfaceB = aliased(Interface)
    OtherDev = aliased(DeviceModel)

    # Cables where this device is on side A (interface_a)
    stmt_a = (
        select(
            IfaceA.name.label("device_port"),
            IfaceB.name.label("other_port"),
            OtherDev.name.label("other_device_name"),
            OtherDev.device_type.label("other_device_type"),
        )
        .select_from(Cable)
        .join(IfaceA, Cable.interface_a_id == IfaceA.id)
        .join(IfaceB, Cable.interface_b_id == IfaceB.id)
        .join(OtherDev, IfaceB.device_id == OtherDev.id)
        .where(IfaceA.device_id == device_id)
    )

    IfaceA2 = aliased(Interface)
    IfaceB2 = aliased(Interface)
    OtherDev2 = aliased(DeviceModel)

    # Cables where this device is on side B (interface_b)
    stmt_b = (
        select(
            IfaceB2.name.label("device_port"),
            IfaceA2.name.label("other_port"),
            OtherDev2.name.label("other_device_name"),
            OtherDev2.device_type.label("other_device_type"),
        )
        .select_from(Cable)
        .join(IfaceA2, Cable.interface_a_id == IfaceA2.id)
        .join(IfaceB2, Cable.interface_b_id == IfaceB2.id)
        .join(OtherDev2, IfaceA2.device_id == OtherDev2.id)
        .where(IfaceB2.device_id == device_id)
    )

    result_a = await db.execute(stmt_a)
    result_b = await db.execute(stmt_b)
    all_connections = list(result_a.all()) + list(result_b.all())

    pp_connections = [
        {"pp_name": row.other_device_name, "pp_port": row.other_port, "device_port": row.device_port}
        for row in all_connections
        if str(row.other_device_type) == "patch_panel"
    ]

    return DeviceConnectionsPreview(cables_total=len(all_connections), pp_connections=pp_connections)


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
    # Auto-assign u_position when cabinet changes and no explicit position is given
    target_cabinet = body.cabinet_id if body.cabinet_id is not None else device.cabinet_id
    if target_cabinet and body.u_position is None and device.u_position is None:
        free_u = await crud_cabinet.find_next_free_u(db, target_cabinet, u_height=body.u_height or device.u_height or 1)
        if free_u is not None:
            body = body.model_copy(update={"u_position": free_u})
    updated = await crud_device.update(db, device, body)
    client_ip = getattr(request.state, "client_ip", None)
    await log_action(db, user_id=current_user.id, action="update", entity_table="device",
                     entity_id=updated.id, client_ip=client_ip,
                     description=f"Updated device '{updated.name}'.")
    return DeviceRead.model_validate(await _reload_device(db, updated.id))


@router.patch("/bulk-update", response_model=DeviceBulkUpdateResponse)
async def bulk_update_devices(
    body: DeviceBulkUpdateRequest,
    request: Request,
    current_user: Annotated[object, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> DeviceBulkUpdateResponse:
    """Aggiorna in blocco cabinet_id e/o status su una lista di device."""
    if not body.ids:
        return DeviceBulkUpdateResponse(updated=0)
    update_data: dict = {}
    if body.cabinet_id is not None:
        update_data["cabinet_id"] = body.cabinet_id
    if body.status is not None:
        update_data["status"] = body.status
    if not update_data:
        return DeviceBulkUpdateResponse(updated=0)
    from sqlalchemy import update as sa_update
    stmt = (
        sa_update(Device)
        .where(Device.id.in_(body.ids))
        .values(**update_data)
    )
    result = await db.execute(stmt)
    await db.commit()
    client_ip = getattr(request.state, "client_ip", None)
    await log_action(db, user_id=current_user.id, action="bulk_update", entity_table="device",
                     entity_id=None, client_ip=client_ip,
                     description=f"Bulk updated {result.rowcount} devices: {update_data}")
    return DeviceBulkUpdateResponse(updated=result.rowcount)


@router.delete("/bulk-delete", response_model=DeviceBulkDeleteResponse)
async def bulk_delete_devices(
    body: DeviceBulkDeleteRequest,
    request: Request,
    current_user: Annotated[object, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> DeviceBulkDeleteResponse:
    """Elimina in blocco una lista di device."""
    if not body.ids:
        return DeviceBulkDeleteResponse(deleted=0)
    deleted = 0
    for device_id in body.ids:
        device = await crud_device.get(db, device_id)
        if device:
            await crud_device.remove(db, device_id)
            deleted += 1
    client_ip = getattr(request.state, "client_ip", None)
    await log_action(db, user_id=current_user.id, action="bulk_delete", entity_table="device",
                     entity_id=None, client_ip=client_ip,
                     description=f"Bulk deleted {deleted} devices: ids={body.ids}")
    return DeviceBulkDeleteResponse(deleted=deleted)


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


@router.get("/{device_id}/ports", response_model=list[DevicePortDetail])
async def get_device_ports(
    device_id: int,
    _: Annotated[object, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[DevicePortDetail]:
    device = await crud_device.get(db, device_id)
    if device is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found.")

    # Single JOIN query: Interface → Cable (optional) → LinkedInterface + LinkedDevice
    # case() determines which end of the cable is "the other side"
    LinkedIface = aliased(Interface)
    LinkedDev = aliased(Device)

    other_iface_id_expr = case(
        (Cable.interface_a_id == Interface.id, Cable.interface_b_id),
        else_=Cable.interface_a_id,
    )

    stmt = (
        select(Interface, Cable, LinkedIface, LinkedDev)
        .where(Interface.device_id == device_id)
        .outerjoin(
            Cable,
            or_(Cable.interface_a_id == Interface.id, Cable.interface_b_id == Interface.id),
        )
        .outerjoin(LinkedIface, LinkedIface.id == other_iface_id_expr)
        .outerjoin(LinkedDev, LinkedDev.id == LinkedIface.device_id)
        .order_by(Interface.id)
    )
    rows = (await db.execute(stmt)).all()

    # Assemble result
    details = []
    for row in rows:
        iface: Interface = row[0]
        cable: Optional[Cable] = row[1]
        linked_iface: Optional[Interface] = row[2]
        linked_dev: Optional[Device] = row[3]

        linked_iface_detail = None
        if linked_iface and linked_dev:
            linked_iface_detail = InterfaceMinimal(
                id=linked_iface.id,
                name=linked_iface.name,
                label=linked_iface.label,
                device_id=linked_dev.id,
                device_name=linked_dev.name,
            )
        details.append(DevicePortDetail(
            interface=InterfaceRead.model_validate(iface),
            linked_interface=linked_iface_detail,
            cable_id=cable.id if cable else None,
        ))
    return details


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
    _: Annotated[object, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    page: int = 1,
    size: int = 100,
) -> list[ScanJobRead]:
    device = await crud_device.get(db, device_id)
    if device is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found.")
    jobs = await crud_scan_job.get_by_device(db, device_id, skip=(page - 1) * size, limit=size)
    return [ScanJobRead.model_validate(j) for j in jobs]


@router.get("/{device_id}/port-map", response_model=list[PortMapEntry])
async def get_device_port_map(
    device_id: int,
    _: Annotated[object, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[PortMapEntry]:
    """Return port-level classification for a switch: direct device, LLDP/CDP, unmanaged, or empty."""
    device = await crud_device.get(db, device_id)
    if device is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found.")

    # Load all interfaces
    ifaces_result = await db.execute(
        select(Interface).where(Interface.device_id == device_id)
    )
    interfaces = ifaces_result.scalars().all()
    iface_ids = [i.id for i in interfaces]

    # Load active MAC entries for these interfaces
    from app.models.mac_entry import MacEntry
    mac_result = await db.execute(
        select(MacEntry).where(
            MacEntry.interface_id.in_(iface_ids),
            MacEntry.is_active == True,
        )
    )
    macs_by_iface: dict[int, list[MacEntry]] = {}
    for m in mac_result.scalars().all():
        macs_by_iface.setdefault(m.interface_id, []).append(m)

    # Load cables for these interfaces and find linked devices
    InterfaceA = aliased(Interface)
    InterfaceB = aliased(Interface)
    DeviceA = aliased(Device)
    DeviceB = aliased(Device)
    cables_result = await db.execute(
        select(Cable, InterfaceA, InterfaceB, DeviceA, DeviceB)
        .join(InterfaceA, Cable.interface_a_id == InterfaceA.id)
        .join(InterfaceB, Cable.interface_b_id == InterfaceB.id)
        .outerjoin(DeviceA, InterfaceA.device_id == DeviceA.id)
        .outerjoin(DeviceB, InterfaceB.device_id == DeviceB.id)
        .where(
            or_(
                Cable.interface_a_id.in_(iface_ids),
                Cable.interface_b_id.in_(iface_ids),
            )
        )
    )
    cable_by_iface: dict[int, tuple[int, int, str]] = {}  # iface_id → (cable_id, linked_device_id, linked_device_name)
    for cable, ia, ib, da, db_ in cables_result.all():
        if ia.device_id == device_id:
            cable_by_iface[ia.id] = (cable.id, db_.id if db_ else None, db_.name if db_ else None)
        if ib.device_id == device_id:
            cable_by_iface[ib.id] = (cable.id, da.id if da else None, da.name if da else None)

    # Load neighbors from the last completed SSH/SNMP scan job
    from app.models.scan_job import ScanJob, ScanType as ScanJobType
    last_job_result = await db.execute(
        select(ScanJob)
        .where(
            ScanJob.device_id == device_id,
            ScanJob.status == "completed",
            ScanJob.scan_type.in_(["ssh_full", "snmp_full", "snmp_lldp"]),
        )
        .order_by(ScanJob.completed_at.desc())
        .limit(1)
    )
    last_job = last_job_result.scalar_one_or_none()
    neighbor_ports: set[str] = set()
    neighbor_by_port: dict[str, str] = {}
    if last_job and last_job.log_output:
        # Parse neighbors from scan result_summary is not available; use mac data heuristic.
        pass
    # Better: load from ScanConflict or from a dedicated neighbors store.
    # For now, use interface names that appear in LLDP/CDP based on cable to managed devices.
    for iface_id, (cable_id, linked_id, linked_name) in cable_by_iface.items():
        if linked_id is not None:
            iface = next((i for i in interfaces if i.id == iface_id), None)
            if iface:
                neighbor_ports.add(iface.name)
                neighbor_by_port[iface.name] = linked_name or ""

    # Build port map
    UNMANAGED_THRESHOLD = 3
    entries: list[PortMapEntry] = []
    for iface in interfaces:
        macs = macs_by_iface.get(iface.id, [])
        cable_info = cable_by_iface.get(iface.id)
        mac_count = len(macs)

        # Classify
        if iface.name in neighbor_ports and cable_info and cable_info[1]:
            classification = "lldp_cdp"
        elif mac_count == 0:
            classification = "empty"
        elif mac_count >= UNMANAGED_THRESHOLD and iface.name not in neighbor_ports:
            classification = "unmanaged"
        elif 1 <= mac_count <= 2 and iface.name not in neighbor_ports:
            classification = "direct"
        else:
            classification = "empty"

        # Get vendor names
        mac_entries_out: list[PortMapMacEntry] = []
        for m in macs:
            vendor_name = None
            try:
                from app.tasks.scan_tasks import _vendor_from_mac
                vendor_name = _vendor_from_mac(m.mac_address)
            except Exception:
                pass
            mac_entries_out.append(PortMapMacEntry(
                mac_address=m.mac_address,
                vendor_name=vendor_name,
                ip_address=m.ip_address,
                vlan_id=m.vlan_id,
            ))

        entries.append(PortMapEntry(
            interface_id=iface.id,
            interface_name=iface.name,
            oper_up=iface.oper_up,
            admin_up=iface.admin_up,
            speed_mbps=iface.speed_mbps,
            description=iface.description,
            classification=classification,
            mac_count=mac_count,
            mac_entries=mac_entries_out,
            linked_device_id=cable_info[1] if cable_info else None,
            linked_device_name=cable_info[2] if cable_info else None,
            cable_id=cable_info[0] if cable_info else None,
            lldp_neighbor_hostname=neighbor_by_port.get(iface.name),
        ))

    # Sort: by port name naturally
    import re
    def _port_sort_key(e: PortMapEntry) -> tuple:
        parts = re.split(r'(\d+)', e.interface_name)
        return tuple(int(p) if p.isdigit() else p.lower() for p in parts)
    entries.sort(key=_port_sort_key)
    return entries


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

    # Trigger Celery task — keep status=pending; worker will set running on first execution
    try:
        from app.tasks.scan_tasks import run_device_scan
        task = run_device_scan.delay(device_id, job.id, body.scan_type.value)
        job.celery_task_id = task.id
        db.add(job)
        await db.flush()
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
