from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel

from app.models.ip_address import IpAddressSource


class IpAddressCreate(BaseModel):
    address: str
    device_id: Optional[int] = None
    interface_id: Optional[int] = None
    prefix_id: Optional[int] = None
    is_primary: bool = False
    dns_name: Optional[str] = None
    description: Optional[str] = None
    source: IpAddressSource = IpAddressSource.manual


class IpAddressUpdate(BaseModel):
    address: Optional[str] = None
    device_id: Optional[int] = None
    interface_id: Optional[int] = None
    prefix_id: Optional[int] = None
    is_primary: Optional[bool] = None
    dns_name: Optional[str] = None
    description: Optional[str] = None
    source: Optional[IpAddressSource] = None


class IpAddressRead(BaseModel):
    id: int
    address: str
    device_id: Optional[int] = None
    interface_id: Optional[int] = None
    prefix_id: Optional[int] = None
    is_primary: bool
    dns_name: Optional[str] = None
    description: Optional[str] = None
    source: Optional[IpAddressSource] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
