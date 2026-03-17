from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Optional

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.device import Device


class ScheduledScan(Base):
    __tablename__ = "scheduled_scan"

    id: Mapped[int] = mapped_column(sa.Integer, primary_key=True, index=True)
    device_id: Mapped[int] = mapped_column(
        sa.Integer,
        sa.ForeignKey("device.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    scan_type: Mapped[str] = mapped_column(sa.String(50), nullable=False)
    cron_expression: Mapped[str] = mapped_column(sa.String(100), nullable=False)
    enabled: Mapped[bool] = mapped_column(
        sa.Boolean, nullable=False, default=True, server_default=sa.true()
    )
    last_run: Mapped[Optional[datetime]] = mapped_column(
        sa.DateTime(timezone=True), nullable=True
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
    device: Mapped[Device] = relationship("Device")

    def __repr__(self) -> str:
        return (
            f"<ScheduledScan id={self.id} device_id={self.device_id} "
            f"cron={self.cron_expression!r} enabled={self.enabled}>"
        )
