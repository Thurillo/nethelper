from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel

from app.models.scan_job import ScanStatus, ScanType


class ScanJobCreate(BaseModel):
    device_id: Optional[int] = None
    scan_type: ScanType
    range_start_ip: Optional[str] = None
    range_end_ip: Optional[str] = None
    range_ports: Optional[list[int]] = None
    triggered_by_user_id: Optional[int] = None
    is_scheduled: bool = False


class IpRangeScanRequest(BaseModel):
    start_ip: str
    end_ip: str
    ports: list[int] = [22, 80, 443, 8080, 8443]
    timeout_ms: int = 500


class ScanJobRead(BaseModel):
    id: int
    device_id: Optional[int] = None
    scan_type: ScanType
    status: ScanStatus
    range_start_ip: Optional[str] = None
    range_end_ip: Optional[str] = None
    range_ports: Optional[list[int]] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    result_summary: Optional[dict[str, Any]] = None
    error_message: Optional[str] = None
    log_output: Optional[str] = None
    is_scheduled: bool
    triggered_by_user_id: Optional[int] = None
    created_at: datetime

    model_config = {"from_attributes": True}
