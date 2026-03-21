from __future__ import annotations

import enum
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any, Optional

import sqlalchemy as sa
from sqlalchemy import JSON as JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.device import Device
    from app.models.user import User
    from app.models.mac_entry import MacEntry
    from app.models.scan_conflict import ScanConflict


class ScanType(str, enum.Enum):
    snmp_full = "snmp_full"
    snmp_arp = "snmp_arp"
    snmp_mac = "snmp_mac"
    snmp_lldp = "snmp_lldp"
    ssh_full = "ssh_full"
    ip_range = "ip_range"


class ScanStatus(str, enum.Enum):
    pending = "pending"
    running = "running"
    completed = "completed"
    failed = "failed"
    cancelled = "cancelled"


class ScanJob(Base):
    __tablename__ = "scan_job"

    id: Mapped[int] = mapped_column(sa.Integer, primary_key=True, index=True)
    device_id: Mapped[Optional[int]] = mapped_column(
        sa.Integer,
        sa.ForeignKey("device.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    scan_type: Mapped[ScanType] = mapped_column(
        sa.Enum(ScanType, native_enum=True), nullable=False
    )
    status: Mapped[ScanStatus] = mapped_column(
        sa.Enum(ScanStatus, native_enum=True),
        nullable=False,
        default=ScanStatus.pending,
        server_default=ScanStatus.pending.value,
    )

    # IP-range scan parameters
    range_start_ip: Mapped[Optional[str]] = mapped_column(sa.String(50), nullable=True)
    range_end_ip: Mapped[Optional[str]] = mapped_column(sa.String(50), nullable=True)
    # List of port numbers, e.g. [22, 80, 443]
    range_ports: Mapped[Optional[list[int]]] = mapped_column(JSONB, nullable=True)

    celery_task_id: Mapped[Optional[str]] = mapped_column(
        sa.String(255), nullable=True, index=True
    )

    started_at: Mapped[Optional[datetime]] = mapped_column(
        sa.DateTime(timezone=True), nullable=True
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(
        sa.DateTime(timezone=True), nullable=True
    )

    # e.g. {"devices_found": 5, "interfaces_found": 48}
    result_summary: Mapped[Optional[dict[str, Any]]] = mapped_column(
        JSONB, nullable=True
    )
    error_message: Mapped[Optional[str]] = mapped_column(sa.Text, nullable=True)
    log_output: Mapped[Optional[str]] = mapped_column(sa.Text, nullable=True)

    triggered_by_user_id: Mapped[Optional[int]] = mapped_column(
        sa.Integer,
        sa.ForeignKey("user.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    is_scheduled: Mapped[bool] = mapped_column(
        sa.Boolean, nullable=False, default=False, server_default=sa.false()
    )
    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        server_default=sa.func.now(),
        index=True,
    )

    # Relationships
    device: Mapped[Optional[Device]] = relationship(
        "Device", back_populates="scan_jobs"
    )
    triggered_by_user: Mapped[Optional[User]] = relationship(
        "User",
        back_populates="scan_jobs",
        foreign_keys=[triggered_by_user_id],
    )
    mac_entries: Mapped[list[MacEntry]] = relationship(
        "MacEntry", back_populates="scan_job"
    )
    conflicts: Mapped[list[ScanConflict]] = relationship(
        "ScanConflict", back_populates="scan_job"
    )

    def __repr__(self) -> str:
        return (
            f"<ScanJob id={self.id} type={self.scan_type} status={self.status}>"
        )
