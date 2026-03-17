from __future__ import annotations

from typing import Optional

from pydantic import BaseModel


class CableCreate(BaseModel):
    interface_a_id: int
    interface_b_id: int
    cable_type: Optional[str] = None
    label: Optional[str] = None
    length_m: Optional[float] = None
    color: Optional[str] = None
    notes: Optional[str] = None


class CableUpdate(BaseModel):
    interface_a_id: Optional[int] = None
    interface_b_id: Optional[int] = None
    cable_type: Optional[str] = None
    label: Optional[str] = None
    length_m: Optional[float] = None
    color: Optional[str] = None
    notes: Optional[str] = None


class InterfaceMinimal(BaseModel):
    id: int
    name: str
    label: Optional[str] = None
    device_id: int
    device_name: Optional[str] = None

    model_config = {"from_attributes": True}


class CableRead(BaseModel):
    id: int
    interface_a_id: int
    interface_b_id: int
    cable_type: Optional[str] = None
    label: Optional[str] = None
    length_m: Optional[float] = None
    color: Optional[str] = None
    notes: Optional[str] = None
    interface_a: Optional[InterfaceMinimal] = None
    interface_b: Optional[InterfaceMinimal] = None

    model_config = {"from_attributes": True}
