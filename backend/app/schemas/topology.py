from __future__ import annotations

from typing import Optional

from pydantic import BaseModel


class TopologyNode(BaseModel):
    id: int
    name: str
    device_type: str
    primary_ip: Optional[str] = None
    site_id: Optional[int] = None
    cabinet_id: Optional[int] = None
    status: str


class TopologyEdge(BaseModel):
    id: int
    source_device_id: int
    target_device_id: int
    source_interface: str
    target_interface: str
    cable_type: Optional[str] = None


class TopologyGraph(BaseModel):
    nodes: list[TopologyNode]
    edges: list[TopologyEdge]
