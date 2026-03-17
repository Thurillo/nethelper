from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel

from app.models.mac_entry import MacEntrySource


class MacEntryCreate(BaseModel):
    mac_address: str
    device_id: int
    interface_id: Optional[int] = None
    vlan_id: Optional[int] = None
    ip_address: Optional[str] = None
    hostname: Optional[str] = None
    notes: Optional[str] = None
    source: MacEntrySource = MacEntrySource.manual


class MacEntryUpdate(BaseModel):
    mac_address: Optional[str] = None
    interface_id: Optional[int] = None
    vlan_id: Optional[int] = None
    ip_address: Optional[str] = None
    hostname: Optional[str] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = None


class MacEntryRead(BaseModel):
    id: int
    scan_job_id: Optional[int] = None
    device_id: int
    interface_id: Optional[int] = None
    mac_address: str
    vlan_id: Optional[int] = None
    ip_address: Optional[str] = None
    hostname: Optional[str] = None
    seen_at: datetime
    is_active: bool
    source: MacEntrySource
    notes: Optional[str] = None

    model_config = {"from_attributes": True}


class MacSearchResult(BaseModel):
    mac_address: str
    entries: list[MacEntryRead]
