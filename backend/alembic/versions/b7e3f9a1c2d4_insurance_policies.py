"""insurance policies

Revision ID: b7e3f9a1c2d4
Revises: a4d1c0e7b3f2
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = 'b7e3f9a1c2d4'
down_revision: Union[str, Sequence[str], None] = 'a4d1c0e7b3f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'insurance_policies',
        sa.Column('id', sa.Uuid(), primary_key=True),
        sa.Column('user_id', sa.Uuid(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('account_id', sa.Uuid(), sa.ForeignKey('accounts.id'), nullable=False),
        sa.Column('transfer_id', sa.Uuid(), sa.ForeignKey('transfers.id'), nullable=False, unique=True),
        sa.Column('product', sa.String(10), nullable=False),
        sa.Column('plan', sa.String(20), nullable=False),
        sa.Column('details', postgresql.JSONB(), nullable=False),
        sa.Column('holder_name', sa.String(100), nullable=False),
        sa.Column('premium', sa.BigInteger(), nullable=False),
        sa.Column('coverage', sa.BigInteger(), nullable=False),
        sa.Column('currency', sa.String(3), nullable=False),
        sa.Column('start_date', sa.Date(), nullable=False),
        sa.Column('end_date', sa.Date(), nullable=False),
        sa.Column('policy_number', sa.String(32), nullable=False, unique=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("product IN ('travel', 'medical', 'car', 'home')", name='ck_insurance_product'),
        sa.CheckConstraint('premium > 0', name='ck_insurance_premium_positive'),
        sa.CheckConstraint('end_date >= start_date', name='ck_insurance_dates'),
    )
    op.create_index('ix_insurance_policies_user_id', 'insurance_policies', ['user_id'])


def downgrade() -> None:
    op.drop_table('insurance_policies')
