from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, field_validator

from app.models.device import DeviceStatus, DeviceType
from app.models.scan_job import ScanType
from app.core.mac import normalize_mac


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

    @field_validator('mac_address', mode='before')
    @classmethod
    def normalise_mac(cls, v: Optional[str]) -> Optional[str]:
        if not v:
            return None
        result = normalize_mac(v)
        if result is None:
            raise ValueError(f"Formato MAC non valido: '{v}'. Usa XX:XX:XX:XX:XX:XX, XXXX.XXXX.XXXX o simili.")
        return result


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


class DeviceScanRequest(BaseModel):
    scan_type: ScanType
