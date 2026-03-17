from __future__ import annotations

import enum
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any, Optional

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.user import User


class AuditAction(str, enum.Enum):
    create = "create"
    update = "update"
    delete = "delete"
    login = "login"
    logout = "logout"
    scan_accept = "scan_accept"
    scan_reject = "scan_reject"


class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(sa.Integer, primary_key=True, index=True)

    user_id: Mapped[Optional[int]] = mapped_column(
        sa.Integer,
        sa.ForeignKey("user.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    timestamp: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        server_default=sa.func.now(),
        index=True,
    )
    action: Mapped[AuditAction] = mapped_column(
        sa.Enum(AuditAction, native_enum=True), nullable=False, index=True
    )

    # Which table and row this log entry refers to
    entity_table: Mapped[Optional[str]] = mapped_column(
        sa.String(100), nullable=True, index=True
    )
    entity_id: Mapped[Optional[int]] = mapped_column(
        sa.Integer, nullable=True, index=True
    )

    field_name: Mapped[Optional[str]] = mapped_column(sa.String(100), nullable=True)

    # Before/after values stored as JSONB for flexibility
    old_value: Mapped[Optional[Any]] = mapped_column(JSONB, nullable=True)
    new_value: Mapped[Optional[Any]] = mapped_column(JSONB, nullable=True)

    client_ip: Mapped[Optional[str]] = mapped_column(sa.String(50), nullable=True)

    # Human-readable description, e.g. "User admin updated device sw-core-01"
    description: Mapped[Optional[str]] = mapped_column(sa.String(500), nullable=True)

    # Relationships
    user: Mapped[Optional[User]] = relationship("User", back_populates="audit_logs")

    def __repr__(self) -> str:
        return (
            f"<AuditLog id={self.id} action={self.action} "
            f"entity={self.entity_table}:{self.entity_id}>"
        )
