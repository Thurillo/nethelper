from __future__ import annotations

import enum
from datetime import datetime
from typing import TYPE_CHECKING, Optional

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.interface import Interface
    from app.models.device import Device
    from app.models.ip_prefix import IpPrefix


class IpAddressSource(str, enum.Enum):
    manual = "manual"
    snmp_arp = "snmp_arp"
    snmp_if = "snmp_if"
    ip_range_scan = "ip_range_scan"


class IpAddress(Base):
    __tablename__ = "ip_address"

    id: Mapped[int] = mapped_column(sa.Integer, primary_key=True, index=True)

    # Stored in CIDR notation, e.g. "192.168.1.1/24"
    address: Mapped[str] = mapped_column(
        sa.String(50), nullable=False, unique=True, index=True
    )

    interface_id: Mapped[Optional[int]] = mapped_column(
        sa.Integer,
        sa.ForeignKey("interface.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    device_id: Mapped[Optional[int]] = mapped_column(
        sa.Integer,
        sa.ForeignKey("device.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    prefix_id: Mapped[Optional[int]] = mapped_column(
        sa.Integer,
        sa.ForeignKey("ip_prefix.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    is_primary: Mapped[bool] = mapped_column(
        sa.Boolean, nullable=False, default=False, server_default=sa.false()
    )
    dns_name: Mapped[Optional[str]] = mapped_column(sa.String(255), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(sa.Text, nullable=True)
    source: Mapped[IpAddressSource] = mapped_column(
        sa.Enum(IpAddressSource, native_enum=True),
        nullable=False,
        default=IpAddressSource.manual,
        server_default=IpAddressSource.manual.value,
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

    # Relationships
    interface: Mapped[Optional[Interface]] = relationship(
        "Interface",
        back_populates="ip_addresses",
        foreign_keys=[interface_id],
    )
    device: Mapped[Optional[Device]] = relationship(
        "Device",
        back_populates="ip_addresses",
        foreign_keys=[device_id],
    )
    prefix: Mapped[Optional[IpPrefix]] = relationship(
        "IpPrefix", back_populates="ip_addresses"
    )

    def __repr__(self) -> str:
        return f"<IpAddress id={self.id} address={self.address!r} source={self.source}>"
