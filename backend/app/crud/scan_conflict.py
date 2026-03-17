from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import func, select
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

    async def ignore_conflict(
        self,
        db: AsyncSession,
        conflict_id: int,
        user_id: int,
        notes: Optional[str] = None,
    ) -> Optional[ScanConflict]:
        return await self._resolve(db, conflict_id, user_id, ConflictStatus.ignored, notes)


crud_scan_conflict = CRUDScanConflict(ScanConflict)
