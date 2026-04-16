from __future__ import annotations

"""
topology_linker.py
------------------
After a device scan completes, auto-create Cable records that link switch port
Interfaces to the discovered remote devices.

Two phases:
  A) LLDP/CDP neighbors  → exact port-to-port links for managed devices
  B) MAC table entries   → link switch ports to any device by MAC/IP lookup

Conflict cases (port already wired to a DIFFERENT device) are recorded as
ScanConflict(conflict_type=port_cable_conflict) and the old cable is NOT
replaced — the admin decides from the Conflitti page.
"""

from typing import TYPE_CHECKING, Any

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.discovery.drivers.base import CollectedData
from app.models.cable import Cable, CableType
from app.models.device import Device, DeviceStatus, DeviceType
from app.models.interface import Interface
from app.models.mac_entry import MacEntry
from app.models.scan_conflict import ConflictStatus, ConflictType, ScanConflict

if TYPE_CHECKING:
    pass


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _norm_mac(mac: str | None) -> str:
    """Normalise MAC address: lowercase, strip separators."""
    if not mac:
        return ""
    return mac.lower().replace(":", "").replace("-", "").replace(".", "")


async def _find_device_by_mac_or_ip(
    db: AsyncSession, mac_norm: str, ip: str | None
) -> Device | None:
    """Find an existing Device by normalised MAC or primary IP."""
    candidates: list[Device] = []

    if mac_norm:
        result = await db.execute(
            select(Device).where(Device.mac_address.isnot(None))
        )
        for d in result.scalars().all():
            if _norm_mac(d.mac_address) == mac_norm:
                candidates.append(d)

    if not candidates and ip:
        result = await db.execute(
            select(Device).where(
                Device.primary_ip == ip
            )
        )
        candidates = list(result.scalars().all())

    return candidates[0] if candidates else None


async def _find_device_by_name_or_ip(
    db: AsyncSession, name: str | None, ip: str | None
) -> Device | None:
    """Find a Device by hostname (case-insensitive prefix match) or IP."""
    if name:
        from sqlalchemy import func
        result = await db.execute(
            select(Device).where(func.lower(Device.name) == name.lower())
        )
        d = result.scalar_one_or_none()
        if d:
            return d

    if ip:
        result = await db.execute(
            select(Device).where(
                Device.primary_ip == ip
            )
        )
        return result.scalar_one_or_none()

    return None


async def _get_or_create_interface(db: AsyncSession, device: Device) -> Interface:
    """Return the first Interface of a device, or create a default one."""
    result = await db.execute(
        select(Interface).where(Interface.device_id == device.id).limit(1)
    )
    iface = result.scalar_one_or_none()
    if iface:
        return iface

    iface = Interface(
        device_id=device.id,
        name="eth0",
        interface_type="ethernet",
    )
    db.add(iface)
    await db.flush()
    await db.refresh(iface)
    return iface


async def _find_interface_by_name(
    db: AsyncSession, device_id: int, name: str
) -> Interface | None:
    """Find an interface on a device by exact name match."""
    result = await db.execute(
        select(Interface).where(
            Interface.device_id == device_id,
            Interface.name == name,
        )
    )
    return result.scalar_one_or_none()


async def _create_placeholder_device(
    db: AsyncSession,
    mac_norm: str,
    ip: str | None,
    vendor_name: str | None,
) -> Device:
    """Create a minimal placeholder Device for an unrecognised MAC."""
    # Build a short human-readable name from vendor + last 4 hex chars of MAC
    suffix = mac_norm[-4:].upper() if len(mac_norm) >= 4 else mac_norm.upper()
    prefix = (vendor_name or "Device")[:20]
    name = f"{prefix} {suffix}"

    dev = Device(
        name=name,
        device_type=DeviceType.other,
        status=DeviceStatus.planned,
        primary_ip=ip,
        mac_address=":".join(mac_norm[i:i+2] for i in range(0, 12, 2)) if len(mac_norm) == 12 else None,
    )
    db.add(dev)
    await db.flush()
    await db.refresh(dev)
    return dev


async def _get_cable_on_iface(
    db: AsyncSession, iface_id: int
) -> Cable | None:
    """Return the cable (if any) attached to the given interface."""
    result = await db.execute(
        select(Cable).where(
            or_(Cable.interface_a_id == iface_id, Cable.interface_b_id == iface_id)
        ).limit(1)
    )
    return result.scalar_one_or_none()


async def _ensure_cable(
    db: AsyncSession,
    iface_a_id: int,
    iface_b_id: int,
    stats: dict,
    device: Device,
    scan_job_id: int,
    local_iface: Interface,
) -> None:
    """Create cable if it doesn't exist; raise conflict if port is already wired to something else."""
    a, b = sorted([iface_a_id, iface_b_id])

    # Check if this exact cable already exists
    existing = await db.execute(
        select(Cable).where(Cable.interface_a_id == a, Cable.interface_b_id == b)
    )
    if existing.scalar_one_or_none():
        stats["skipped"] += 1
        return

    # Check if the local switch port is wired to a DIFFERENT interface
    existing_cable = await _get_cable_on_iface(db, local_iface.id)
    if existing_cable:
        # Determine the remote side of the existing cable
        remote_iface_id = (
            existing_cable.interface_b_id
            if existing_cable.interface_a_id == local_iface.id
            else existing_cable.interface_a_id
        )
        # Find the remote device
        remote_iface_result = await db.execute(
            select(Interface).where(Interface.id == remote_iface_id)
        )
        remote_iface = remote_iface_result.scalar_one_or_none()
        remote_device_name = None
        if remote_iface:
            rd_result = await db.execute(
                select(Device).where(Device.id == remote_iface.device_id)
            )
            rd = rd_result.scalar_one_or_none()
            remote_device_name = rd.name if rd else None

        # Find what we discovered on this port
        new_iface_result = await db.execute(
            select(Interface).where(Interface.id == iface_b_id if iface_a_id == local_iface.id else Interface.id == iface_a_id)
        )
        new_iface = new_iface_result.scalar_one_or_none()
        new_device_name = None
        if new_iface:
            nd_result = await db.execute(select(Device).where(Device.id == new_iface.device_id))
            nd = nd_result.scalar_one_or_none()
            new_device_name = nd.name if nd else None

        conflict = ScanConflict(
            scan_job_id=scan_job_id,
            device_id=device.id,
            conflict_type=ConflictType.port_cable_conflict,
            entity_table="cable",
            entity_id=existing_cable.id,
            field_name="connected_device",
            current_value={
                "cable_id": existing_cable.id,
                "iface_id": remote_iface_id,
                "device_name": remote_device_name,
            },
            discovered_value={
                "iface_a_id": a,
                "iface_b_id": b,
                "device_name": new_device_name,
                "switch_port": local_iface.name,
            },
            status=ConflictStatus.pending,
        )
        db.add(conflict)
        await db.flush()
        stats["conflicts"] += 1
        return

    cable = Cable(
        interface_a_id=a,
        interface_b_id=b,
        cable_type=CableType.cat6,
    )
    db.add(cable)
    await db.flush()
    stats["cables_created"] += 1


async def _update_mac_entry_interface(
    db: AsyncSession,
    mac_norm: str,
    scan_job_id: int,
    iface_id: int,
) -> None:
    """Set interface_id on MacEntry records for the given MAC in this scan job."""
    result = await db.execute(
        select(MacEntry).where(
            MacEntry.scan_job_id == scan_job_id,
            MacEntry.mac_address == mac_norm,
        )
    )
    for entry in result.scalars().all():
        entry.interface_id = iface_id
        db.add(entry)


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

async def link_topology(
    db: AsyncSession,
    device: Device,
    collected: CollectedData,
    scan_job_id: int,
) -> dict:
    """
    Auto-create Cable records between switch port interfaces and discovered
    devices. Called after reconcile() in scan_tasks.py.

    Returns a stats dict: cables_created, devices_created, skipped, conflicts.
    """
    stats = {
        "cables_created": 0,
        "devices_created": 0,
        "skipped": 0,
        "conflicts": 0,
    }

    # Only run for switches / routers (devices that have a MAC table)
    if device.device_type not in (
        DeviceType.switch,
        DeviceType.router,
        DeviceType.access_point,
    ):
        return stats

    # Load this device's interfaces keyed by if_index
    result = await db.execute(
        select(Interface).where(Interface.device_id == device.id)
    )
    all_ifaces = result.scalars().all()
    iface_by_ifindex: dict[int, Interface] = {
        i.if_index: i for i in all_ifaces if i.if_index is not None
    }
    iface_by_name: dict[str, Interface] = {i.name: i for i in all_ifaces}

    # -----------------------------------------------------------------------
    # Phase A — LLDP/CDP neighbors
    # -----------------------------------------------------------------------
    for neighbor in collected.neighbors:
        local_port_raw = neighbor.get("local_port", "")
        remote_hostname = neighbor.get("remote_hostname") or neighbor.get("remote_sys_name", "")
        remote_port_name = neighbor.get("remote_port", "")
        remote_ip = neighbor.get("remote_ip")

        # Try to resolve local interface from LLDP port number
        # LLDP port index format: "{time_mark}.{lldp_port_num}.{rem_index}"
        # Many switches set lldp_port_num == ifIndex
        local_iface: Interface | None = None
        parts = local_port_raw.split(".")
        if len(parts) >= 2:
            try:
                lldp_port_num = int(parts[1])
                local_iface = iface_by_ifindex.get(lldp_port_num)
            except ValueError:
                pass

        # Fallback: try treating the whole string as ifIndex
        if not local_iface:
            try:
                local_iface = iface_by_ifindex.get(int(local_port_raw))
            except (ValueError, TypeError):
                pass

        if not local_iface:
            continue

        # Find remote device
        remote_device = await _find_device_by_name_or_ip(db, remote_hostname or None, remote_ip)
        if not remote_device:
            continue

        # Find remote interface
        remote_iface: Interface | None = None
        if remote_port_name:
            remote_iface = await _find_interface_by_name(db, remote_device.id, remote_port_name)
        if not remote_iface:
            remote_iface = await _get_or_create_interface(db, remote_device)

        await _ensure_cable(
            db, local_iface.id, remote_iface.id, stats, device, scan_job_id, local_iface
        )

    # -----------------------------------------------------------------------
    # Phase B — MAC table + ARP correlation
    # -----------------------------------------------------------------------
    # Build mac_norm → ip from ARP entries
    mac_to_ip: dict[str, str] = {}
    for arp in collected.arp_entries:
        m = _norm_mac(arp.get("mac_address", ""))
        if m:
            mac_to_ip[m] = arp.get("ip_address", "")

    # Normalised MAC of the switch itself (skip self-entries)
    self_mac = _norm_mac(device.mac_address or "")

    for entry in collected.mac_entries:
        mac_norm = _norm_mac(entry.get("mac_address", ""))
        bridge_port = entry.get("bridge_port")

        if not mac_norm or not bridge_port:
            continue

        # Skip the switch's own MAC
        if mac_norm == self_mac:
            continue

        # bridge_port → if_index → Interface
        if_index = collected.bridge_port_map.get(bridge_port)
        if not if_index:
            continue
        local_iface = iface_by_ifindex.get(if_index)
        if not local_iface:
            continue

        # Populate MacEntry.interface_id
        await _update_mac_entry_interface(db, mac_norm, scan_job_id, local_iface.id)

        ip = mac_to_ip.get(mac_norm) or entry.get("ip_address") or None

        # Find or create the remote device
        remote_device = await _find_device_by_mac_or_ip(db, mac_norm, ip)
        if not remote_device:
            vendor_name = entry.get("vendor")
            remote_device = await _create_placeholder_device(db, mac_norm, ip, vendor_name)
            stats["devices_created"] += 1

        remote_iface = await _get_or_create_interface(db, remote_device)
        await _ensure_cable(
            db, local_iface.id, remote_iface.id, stats, device, scan_job_id, local_iface
        )

    await db.flush()
    return stats
