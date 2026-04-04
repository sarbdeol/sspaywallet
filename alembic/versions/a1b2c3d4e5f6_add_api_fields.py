"""add api_key webhook_url api_enabled to sub_wallets

Revision ID: a1b2c3d4e5f6
Revises: 
Create Date: 2026-04-04

"""
from alembic import op
import sqlalchemy as sa
import secrets


revision = 'a1b2c3d4e5f6'
down_revision = None  # set to your latest migration ID if you have one
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add new columns to sub_wallets
    op.add_column('sub_wallets', sa.Column('api_key',     sa.String(100), nullable=True))
    op.add_column('sub_wallets', sa.Column('webhook_url', sa.String(500), nullable=True))
    op.add_column('sub_wallets', sa.Column('api_enabled', sa.Boolean(), nullable=False, server_default='true'))

    # Generate unique API keys for all existing wallets using md5 (no extension needed)
    op.execute("""
        UPDATE sub_wallets
        SET api_key = 'xpay_sk_' || md5(random()::text || id::text || clock_timestamp()::text)
        WHERE api_key IS NULL
    """)

    # Now make api_key not nullable and add unique constraint + index
    op.alter_column('sub_wallets', 'api_key', nullable=False)
    op.create_unique_constraint('uq_sub_wallets_api_key', 'sub_wallets', ['api_key'])
    op.create_index('ix_sub_wallets_api_key', 'sub_wallets', ['api_key'], unique=True)


def downgrade() -> None:
    op.drop_index('ix_sub_wallets_api_key', table_name='sub_wallets')
    op.drop_constraint('uq_sub_wallets_api_key', 'sub_wallets', type_='unique')
    op.drop_column('sub_wallets', 'api_enabled')
    op.drop_column('sub_wallets', 'webhook_url')
    op.drop_column('sub_wallets', 'api_key')