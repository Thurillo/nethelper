"""checkmk integration: app_setting table + checkmk_host_name on device

Revision ID: a1b2c3d4e5f6
Revises: f6a0c3d4e5b7
Create Date: 2026-03-25

"""
from alembic import op
import sqlalchemy as sa

revision = 'a1b2c3d4e5f6'
down_revision = 'f6a0c3d4e5b7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create app_setting table (generic key/value store for GUI-configurable settings)
    op.create_table(
        'app_setting',
        sa.Column('key', sa.String(100), primary_key=True),
        sa.Column('value', sa.Text(), nullable=True),
    )

    # Add checkmk_host_name column to device table
    op.add_column(
        'device',
        sa.Column('checkmk_host_name', sa.String(255), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('device', 'checkmk_host_name')
    op.drop_table('app_setting')
