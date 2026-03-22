from __future__ import annotations

from pydantic import BaseModel

from app.schemas.scan_job import ScanJobRead


class DashboardStats(BaseModel):
    devices_total: int
    devices_active: int
    sites_count: int
    cabinets_count: int
    interfaces_count: int
    cables_count: int
    vlans_count: int
    prefixes_count: int
    ip_addresses_count: int
    pending_conflicts: int
    recent_scans: list[ScanJobRead]
    suspected_unmanaged_switches: int
    devices_by_type: dict[str, int]
    devices_by_status: dict[str, int]
