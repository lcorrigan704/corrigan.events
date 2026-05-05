"""production sports email payouts

Revision ID: 0001_production_sports_email_payouts
Revises:
Create Date: 2026-05-05
"""

from alembic import op
import sqlalchemy as sa

revision = "0001_production_sports_email_payouts"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("payout_terms") as batch:
        batch.add_column(sa.Column("category", sa.String(length=17), nullable=True))
    op.execute(
        """
        UPDATE payout_terms
        SET category = CASE lower(label)
            WHEN 'winner' THEN 'champion'
            WHEN 'champion' THEN 'champion'
            WHEN 'runner up' THEN 'runner_up'
            WHEN 'runner-up' THEN 'runner_up'
            WHEN 'third place' THEN 'third_place'
            WHEN 'most goals scored' THEN 'most_goals_scored'
            WHEN 'last place' THEN 'last_place'
            ELSE 'champion'
        END
        """
    )
    op.create_table(
        "world_cup_fixtures",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("sweepstake_id", sa.Integer(), nullable=False),
        sa.Column("match_no", sa.Integer(), nullable=False),
        sa.Column("stage", sa.String(length=40), nullable=False),
        sa.Column("group_name", sa.String(length=16), nullable=True),
        sa.Column("venue", sa.String(length=120), nullable=True),
        sa.Column("kickoff_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("home_code", sa.String(length=32), nullable=True),
        sa.Column("away_code", sa.String(length=32), nullable=True),
        sa.Column("home_score", sa.Integer(), nullable=True),
        sa.Column("away_score", sa.Integer(), nullable=True),
        sa.Column("winner_code", sa.String(length=32), nullable=True),
        sa.Column("status", sa.String(length=10), nullable=False),
        sa.Column("payload_json", sa.Text(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["sweepstake_id"], ["sweepstakes.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("sweepstake_id", "match_no", name="uq_sweepstake_fixture_match_no"),
    )
    op.create_table(
        "group_standings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("sweepstake_id", sa.Integer(), nullable=False),
        sa.Column("team_code", sa.String(length=32), nullable=False),
        sa.Column("group_name", sa.String(length=16), nullable=False),
        sa.Column("played", sa.Integer(), nullable=False),
        sa.Column("wins", sa.Integer(), nullable=False),
        sa.Column("draws", sa.Integer(), nullable=False),
        sa.Column("losses", sa.Integer(), nullable=False),
        sa.Column("goals_for", sa.Integer(), nullable=False),
        sa.Column("goals_against", sa.Integer(), nullable=False),
        sa.Column("goal_difference", sa.Integer(), nullable=False),
        sa.Column("points", sa.Integer(), nullable=False),
        sa.Column("rank", sa.Integer(), nullable=True),
        sa.Column("is_final", sa.Boolean(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["sweepstake_id"], ["sweepstakes.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("sweepstake_id", "team_code", name="uq_sweepstake_standing_team"),
    )
    op.create_table(
        "knockout_matches",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("sweepstake_id", sa.Integer(), nullable=False),
        sa.Column("match_no", sa.Integer(), nullable=False),
        sa.Column("round_name", sa.String(length=40), nullable=False),
        sa.Column("home_placeholder", sa.String(length=120), nullable=False),
        sa.Column("away_placeholder", sa.String(length=120), nullable=False),
        sa.Column("venue", sa.String(length=120), nullable=True),
        sa.Column("home_code", sa.String(length=32), nullable=True),
        sa.Column("away_code", sa.String(length=32), nullable=True),
        sa.Column("home_score", sa.Integer(), nullable=True),
        sa.Column("away_score", sa.Integer(), nullable=True),
        sa.Column("winner_code", sa.String(length=32), nullable=True),
        sa.Column("status", sa.String(length=10), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["sweepstake_id"], ["sweepstakes.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("sweepstake_id", "match_no", name="uq_sweepstake_knockout_match_no"),
    )
    op.create_table(
        "sports_sync_runs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("provider", sa.String(length=80), nullable=False),
        sa.Column("status", sa.String(length=40), nullable=False),
        sa.Column("message", sa.String(length=255), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "sports_overrides",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("sweepstake_id", sa.Integer(), nullable=False),
        sa.Column("target_type", sa.String(length=40), nullable=False),
        sa.Column("target_key", sa.String(length=80), nullable=False),
        sa.Column("payload_json", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["sweepstake_id"], ["sweepstakes.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "email_outbox",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("recipient", sa.String(length=255), nullable=False),
        sa.Column("subject", sa.String(length=255), nullable=False),
        sa.Column("body_text", sa.Text(), nullable=False),
        sa.Column("provider", sa.String(length=80), nullable=False),
        sa.Column("status", sa.String(length=7), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("last_error", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("email_outbox")
    op.drop_table("sports_overrides")
    op.drop_table("sports_sync_runs")
    op.drop_table("knockout_matches")
    op.drop_table("group_standings")
    op.drop_table("world_cup_fixtures")
    with op.batch_alter_table("payout_terms") as batch:
        batch.drop_column("category")
