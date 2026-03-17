from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.base import CRUDBase
from app.models.mac_entry import MacEntry
from app.schemas.mac_entry import MacEntryCreate, MacEntryUpdate


class CRUDMacEntry(CRUDBase[MacEntry, MacEntryCreate, MacEntryUpdate]):
    async def search_by_mac(
        self, db: AsyncSession, mac_address: str
    ) -> list[MacEntry]:
        """Partial match search on mac_address (case-insensitive)."""
        result = await db.execute(
            select(MacEntry).where(
                MacEntry.mac_address.ilike(f"%{mac_address}%")
            )
        )
        return list(result.scalars().all())

    async def get_by_device(
        self, db: AsyncSession, device_id: int
    ) -> list[MacEntry]:
        result = await db.execute(
            select(MacEntry).where(MacEntry.device_id == device_id)
        )
        return list(result.scalars().all())

    async def deactivate_old_entries(
        self, db: AsyncSession, device_id: int, scan_job_id: int
    ) -> None:
        """Mark all existing mac entries for a device as inactive (except the current scan)."""
        await db.execute(
            update(MacEntry)
            .where(
                MacEntry.device_id == device_id,
                MacEntry.scan_job_id != scan_job_id,
                MacEntry.is_active == True,
            )
            .values(is_active=False)
        )
        await db.flush()

    async def purge_old_entries(self, db: AsyncSession, days: int) -> int:
        """Delete mac entries older than `days` days. Returns count deleted."""
        from sqlalchemy import delete
        from datetime import timedelta

        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        result = await db.execute(
            delete(MacEntry).where(MacEntry.seen_at < cutoff)
        )
        await db.flush()
        return result.rowcount


crud_mac_entry = CRUDMacEntry(MacEntry)
