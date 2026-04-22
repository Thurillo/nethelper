from __future__ import annotations

from typing import TYPE_CHECKING, Any

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

if TYPE_CHECKING:
    from app.models.device import Device
    from app.models.scan_conflict import ScanConflict

from app.discovery.drivers.base import CollectedData
from app.discovery.topology_linker import _find_device_by_mac_or_ip, _norm_mac
from app.models.interface import Interface
from app.models.scan_conflict import ConflictStatus, ConflictType, ScanConflict


async def _create_conflict(
    db: AsyncSession,
    scan_job_id: int,
    device_id: int,
    conflict_type: ConflictType,
    entity_table: str | None,
    entity_id: int | None,
    field_name: str | None,
    current_value: Any,
    discovered_value: Any,
) -> ScanConflict:
    conflict = ScanConflict(
        scan_job_id=scan_job_id,
        device_id=device_id,
        conflict_type=conflict_type,
        entity_table=entity_table,
        entity_id=entity_id,
        field_name=field_name,
        current_value=current_value,
        discovered_value=discovered_value,
        status=ConflictStatus.pending,
    )
    db.add(conflict)
    await db.flush()
    return conflict


class Reconciler:
    """Compare collected data against the DB and create ScanConflict records."""

    async def reconcile(
        self,
        db: AsyncSession,
        device: "Device",
        collected_data: CollectedData,
        scan_job_id: int,
    ) -> list["ScanConflict"]:
        conflicts: list[ScanConflict] = []

        # ----------------------------------------------------------------
        # 1. Interfaces
        # ----------------------------------------------------------------
        result = await db.execute(
            select(Interface).where(Interface.device_id == device.id)
        )
        existing_ifaces = {i.name: i for i in result.scalars().all()}

        is_first_run = len(existing_ifaces) == 0

        for collected_iface in collected_data.interfaces:
            name = collected_iface.get("name")
            if not name:
                continue

            existing = existing_ifaces.get(name)

            if existing is None:
                if is_first_run:
                    # First run: create directly, no conflict
                    new_iface = Interface(
                        device_id=device.id,
                        name=name,
                        description=collected_iface.get("description"),
                        mac_address=collected_iface.get("mac_address"),
                        speed_mbps=collected_iface.get("speed_mbps"),
                        mtu=collected_iface.get("mtu"),
                        admin_up=collected_iface.get("admin_up"),
                        oper_up=collected_iface.get("oper_up"),
                        if_index=collected_iface.get("if_index"),
                    )
                    db.add(new_iface)
                else:
                    # New interface discovered after first run
                    conflict = await _create_conflict(
                        db,
                        scan_job_id=scan_job_id,
                        device_id=device.id,
                        conflict_type=ConflictType.new_interface,
                        entity_table="interface",
                        entity_id=None,
                        field_name="name",
                        current_value=None,
                        discovered_value=collected_iface,
                    )
                    conflicts.append(conflict)
            else:
                # Check for field changes
                field_checks = [
                    ("mac_address", existing.mac_address, collected_iface.get("mac_address")),
                    ("speed_mbps", existing.speed_mbps, collected_iface.get("speed_mbps")),
                    ("admin_up", existing.admin_up, collected_iface.get("admin_up")),
                ]
                for field, current, discovered in field_checks:
                    if discovered is not None and current != discovered:
                        conflict = await _create_conflict(
                            db,
                            scan_job_id=scan_job_id,
                            device_id=device.id,
                            conflict_type=ConflictType.other,
                            entity_table="interface",
                            entity_id=existing.id,
                            field_name=field,
                            current_value=current,
                            discovered_value=discovered,
                        )
                        conflicts.append(conflict)

                # Update oper_up directly (operational status, no conflict needed)
                if collected_iface.get("oper_up") is not None:
                    existing.oper_up = collected_iface["oper_up"]
                    db.add(existing)

        # ----------------------------------------------------------------
        # 2. System info (hostname)
        # ----------------------------------------------------------------
        discovered_hostname = collected_data.system_info.get("hostname") or collected_data.system_info.get("sys_name")
        if discovered_hostname and discovered_hostname != device.name:
            if not is_first_run:
                conflict = await _create_conflict(
                    db,
                    scan_job_id=scan_job_id,
                    device_id=device.id,
                    conflict_type=ConflictType.changed_hostname,
                    entity_table="device",
                    entity_id=device.id,
                    field_name="name",
                    current_value=device.name,
                    discovered_value=discovered_hostname,
                )
                conflicts.append(conflict)

        # ----------------------------------------------------------------
        # 3. Update device model/serial on first run
        # ----------------------------------------------------------------
        if is_first_run:
            model = collected_data.system_info.get("model")
            serial = collected_data.system_info.get("serial")
            if model and not device.model:
                device.model = model
            if serial and not device.serial_number:
                device.serial_number = serial
            db.add(device)

        await db.flush()

        # ----------------------------------------------------------------
        # 3. Direct device discovery
        # For each non-LLDP/CDP port with 1-2 MACs not yet in inventory,
        # create a new_device_discovered conflict for admin review.
        # ----------------------------------------------------------------
        mac_by_iface: dict[str, list[dict]] = {}
        for m in collected_data.mac_entries:
            iface_name = m.get("interface_name", "")
            if iface_name:
                mac_by_iface.setdefault(iface_name, []).append(m)

        neighbor_ports = {n.get("local_port", "") for n in collected_data.neighbors}

        for iface_name, mac_list in mac_by_iface.items():
            if iface_name in neighbor_ports:
                continue
            if len(mac_list) > 2:
                continue

            for mac_entry in mac_list:
                mac = mac_entry.get("mac_address", "")
                if not mac:
                    continue

                known = await _find_device_by_mac_or_ip(
                    db, _norm_mac(mac), mac_entry.get("ip_address")
                )
                if known:
                    continue

                # Skip if a pending conflict for this MAC already exists
                dup = await db.execute(
                    select(ScanConflict).where(
                        and_(
                            ScanConflict.device_id == device.id,
                            ScanConflict.conflict_type == ConflictType.new_device_discovered,
                            ScanConflict.status == ConflictStatus.pending,
                        )
                    )
                )
                already_pending = any(
                    (c.discovered_value or {}).get("mac_address") == mac
                    for c in dup.scalars().all()
                )
                if already_pending:
                    continue

                vendor_name = None
                try:
                    from app.tasks.scan_tasks import _vendor_from_mac
                    vendor_name = _vendor_from_mac(mac)
                except Exception:
                    pass

                iface = existing_ifaces.get(iface_name)
                conflict = ScanConflict(
                    scan_job_id=scan_job_id,
                    device_id=device.id,
                    conflict_type=ConflictType.new_device_discovered,
                    entity_table="interface",
                    entity_id=iface.id if iface else None,
                    field_name=None,
                    current_value=None,
                    discovered_value={
                        "interface_name": iface_name,
                        "interface_id": iface.id if iface else None,
                        "mac_address": mac,
                        "vendor_name": vendor_name,
                        "ip_address": mac_entry.get("ip_address"),
                        "vlan_id": mac_entry.get("vlan_id"),
                    },
                    status=ConflictStatus.pending,
                )
                db.add(conflict)
                conflicts.append(conflict)

        await db.flush()
        return conflicts
