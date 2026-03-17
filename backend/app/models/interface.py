from __future__ import annotations

import enum
from datetime import datetime
from typing import TYPE_CHECKING, Optional

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.device import Device
    from app.models.vlan import Vlan
    from app.models.interface_vlan import InterfaceVlan
    from app.models.cable import Cable
    from app.models.mac_entry import MacEntry
    from app.models.ip_address import IpAddress


class InterfaceType(str, enum.Enum):
    ethernet = "ethernet"
    fiber = "fiber"
    sfp = "sfp"
    sfp_plus = "sfp_plus"
    lag = "lag"
    loopback = "loopback"
    vlan_if = "vlan_if"
    wireless = "wireless"
    patch_panel_port = "patch_panel_port"
    other = "other"


class Interface(Base):
    __tablename__ = "interface"

    __table_args__ = (
        sa.UniqueConstraint("device_id", "name", name="uq_interface_device_name"),
    )

    id: Mapped[int] = mapped_column(sa.Integer, primary_key=True, index=True)
    device_id: Mapped[int] = mapped_column(
        sa.Integer,
        sa.ForeignKey("device.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(sa.String(150), nullable=False)
    label: Mapped[Optional[str]] = mapped_column(sa.String(150), nullable=True)
    if_type: Mapped[InterfaceType] = mapped_column(
        sa.Enum(InterfaceType, native_enum=True),
        nullable=False,
        default=InterfaceType.ethernet,
        server_default=InterfaceType.ethernet.value,
    )
    mac_address: Mapped[Optional[str]] = mapped_column(sa.String(20), nullable=True, index=True)
    speed_mbps: Mapped[Optional[int]] = mapped_column(sa.Integer, nullable=True)
    mtu: Mapped[Optional[int]] = mapped_column(sa.Integer, nullable=True)
    admin_up: Mapped[Optional[bool]] = mapped_column(sa.Boolean, nullable=True)
    oper_up: Mapped[Optional[bool]] = mapped_column(sa.Boolean, nullable=True)
    if_index: Mapped[Optional[int]] = mapped_column(sa.Integer, nullable=True)
    vlan_id: Mapped[Optional[int]] = mapped_column(
        sa.Integer,
        sa.ForeignKey("vlan.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    description: Mapped[Optional[str]] = mapped_column(sa.Text, nullable=True)
    room_destination: Mapped[Optional[str]] = mapped_column(sa.String(255), nullable=True)
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
    device: Mapped[Device] = relationship("Device", back_populates="interfaces")
    vlan: Mapped[Optional[Vlan]] = relationship(
        "Vlan",
        back_populates="interfaces",
        foreign_keys=[vlan_id],
    )
    interface_vlans: Mapped[list[InterfaceVlan]] = relationship(
        "InterfaceVlan",
        back_populates="interface",
        cascade="all, delete-orphan",
    )
    cables_a: Mapped[list[Cable]] = relationship(
        "Cable",
        back_populates="interface_a",
        foreign_keys="Cable.interface_a_id",
        cascade="all, delete-orphan",
    )
    cables_b: Mapped[list[Cable]] = relationship(
        "Cable",
        back_populates="interface_b",
        foreign_keys="Cable.interface_b_id",
        cascade="all, delete-orphan",
    )
    mac_entries: Mapped[list[MacEntry]] = relationship("MacEntry", back_populates="interface")
    ip_addresses: Mapped[list[IpAddress]] = relationship(
        "IpAddress",
        back_populates="interface",
        foreign_keys="IpAddress.interface_id",
    )

    def __repr__(self) -> str:
        return f"<Interface id={self.id} name={self.name!r} device_id={self.device_id}>"
