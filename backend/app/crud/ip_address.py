from __future__ import annotations

from typing import Optional

from sqlalchemy import cast, func, select
from sqlalchemy.dialects.postgresql import INET
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.crud.base import CRUDBase
from app.models.ip_address import IpAddress
from app.models.device import Device
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
        cidr: str | None = None,
        skip: int = 0,
        limit: int = 100,
    ) -> list[IpAddress]:
        """
        Return IPs for a prefix. If cidr is provided, match by CIDR range (inet <<)
        so that IPs with prefix_id=NULL are also included. Falls back to prefix_id filter.
        """
        stmt = (
            select(IpAddress)
            .options(
                selectinload(IpAddress.device).selectinload(Device.vendor),
                selectinload(IpAddress.device).selectinload(Device.site),
            )
        )
        if cidr:
            stmt = stmt.where(cast(IpAddress.address, INET).op("<<")(cast(cidr, INET)))
        else:
            stmt = stmt.where(IpAddress.prefix_id == prefix_id)
        stmt = stmt.order_by(IpAddress.address).offset(skip).limit(limit)
        result = await db.execute(stmt)
        return list(result.scalars().all())

    async def count_by_cidr(self, db: AsyncSession, cidr: str) -> int:
        result = await db.execute(
            select(func.count(IpAddress.id)).where(
                cast(IpAddress.address, INET).op("<<")(cast(cidr, INET))
            )
        )
        return result.scalar_one()


crud_ip_address = CRUDIpAddress(IpAddress)
