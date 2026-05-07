from datetime import datetime
from typing import Any
import re

from pydantic import BaseModel, Field, field_validator, model_validator

from app.models import PayoutCategory, TemplateType

EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def normalize_email(value: str) -> str:
    normalized = value.strip().lower()
    if not EMAIL_PATTERN.match(normalized):
        raise ValueError("Enter a valid email address")
    return normalized


class SlotCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: str | None = None
    paid: bool = True


class ParticipantCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: str | None = None
    slots_count: int = Field(ge=1, le=200)
    paid: bool = True


PAYOUT_LABEL_TO_CATEGORY = {
    "winner": PayoutCategory.champion,
    "champion": PayoutCategory.champion,
    "runner up": PayoutCategory.runner_up,
    "runner-up": PayoutCategory.runner_up,
    "runner_up": PayoutCategory.runner_up,
    "third place": PayoutCategory.third_place,
    "third_place": PayoutCategory.third_place,
    "most goals scored": PayoutCategory.most_goals_scored,
    "most_goals_scored": PayoutCategory.most_goals_scored,
    "last place": PayoutCategory.last_place,
    "last_place": PayoutCategory.last_place,
}


def category_from_label(value: str) -> PayoutCategory:
    category = PAYOUT_LABEL_TO_CATEGORY.get(value.strip().lower())
    if not category:
        raise ValueError("Choose a valid payout category")
    return category


class PayoutCreate(BaseModel):
    category: PayoutCategory | None = None
    label: str | None = Field(default=None, min_length=1, max_length=80)
    percentage: int = Field(ge=0, le=100)

    @model_validator(mode="after")
    def normalize_category(self) -> "PayoutCreate":
        if self.category is None:
            if not self.label:
                raise ValueError("Choose a payout category")
            self.category = category_from_label(self.label)
        return self


class SweepstakeCreate(BaseModel):
    title: str = Field(min_length=2, max_length=160)
    organiser_email: str = Field(min_length=3, max_length=255)
    template_type: TemplateType
    buy_in_pence: int = Field(ge=0)
    reveal_at: datetime
    participants: list[ParticipantCreate] | None = None
    slots: list[SlotCreate] | None = None
    payouts: list[PayoutCreate] = Field(min_length=1)

    @model_validator(mode="after")
    def has_entries(self) -> "SweepstakeCreate":
        if self.template_type != TemplateType.world_cup_2026:
            raise ValueError("Only World Cup 2026 sweepstakes are supported")
        return self

    @field_validator("payouts")
    @classmethod
    def payouts_total_100(cls, value: list[PayoutCreate]) -> list[PayoutCreate]:
        if sum(term.percentage for term in value) != 100:
            raise ValueError("Payout percentages must total 100")
        categories = [term.category for term in value]
        if len(categories) != len(set(categories)):
            raise ValueError("Payout categories must be unique")
        return value

    @field_validator("organiser_email")
    @classmethod
    def organiser_email_is_valid(cls, value: str) -> str:
        return normalize_email(value)


class AdminLinkRequest(BaseModel):
    email: str = Field(min_length=3, max_length=255)

    @field_validator("email")
    @classmethod
    def email_is_valid(cls, value: str) -> str:
        return normalize_email(value)


class AdminLinkRecoveryItem(BaseModel):
    title: str
    admin_url: str
    view_code: str


class AdminLinkRecovery(BaseModel):
    message: str
    sent_count: int
    dev_links: list[AdminLinkRecoveryItem] = []


class ParticipantListUpdate(BaseModel):
    participants: list[ParticipantCreate] = Field(default_factory=list)


class DraftSettingsUpdate(BaseModel):
    buy_in_pence: int = Field(ge=0)
    reveal_at: datetime
    payouts: list[PayoutCreate] = Field(min_length=1)

    @field_validator("payouts")
    @classmethod
    def payouts_total_100(cls, value: list[PayoutCreate]) -> list[PayoutCreate]:
        if sum(term.percentage for term in value) != 100:
            raise ValueError("Payout percentages must total 100")
        categories = [term.category for term in value]
        if len(categories) != len(set(categories)):
            raise ValueError("Payout categories must be unique")
        return value


class ItemUpdate(BaseModel):
    status: str | None = None
    placement: int | None = Field(default=None, ge=1)


class DrawItemRead(BaseModel):
    id: int
    name: str
    code: str
    group_name: str | None
    seed_label: str | None
    primary_color: str
    secondary_color: str
    status: str
    placement: int | None


class GroupStandingRead(BaseModel):
    team_code: str
    group_name: str
    played: int
    wins: int
    draws: int
    losses: int
    goals_for: int
    goals_against: int
    goal_difference: int
    points: int
    rank: int | None
    is_final: bool


class KnockoutMatchRead(BaseModel):
    match_no: int
    round_name: str
    home_placeholder: str
    away_placeholder: str
    venue: str | None
    home_code: str | None
    away_code: str | None
    home_score: int | None
    away_score: int | None
    winner_code: str | None
    status: str


class SlotWinnerRead(BaseModel):
    id: int
    name: str
    email: str | None


class PayoutRead(BaseModel):
    category: str
    label: str
    percentage: int
    amount_pence: int
    outcome_status: str
    winning_item: DrawItemRead | None = None
    winning_slot: SlotWinnerRead | None = None


class SlotRead(BaseModel):
    id: int
    name: str
    email: str | None
    paid: bool
    assigned_item: DrawItemRead | None


class SweepstakeRead(BaseModel):
    id: int
    title: str
    template_type: str
    buy_in_pence: int
    currency: str
    view_code: str
    reveal_at: datetime
    draw_status: str
    is_revealed: bool
    pot_pence: int
    share_url: str
    slots: list[SlotRead]
    items: list[DrawItemRead]
    payouts: list[PayoutRead]
    standings: list[GroupStandingRead]
    knockout_matches: list[KnockoutMatchRead]
    sports_provider_status: str
    audit_metadata: dict[str, Any] | None = None


class SweepstakeCreated(BaseModel):
    admin_url: str
    view_code: str
    share_url: str
    sweepstake: SweepstakeRead


class PortalSweepstakeRead(BaseModel):
    id: int
    title: str
    organiser_email: str | None
    view_code: str
    participant_url: str
    admin_url: str | None = None
    draw_status: str
    reveal_at: datetime
    created_at: datetime
    slot_count: int
    named_slot_count: int
    pot_pence: int


class PortalAdminLinkRead(BaseModel):
    admin_url: str
