from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Optional

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.cabinet import Cabinet
    from app.models.device import Device
    from app.models.vlan import Vlan
    from app.models.ip_prefix import IpPrefix


class Site(Base):
    __tablename__ = "site"

    id: Mapped[int] = mapped_column(sa.Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(sa.String(150), unique=True, nullable=False, index=True)
    description: Mapped[Optional[str]] = mapped_column(sa.Text, nullable=True)
    address: Mapped[Optional[str]] = mapped_column(sa.Text, nullable=True)
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
    cabinets: Mapped[list[Cabinet]] = relationship("Cabinet", back_populates="site")
    devices: Mapped[list[Device]] = relationship("Device", back_populates="site")
    vlans: Mapped[list[Vlan]] = relationship("Vlan", back_populates="site")
    ip_prefixes: Mapped[list[IpPrefix]] = relationship("IpPrefix", back_populates="site")

    def __repr__(self) -> str:
        return f"<Site id={self.id} name={self.name!r}>"
