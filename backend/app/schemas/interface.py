from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel

from app.models.interface import InterfaceType


class InterfaceCreate(BaseModel):
    device_id: int
    name: str
    label: Optional[str] = None
    if_type: InterfaceType = InterfaceType.ethernet
    mac_address: Optional[str] = None
    speed_mbps: Optional[int] = None
    mtu: Optional[int] = None
    admin_up: Optional[bool] = None
    vlan_id: Optional[int] = None
    description: Optional[str] = None
    room_destination: Optional[str] = None
    notes: Optional[str] = None


class InterfaceUpdate(BaseModel):
    name: Optional[str] = None
    label: Optional[str] = None
    if_type: Optional[InterfaceType] = None
    mac_address: Optional[str] = None
    speed_mbps: Optional[int] = None
    mtu: Optional[int] = None
    admin_up: Optional[bool] = None
    oper_up: Optional[bool] = None
    if_index: Optional[int] = None
    vlan_id: Optional[int] = None
    description: Optional[str] = None
    room_destination: Optional[str] = None
    notes: Optional[str] = None


class InterfaceRead(BaseModel):
    id: int
    device_id: int
    name: str
    label: Optional[str] = None
    if_type: InterfaceType
    mac_address: Optional[str] = None
    speed_mbps: Optional[int] = None
    mtu: Optional[int] = None
    admin_up: Optional[bool] = None
    oper_up: Optional[bool] = None
    if_index: Optional[int] = None
    vlan_id: Optional[int] = None
    description: Optional[str] = None
    room_destination: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
