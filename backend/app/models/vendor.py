from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Optional

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.device import Device


class Vendor(Base):
    __tablename__ = "vendor"

    id: Mapped[int] = mapped_column(sa.Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(sa.String(150), nullable=False)
    slug: Mapped[str] = mapped_column(
        sa.String(100), unique=True, nullable=False, index=True
    )

    # SNMP defaults
    snmp_default_community: Mapped[Optional[str]] = mapped_column(
        sa.String(255), nullable=True
    )
    snmp_default_version: Mapped[int] = mapped_column(
        sa.Integer, nullable=False, default=2, server_default="2"
    )
    snmp_v3_default_username: Mapped[Optional[str]] = mapped_column(
        sa.String(150), nullable=True
    )

    # SSH defaults
    ssh_default_username: Mapped[Optional[str]] = mapped_column(
        sa.String(150), nullable=True
    )
    ssh_default_password_enc: Mapped[Optional[str]] = mapped_column(
        sa.Text, nullable=True
    )
    ssh_default_port: Mapped[int] = mapped_column(
        sa.Integer, nullable=False, default=22, server_default="22"
    )

    # Driver string used for dynamic import (e.g. "cisco_ios", "unifi")
    driver_class: Mapped[Optional[str]] = mapped_column(sa.String(100), nullable=True)

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
    devices: Mapped[list[Device]] = relationship("Device", back_populates="vendor")

    def __repr__(self) -> str:
        return f"<Vendor id={self.id} name={self.name!r} slug={self.slug!r}>"
