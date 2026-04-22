from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.base import CRUDBase
from app.models.scan_conflict import ConflictStatus, ScanConflict
from app.schemas.scan_conflict import ScanConflictRead


class CRUDScanConflict(CRUDBase[ScanConflict, ScanConflictRead, ScanConflictRead]):
    async def get_pending_count(self, db: AsyncSession) -> int:
        result = await db.execute(
            select(func.count(ScanConflict.id)).where(
                ScanConflict.status == ConflictStatus.pending
            )
        )
        return result.scalar() or 0

    async def get_multi_filtered(
        self,
        db: AsyncSession,
        skip: int = 0,
        limit: int = 100,
        status: Optional[str] = None,
        device_id: Optional[int] = None,
        conflict_type: Optional[str] = None,
    ) -> list[ScanConflict]:
        stmt = select(ScanConflict)
        if status is not None:
            stmt = stmt.where(ScanConflict.status == status)
        if device_id is not None:
            stmt = stmt.where(ScanConflict.device_id == device_id)
        if conflict_type is not None:
            stmt = stmt.where(ScanConflict.conflict_type == conflict_type)
        stmt = stmt.order_by(ScanConflict.created_at.desc()).offset(skip).limit(limit)
        result = await db.execute(stmt)
        return list(result.scalars().all())

    async def _resolve(
        self,
        db: AsyncSession,
        conflict_id: int,
        user_id: int,
        new_status: ConflictStatus,
        notes: Optional[str] = None,
    ) -> Optional[ScanConflict]:
        conflict = await self.get(db, conflict_id)
        if conflict is None:
            return None
        conflict.status = new_status
        conflict.resolved_by_user_id = user_id
        conflict.resolved_at = datetime.now(timezone.utc)
        if notes:
            conflict.notes = notes
        db.add(conflict)
        await db.flush()
        await db.refresh(conflict)
        return conflict

    async def accept_conflict(
        self,
        db: AsyncSession,
        conflict_id: int,
        user_id: int,
        notes: Optional[str] = None,
    ) -> Optional[ScanConflict]:
        conflict = await self.get(db, conflict_id)
        if conflict is None:
            return None

        # Apply discovered_value to the entity in DB
        await self._apply_discovered_value(db, conflict)

        return await self._resolve(db, conflict_id, user_id, ConflictStatus.accepted, notes)

    async def _apply_discovered_value(
        self, db: AsyncSession, conflict: ScanConflict
    ) -> None:
        """Apply discovered_value to the entity referenced by the conflict."""
        if conflict.entity_table is None or conflict.entity_id is None or conflict.field_name is None:
            return
        if conflict.discovered_value is None:
            return

        model_map: dict[str, type] = {}
        try:
            from app.models.interface import Interface
            from app.models.device import Device
            from app.models.ip_address import IpAddress
            model_map = {
                "interface": Interface,
                "device": Device,
                "ip_address": IpAddress,
            }
        except ImportError:
            return

        model_cls = model_map.get(conflict.entity_table)
        if model_cls is None:
            return

        result = await db.execute(
            select(model_cls).where(model_cls.id == conflict.entity_id)
        )
        entity = result.scalar_one_or_none()
        if entity is None:
            return

        if hasattr(entity, conflict.field_name):
            setattr(entity, conflict.field_name, conflict.discovered_value)
            db.add(entity)
            await db.flush()

    async def reject_conflict(
        self,
        db: AsyncSession,
        conflict_id: int,
        user_id: int,
        notes: Optional[str] = None,
    ) -> Optional[ScanConflict]:
        return await self._resolve(db, conflict_id, user_id, ConflictStatus.rejected, notes)

    async def bulk_accept(
        self,
        db: AsyncSession,
        conflict_ids: list[int],
        user_id: int,
        notes: Optional[str] = None,
    ) -> list[ScanConflict]:
        """Accept multiple conflicts: one query to load all, then per-entity value apply."""
        res = await db.execute(select(ScanConflict).where(ScanConflict.id.in_(conflict_ids)))
        conflicts = list(res.scalars().all())
        now = datetime.now(timezone.utc)
        for conflict in conflicts:
            await self._apply_discovered_value(db, conflict)
            conflict.status = ConflictStatus.accepted
            conflict.resolved_by_user_id = user_id
            conflict.resolved_at = now
            if notes:
                conflict.notes = notes
            db.add(conflict)
        await db.flush()
        for conflict in conflicts:
            await db.refresh(conflict)
        return conflicts

    async def bulk_reject(
        self,
        db: AsyncSession,
        conflict_ids: list[int],
        user_id: int,
        notes: Optional[str] = None,
    ) -> list[ScanConflict]:
        """Reject multiple conflicts in a single UPDATE + SELECT."""
        now = datetime.now(timezone.utc)
        await db.execute(
            update(ScanConflict)
            .where(ScanConflict.id.in_(conflict_ids))
            .values(
                status=ConflictStatus.rejected,
                resolved_by_user_id=user_id,
                resolved_at=now,
                notes=notes,
            )
        )
        await db.flush()
        res = await db.execute(select(ScanConflict).where(ScanConflict.id.in_(conflict_ids)))
        return list(res.scalars().all())

    async def accept_new_device_conflict(
        self,
        db: AsyncSession,
        conflict_id: int,
        user_id: int,
        device_name: str,
        device_type: str,
        notes: str | None = None,
    ) -> tuple["ScanConflict | None", "Any"]:
        """Accept a new_device_discovered conflict: create Device + Interface + Cable."""
        conflict = await self.get(db, conflict_id)
        if conflict is None:
            return None, None

        dv = conflict.discovered_value or {}
        mac = dv.get("mac_address")
        interface_id = dv.get("interface_id")

        from app.models.device import Device, DeviceType, DeviceStatus
        from app.models.interface import Interface
        from app.models.cable import Cable, CableType

        new_device = Device(
            name=device_name,
            device_type=DeviceType(device_type),
            status=DeviceStatus.active,
            mac_address=mac,
            primary_ip=dv.get("ip_address") or None,
        )
        db.add(new_device)
        await db.flush()
        await db.refresh(new_device)

        new_iface = Interface(
            device_id=new_device.id,
            name="eth0",
            mac_address=mac,
        )
        db.add(new_iface)
        await db.flush()
        await db.refresh(new_iface)

        if interface_id:
            iface_a = min(interface_id, new_iface.id)
            iface_b = max(interface_id, new_iface.id)
            # Avoid duplicate cable
            from sqlalchemy import select as sa_select, and_ as sa_and
            existing_cable = await db.execute(
                sa_select(Cable).where(
                    sa_and(Cable.interface_a_id == iface_a, Cable.interface_b_id == iface_b)
                )
            )
            if existing_cable.scalar_one_or_none() is None:
                db.add(Cable(interface_a_id=iface_a, interface_b_id=iface_b, cable_type=CableType.other))
                await db.flush()

        resolved = await self._resolve(db, conflict_id, user_id, ConflictStatus.accepted, notes)
        return resolved, new_device

    async def ignore_conflict(
        self,
        db: AsyncSession,
        conflict_id: int,
        user_id: int,
        notes: Optional[str] = None,
    ) -> Optional[ScanConflict]:
        return await self._resolve(db, conflict_id, user_id, ConflictStatus.ignored, notes)


crud_scan_conflict = CRUDScanConflict(ScanConflict)
