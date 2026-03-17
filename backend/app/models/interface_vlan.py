from __future__ import annotations

from typing import TYPE_CHECKING

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.interface import Interface
    from app.models.vlan import Vlan


class InterfaceVlan(Base):
    __tablename__ = "interface_vlan"

    __table_args__ = (
        sa.PrimaryKeyConstraint("interface_id", "vlan_id", name="pk_interface_vlan"),
    )

    interface_id: Mapped[int] = mapped_column(
        sa.Integer,
        sa.ForeignKey("interface.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    vlan_id: Mapped[int] = mapped_column(
        sa.Integer,
        sa.ForeignKey("vlan.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    is_tagged: Mapped[bool] = mapped_column(
        sa.Boolean,
        nullable=False,
        default=True,
        server_default=sa.true(),
    )

    # Relationships
    interface: Mapped[Interface] = relationship("Interface", back_populates="interface_vlans")
    vlan: Mapped[Vlan] = relationship("Vlan", back_populates="interface_vlans")

    def __repr__(self) -> str:
        return f"<InterfaceVlan interface_id={self.interface_id} vlan_id={self.vlan_id} tagged={self.is_tagged}>"
