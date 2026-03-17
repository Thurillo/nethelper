from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel

from app.models.audit_log import AuditAction


class AuditLogRead(BaseModel):
    id: int
    user_id: Optional[int] = None
    username: Optional[str] = None
    timestamp: datetime
    action: AuditAction
    entity_table: Optional[str] = None
    entity_id: Optional[int] = None
    field_name: Optional[str] = None
    old_value: Optional[Any] = None
    new_value: Optional[Any] = None
    client_ip: Optional[str] = None
    description: Optional[str] = None

    model_config = {"from_attributes": True}
