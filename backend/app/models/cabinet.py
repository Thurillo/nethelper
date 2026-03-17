from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Optional

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.site import Site
    from app.models.device import Device


class Cabinet(Base):
    __tablename__ = "cabinet"

    __table_args__ = (
        sa.UniqueConstraint("site_id", "name", name="uq_cabinet_site_name"),
    )

    id: Mapped[int] = mapped_column(sa.Integer, primary_key=True, index=True)
    site_id: Mapped[int] = mapped_column(
        sa.Integer,
        sa.ForeignKey("site.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(sa.String(150), nullable=False)
    u_count: Mapped[int] = mapped_column(sa.Integer, nullable=False, default=42, server_default="42")
    description: Mapped[Optional[str]] = mapped_column(sa.Text, nullable=True)
    row_label: Mapped[Optional[str]] = mapped_column(sa.String(50), nullable=True)
    position: Mapped[Optional[int]] = mapped_column(sa.Integer, nullable=True)
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
    site: Mapped[Site] = relationship("Site", back_populates="cabinets")
    devices: Mapped[list[Device]] = relationship("Device", back_populates="cabinet")

    def __repr__(self) -> str:
        return f"<Cabinet id={self.id} name={self.name!r} site_id={self.site_id}>"
