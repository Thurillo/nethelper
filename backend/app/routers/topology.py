from __future__ import annotations

import json
from typing import Annotated, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, require_admin
from app.models.cable import Cable
from app.models.device import Device
from app.models.interface import Interface
from app.models.topology_map import TopologyMap
from app.schemas.topology import TopologyEdge, TopologyGraph, TopologyNode
from app.schemas.topology_map import (
    TopologyMapCreate,
    TopologyMapLayoutPatch,
    TopologyMapList,
    TopologyMapRead,
    TopologyMapUpdate,
)

router = APIRouter(prefix="/topology", tags=["topology"])


@router.get("/", response_model=TopologyGraph)
async def get_topology(
    _: Annotated[object, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    site_id: Optional[int] = None,
    device_type: Optional[str] = None,
    max_nodes: int = 200,
) -> TopologyGraph:
    # Build device query
    stmt = select(Device)
    if site_id is not None:
        stmt = stmt.where(Device.site_id == site_id)
    if device_type is not None:
        stmt = stmt.where(Device.device_type == device_type)
    stmt = stmt.limit(max_nodes)
    result = await db.execute(stmt)
    devices = result.scalars().all()

    device_ids = {d.id for d in devices}
    nodes = [
        TopologyNode(
            id=d.id,
            name=d.name,
            device_type=d.device_type.value,
            primary_ip=d.primary_ip,
            mac_address=d.mac_address,
            site_id=d.site_id,
            cabinet_id=d.cabinet_id,
            status=d.status.value,
        )
        for d in devices
    ]

    # Get interfaces for these devices
    iface_result = await db.execute(
        select(Interface).where(Interface.device_id.in_(device_ids))
    )
    interfaces = iface_result.scalars().all()
    iface_map = {i.id: i for i in interfaces}
    iface_to_device = {i.id: i.device_id for i in interfaces}
    iface_ids = set(iface_to_device.keys())

    # Get cables between these interfaces
    cable_result = await db.execute(
        select(Cable).where(
            Cable.interface_a_id.in_(iface_ids),
            Cable.interface_b_id.in_(iface_ids),
        )
    )
    cables = cable_result.scalars().all()

    edges = []
    for cable in cables:
        iface_a = iface_map.get(cable.interface_a_id)
        iface_b = iface_map.get(cable.interface_b_id)
        if iface_a is None or iface_b is None:
            continue
        dev_a = iface_to_device.get(cable.interface_a_id)
        dev_b = iface_to_device.get(cable.interface_b_id)
        if dev_a is None or dev_b is None or dev_a == dev_b:
            continue
        # Only include edges where both devices are in our node set
        if dev_a not in device_ids or dev_b not in device_ids:
            continue
        edges.append(
            TopologyEdge(
                id=cable.id,
                source_device_id=dev_a,
                target_device_id=dev_b,
                source_interface=iface_a.name,
                target_interface=iface_b.name,
                cable_type=cable.cable_type,
            )
        )

    return TopologyGraph(nodes=nodes, edges=edges)


@router.get("/neighbors/{device_id}", response_model=TopologyGraph)
async def get_device_neighbors(
    device_id: int,
    _: Annotated[object, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TopologyGraph:
    # Verify device exists
    result = await db.execute(select(Device).where(Device.id == device_id))
    device = result.scalar_one_or_none()
    if device is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found.")

    # Get interfaces of this device
    iface_result = await db.execute(
        select(Interface).where(Interface.device_id == device_id)
    )
    my_interfaces = iface_result.scalars().all()
    my_iface_ids = {i.id for i in my_interfaces}

    if not my_iface_ids:
        node = TopologyNode(
            id=device.id,
            name=device.name,
            device_type=device.device_type.value,
            primary_ip=device.primary_ip,
            site_id=device.site_id,
            cabinet_id=device.cabinet_id,
            status=device.status.value,
        )
        return TopologyGraph(nodes=[node], edges=[])

    # Find cables connected to this device's interfaces
    from sqlalchemy import or_
    cable_result = await db.execute(
        select(Cable).where(
            or_(
                Cable.interface_a_id.in_(my_iface_ids),
                Cable.interface_b_id.in_(my_iface_ids),
            )
        )
    )
    cables = cable_result.scalars().all()

    # Collect all neighbor interface IDs
    neighbor_iface_ids = set()
    for cable in cables:
        if cable.interface_a_id in my_iface_ids:
            neighbor_iface_ids.add(cable.interface_b_id)
        else:
            neighbor_iface_ids.add(cable.interface_a_id)

    # Get neighbor interfaces and their devices
    if neighbor_iface_ids:
        n_iface_result = await db.execute(
            select(Interface).where(Interface.id.in_(neighbor_iface_ids))
        )
        neighbor_ifaces = n_iface_result.scalars().all()
        neighbor_device_ids = {i.device_id for i in neighbor_ifaces}
        all_iface_map = {i.id: i for i in list(my_interfaces) + list(neighbor_ifaces)}
        iface_to_device = {i.id: i.device_id for i in list(my_interfaces) + list(neighbor_ifaces)}

        # Fetch neighbor devices
        n_dev_result = await db.execute(
            select(Device).where(Device.id.in_(neighbor_device_ids))
        )
        neighbor_devices = n_dev_result.scalars().all()
    else:
        neighbor_devices = []
        all_iface_map = {i.id: i for i in my_interfaces}
        iface_to_device = {i.id: device_id for i in my_interfaces}

    all_devices = [device] + list(neighbor_devices)
    all_device_ids = {d.id for d in all_devices}

    nodes = [
        TopologyNode(
            id=d.id,
            name=d.name,
            device_type=d.device_type.value,
            primary_ip=d.primary_ip,
            mac_address=d.mac_address,
            site_id=d.site_id,
            cabinet_id=d.cabinet_id,
            status=d.status.value,
        )
        for d in all_devices
    ]

    edges = []
    for cable in cables:
        iface_a = all_iface_map.get(cable.interface_a_id)
        iface_b = all_iface_map.get(cable.interface_b_id)
        if iface_a is None or iface_b is None:
            continue
        dev_a = iface_to_device.get(cable.interface_a_id)
        dev_b = iface_to_device.get(cable.interface_b_id)
        if dev_a is None or dev_b is None or dev_a == dev_b:
            continue
        edges.append(
            TopologyEdge(
                id=cable.id,
                source_device_id=dev_a,
                target_device_id=dev_b,
                source_interface=iface_a.name,
                target_interface=iface_b.name,
                cable_type=cable.cable_type,
            )
        )

    return TopologyGraph(nodes=nodes, edges=edges)


# ─── Topology Map endpoints ────────────────────────────────────────────────────

def _map_to_read(tmap: TopologyMap) -> TopologyMapRead:
    """Convert ORM TopologyMap to TopologyMapRead schema."""
    return TopologyMapRead.model_validate(tmap)


@router.get("/maps/", response_model=List[TopologyMapList])
async def list_topology_maps(
    _: Annotated[object, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    site_id: Optional[int] = None,
) -> List[TopologyMapList]:
    stmt = select(TopologyMap).order_by(TopologyMap.name)
    if site_id is not None:
        stmt = stmt.where(TopologyMap.site_id == site_id)
    result = await db.execute(stmt)
    maps = result.scalars().all()
    return [TopologyMapList.model_validate(m) for m in maps]


@router.post("/maps/", response_model=TopologyMapRead, status_code=status.HTTP_201_CREATED)
async def create_topology_map(
    body: TopologyMapCreate,
    current_user: Annotated[object, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TopologyMapRead:
    tmap = TopologyMap(
        name=body.name,
        site_id=body.site_id,
        created_by_id=current_user.id,
        layout=None,
    )
    db.add(tmap)
    await db.flush()
    await db.refresh(tmap)
    return _map_to_read(tmap)


@router.get("/maps/{map_id}", response_model=TopologyMapRead)
async def get_topology_map(
    map_id: int,
    _: Annotated[object, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TopologyMapRead:
    result = await db.execute(select(TopologyMap).where(TopologyMap.id == map_id))
    tmap = result.scalar_one_or_none()
    if tmap is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Topology map not found.")
    return _map_to_read(tmap)


@router.put("/maps/{map_id}", response_model=TopologyMapRead)
async def update_topology_map(
    map_id: int,
    body: TopologyMapUpdate,
    _: Annotated[object, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TopologyMapRead:
    result = await db.execute(select(TopologyMap).where(TopologyMap.id == map_id))
    tmap = result.scalar_one_or_none()
    if tmap is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Topology map not found.")
    if body.name is not None:
        tmap.name = body.name
    if body.site_id is not None:
        tmap.site_id = body.site_id
    elif "site_id" in body.model_fields_set:
        tmap.site_id = None
    db.add(tmap)
    await db.flush()
    await db.refresh(tmap)
    return _map_to_read(tmap)


@router.patch("/maps/{map_id}/layout", response_model=TopologyMapRead)
async def patch_topology_map_layout(
    map_id: int,
    body: TopologyMapLayoutPatch,
    _: Annotated[object, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TopologyMapRead:
    result = await db.execute(select(TopologyMap).where(TopologyMap.id == map_id))
    tmap = result.scalar_one_or_none()
    if tmap is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Topology map not found.")
    layout_dict = {k: v.model_dump() for k, v in body.layout.items()}
    tmap.layout = json.dumps(layout_dict)
    db.add(tmap)
    await db.flush()
    await db.refresh(tmap)
    return _map_to_read(tmap)


@router.delete("/maps/{map_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_topology_map(
    map_id: int,
    _: Annotated[object, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    result = await db.execute(select(TopologyMap).where(TopologyMap.id == map_id))
    tmap = result.scalar_one_or_none()
    if tmap is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Topology map not found.")
    await db.delete(tmap)
    await db.flush()
