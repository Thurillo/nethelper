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


class CabinetRead(BaseModel):
    id: int
    site_id: int
    name: str
    u_count: int
    description: Optional[str] = None
    row_label: Optional[str] = None
    position: Optional[str] = None

    model_config = {"from_attributes": True}


class RackDiagramSlot(BaseModel):
    u_position: int
    u_height: int
    device_id: Optional[int] = None
    device_name: Optional[str] = None
    device_type: Optional[str] = None
    is_free: bool


class RackDiagram(BaseModel):
    cabinet: CabinetRead
    slots: list[RackDiagramSlot]
    free_slots: list[int]
