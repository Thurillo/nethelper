"""add duplicate_device conflict type and last_seen on create

Revision ID: d4f8a1b2c3e5
Revises: c61dca1aad09
Create Date: 2026-03-22 10:00:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd4f8a1b2c3e5'
down_revision: Union[str, None] = 'c61dca1aad09'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add new enum value to conflicttype (PostgreSQL-safe, non-transactional DDL)
    op.execute("ALTER TYPE conflicttype ADD VALUE IF NOT EXISTS 'duplicate_device'")


def downgrade() -> None:
    # PostgreSQL does not support removing enum values; downgrade is a no-op
    pass
