from __future__ import annotations

from datetime import datetime
from typing import Optional, TYPE_CHECKING

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.site import Site
    from app.models.user import User


class TopologyMap(Base):
    __tablename__ = "topology_map"

    id: Mapped[int] = mapped_column(sa.Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(sa.String(150), nullable=False)
    site_id: Mapped[Optional[int]] = mapped_column(
        sa.Integer,
        sa.ForeignKey("site.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    created_by_id: Mapped[Optional[int]] = mapped_column(
        sa.Integer,
        sa.ForeignKey("user.id", ondelete="SET NULL"),
        nullable=True,
    )
    # JSON text: {"<device_id>": {"x": 450.5, "y": 230.0, "visible": true}, ...}
    # Using Text instead of JSON column for SQLite + PostgreSQL compatibility
    layout: Mapped[Optional[str]] = mapped_column(sa.Text, nullable=True)

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

    site: Mapped[Optional["Site"]] = relationship("Site")
    created_by: Mapped[Optional["User"]] = relationship("User")
