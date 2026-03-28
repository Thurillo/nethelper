"""device plan position

Revision ID: d1e2f3a4b5c6
Revises: a1b2c3d4e5f6
Create Date: 2026-03-28 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'd1e2f3a4b5c6'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('device', sa.Column('plan_x', sa.Float(), nullable=True))
    op.add_column('device', sa.Column('plan_y', sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column('device', 'plan_y')
    op.drop_column('device', 'plan_x')
