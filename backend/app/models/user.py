from __future__ import annotations

import enum
from datetime import datetime
from typing import TYPE_CHECKING, Optional

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.scan_job import ScanJob
    from app.models.scan_conflict import ScanConflict
    from app.models.audit_log import AuditLog


class UserRole(str, enum.Enum):
    admin = "admin"
    readonly = "readonly"


class User(Base):
    __tablename__ = "user"

    id: Mapped[int] = mapped_column(sa.Integer, primary_key=True, index=True)
    username: Mapped[str] = mapped_column(
        sa.String(150), unique=True, nullable=False, index=True
    )
    email: Mapped[Optional[str]] = mapped_column(
        sa.String(255), unique=True, nullable=True, index=True
    )
    hashed_password: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(
        sa.Enum(UserRole, native_enum=True),
        nullable=False,
        default=UserRole.readonly,
        server_default=UserRole.readonly.value,
    )
    is_active: Mapped[bool] = mapped_column(
        sa.Boolean, nullable=False, default=True, server_default=sa.true()
    )
    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True),
        nullable=False,
        server_default=sa.func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True),
        nullable=False,
        server_default=sa.func.now(),
        onupdate=sa.func.now(),
    )
    last_login: Mapped[Optional[datetime]] = mapped_column(
        sa.DateTime(timezone=True), nullable=True
    )

    # Relationships
    scan_jobs: Mapped[list[ScanJob]] = relationship(
        "ScanJob",
        back_populates="triggered_by_user",
        foreign_keys="ScanJob.triggered_by_user_id",
    )
    resolved_conflicts: Mapped[list[ScanConflict]] = relationship(
        "ScanConflict",
        back_populates="resolved_by_user",
        foreign_keys="ScanConflict.resolved_by_user_id",
    )
    audit_logs: Mapped[list[AuditLog]] = relationship(
        "AuditLog", back_populates="user"
    )

    def __repr__(self) -> str:
        return f"<User id={self.id} username={self.username!r} role={self.role}>"
