"""draw audit metadata

Revision ID: 0002_draw_audit_metadata
Revises: 0001_production_sports_email_payouts
Create Date: 2026-05-07
"""

from alembic import op
import sqlalchemy as sa

revision = "0002_draw_audit_metadata"
down_revision = "0001_production_sports_email_payouts"
branch_labels = None
depends_on = None


def upgrade() -> None:
    existing_columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("sweepstakes")}
    with op.batch_alter_table("sweepstakes") as batch:
        if "draw_published_at" not in existing_columns:
            batch.add_column(sa.Column("draw_published_at", sa.DateTime(timezone=True), nullable=True))
        if "draw_algorithm" not in existing_columns:
            batch.add_column(sa.Column("draw_algorithm", sa.String(length=80), nullable=True))
        if "assignment_digest" not in existing_columns:
            batch.add_column(sa.Column("assignment_digest", sa.String(length=64), nullable=True))
        if "audit_version" not in existing_columns:
            batch.add_column(sa.Column("audit_version", sa.Integer(), nullable=True))


def downgrade() -> None:
    existing_columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("sweepstakes")}
    with op.batch_alter_table("sweepstakes") as batch:
        if "audit_version" in existing_columns:
            batch.drop_column("audit_version")
        if "assignment_digest" in existing_columns:
            batch.drop_column("assignment_digest")
        if "draw_algorithm" in existing_columns:
            batch.drop_column("draw_algorithm")
        if "draw_published_at" in existing_columns:
            batch.drop_column("draw_published_at")
