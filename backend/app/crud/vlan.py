from __future__ import annotations

from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.base import CRUDBase
from app.models.vlan import Vlan
from app.schemas.vlan import VlanCreate, VlanUpdate


class CRUDVlan(CRUDBase[Vlan, VlanCreate, VlanUpdate]):
    async def get_by_vid(
        self, db: AsyncSession, vid: int, site_id: Optional[int] = None
    ) -> Optional[Vlan]:
        stmt = select(Vlan).where(Vlan.vid == vid)
        if site_id is not None:
            stmt = stmt.where(Vlan.site_id == site_id)
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_site(self, db: AsyncSession, site_id: int) -> list[Vlan]:
        result = await db.execute(
            select(Vlan).where(Vlan.site_id == site_id)
        )
        return list(result.scalars().all())


crud_vlan = CRUDVlan(Vlan)
