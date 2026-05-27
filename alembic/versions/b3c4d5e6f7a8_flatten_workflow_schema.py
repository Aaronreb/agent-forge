"""flatten_workflow_schema

Revision ID: b3c4d5e6f7a8
Revises: a1b2c3d4e5f6
Create Date: 2026-05-25 12:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'b3c4d5e6f7a8'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add JSONB columns to workflows
    op.add_column('workflows', sa.Column('nodes', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default='[]'))
    op.add_column('workflows', sa.Column('edges', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default='[]'))
    op.add_column('workflows', sa.Column('updated_at', sa.DateTime(), nullable=True))

    # Remove old relational column
    op.drop_column('workflows', 'template_slug')

    # Drop FK-dependent tables in correct order
    op.drop_table('workflow_edges')
    op.drop_table('workflow_nodes')
    op.drop_table('workflow_templates')


def downgrade() -> None:
    op.create_table(
        'workflow_templates',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('slug', sa.String(64), nullable=False),
        sa.Column('name', sa.String(128), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('definition', sa.JSON(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('slug'),
    )
    op.create_table(
        'workflow_nodes',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('workflow_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('agent_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('position_x', sa.Float(), nullable=True),
        sa.Column('position_y', sa.Float(), nullable=True),
        sa.Column('is_entry', sa.Boolean(), nullable=True),
        sa.Column('node_type', sa.String(32), nullable=False),
        sa.Column('label', sa.String(128), nullable=False),
        sa.Column('node_name', sa.String(128), nullable=False),
        sa.Column('config', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.ForeignKeyConstraint(['workflow_id'], ['workflows.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_table(
        'workflow_edges',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('workflow_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('source_node_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('target_node_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('condition_expr', sa.Text(), nullable=True),
        sa.Column('label', sa.String(128), nullable=True),
        sa.ForeignKeyConstraint(['workflow_id'], ['workflows.id']),
        sa.ForeignKeyConstraint(['source_node_id'], ['workflow_nodes.id']),
        sa.ForeignKeyConstraint(['target_node_id'], ['workflow_nodes.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.add_column('workflows', sa.Column('template_slug', sa.String(64), nullable=True))
    op.drop_column('workflows', 'updated_at')
    op.drop_column('workflows', 'edges')
    op.drop_column('workflows', 'nodes')
