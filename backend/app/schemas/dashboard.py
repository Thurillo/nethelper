from __future__ import annotations

from pydantic import BaseModel

from app.schemas.scan_job import ScanJobRead


class DashboardStats(BaseModel):
    total_devices: int
    active_devices: int
    total_sites: int
    total_cabinets: int
    total_interfaces: int
    total_cables: int
    total_vlans: int
    total_prefixes: int
    total_ip_addresses: int
    pending_conflicts: int
    recent_scans: list[ScanJobRead]
    unmanaged_suspected: int
