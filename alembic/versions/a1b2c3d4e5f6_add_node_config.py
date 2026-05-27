"""add_node_config

Revision ID: a1b2c3d4e5f6
Revises: d86c19c23eb3
Create Date: 2026-05-25 10:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'a1b2c3d4e5f6'
down_revision = 'd86c19c23eb3'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('workflow_nodes', sa.Column('config', postgresql.JSONB(astext_type=sa.Text()), nullable=True))


def downgrade() -> None:
    op.drop_column('workflow_nodes', 'config')
