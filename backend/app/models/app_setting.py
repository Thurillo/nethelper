from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AppSetting(Base):
    """Generic key/value store for GUI-configurable application settings."""

    __tablename__ = "app_setting"

    key: Mapped[str] = mapped_column(sa.String(100), primary_key=True)
    value: Mapped[str | None] = mapped_column(sa.Text, nullable=True)

    def __repr__(self) -> str:
        return f"<AppSetting key={self.key!r}>"
