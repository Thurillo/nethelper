from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.device import Device
from app.models.interface import Interface
from app.models.mac_entry import MacEntry
from app.models.scan_conflict import ConflictStatus, ConflictType, ScanConflict

if TYPE_CHECKING:
    pass

# Minimum number of unique MACs on one interface to suspect an unmanaged switch
UNMANAGED_THRESHOLD = 3


async def detect_unmanaged_switches(
    db: AsyncSession,
    device_id: int,
    scan_job_id: int,
) -> list[ScanConflict]:
    """Check each interface of device_id for signs of unmanaged switches.

    If an interface has >= UNMANAGED_THRESHOLD active MAC entries from the
    latest scan, and none of those MACs correspond to a managed device's
    primary IP, create a ScanConflict of type suspected_unmanaged_switch.
    """
    conflicts: list[ScanConflict] = []

    # Get all interfaces for the device
    iface_result = await db.execute(
        select(Interface).where(Interface.device_id == device_id)
    )
    interfaces = iface_result.scalars().all()

    # Collect primary IPs of all managed devices → map to device
    dev_result = await db.execute(
        select(Device.primary_ip, Device.id).where(
            Device.primary_ip.isnot(None)
        )
    )
    managed_ips = {row.primary_ip.split("/")[0]: row.id for row in dev_result.all()}

    for iface in interfaces:
        # Count active MAC entries on this interface from this scan job
        count_result = await db.execute(
            select(func.count(MacEntry.id)).where(
                MacEntry.interface_id == iface.id,
                MacEntry.scan_job_id == scan_job_id,
                MacEntry.is_active == True,
            )
        )
        active_mac_count = count_result.scalar() or 0

        if active_mac_count < UNMANAGED_THRESHOLD:
            continue

        # Check if any of those MACs correspond to managed device IPs
        mac_result = await db.execute(
            select(MacEntry.mac_address, MacEntry.ip_address).where(
                MacEntry.interface_id == iface.id,
                MacEntry.scan_job_id == scan_job_id,
                MacEntry.is_active == True,
            )
        )
        mac_entries = mac_result.all()

        # Check if any IPs found correlate to a managed device
        found_managed = False
        for entry in mac_entries:
            if entry.ip_address and entry.ip_address.split("/")[0] in managed_ips:
                found_managed = True
                break

        if not found_managed:
            # This interface likely has an unmanaged switch behind it
            conflict = ScanConflict(
                scan_job_id=scan_job_id,
                device_id=device_id,
                conflict_type=ConflictType.suspected_unmanaged_switch,
                entity_table="interface",
                entity_id=iface.id,
                field_name=None,
                current_value=None,
                discovered_value={
                    "interface_name": iface.name,
                    "active_mac_count": active_mac_count,
                },
                status=ConflictStatus.pending,
            )
            db.add(conflict)
            await db.flush()
            conflicts.append(conflict)

            # Mark device as suspected unmanaged
            dev_result2 = await db.execute(
                select(Device).where(Device.id == device_id)
            )
            dev = dev_result2.scalar_one_or_none()
            if dev:
                dev.is_unmanaged_suspected = True
                db.add(dev)

    await db.flush()
    return conflicts
