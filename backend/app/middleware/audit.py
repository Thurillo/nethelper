from __future__ import annotations

from typing import Optional

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response


class AuditMiddleware(BaseHTTPMiddleware):
    """Middleware that extracts client IP and stores it in request.state."""

    async def dispatch(self, request: Request, call_next) -> Response:
        client_ip = _extract_client_ip(request)
        request.state.client_ip = client_ip
        response = await call_next(request)
        return response


def _extract_client_ip(request: Request) -> Optional[str]:
    """Extract the real client IP, respecting proxy headers."""
    # Check X-Forwarded-For first (proxy/load balancer)
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        # First IP in the chain is the original client
        return forwarded_for.split(",")[0].strip()

    # Check X-Real-IP (nginx)
    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip.strip()

    # Direct connection
    if request.client:
        return request.client.host

    return None


async def create_audit_log(
    db,
    request: Request,
    user,
    action: str,
    entity_table: Optional[str] = None,
    entity_id: Optional[int] = None,
    field_name: Optional[str] = None,
    old_value: Optional[str] = None,
    new_value: Optional[str] = None,
    description: Optional[str] = None,
) -> None:
    """Helper function to create audit log entries from router handlers."""
    from app.crud.audit_log import log_action

    client_ip = getattr(request.state, "client_ip", None)
    user_id = getattr(user, "id", None) if user else None

    await log_action(
        db,
        user_id=user_id,
        action=action,
        entity_table=entity_table,
        entity_id=entity_id,
        field_name=field_name,
        old_value=old_value,
        new_value=new_value,
        client_ip=client_ip,
        description=description,
    )
