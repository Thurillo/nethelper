from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.base import CRUDBase
from app.models.cabinet import Cabinet
from app.models.site import Site
from app.schemas.site import SiteCreate, SiteRead, SiteUpdate


class CRUDSite(CRUDBase[Site, SiteCreate, SiteUpdate]):
    async def get_with_cabinet_count(self, db: AsyncSession, site_id: int) -> SiteRead | None:
        site = await self.get(db, site_id)
        if site is None:
            return None
        count_result = await db.execute(
            select(func.count(Cabinet.id)).where(Cabinet.site_id == site_id)
        )
        cabinet_count = count_result.scalar() or 0
        return SiteRead(
            id=site.id,
            name=site.name,
            description=site.description,
            address=site.address,
            created_at=site.created_at,
            cabinet_count=cabinet_count,
        )

    async def get_multi_with_counts(
        self, db: AsyncSession, skip: int = 0, limit: int = 100
    ) -> list[SiteRead]:
        stmt = (
            select(Site, func.count(Cabinet.id).label("cabinet_count"))
            .outerjoin(Cabinet, Cabinet.site_id == Site.id)
            .group_by(Site.id)
            .offset(skip)
            .limit(limit)
        )
        result = await db.execute(stmt)
        rows = result.all()
        return [
            SiteRead(
                id=row.Site.id,
                name=row.Site.name,
                description=row.Site.description,
                address=row.Site.address,
                created_at=row.Site.created_at,
                cabinet_count=row.cabinet_count,
            )
            for row in rows
        ]


crud_site = CRUDSite(Site)
