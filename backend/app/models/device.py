from __future__ import annotations

import enum
from datetime import datetime
from typing import TYPE_CHECKING, Optional

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.site import Site
    from app.models.cabinet import Cabinet
    from app.models.vendor import Vendor
    from app.models.interface import Interface
    from app.models.ip_address import IpAddress
    from app.models.mac_entry import MacEntry
    from app.models.scan_job import ScanJob
    from app.models.scan_conflict import ScanConflict


class DeviceType(str, enum.Enum):
    switch = "switch"
    router = "router"
    access_point = "access_point"
    server = "server"
    patch_panel = "patch_panel"
    pdu = "pdu"
    firewall = "firewall"
    ups = "ups"
    unmanaged_switch = "unmanaged_switch"
    workstation = "workstation"
    printer = "printer"
    camera = "camera"
    phone = "phone"
    other = "other"


class DeviceStatus(str, enum.Enum):
    active = "active"
    inactive = "inactive"
    planned = "planned"
    decommissioned = "decommissioned"


class Device(Base):
    __tablename__ = "device"

    id: Mapped[int] = mapped_column(sa.Integer, primary_key=True, index=True)
    site_id: Mapped[Optional[int]] = mapped_column(
        sa.Integer,
        sa.ForeignKey("site.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    cabinet_id: Mapped[Optional[int]] = mapped_column(
        sa.Integer,
        sa.ForeignKey("cabinet.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    vendor_id: Mapped[Optional[int]] = mapped_column(
        sa.Integer,
        sa.ForeignKey("vendor.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    name: Mapped[str] = mapped_column(sa.String(150), nullable=False, index=True)
    device_type: Mapped[DeviceType] = mapped_column(
        sa.Enum(DeviceType, native_enum=True),
        nullable=False,
        default=DeviceType.switch,
        server_default=DeviceType.switch.value,
    )
    status: Mapped[DeviceStatus] = mapped_column(
        sa.Enum(DeviceStatus, native_enum=True),
        nullable=False,
        default=DeviceStatus.active,
        server_default=DeviceStatus.active.value,
    )
    model: Mapped[Optional[str]] = mapped_column(sa.String(150), nullable=True)
    serial_number: Mapped[Optional[str]] = mapped_column(sa.String(150), nullable=True)
    asset_tag: Mapped[Optional[str]] = mapped_column(sa.String(100), nullable=True)
    mac_address: Mapped[Optional[str]] = mapped_column(sa.String(17), nullable=True)  # XX:XX:XX:XX:XX:XX

    # Rack positioning
    u_position: Mapped[Optional[int]] = mapped_column(sa.SmallInteger, nullable=True)
    u_height: Mapped[int] = mapped_column(
        sa.SmallInteger, nullable=False, default=1, server_default="1"
    )

    # Primary management IP (CIDR or bare IP, stored as String for broad compatibility)
    primary_ip: Mapped[Optional[str]] = mapped_column(sa.String(50), nullable=True)

    # ------------------------------------------------------------------
    # SNMP – override vendor defaults per-device
    # ------------------------------------------------------------------
    snmp_community: Mapped[Optional[str]] = mapped_column(sa.String(255), nullable=True)
    snmp_version: Mapped[int] = mapped_column(
        sa.SmallInteger, nullable=False, default=2, server_default="2"
    )
    snmp_v3_username: Mapped[Optional[str]] = mapped_column(
        sa.String(150), nullable=True
    )
    snmp_v3_auth_protocol: Mapped[Optional[str]] = mapped_column(
        sa.String(50), nullable=True
    )
    snmp_v3_auth_password_enc: Mapped[Optional[str]] = mapped_column(
        sa.Text, nullable=True
    )
    snmp_v3_priv_protocol: Mapped[Optional[str]] = mapped_column(
        sa.String(50), nullable=True
    )
    snmp_v3_priv_password_enc: Mapped[Optional[str]] = mapped_column(
        sa.Text, nullable=True
    )

    # ------------------------------------------------------------------
    # SSH – override vendor defaults per-device
    # ------------------------------------------------------------------
    ssh_username: Mapped[Optional[str]] = mapped_column(sa.String(150), nullable=True)
    ssh_password_enc: Mapped[Optional[str]] = mapped_column(sa.Text, nullable=True)
    ssh_key_path: Mapped[Optional[str]] = mapped_column(sa.String(500), nullable=True)
    ssh_port: Mapped[Optional[int]] = mapped_column(sa.SmallInteger, nullable=True)

    # ------------------------------------------------------------------
    # Misc
    # ------------------------------------------------------------------
    notes: Mapped[Optional[str]] = mapped_column(sa.Text, nullable=True)
    last_seen: Mapped[Optional[datetime]] = mapped_column(
        sa.DateTime(timezone=True), nullable=True
    )
    is_unmanaged_suspected: Mapped[bool] = mapped_column(
        sa.Boolean, nullable=False, default=False, server_default=sa.false()
    )
    checkmk_host_name: Mapped[Optional[str]] = mapped_column(
        sa.String(255), nullable=True
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
    site: Mapped[Optional[Site]] = relationship("Site", back_populates="devices")
    cabinet: Mapped[Optional[Cabinet]] = relationship(
        "Cabinet", back_populates="devices"
    )
    vendor: Mapped[Optional[Vendor]] = relationship("Vendor", back_populates="devices")
    interfaces: Mapped[list[Interface]] = relationship(
        "Interface", back_populates="device", cascade="all, delete-orphan"
    )
    ip_addresses: Mapped[list[IpAddress]] = relationship(
        "IpAddress",
        back_populates="device",
        foreign_keys="IpAddress.device_id",
        cascade="all, delete-orphan",
    )
    mac_entries: Mapped[list[MacEntry]] = relationship(
        "MacEntry", back_populates="device", cascade="all, delete-orphan"
    )
    scan_jobs: Mapped[list[ScanJob]] = relationship(
        "ScanJob", back_populates="device"
    )
    scan_conflicts: Mapped[list[ScanConflict]] = relationship(
        "ScanConflict", back_populates="device"
    )

    def __repr__(self) -> str:
        return (
            f"<Device id={self.id} name={self.name!r} type={self.device_type}>"
        )
