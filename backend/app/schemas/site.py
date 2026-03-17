from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class SiteCreate(BaseModel):
    name: str
    description: Optional[str] = None
    address: Optional[str] = None


class SiteUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    address: Optional[str] = None


class SiteRead(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    address: Optional[str] = None
    created_at: datetime
    cabinet_count: int = 0

    model_config = {"from_attributes": True}
