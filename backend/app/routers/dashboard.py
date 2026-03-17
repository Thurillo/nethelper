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


@router.get("/stats", response_model=DashboardStats)
async def get_dashboard_stats(
    _: Annotated[object, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> DashboardStats:
    (
        total_devices,
        active_devices,
        total_sites,
        total_cabinets,
        total_interfaces,
        total_cables,
        total_vlans,
        total_prefixes,
        total_ip_addresses,
        pending_conflicts,
        unmanaged_suspected,
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
    )

    recent_scan_objs = await crud_scan_job.get_recent(db, limit=10)
    recent_scans = [ScanJobRead.model_validate(j) for j in recent_scan_objs]

    return DashboardStats(
        total_devices=total_devices,
        active_devices=active_devices,
        total_sites=total_sites,
        total_cabinets=total_cabinets,
        total_interfaces=total_interfaces,
        total_cables=total_cables,
        total_vlans=total_vlans,
        total_prefixes=total_prefixes,
        total_ip_addresses=total_ip_addresses,
        pending_conflicts=pending_conflicts,
        recent_scans=recent_scans,
        unmanaged_suspected=unmanaged_suspected,
    )
