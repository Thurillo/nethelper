from __future__ import annotations

from typing import Optional

from pydantic import BaseModel


class CabinetCreate(BaseModel):
    site_id: int
    name: str
    u_count: int = 42
    description: Optional[str] = None
    row_label: Optional[str] = None
    position: Optional[str] = None


class CabinetUpdate(BaseModel):
    site_id: Optional[int] = None
    name: Optional[str] = None
    u_count: Optional[int] = None
    description: Optional[str] = None
    row_label: Optional[str] = None
    position: Optional[str] = None


class _SiteMinimal(BaseModel):
    id: int
    name: str
    model_config = {"from_attributes": True}


class CabinetRead(BaseModel):
    id: int
    site_id: int
    name: str
    u_count: int
    description: Optional[str] = None
    row_label: Optional[str] = None
    position: Optional[str] = None
    site: Optional[_SiteMinimal] = None
    devices_count: Optional[int] = None

    model_config = {"from_attributes": True}


class RackDiagramDevice(BaseModel):
    id: int
    name: str
    device_type: str
    status: str
    u_height: int
    u_position: Optional[int] = None
    primary_ip: Optional[str] = None
    model: Optional[str] = None
    serial_number: Optional[str] = None
    notes: Optional[str] = None

    model_config = {"from_attributes": True}


class RackDiagramSlot(BaseModel):
    u_position: int
    u_height: int
    is_free: bool
    device: Optional[RackDiagramDevice] = None


class RackDiagram(BaseModel):
    cabinet: CabinetRead
    slots: list[RackDiagramSlot]
    free_slots: list[int]
    used_u: int
    free_u: int
