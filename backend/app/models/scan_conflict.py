from __future__ import annotations

import enum
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any, Optional

import sqlalchemy as sa
from sqlalchemy import JSON as JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.scan_job import ScanJob
    from app.models.device import Device
    from app.models.user import User


class ConflictStatus(str, enum.Enum):
    pending = "pending"
    accepted = "accepted"
    rejected = "rejected"
    ignored = "ignored"


class ConflictType(str, enum.Enum):
    new_interface = "new_interface"
    changed_ip = "changed_ip"
    missing_interface = "missing_interface"
    new_mac = "new_mac"
    changed_mac = "changed_mac"
    suspected_unmanaged_switch = "suspected_unmanaged_switch"
    new_device_discovered = "new_device_discovered"
    changed_hostname = "changed_hostname"
    other = "other"


class ScanConflict(Base):
    __tablename__ = "scan_conflict"

    id: Mapped[int] = mapped_column(sa.Integer, primary_key=True, index=True)

    scan_job_id: Mapped[Optional[int]] = mapped_column(
        sa.Integer,
        sa.ForeignKey("scan_job.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    device_id: Mapped[Optional[int]] = mapped_column(
        sa.Integer,
        sa.ForeignKey("device.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    conflict_type: Mapped[ConflictType] = mapped_column(
        sa.Enum(ConflictType, native_enum=True), nullable=False, index=True
    )

    # Which table/entity this conflict refers to (e.g. "interface", "ip_address")
    entity_table: Mapped[Optional[str]] = mapped_column(sa.String(100), nullable=True)
    entity_id: Mapped[Optional[int]] = mapped_column(sa.Integer, nullable=True)

    # Which specific field changed
    field_name: Mapped[Optional[str]] = mapped_column(sa.String(100), nullable=True)

    # Values stored as JSONB to support arbitrary types
    current_value: Mapped[Optional[Any]] = mapped_column(JSONB, nullable=True)
    discovered_value: Mapped[Optional[Any]] = mapped_column(JSONB, nullable=True)

    status: Mapped[ConflictStatus] = mapped_column(
        sa.Enum(ConflictStatus, native_enum=True),
        nullable=False,
        default=ConflictStatus.pending,
        server_default=ConflictStatus.pending.value,
        index=True,
    )

    resolved_by_user_id: Mapped[Optional[int]] = mapped_column(
        sa.Integer,
        sa.ForeignKey("user.id", ondelete="SET NULL"),
        nullable=True,
    )
    resolved_at: Mapped[Optional[datetime]] = mapped_column(
        sa.DateTime(timezone=True), nullable=True
    )
    notes: Mapped[Optional[str]] = mapped_column(sa.Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        server_default=sa.func.now(),
        index=True,
    )

    # Relationships
    scan_job: Mapped[Optional[ScanJob]] = relationship(
        "ScanJob", back_populates="conflicts"
    )
    device: Mapped[Optional[Device]] = relationship(
        "Device", back_populates="scan_conflicts"
    )
    resolved_by_user: Mapped[Optional[User]] = relationship(
        "User",
        back_populates="resolved_conflicts",
        foreign_keys=[resolved_by_user_id],
    )

    def __repr__(self) -> str:
        return (
            f"<ScanConflict id={self.id} type={self.conflict_type} "
            f"status={self.status}>"
        )
