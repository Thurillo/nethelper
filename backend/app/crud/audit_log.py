from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditAction, AuditLog


def _coerce_action(action: str) -> AuditAction:
    """Map any action string to an AuditAction enum value.

    Unknown actions are mapped to the closest meaningful value or
    stored as-is if the DB supports it via the native enum.
    We use a best-effort approach: if it matches an enum name exactly, use it;
    otherwise map common patterns to existing enum values.
    """
    try:
        return AuditAction(action)
    except ValueError:
        pass
    # Fallback mapping for non-standard actions used throughout the codebase
    _FALLBACK: dict[str, AuditAction] = {
        "scan": AuditAction.create,
        "ip_range_scan": AuditAction.create,
        "purge": AuditAction.delete,
        "cancel": AuditAction.update,
        "accept_conflict": AuditAction.scan_accept,
        "reject_conflict": AuditAction.scan_reject,
        "ignore_conflict": AuditAction.scan_reject,
        "bulk_accept_conflicts": AuditAction.scan_accept,
        "bulk_reject_conflicts": AuditAction.scan_reject,
        "link_port": AuditAction.create,
        "unlink_port": AuditAction.delete,
    }
    return _FALLBACK.get(action, AuditAction.update)


async def log_action(
    db: AsyncSession,
    user_id: Optional[int],
    action: str,
    entity_table: Optional[str] = None,
    entity_id: Optional[int] = None,
    field_name: Optional[str] = None,
    old_value: Optional[str] = None,
    new_value: Optional[str] = None,
    client_ip: Optional[str] = None,
    description: Optional[str] = None,
) -> AuditLog:
    audit_action = _coerce_action(action)
    log = AuditLog(
        user_id=user_id,
        timestamp=datetime.now(timezone.utc),
        action=audit_action,
        entity_table=entity_table,
        entity_id=entity_id,
        field_name=field_name,
        old_value=old_value,
        new_value=new_value,
        client_ip=client_ip,
        description=description,
    )
    db.add(log)
    await db.flush()
    await db.refresh(log)
    return log


async def get_audit_logs(
    db: AsyncSession,
    skip: int = 0,
    limit: int = 100,
    user_id: Optional[int] = None,
    entity_table: Optional[str] = None,
    entity_id: Optional[int] = None,
    from_dt: Optional[datetime] = None,
    to_dt: Optional[datetime] = None,
) -> list[AuditLog]:
    stmt = select(AuditLog)
    if user_id is not None:
        stmt = stmt.where(AuditLog.user_id == user_id)
    if entity_table is not None:
        stmt = stmt.where(AuditLog.entity_table == entity_table)
    if entity_id is not None:
        stmt = stmt.where(AuditLog.entity_id == entity_id)
    if from_dt is not None:
        stmt = stmt.where(AuditLog.timestamp >= from_dt)
    if to_dt is not None:
        stmt = stmt.where(AuditLog.timestamp <= to_dt)
    stmt = stmt.order_by(AuditLog.timestamp.desc()).offset(skip).limit(limit)
    result = await db.execute(stmt)
    return list(result.scalars().all())
