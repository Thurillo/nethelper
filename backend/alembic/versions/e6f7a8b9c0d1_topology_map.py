"""topology_map table

Revision ID: e6f7a8b9c0d1
Revises: d1e2f3a4b5c6
Create Date: 2026-03-28

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = 'e6f7a8b9c0d1'
down_revision = 'd1e2f3a4b5c6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'topology_map',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=150), nullable=False),
        sa.Column('site_id', sa.Integer(), nullable=True),
        sa.Column('created_by_id', sa.Integer(), nullable=True),
        sa.Column('layout', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['created_by_id'], ['user.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['site_id'], ['site.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_topology_map_id'), 'topology_map', ['id'], unique=False)
    op.create_index(op.f('ix_topology_map_site_id'), 'topology_map', ['site_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_topology_map_site_id'), table_name='topology_map')
    op.drop_index(op.f('ix_topology_map_id'), table_name='topology_map')
    op.drop_table('topology_map')
