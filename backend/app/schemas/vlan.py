from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel

from app.models.vlan import VlanStatus


class VlanCreate(BaseModel):
    vid: int
    name: str
    site_id: Optional[int] = None
    description: Optional[str] = None
    status: VlanStatus = VlanStatus.active
    notes: Optional[str] = None


class VlanUpdate(BaseModel):
    vid: Optional[int] = None
    name: Optional[str] = None
    site_id: Optional[int] = None
    description: Optional[str] = None
    status: Optional[VlanStatus] = None
    notes: Optional[str] = None


class VlanRead(BaseModel):
    id: int
    vid: int
    name: str
    site_id: Optional[int] = None
    description: Optional[str] = None
    status: VlanStatus
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
