from __future__ import annotations

import enum
from datetime import datetime
from typing import TYPE_CHECKING, Optional

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.site import Site
    from app.models.vlan import Vlan
    from app.models.ip_address import IpAddress


class PrefixStatus(str, enum.Enum):
    active = "active"
    reserved = "reserved"
    deprecated = "deprecated"


class IpPrefix(Base):
    __tablename__ = "ip_prefix"

    __table_args__ = (
        sa.UniqueConstraint("prefix", name="uq_ip_prefix_prefix"),
    )

    id: Mapped[int] = mapped_column(sa.Integer, primary_key=True, index=True)
    site_id: Mapped[Optional[int]] = mapped_column(
        sa.Integer,
        sa.ForeignKey("site.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    vlan_id: Mapped[Optional[int]] = mapped_column(
        sa.Integer,
        sa.ForeignKey("vlan.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    # Stored as a plain string for maximum DB compatibility
    # e.g. "192.168.20.0/23", "10.0.0.0/8"
    prefix: Mapped[str] = mapped_column(sa.String(50), nullable=False, unique=True)
    description: Mapped[Optional[str]] = mapped_column(sa.Text, nullable=True)
    is_pool: Mapped[bool] = mapped_column(
        sa.Boolean, nullable=False, default=False, server_default=sa.false()
    )
    status: Mapped[PrefixStatus] = mapped_column(
        sa.Enum(PrefixStatus, native_enum=True),
        nullable=False,
        default=PrefixStatus.active,
        server_default=PrefixStatus.active.value,
    )
    notes: Mapped[Optional[str]] = mapped_column(sa.Text, nullable=True)
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
    site: Mapped[Optional[Site]] = relationship("Site", back_populates="ip_prefixes")
    vlan: Mapped[Optional[Vlan]] = relationship("Vlan", back_populates="ip_prefixes")
    ip_addresses: Mapped[list[IpAddress]] = relationship(
        "IpAddress", back_populates="prefix"
    )

    def __repr__(self) -> str:
        return f"<IpPrefix id={self.id} prefix={self.prefix!r} status={self.status}>"
