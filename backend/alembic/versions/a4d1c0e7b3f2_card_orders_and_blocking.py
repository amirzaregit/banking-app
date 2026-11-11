"""card orders and block requests

Revision ID: a4d1c0e7b3f2
Revises: 2c22558d42bd
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'a4d1c0e7b3f2'
down_revision: Union[str, Sequence[str], None] = '2c22558d42bd'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # A card can now also be 'blocked' (lost, stolen ...): final, unlike 'frozen' which the customer can undo.
    op.drop_constraint('ck_cards_status', 'cards', type_='check')
    op.create_check_constraint('ck_cards_status', 'cards', "status IN ('active', 'frozen', 'blocked')")

    op.create_table(
        'card_orders',
        sa.Column('id', sa.Uuid(), primary_key=True),
        sa.Column('user_id', sa.Uuid(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('account_id', sa.Uuid(), sa.ForeignKey('accounts.id'), nullable=False),
        sa.Column('theme', sa.String(10), nullable=False),
        sa.Column('branch_id', sa.String(30), nullable=False),
        sa.Column('notify_by', sa.String(10), nullable=False, server_default='app'),
        sa.Column('status', sa.String(10), nullable=False, server_default='pending'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("theme IN ('light', 'dark')", name='ck_card_orders_theme'),
        sa.CheckConstraint("status IN ('pending', 'ready')", name='ck_card_orders_status'),
        sa.CheckConstraint("notify_by IN ('app', 'phone')", name='ck_card_orders_notify'),
    )
    op.create_index('ix_card_orders_user_id', 'card_orders', ['user_id'])
    op.create_index('ix_card_orders_account_id', 'card_orders', ['account_id'])
    op.create_index('uq_card_orders_one_pending', 'card_orders', ['account_id'], unique=True, postgresql_where=sa.text("status = 'pending'"))

    op.create_table(
        'block_requests',
        sa.Column('id', sa.Uuid(), primary_key=True),
        sa.Column('user_id', sa.Uuid(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('account_id', sa.Uuid(), sa.ForeignKey('accounts.id'), nullable=False),
        sa.Column('card_id', sa.Uuid(), sa.ForeignKey('cards.id'), nullable=True),
        sa.Column('target', sa.String(10), nullable=False),
        sa.Column('reason', sa.String(30), nullable=False),
        sa.Column('details', sa.Text(), nullable=True),
        sa.Column('status', sa.String(20), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('resolved_at', sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("target IN ('account', 'card')", name='ck_block_requests_target'),
        sa.CheckConstraint("status IN ('applied', 'pending_review', 'approved', 'rejected')", name='ck_block_requests_status'),
        sa.CheckConstraint("(target = 'card') = (card_id IS NOT NULL)", name='ck_block_requests_card_matches_target'),
    )
    op.create_index('ix_block_requests_user_id', 'block_requests', ['user_id'])
    op.create_index('ix_block_requests_account_id', 'block_requests', ['account_id'])
    op.create_index('uq_block_requests_one_open_account', 'block_requests', ['account_id'], unique=True,
                    postgresql_where=sa.text("status = 'pending_review' AND target = 'account'"))
    op.create_index('uq_block_requests_one_open_card', 'block_requests', ['card_id'], unique=True,
                    postgresql_where=sa.text("status = 'pending_review' AND target = 'card'"))


def downgrade() -> None:
    op.drop_table('block_requests')
    op.drop_table('card_orders')
    op.drop_constraint('ck_cards_status', 'cards', type_='check')
    op.create_check_constraint('ck_cards_status', 'cards', "status IN ('active', 'frozen')")
