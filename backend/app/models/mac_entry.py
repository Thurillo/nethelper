from __future__ import annotations

import enum
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.scan_job import ScanJob
    from app.models.device import Device
    from app.models.interface import Interface


class MacEntrySource(str, enum.Enum):
    scan = "scan"
    manual = "manual"


class MacEntry(Base):
    __tablename__ = "mac_entry"

    id: Mapped[int] = mapped_column(sa.Integer, primary_key=True, index=True)

    scan_job_id: Mapped[Optional[int]] = mapped_column(
        sa.Integer,
        sa.ForeignKey("scan_job.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    # The switch/device that reported this MAC address
    device_id: Mapped[int] = mapped_column(
        sa.Integer,
        sa.ForeignKey("device.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    interface_id: Mapped[Optional[int]] = mapped_column(
        sa.Integer,
        sa.ForeignKey("interface.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Stored normalised to lowercase, colon-separated: "aa:bb:cc:dd:ee:ff"
    mac_address: Mapped[str] = mapped_column(
        sa.String(20), nullable=False, index=True
    )
    vlan_id: Mapped[Optional[int]] = mapped_column(sa.SmallInteger, nullable=True)

    # Correlated from ARP table
    ip_address: Mapped[Optional[str]] = mapped_column(sa.String(50), nullable=True)
    # From reverse DNS or active scan
    hostname: Mapped[Optional[str]] = mapped_column(sa.String(255), nullable=True)

    seen_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        server_default=sa.func.now(),
    )
    is_active: Mapped[bool] = mapped_column(
        sa.Boolean, nullable=False, default=True, server_default=sa.true()
    )
    source: Mapped[MacEntrySource] = mapped_column(
        sa.Enum(MacEntrySource, native_enum=True),
        nullable=False,
        default=MacEntrySource.scan,
        server_default=MacEntrySource.scan.value,
    )
    notes: Mapped[Optional[str]] = mapped_column(sa.Text, nullable=True)

    # Relationships
    scan_job: Mapped[Optional[ScanJob]] = relationship(
        "ScanJob", back_populates="mac_entries"
    )
    device: Mapped[Device] = relationship("Device", back_populates="mac_entries")
    interface: Mapped[Optional[Interface]] = relationship(
        "Interface", back_populates="mac_entries"
    )

    def __repr__(self) -> str:
        return (
            f"<MacEntry id={self.id} mac={self.mac_address!r} "
            f"device_id={self.device_id} active={self.is_active}>"
        )
