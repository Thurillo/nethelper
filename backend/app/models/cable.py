from __future__ import annotations

import enum
from datetime import datetime
from typing import TYPE_CHECKING, Optional

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import Numeric

from app.database import Base

if TYPE_CHECKING:
    from app.models.interface import Interface


class CableType(str, enum.Enum):
    cat5e = "cat5e"
    cat6 = "cat6"
    cat6a = "cat6a"
    cat7 = "cat7"
    fiber_sm = "fiber_sm"
    fiber_mm = "fiber_mm"
    dac = "dac"
    other = "other"


class Cable(Base):
    __tablename__ = "cable"

    __table_args__ = (
        sa.UniqueConstraint("interface_a_id", "interface_b_id", name="uq_cable_interfaces"),
        sa.CheckConstraint("interface_a_id != interface_b_id", name="ck_cable_no_self_loop"),
        sa.CheckConstraint("interface_a_id < interface_b_id", name="ck_cable_ordered_interfaces"),
    )

    id: Mapped[int] = mapped_column(sa.Integer, primary_key=True, index=True)
    interface_a_id: Mapped[int] = mapped_column(
        sa.Integer,
        sa.ForeignKey("interface.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    interface_b_id: Mapped[int] = mapped_column(
        sa.Integer,
        sa.ForeignKey("interface.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    cable_type: Mapped[CableType] = mapped_column(
        sa.Enum(CableType, native_enum=True),
        nullable=False,
        default=CableType.cat6,
        server_default=CableType.cat6.value,
    )
    label: Mapped[Optional[str]] = mapped_column(sa.String(150), nullable=True)
    length_m: Mapped[Optional[float]] = mapped_column(Numeric(7, 2), nullable=True)
    color: Mapped[Optional[str]] = mapped_column(sa.String(50), nullable=True)
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
    interface_a: Mapped[Interface] = relationship(
        "Interface",
        back_populates="cables_a",
        foreign_keys=[interface_a_id],
    )
    interface_b: Mapped[Interface] = relationship(
        "Interface",
        back_populates="cables_b",
        foreign_keys=[interface_b_id],
    )

    def __repr__(self) -> str:
        return f"<Cable id={self.id} a={self.interface_a_id} b={self.interface_b_id} type={self.cable_type}>"
