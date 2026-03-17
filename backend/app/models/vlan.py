from __future__ import annotations

import enum
from datetime import datetime
from typing import TYPE_CHECKING, Optional

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.site import Site
    from app.models.interface import Interface
    from app.models.interface_vlan import InterfaceVlan
    from app.models.ip_prefix import IpPrefix


class VlanStatus(str, enum.Enum):
    active = "active"
    reserved = "reserved"
    deprecated = "deprecated"


class Vlan(Base):
    __tablename__ = "vlan"

    __table_args__ = (
        sa.UniqueConstraint("site_id", "vid", name="uq_vlan_site_vid"),
        sa.CheckConstraint("vid >= 1 AND vid <= 4094", name="ck_vlan_vid_range"),
    )

    id: Mapped[int] = mapped_column(sa.Integer, primary_key=True, index=True)
    site_id: Mapped[Optional[int]] = mapped_column(
        sa.Integer,
        sa.ForeignKey("site.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    vid: Mapped[int] = mapped_column(sa.Integer, nullable=False)
    name: Mapped[str] = mapped_column(sa.String(150), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(sa.Text, nullable=True)
    status: Mapped[VlanStatus] = mapped_column(
        sa.Enum(VlanStatus, native_enum=True),
        nullable=False,
        default=VlanStatus.active,
        server_default=VlanStatus.active.value,
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
    site: Mapped[Optional[Site]] = relationship("Site", back_populates="vlans")
    interfaces: Mapped[list[Interface]] = relationship(
        "Interface",
        back_populates="vlan",
        foreign_keys="Interface.vlan_id",
    )
    interface_vlans: Mapped[list[InterfaceVlan]] = relationship("InterfaceVlan", back_populates="vlan")
    ip_prefixes: Mapped[list[IpPrefix]] = relationship("IpPrefix", back_populates="vlan")

    def __repr__(self) -> str:
        return f"<Vlan id={self.id} vid={self.vid} name={self.name!r}>"
