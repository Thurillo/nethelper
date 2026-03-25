"""SQLAlchemy model registry.

Importing this package ensures every model class is registered on
``Base.metadata`` so Alembic autogenerate can detect all tables.
"""
from __future__ import annotations

# Import order matters: leaf models first, then models that reference them.
from app.models.user import User, UserRole  # noqa: F401
from app.models.vendor import Vendor  # noqa: F401
from app.models.site import Site  # noqa: F401
from app.models.cabinet import Cabinet  # noqa: F401
from app.models.vlan import Vlan, VlanStatus  # noqa: F401
from app.models.ip_prefix import IpPrefix, PrefixStatus  # noqa: F401
from app.models.device import Device, DeviceType, DeviceStatus  # noqa: F401
from app.models.interface import Interface, InterfaceType  # noqa: F401
from app.models.interface_vlan import InterfaceVlan  # noqa: F401
from app.models.cable import Cable, CableType  # noqa: F401
from app.models.ip_address import IpAddress, IpAddressSource  # noqa: F401
from app.models.scan_job import ScanJob, ScanType, ScanStatus  # noqa: F401
from app.models.mac_entry import MacEntry, MacEntrySource  # noqa: F401
from app.models.scan_conflict import ScanConflict, ConflictType, ConflictStatus  # noqa: F401
from app.models.audit_log import AuditLog, AuditAction  # noqa: F401
from app.models.scheduled_scan import ScheduledScan  # noqa: F401
from app.models.dashboard_snapshot import DashboardSnapshot  # noqa: F401
from app.models.app_setting import AppSetting  # noqa: F401

__all__ = [
    "User",
    "UserRole",
    "Vendor",
    "Site",
    "Cabinet",
    "Vlan",
    "VlanStatus",
    "IpPrefix",
    "PrefixStatus",
    "Device",
    "DeviceType",
    "DeviceStatus",
    "Interface",
    "InterfaceType",
    "InterfaceVlan",
    "Cable",
    "CableType",
    "IpAddress",
    "IpAddressSource",
    "ScanJob",
    "ScanType",
    "ScanStatus",
    "MacEntry",
    "MacEntrySource",
    "ScanConflict",
    "ConflictType",
    "ConflictStatus",
    "AuditLog",
    "AuditAction",
    "ScheduledScan",
    "DashboardSnapshot",
    "AppSetting",
]
