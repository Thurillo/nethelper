from __future__ import annotations

import asyncio
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.scan_job import crud_scan_job
from app.crud.scan_conflict import crud_scan_conflict
from app.database import get_db
from app.dependencies import get_current_user
from app.models.cable import Cable
from app.models.cabinet import Cabinet
from app.models.device import Device, DeviceStatus
from app.models.interface import Interface
from app.models.ip_address import IpAddress
from app.models.ip_prefix import IpPrefix
from app.models.site import Site
from app.models.vlan import Vlan
from app.schemas.dashboard import DashboardStats
from app.schemas.scan_job import ScanJobRead

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


async def _count(db: AsyncSession, model) -> int:
    result = await db.execute(select(func.count(model.id)))
    return result.scalar() or 0


async def _count_where(db: AsyncSession, model, *conditions) -> int:
    result = await db.execute(select(func.count(model.id)).where(*conditions))
    return result.scalar() or 0


async def _group_by(db: AsyncSession, model, column) -> dict[str, int]:
    result = await db.execute(
        select(column, func.count(model.id)).group_by(column)
    )
    out = {}
    for row in result.all():
        key = row[0].value if hasattr(row[0], 'value') else str(row[0])
        out[key] = row[1]
    return out


@router.get("/stats", response_model=DashboardStats)
async def get_dashboard_stats(
    _: Annotated[object, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> DashboardStats:
    (
        devices_total,
        devices_active,
        sites_count,
        cabinets_count,
        interfaces_count,
        cables_count,
        vlans_count,
        prefixes_count,
        ip_addresses_count,
        pending_conflicts,
        suspected_unmanaged_switches,
        devices_by_type,
        devices_by_status,
    ) = await asyncio.gather(
        _count(db, Device),
        _count_where(db, Device, Device.status == DeviceStatus.active),
        _count(db, Site),
        _count(db, Cabinet),
        _count(db, Interface),
        _count(db, Cable),
        _count(db, Vlan),
        _count(db, IpPrefix),
        _count(db, IpAddress),
        crud_scan_conflict.get_pending_count(db),
        _count_where(db, Device, Device.is_unmanaged_suspected == True),
        _group_by(db, Device, Device.device_type),
        _group_by(db, Device, Device.status),
    )

    recent_scan_objs = await crud_scan_job.get_recent(db, limit=10)
    recent_scans = [ScanJobRead.model_validate(j) for j in recent_scan_objs]

    return DashboardStats(
        devices_total=devices_total,
        devices_active=devices_active,
        sites_count=sites_count,
        cabinets_count=cabinets_count,
        interfaces_count=interfaces_count,
        cables_count=cables_count,
        vlans_count=vlans_count,
        prefixes_count=prefixes_count,
        ip_addresses_count=ip_addresses_count,
        pending_conflicts=pending_conflicts,
        recent_scans=recent_scans,
        suspected_unmanaged_switches=suspected_unmanaged_switches,
        devices_by_type=devices_by_type,
        devices_by_status=devices_by_status,
    )
