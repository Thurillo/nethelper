from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, model_validator


class TopologyNode(BaseModel):
    id: int
    name: str
    label: str = ''          # alias for name — used by frontend
    device_id: int = 0       # alias for id — used by frontend
    device_type: str
    primary_ip: Optional[str] = None
    mac_address: Optional[str] = None
    site_id: Optional[int] = None
    cabinet_id: Optional[int] = None
    cabinet_name: Optional[str] = None
    site_name: Optional[str] = None
    status: str

    @model_validator(mode='after')
    def _set_aliases(self) -> 'TopologyNode':
        self.label = self.name
        self.device_id = self.id
        return self


class TopologyEdge(BaseModel):
    id: int
    source_device_id: int
    target_device_id: int
    source: str = ''         # source device id as string — used by frontend
    target: str = ''         # target device id as string — used by frontend
    source_interface: str
    target_interface: str
    interface_a: str = ''    # alias for source_interface — used by frontend
    interface_b: str = ''    # alias for target_interface — used by frontend
    cable_type: Optional[str] = None
    label: Optional[str] = None

    @model_validator(mode='after')
    def _set_aliases(self) -> 'TopologyEdge':
        self.source = str(self.source_device_id)
        self.target = str(self.target_device_id)
        self.interface_a = self.source_interface
        self.interface_b = self.target_interface
        return self


class TopologyGraph(BaseModel):
    nodes: list[TopologyNode]
    edges: list[TopologyEdge]
