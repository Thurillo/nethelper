from __future__ import annotations

from ipaddress import IPv4Network, IPv6Network, ip_address as parse_ip, ip_network
from typing import Union

from sqlalchemy import cast, func, select, update
from sqlalchemy.dialects.postgresql import INET
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.crud.base import CRUDBase
from app.models.ip_address import IpAddress
from app.models.ip_prefix import IpPrefix
from app.schemas.ip_prefix import IpPrefixCreate, IpPrefixUpdate, PrefixUtilization


def _cidr_str(prefix_str: str) -> str | None:
    """Return normalized CIDR string for the prefix, or None on error."""
    try:
        return str(ip_network(prefix_str, strict=False))
    except ValueError:
        return None


class CRUDIpPrefix(CRUDBase[IpPrefix, IpPrefixCreate, IpPrefixUpdate]):

    async def get(self, db: AsyncSession, id: int) -> IpPrefix | None:
        result = await db.execute(
            select(IpPrefix)
            .options(selectinload(IpPrefix.site), selectinload(IpPrefix.vlan))
            .where(IpPrefix.id == id)
        )
        return result.scalar_one_or_none()

    async def get_multi(
        self,
        db: AsyncSession,
        skip: int = 0,
        limit: int = 100,
        **filters,
    ) -> list[IpPrefix]:
        stmt = (
            select(IpPrefix)
            .options(selectinload(IpPrefix.site), selectinload(IpPrefix.vlan))
        )
        for field, value in filters.items():
            if value is not None and hasattr(IpPrefix, field):
                stmt = stmt.where(getattr(IpPrefix, field) == value)
        stmt = stmt.offset(skip).limit(limit)
        result = await db.execute(stmt)
        return list(result.scalars().all())

    async def get_by_prefix(self, db: AsyncSession, prefix: str) -> IpPrefix | None:
        result = await db.execute(
            select(IpPrefix).where(IpPrefix.prefix == prefix)
        )
        return result.scalar_one_or_none()

    async def _count_ips_in_cidr(self, db: AsyncSession, cidr: str) -> int:
        """Count all ip_address rows whose address falls within the given CIDR using PostgreSQL inet ops."""
        result = await db.execute(
            select(func.count(IpAddress.id)).where(
                cast(IpAddress.address, INET).op("<<")(cast(cidr, INET))
            )
        )
        return result.scalar_one()

    async def get_used_counts(self, db: AsyncSession, prefixes: list[IpPrefix]) -> dict[int, int]:
        """Return {prefix_id: ip_count} counting ALL IPs that fall within each prefix CIDR."""
        result = {}
        for p in prefixes:
            cidr = _cidr_str(p.prefix)
            result[p.id] = await self._count_ips_in_cidr(db, cidr) if cidr else 0
        return result

    async def assign_prefix_ids(self, db: AsyncSession) -> int:
        """
        For every ip_address with prefix_id=NULL, find the smallest containing prefix
        and set prefix_id accordingly. Returns count of updated rows.
        """
        # Load all prefixes
        prefixes_res = await db.execute(select(IpPrefix))
        prefixes = list(prefixes_res.scalars().all())

        # Build network objects sorted by prefix length desc (most specific first)
        nets: list[tuple[IpPrefix, IPv4Network | IPv6Network]] = []
        for p in prefixes:
            try:
                nets.append((p, ip_network(p.prefix, strict=False)))
            except ValueError:
                pass
        nets.sort(key=lambda x: x[1].prefixlen, reverse=True)

        # Fetch all IPs without a prefix_id
        ips_res = await db.execute(
            select(IpAddress).where(IpAddress.prefix_id.is_(None))
        )
        unlinked = list(ips_res.scalars().all())

        updated = 0
        for ip_obj in unlinked:
            raw = ip_obj.address.split("/")[0]
            try:
                addr = parse_ip(raw)
            except ValueError:
                continue
            for prefix_obj, net in nets:
                if addr in net:
                    ip_obj.prefix_id = prefix_obj.id
                    db.add(ip_obj)
                    updated += 1
                    break

        if updated:
            await db.flush()
        return updated

    async def get_utilization(
        self, db: AsyncSession, prefix_id: int
    ) -> PrefixUtilization | None:
        prefix_obj = await self.get(db, prefix_id)
        if prefix_obj is None:
            return None

        cidr = _cidr_str(prefix_obj.prefix)
        if cidr is None:
            return None

        network = ip_network(prefix_obj.prefix, strict=False)
        if isinstance(network, IPv4Network):
            total = max(network.num_addresses - 2, 0) if network.prefixlen < 31 else network.num_addresses
        else:
            total = network.num_addresses

        used = await self._count_ips_in_cidr(db, cidr)
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

        result = await db.execute(
            select(IpAddress.address).where(
                cast(IpAddress.address, INET).op("<<")(cast(str(network), INET))
            )
        )
        assigned_raw = {row[0] for row in result.all()}
        assigned = set()
        for a in assigned_raw:
            try:
                assigned.add(str(parse_ip(a.split("/")[0])))
            except ValueError:
                pass

        available: list[str] = []
        for host in network.hosts():
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
