from __future__ import annotations

from datetime import datetime
from typing import Annotated, Optional

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.audit_log import get_audit_logs
from app.database import get_db
from app.dependencies import get_current_user
from app.models.audit_log import AuditLog
from app.models.user import User
from app.schemas.audit_log import AuditLogRead

router = APIRouter(prefix="/audit-log", tags=["audit-log"])


@router.get("/", response_model=list[AuditLogRead])
async def list_audit_logs(
    user_id: Optional[int] = None,
    entity_table: Optional[str] = None,
    entity_id: Optional[int] = None,
    from_dt: Optional[datetime] = None,
    to_dt: Optional[datetime] = None,
    skip: int = 0,
    limit: int = 100,
    current_user: Annotated[object, Depends(get_current_user)] = None,
    db: Annotated[AsyncSession, Depends(get_db)] = None,
) -> list[AuditLogRead]:
    logs = await get_audit_logs(
        db,
        skip=skip,
        limit=limit,
        user_id=user_id,
        entity_table=entity_table,
        entity_id=entity_id,
        from_dt=from_dt,
        to_dt=to_dt,
    )

    # Enrich with usernames
    user_ids = {log.user_id for log in logs if log.user_id is not None}
    usernames: dict[int, str] = {}
    if user_ids:
        result = await db.execute(
            select(User.id, User.username).where(User.id.in_(user_ids))
        )
        usernames = {row.id: row.username for row in result.all()}

    return [
        AuditLogRead(
            id=log.id,
            user_id=log.user_id,
            username=usernames.get(log.user_id) if log.user_id else None,
            timestamp=log.timestamp,
            action=log.action,
            entity_table=log.entity_table,
            entity_id=log.entity_id,
            field_name=log.field_name,
            old_value=log.old_value,
            new_value=log.new_value,
            client_ip=log.client_ip,
            description=log.description,
        )
        for log in logs
    ]
