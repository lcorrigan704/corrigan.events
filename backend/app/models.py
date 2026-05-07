from datetime import datetime, timezone
from enum import StrEnum

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class TemplateType(StrEnum):
    world_cup_2026 = "world_cup_2026"
    generic = "generic"


class DrawStatus(StrEnum):
    draft = "draft"
    generated = "generated"
    revealed = "revealed"


class ItemStatus(StrEnum):
    active = "active"
    eliminated = "eliminated"
    winner = "winner"
    placed = "placed"


class PayoutCategory(StrEnum):
    champion = "champion"
    runner_up = "runner_up"
    third_place = "third_place"
    most_goals_scored = "most_goals_scored"
    last_place = "last_place"


class OutcomeStatus(StrEnum):
    pending = "pending"
    provisional = "provisional"
    final = "final"


class MatchStatus(StrEnum):
    scheduled = "scheduled"
    live = "live"
    completed = "completed"
    postponed = "postponed"
    cancelled = "cancelled"


class EmailStatus(StrEnum):
    pending = "pending"
    sent = "sent"
    failed = "failed"


class Sweepstake(Base):
    __tablename__ = "sweepstakes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(160))
    template_type: Mapped[TemplateType] = mapped_column(Enum(TemplateType))
    buy_in_pence: Mapped[int] = mapped_column(Integer, default=0)
    currency: Mapped[str] = mapped_column(String(3), default="GBP")
    organiser_email: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    view_code: Mapped[str] = mapped_column(String(6), unique=True, index=True)
    admin_token_hash: Mapped[str] = mapped_column(String(255), index=True)
    reveal_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    draw_status: Mapped[DrawStatus] = mapped_column(Enum(DrawStatus), default=DrawStatus.generated)
    draw_published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    draw_algorithm: Mapped[str | None] = mapped_column(String(80), nullable=True)
    assignment_digest: Mapped[str | None] = mapped_column(String(64), nullable=True)
    audit_version: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    slots: Mapped[list["ParticipantSlot"]] = relationship(
        back_populates="sweepstake", cascade="all, delete-orphan", order_by="ParticipantSlot.position"
    )
    items: Mapped[list["DrawItem"]] = relationship(
        back_populates="sweepstake", cascade="all, delete-orphan", order_by="DrawItem.position"
    )
    payouts: Mapped[list["PayoutTerm"]] = relationship(
        back_populates="sweepstake", cascade="all, delete-orphan", order_by="PayoutTerm.position"
    )
    snapshots: Mapped[list["SportsSnapshot"]] = relationship(
        back_populates="sweepstake", cascade="all, delete-orphan"
    )
    fixtures: Mapped[list["WorldCupFixture"]] = relationship(
        back_populates="sweepstake", cascade="all, delete-orphan"
    )
    standings: Mapped[list["GroupStanding"]] = relationship(
        back_populates="sweepstake", cascade="all, delete-orphan"
    )
    knockout_matches: Mapped[list["KnockoutMatch"]] = relationship(
        back_populates="sweepstake", cascade="all, delete-orphan", order_by="KnockoutMatch.match_no"
    )


class ParticipantSlot(Base):
    __tablename__ = "participant_slots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    sweepstake_id: Mapped[int] = mapped_column(ForeignKey("sweepstakes.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    paid: Mapped[bool] = mapped_column(Boolean, default=True)
    position: Mapped[int] = mapped_column(Integer)
    draw_item_id: Mapped[int | None] = mapped_column(ForeignKey("draw_items.id"), nullable=True)

    sweepstake: Mapped[Sweepstake] = relationship(back_populates="slots")
    draw_item: Mapped["DrawItem | None"] = relationship(back_populates="assigned_slots")


class DrawItem(Base):
    __tablename__ = "draw_items"
    __table_args__ = (UniqueConstraint("sweepstake_id", "code", name="uq_sweepstake_item_code"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    sweepstake_id: Mapped[int] = mapped_column(ForeignKey("sweepstakes.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    code: Mapped[str] = mapped_column(String(32))
    group_name: Mapped[str | None] = mapped_column(String(16), nullable=True)
    seed_label: Mapped[str | None] = mapped_column(String(80), nullable=True)
    primary_color: Mapped[str] = mapped_column(String(16), default="#16a34a")
    secondary_color: Mapped[str] = mapped_column(String(16), default="#f8fafc")
    status: Mapped[ItemStatus] = mapped_column(Enum(ItemStatus), default=ItemStatus.active)
    placement: Mapped[int | None] = mapped_column(Integer, nullable=True)
    position: Mapped[int] = mapped_column(Integer)

    sweepstake: Mapped[Sweepstake] = relationship(back_populates="items")
    assigned_slots: Mapped[list[ParticipantSlot]] = relationship(back_populates="draw_item")


class PayoutTerm(Base):
    __tablename__ = "payout_terms"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    sweepstake_id: Mapped[int] = mapped_column(ForeignKey("sweepstakes.id"), index=True)
    label: Mapped[str] = mapped_column(String(80))
    category: Mapped[PayoutCategory] = mapped_column(Enum(PayoutCategory), default=PayoutCategory.champion)
    percentage: Mapped[int] = mapped_column(Integer)
    position: Mapped[int] = mapped_column(Integer)

    sweepstake: Mapped[Sweepstake] = relationship(back_populates="payouts")


class SportsSnapshot(Base):
    __tablename__ = "sports_snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    sweepstake_id: Mapped[int] = mapped_column(ForeignKey("sweepstakes.id"), index=True)
    provider: Mapped[str] = mapped_column(String(80))
    provider_status: Mapped[str] = mapped_column(String(40), default="not_configured")
    payload_json: Mapped[str] = mapped_column(Text, default="{}")
    synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    sweepstake: Mapped[Sweepstake] = relationship(back_populates="snapshots")


class WorldCupFixture(Base):
    __tablename__ = "world_cup_fixtures"
    __table_args__ = (UniqueConstraint("sweepstake_id", "match_no", name="uq_sweepstake_fixture_match_no"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    sweepstake_id: Mapped[int] = mapped_column(ForeignKey("sweepstakes.id"), index=True)
    match_no: Mapped[int] = mapped_column(Integer)
    stage: Mapped[str] = mapped_column(String(40))
    group_name: Mapped[str | None] = mapped_column(String(16), nullable=True)
    venue: Mapped[str | None] = mapped_column(String(120), nullable=True)
    kickoff_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    home_code: Mapped[str | None] = mapped_column(String(32), nullable=True)
    away_code: Mapped[str | None] = mapped_column(String(32), nullable=True)
    home_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    away_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    winner_code: Mapped[str | None] = mapped_column(String(32), nullable=True)
    status: Mapped[MatchStatus] = mapped_column(Enum(MatchStatus), default=MatchStatus.scheduled)
    payload_json: Mapped[str] = mapped_column(Text, default="{}")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    sweepstake: Mapped[Sweepstake] = relationship(back_populates="fixtures")


class GroupStanding(Base):
    __tablename__ = "group_standings"
    __table_args__ = (UniqueConstraint("sweepstake_id", "team_code", name="uq_sweepstake_standing_team"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    sweepstake_id: Mapped[int] = mapped_column(ForeignKey("sweepstakes.id"), index=True)
    team_code: Mapped[str] = mapped_column(String(32), index=True)
    group_name: Mapped[str] = mapped_column(String(16), index=True)
    played: Mapped[int] = mapped_column(Integer, default=0)
    wins: Mapped[int] = mapped_column(Integer, default=0)
    draws: Mapped[int] = mapped_column(Integer, default=0)
    losses: Mapped[int] = mapped_column(Integer, default=0)
    goals_for: Mapped[int] = mapped_column(Integer, default=0)
    goals_against: Mapped[int] = mapped_column(Integer, default=0)
    goal_difference: Mapped[int] = mapped_column(Integer, default=0)
    points: Mapped[int] = mapped_column(Integer, default=0)
    rank: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_final: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    sweepstake: Mapped[Sweepstake] = relationship(back_populates="standings")


class KnockoutMatch(Base):
    __tablename__ = "knockout_matches"
    __table_args__ = (UniqueConstraint("sweepstake_id", "match_no", name="uq_sweepstake_knockout_match_no"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    sweepstake_id: Mapped[int] = mapped_column(ForeignKey("sweepstakes.id"), index=True)
    match_no: Mapped[int] = mapped_column(Integer)
    round_name: Mapped[str] = mapped_column(String(40))
    home_placeholder: Mapped[str] = mapped_column(String(120))
    away_placeholder: Mapped[str] = mapped_column(String(120))
    venue: Mapped[str | None] = mapped_column(String(120), nullable=True)
    home_code: Mapped[str | None] = mapped_column(String(32), nullable=True)
    away_code: Mapped[str | None] = mapped_column(String(32), nullable=True)
    home_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    away_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    winner_code: Mapped[str | None] = mapped_column(String(32), nullable=True)
    status: Mapped[MatchStatus] = mapped_column(Enum(MatchStatus), default=MatchStatus.scheduled)
    position: Mapped[int] = mapped_column(Integer, default=0)

    sweepstake: Mapped[Sweepstake] = relationship(back_populates="knockout_matches")


class SportsSyncRun(Base):
    __tablename__ = "sports_sync_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    provider: Mapped[str] = mapped_column(String(80))
    status: Mapped[str] = mapped_column(String(40), default="pending")
    message: Mapped[str | None] = mapped_column(String(255), nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class SportsOverride(Base):
    __tablename__ = "sports_overrides"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    sweepstake_id: Mapped[int] = mapped_column(ForeignKey("sweepstakes.id"), index=True)
    target_type: Mapped[str] = mapped_column(String(40))
    target_key: Mapped[str] = mapped_column(String(80))
    payload_json: Mapped[str] = mapped_column(Text, default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class EmailOutbox(Base):
    __tablename__ = "email_outbox"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    recipient: Mapped[str] = mapped_column(String(255), index=True)
    subject: Mapped[str] = mapped_column(String(255))
    body_text: Mapped[str] = mapped_column(Text)
    provider: Mapped[str] = mapped_column(String(80), default="resend")
    status: Mapped[EmailStatus] = mapped_column(Enum(EmailStatus), default=EmailStatus.pending, index=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    last_error: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
