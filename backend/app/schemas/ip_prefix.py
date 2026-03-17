from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel

from app.models.ip_prefix import PrefixStatus


class IpPrefixCreate(BaseModel):
    prefix: str
    site_id: Optional[int] = None
    vlan_id: Optional[int] = None
    description: Optional[str] = None
    is_pool: bool = False
    status: PrefixStatus = PrefixStatus.active
    notes: Optional[str] = None


class IpPrefixUpdate(BaseModel):
    prefix: Optional[str] = None
    site_id: Optional[int] = None
    vlan_id: Optional[int] = None
    description: Optional[str] = None
    is_pool: Optional[bool] = None
    status: Optional[PrefixStatus] = None
    notes: Optional[str] = None


class IpPrefixRead(BaseModel):
    id: int
    prefix: str
    site_id: Optional[int] = None
    vlan_id: Optional[int] = None
    description: Optional[str] = None
    is_pool: bool
    status: PrefixStatus
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PrefixUtilization(BaseModel):
    prefix: str
    total: int
    used: int
    free: int
    utilization_pct: float
