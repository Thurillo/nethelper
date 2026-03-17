from __future__ import annotations

from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.base import CRUDBase
from app.models.ip_address import IpAddress
from app.schemas.ip_address import IpAddressCreate, IpAddressUpdate


class CRUDIpAddress(CRUDBase[IpAddress, IpAddressCreate, IpAddressUpdate]):
    async def get_by_address(self, db: AsyncSession, address: str) -> Optional[IpAddress]:
        result = await db.execute(
            select(IpAddress).where(IpAddress.address == address)
        )
        return result.scalar_one_or_none()

    async def get_by_device(self, db: AsyncSession, device_id: int) -> list[IpAddress]:
        result = await db.execute(
            select(IpAddress).where(IpAddress.device_id == device_id)
        )
        return list(result.scalars().all())

    async def get_by_interface(self, db: AsyncSession, interface_id: int) -> list[IpAddress]:
        result = await db.execute(
            select(IpAddress).where(IpAddress.interface_id == interface_id)
        )
        return list(result.scalars().all())

    async def get_by_prefix(
        self,
        db: AsyncSession,
        prefix_id: int,
        skip: int = 0,
        limit: int = 100,
    ) -> list[IpAddress]:
        result = await db.execute(
            select(IpAddress)
            .where(IpAddress.prefix_id == prefix_id)
            .offset(skip)
            .limit(limit)
        )
        return list(result.scalars().all())


crud_ip_address = CRUDIpAddress(IpAddress)
