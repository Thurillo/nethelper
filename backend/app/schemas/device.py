from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel

from app.models.device import DeviceStatus, DeviceType
from app.models.scan_job import ScanType


class DeviceCreate(BaseModel):
    name: str
    device_type: DeviceType
    status: DeviceStatus = DeviceStatus.active
    site_id: Optional[int] = None
    cabinet_id: Optional[int] = None
    vendor_id: Optional[int] = None
    model: Optional[str] = None
    serial_number: Optional[str] = None
    u_position: Optional[int] = None
    u_height: int = 1
    primary_ip: Optional[str] = None
    snmp_community: Optional[str] = None
    snmp_version: int = 2
    snmp_v3_username: Optional[str] = None
    snmp_v3_auth_protocol: Optional[str] = None
    snmp_v3_auth_password: Optional[str] = None  # plain, will be encrypted
    snmp_v3_priv_protocol: Optional[str] = None
    snmp_v3_priv_password: Optional[str] = None  # plain, will be encrypted
    ssh_username: Optional[str] = None
    ssh_password: Optional[str] = None  # plain, will be encrypted
    ssh_key_path: Optional[str] = None
    ssh_port: Optional[int] = None
    notes: Optional[str] = None


class DeviceUpdate(BaseModel):
    name: Optional[str] = None
    device_type: Optional[DeviceType] = None
    status: Optional[DeviceStatus] = None
    site_id: Optional[int] = None
    cabinet_id: Optional[int] = None
    vendor_id: Optional[int] = None
    model: Optional[str] = None
    serial_number: Optional[str] = None
    u_position: Optional[int] = None
    u_height: Optional[int] = None
    primary_ip: Optional[str] = None
    snmp_community: Optional[str] = None
    snmp_version: Optional[int] = None
    snmp_v3_username: Optional[str] = None
    snmp_v3_auth_protocol: Optional[str] = None
    snmp_v3_auth_password: Optional[str] = None
    snmp_v3_priv_protocol: Optional[str] = None
    snmp_v3_priv_password: Optional[str] = None
    ssh_username: Optional[str] = None
    ssh_password: Optional[str] = None
    ssh_key_path: Optional[str] = None
    ssh_port: Optional[int] = None
    notes: Optional[str] = None
    is_unmanaged_suspected: Optional[bool] = None


class DeviceRead(BaseModel):
    id: int
    name: str
    device_type: DeviceType
    status: DeviceStatus
    site_id: Optional[int] = None
    cabinet_id: Optional[int] = None
    vendor_id: Optional[int] = None
    model: Optional[str] = None
    serial_number: Optional[str] = None
    u_position: Optional[int] = None
    u_height: int
    primary_ip: Optional[str] = None
    snmp_community: Optional[str] = None
    snmp_version: int
    snmp_v3_username: Optional[str] = None
    snmp_v3_auth_protocol: Optional[str] = None
    snmp_v3_priv_protocol: Optional[str] = None
    ssh_username: Optional[str] = None
    ssh_key_path: Optional[str] = None
    ssh_port: Optional[int] = None
    notes: Optional[str] = None
    last_seen: Optional[datetime] = None
    is_unmanaged_suspected: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DeviceScanRequest(BaseModel):
    scan_type: ScanType
