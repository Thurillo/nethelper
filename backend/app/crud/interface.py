from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.base import CRUDBase
from app.models.interface import Interface
from app.schemas.interface import InterfaceCreate, InterfaceUpdate


class CRUDInterface(CRUDBase[Interface, InterfaceCreate, InterfaceUpdate]):
    async def get_by_device(self, db: AsyncSession, device_id: int) -> list[Interface]:
        result = await db.execute(
            select(Interface).where(Interface.device_id == device_id)
        )
        return list(result.scalars().all())

    async def get_by_mac(self, db: AsyncSession, mac_address: str) -> list[Interface]:
        result = await db.execute(
            select(Interface).where(
                Interface.mac_address.ilike(mac_address)
            )
        )
        return list(result.scalars().all())

    async def get_by_device_and_name(
        self, db: AsyncSession, device_id: int, name: str
    ) -> Interface | None:
        result = await db.execute(
            select(Interface).where(
                Interface.device_id == device_id,
                Interface.name == name,
            )
        )
        return result.scalar_one_or_none()


crud_interface = CRUDInterface(Interface)
