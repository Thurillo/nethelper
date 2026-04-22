from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel

from app.models.scan_conflict import ConflictStatus, ConflictType


class ScanConflictCreate(BaseModel):
    conflict_type: ConflictType
    device_id: Optional[int] = None
    scan_job_id: Optional[int] = None
    entity_table: Optional[str] = None
    entity_id: Optional[int] = None
    field_name: Optional[str] = None
    current_value: Optional[Any] = None
    discovered_value: Optional[Any] = None
    notes: Optional[str] = None


class ScanConflictRead(BaseModel):
    id: int
    scan_job_id: Optional[int] = None
    device_id: Optional[int] = None
    conflict_type: ConflictType
    entity_table: Optional[str] = None
    entity_id: Optional[int] = None
    field_name: Optional[str] = None
    current_value: Optional[Any] = None
    discovered_value: Optional[Any] = None
    status: ConflictStatus
    resolved_by_user_id: Optional[int] = None
    resolved_at: Optional[datetime] = None
    notes: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ConflictResolveRequest(BaseModel):
    notes: Optional[str] = None


class ConflictBulkResolveRequest(BaseModel):
    conflict_ids: list[int]
    notes: Optional[str] = None


class AcceptNewDeviceRequest(BaseModel):
    device_name: str
    device_type: str
    notes: Optional[str] = None
