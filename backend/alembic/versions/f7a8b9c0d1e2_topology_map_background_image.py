"""topology_map background_image_url

Revision ID: f7a8b9c0d1e2
Revises: e6f7a8b9c0d1
Create Date: 2026-03-28 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = 'f7a8b9c0d1e2'
down_revision = 'e6f7a8b9c0d1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'topology_map',
        sa.Column('background_image_url', sa.String(500), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('topology_map', 'background_image_url')
