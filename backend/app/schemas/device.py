from __future__ import annotations

import ipaddress
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, field_validator

from app.models.device import DeviceStatus, DeviceType
from app.models.scan_job import ScanType
from app.core.mac import normalize_mac


def _validate_ip(v: Optional[str]) -> Optional[str]:
    """Validate that a string is a valid IPv4/IPv6 address (without prefix)."""
    if not v:
        return None
    try:
        ipaddress.ip_address(v.strip())
        return v.strip()
    except ValueError:
        raise ValueError(f"Indirizzo IP non valido: '{v}'")


class DeviceCreate(BaseModel):
    name: str
    device_type: DeviceType
    status: DeviceStatus = DeviceStatus.active
    site_id: Optional[int] = None
    cabinet_id: Optional[int] = None
    vendor_id: Optional[int] = None
    model: Optional[str] = None
    serial_number: Optional[str] = None
    mac_address: Optional[str] = None
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

    @field_validator('mac_address', mode='before')
    @classmethod
    def normalise_mac(cls, v: Optional[str]) -> Optional[str]:
        if not v:
            return None
        result = normalize_mac(v)
        if result is None:
            raise ValueError(f"Formato MAC non valido: '{v}'. Usa XX:XX:XX:XX:XX:XX, XXXX.XXXX.XXXX o simili.")
        return result

    @field_validator('primary_ip', 'management_ip', mode='before')
    @classmethod
    def validate_ip_field(cls, v: Optional[str]) -> Optional[str]:
        return _validate_ip(v)


class DeviceUpdate(BaseModel):
    name: Optional[str] = None
    device_type: Optional[DeviceType] = None
    status: Optional[DeviceStatus] = None
    site_id: Optional[int] = None
    cabinet_id: Optional[int] = None
    vendor_id: Optional[int] = None
    model: Optional[str] = None
    serial_number: Optional[str] = None
    mac_address: Optional[str] = None
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
    checkmk_host_name: Optional[str] = None
    plan_x: Optional[float] = None
    plan_y: Optional[float] = None

    @field_validator('mac_address', mode='before')
    @classmethod
    def normalise_mac(cls, v: Optional[str]) -> Optional[str]:
        if not v:
            return None
        result = normalize_mac(v)
        if result is None:
            raise ValueError(f"Formato MAC non valido: '{v}'. Usa XX:XX:XX:XX:XX:XX, XXXX.XXXX.XXXX o simili.")
        return result

    @field_validator('primary_ip', 'management_ip', mode='before')
    @classmethod
    def validate_ip_field(cls, v: Optional[str]) -> Optional[str]:
        return _validate_ip(v)


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
    mac_address: Optional[str] = None
    mac_address_cisco: Optional[str] = None   # XXXX.XXXX.XXXX — computed
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
    checkmk_host_name: Optional[str] = None
    plan_x: Optional[float] = None
    plan_y: Optional[float] = None
    created_at: datetime
    updated_at: datetime
    cabinet_name: Optional[str] = None
    vendor_name: Optional[str] = None

    model_config = {"from_attributes": True}

    @classmethod
    def model_validate(cls, obj, **kwargs):
        instance = super().model_validate(obj, **kwargs)
        if instance.mac_address:
            from app.core.mac import mac_to_cisco
            instance.mac_address_cisco = mac_to_cisco(instance.mac_address)
        # Populate cabinet_name from the loaded relationship if present
        try:
            cabinet = getattr(obj, "cabinet", None)
            if cabinet is not None:
                instance.cabinet_name = cabinet.name
        except Exception:
            pass
        # Populate vendor_name from the loaded relationship if present
        try:
            vendor = getattr(obj, "vendor", None)
            if vendor is not None:
                instance.vendor_name = vendor.name
        except Exception:
            pass
        return instance


class DeviceBulkCreateItem(BaseModel):
    name: str
    primary_ip: Optional[str] = None
    device_type: DeviceType = DeviceType.other
    status: DeviceStatus = DeviceStatus.active
    cabinet_id: Optional[int] = None
    vendor_id: Optional[int] = None
    model: Optional[str] = None
    mac_address: Optional[str] = None


class DeviceBulkCreateRequest(BaseModel):
    devices: list[DeviceBulkCreateItem]
    skip_duplicates: bool = True


class DeviceBulkCreateResponse(BaseModel):
    created: int
    skipped: int
    errors: list[str]


class DeviceScanRequest(BaseModel):
    scan_type: ScanType
