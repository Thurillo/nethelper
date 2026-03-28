from __future__ import annotations

import json
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, model_validator


class TopologyMapNodeLayout(BaseModel):
    x: float
    y: float
    visible: bool = True


class TopologyMapCreate(BaseModel):
    name: str
    site_id: Optional[int] = None


class TopologyMapUpdate(BaseModel):
    name: Optional[str] = None
    site_id: Optional[int] = None


class TopologyMapLayoutPatch(BaseModel):
    layout: dict[str, TopologyMapNodeLayout]


class TopologyMapList(BaseModel):
    id: int
    name: str
    site_id: Optional[int] = None
    created_by_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TopologyMapRead(BaseModel):
    id: int
    name: str
    site_id: Optional[int] = None
    created_by_id: Optional[int] = None
    layout: dict[str, TopologyMapNodeLayout] = {}
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @model_validator(mode="before")
    @classmethod
    def _parse_layout(cls, data: object) -> object:
        """Deserialize the JSON text `layout` column into a dict."""
        if hasattr(data, "__dict__") or hasattr(data, "layout"):
            # ORM object
            raw = getattr(data, "layout", None)
            if isinstance(raw, str):
                try:
                    parsed = json.loads(raw)
                except (json.JSONDecodeError, ValueError):
                    parsed = {}
                # Build a mutable copy for Pydantic
                return {
                    "id": data.id,
                    "name": data.name,
                    "site_id": data.site_id,
                    "created_by_id": data.created_by_id,
                    "layout": parsed,
                    "created_at": data.created_at,
                    "updated_at": data.updated_at,
                }
            elif raw is None:
                return {
                    "id": data.id,
                    "name": data.name,
                    "site_id": data.site_id,
                    "created_by_id": data.created_by_id,
                    "layout": {},
                    "created_at": data.created_at,
                    "updated_at": data.updated_at,
                }
        return data
