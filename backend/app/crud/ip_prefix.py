from __future__ import annotations

from ipaddress import IPv4Network, IPv6Network, ip_address as parse_ip, ip_network
from typing import Union

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.base import CRUDBase
from app.models.ip_address import IpAddress
from app.models.ip_prefix import IpPrefix
from app.schemas.ip_prefix import IpPrefixCreate, IpPrefixUpdate, PrefixUtilization


class CRUDIpPrefix(CRUDBase[IpPrefix, IpPrefixCreate, IpPrefixUpdate]):
    async def get_by_prefix(self, db: AsyncSession, prefix: str) -> IpPrefix | None:
        result = await db.execute(
            select(IpPrefix).where(IpPrefix.prefix == prefix)
        )
        return result.scalar_one_or_none()

    async def get_utilization(
        self, db: AsyncSession, prefix_id: int
    ) -> PrefixUtilization | None:
        prefix_obj = await self.get(db, prefix_id)
        if prefix_obj is None:
            return None

        try:
            network: Union[IPv4Network, IPv6Network] = ip_network(
                prefix_obj.prefix, strict=False
            )
        except ValueError:
            return None

        # Count usable hosts (exclude network and broadcast for IPv4)
        if isinstance(network, IPv4Network):
            total = max(network.num_addresses - 2, 0) if network.prefixlen < 31 else network.num_addresses
        else:
            total = network.num_addresses

        # Count assigned IPs in this prefix
        result = await db.execute(
            select(IpAddress).where(IpAddress.prefix_id == prefix_id)
        )
        used_ips = list(result.scalars().all())
        used = len(used_ips)
        free = max(total - used, 0)
        utilization_pct = round((used / total * 100) if total > 0 else 0.0, 2)

        return PrefixUtilization(
            prefix=prefix_obj.prefix,
            total=total,
            used=used,
            free=free,
            utilization_pct=utilization_pct,
        )

    async def get_available_ips(
        self, db: AsyncSession, prefix_id: int, limit: int = 50
    ) -> list[str]:
        prefix_obj = await self.get(db, prefix_id)
        if prefix_obj is None:
            return []

        try:
            network = ip_network(prefix_obj.prefix, strict=False)
        except ValueError:
            return []

        # Get already-assigned IPs in this prefix
        result = await db.execute(
            select(IpAddress.address).where(IpAddress.prefix_id == prefix_id)
        )
        assigned_raw = {row[0] for row in result.all()}
        # Normalize assigned IPs (strip CIDR notation)
        assigned = set()
        for a in assigned_raw:
            try:
                assigned.add(str(parse_ip(a.split("/")[0])))
            except ValueError:
                pass

        available: list[str] = []
        hosts = list(network.hosts()) if network.version == 4 else list(network.hosts())
        for host in hosts:
            if str(host) not in assigned:
                available.append(str(host))
            if len(available) >= limit:
                break

        return available

    async def get_by_site(self, db: AsyncSession, site_id: int) -> list[IpPrefix]:
        result = await db.execute(
            select(IpPrefix).where(IpPrefix.site_id == site_id)
        )
        return list(result.scalars().all())


crud_ip_prefix = CRUDIpPrefix(IpPrefix)
