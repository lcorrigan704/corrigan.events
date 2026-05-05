import random
from datetime import datetime
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session, joinedload, selectinload

from app.config import get_settings
from app.models import (
    DrawItem,
    DrawStatus,
    GroupStanding,
    ItemStatus,
    KnockoutMatch,
    MatchStatus,
    OutcomeStatus,
    ParticipantSlot,
    PayoutCategory,
    PayoutTerm,
    SportsSnapshot,
    Sweepstake,
    TemplateType,
)
from app.schemas import DraftSettingsUpdate, ParticipantCreate, SlotCreate, SweepstakeCreate
from app.security import generate_admin_token, generate_view_code, hash_token, is_revealed, random_seed
from app.templates import world_cup_items, world_cup_knockout_matches

APP_TIMEZONE = ZoneInfo("Europe/London")


def normalize_reveal_at(reveal_at: datetime) -> datetime:
    if reveal_at.tzinfo:
        return reveal_at.astimezone(APP_TIMEZONE).replace(tzinfo=None)
    return reveal_at


def build_items(payload: SweepstakeCreate) -> list[dict[str, str | int | None]]:
    if payload.template_type == TemplateType.world_cup_2026:
        return world_cup_items()
    raise ValueError("Only World Cup 2026 sweepstakes are supported")


PAYOUT_LABELS = {
    PayoutCategory.champion: "Champion",
    PayoutCategory.runner_up: "Runner up",
    PayoutCategory.third_place: "Third place",
    PayoutCategory.most_goals_scored: "Most goals scored",
    PayoutCategory.last_place: "Last place",
}


def payout_label(category: PayoutCategory) -> str:
    return PAYOUT_LABELS[category]


def create_sweepstake(db: Session, payload: SweepstakeCreate) -> tuple[Sweepstake, str]:
    items = build_items(payload)
    entry_slots = expand_participant_slots(payload)
    if len(entry_slots) > len(items):
        raise ValueError(f"A maximum of {len(items)} paid slots are allowed: one slot for each draw item")

    token = generate_admin_token()
    sweepstake = Sweepstake(
        title=payload.title,
        organiser_email=payload.organiser_email,
        template_type=payload.template_type,
        buy_in_pence=payload.buy_in_pence,
        view_code=generate_view_code(db),
        admin_token_hash=hash_token(token),
        reveal_at=normalize_reveal_at(payload.reveal_at),
        draw_status=DrawStatus.draft,
    )
    db.add(sweepstake)
    db.flush()

    draw_items = [DrawItem(sweepstake_id=sweepstake.id, **item) for item in items]
    db.add_all(draw_items)
    db.flush()
    db.add_all(
        [
            GroupStanding(
                sweepstake_id=sweepstake.id,
                team_code=item.code,
                group_name=item.group_name or "",
                rank=(index % 4) + 1,
            )
            for index, item in enumerate(draw_items)
        ]
    )
    db.add_all([KnockoutMatch(sweepstake_id=sweepstake.id, **match) for match in world_cup_knockout_matches()])

    slots = [
        ParticipantSlot(
            sweepstake_id=sweepstake.id,
            name=slot.name.strip(),
            email=slot.email,
            paid=slot.paid,
            position=index,
        )
        for index, slot in enumerate(entry_slots)
    ]
    db.add_all(slots)
    db.flush()

    for index, term in enumerate(payload.payouts):
        category = term.category or PayoutCategory.champion
        db.add(
            PayoutTerm(
                sweepstake_id=sweepstake.id,
                category=category,
                label=payout_label(category),
                percentage=term.percentage,
                position=index,
            )
        )

    db.add(
        SportsSnapshot(
            sweepstake_id=sweepstake.id,
            provider="wc2026api",
            provider_status="not_configured",
            payload_json="{}",
        )
    )
    db.commit()
    db.refresh(sweepstake)
    return get_sweepstake(db, sweepstake.id), token


def ensure_world_cup_support_rows(db: Session, sweepstake: Sweepstake) -> None:
    if sweepstake.template_type != TemplateType.world_cup_2026:
        return
    changed = False
    if not sweepstake.standings:
        for index, item in enumerate(sweepstake.items):
            db.add(
                GroupStanding(
                    sweepstake_id=sweepstake.id,
                    team_code=item.code,
                    group_name=item.group_name or "",
                    rank=(index % 4) + 1,
                )
            )
        changed = True
    if not sweepstake.knockout_matches:
        db.add_all([KnockoutMatch(sweepstake_id=sweepstake.id, **match) for match in world_cup_knockout_matches()])
        changed = True
    if changed:
        db.commit()


def replace_participants(db: Session, sweepstake: Sweepstake, participants: list[ParticipantCreate]) -> Sweepstake:
    if sweepstake.draw_status != DrawStatus.draft:
        raise ValueError("Participants can only be changed before the draw is published")

    items_count = len(sweepstake.items)
    slots_payload: list[SlotCreate] = []
    for participant in participants:
        slots_payload.extend(
            SlotCreate(name=participant.name.strip(), email=participant.email, paid=participant.paid)
            for _ in range(participant.slots_count)
        )

    if len(slots_payload) > items_count:
        raise ValueError(f"A maximum of {items_count} paid slots are allowed: one slot for each draw item")

    for slot in list(sweepstake.slots):
        db.delete(slot)
    db.flush()

    db.add_all([
        ParticipantSlot(
            sweepstake_id=sweepstake.id,
            name=slot.name.strip(),
            email=slot.email,
            paid=slot.paid,
            position=index,
        )
        for index, slot in enumerate(slots_payload)
    ])
    db.commit()
    return get_sweepstake(db, sweepstake.id)


def update_draft_settings(db: Session, sweepstake: Sweepstake, payload: DraftSettingsUpdate) -> Sweepstake:
    if sweepstake.draw_status != DrawStatus.draft:
        raise ValueError("Draw settings can only be changed before the draw is published")

    sweepstake.buy_in_pence = payload.buy_in_pence
    sweepstake.reveal_at = normalize_reveal_at(payload.reveal_at)

    for term in list(sweepstake.payouts):
        db.delete(term)
    db.flush()

    for index, term in enumerate(payload.payouts):
        category = term.category or PayoutCategory.champion
        db.add(
            PayoutTerm(
                sweepstake_id=sweepstake.id,
                category=category,
                label=payout_label(category),
                percentage=term.percentage,
                position=index,
            )
        )

    db.commit()
    return get_sweepstake(db, sweepstake.id)


def publish_sweepstake(db: Session, sweepstake: Sweepstake) -> Sweepstake:
    if sweepstake.draw_status != DrawStatus.draft:
        return get_sweepstake(db, sweepstake.id)

    paid_slots = [slot for slot in sweepstake.slots if slot.paid]
    if len(paid_slots) != len(sweepstake.items):
        raise ValueError(f"Exactly {len(sweepstake.items)} paid slots are required before publishing")

    assign_draw_items(paid_slots, list(sweepstake.items), seed=random_seed())
    sweepstake.draw_status = DrawStatus.generated
    db.commit()
    return get_sweepstake(db, sweepstake.id)


def recover_admin_links(db: Session, email: str) -> list[dict[str, str]]:
    settings = get_settings()
    sweepstakes = (
        db.query(Sweepstake)
        .filter(Sweepstake.organiser_email == email.strip().lower())
        .order_by(Sweepstake.created_at.desc())
        .all()
    )
    recovered_links: list[dict[str, str]] = []
    for sweepstake in sweepstakes:
        token = generate_admin_token()
        sweepstake.admin_token_hash = hash_token(token)
        recovered_links.append(
            {
                "title": sweepstake.title,
                "admin_url": f"{settings.public_base_url}/admin/{token}",
                "view_code": sweepstake.view_code,
            }
        )
    db.commit()
    return recovered_links


def expand_participant_slots(payload: SweepstakeCreate) -> list[SlotCreate]:
    if payload.participants:
        slots: list[SlotCreate] = []
        for participant in payload.participants:
            slots.extend(
                SlotCreate(name=participant.name.strip(), email=participant.email, paid=participant.paid)
                for _ in range(participant.slots_count)
            )
        return slots
    return payload.slots or []


def assign_draw_items(slots: list[ParticipantSlot], items: list[DrawItem], seed: str) -> None:
    rng = random.Random(seed)
    shuffled_slots = list(slots)
    rng.shuffle(shuffled_slots)
    shuffled_items = list(items)
    rng.shuffle(shuffled_items)
    for slot, item in zip(shuffled_slots, shuffled_items, strict=False):
        slot.draw_item_id = item.id


def get_sweepstake(db: Session, sweepstake_id: int) -> Sweepstake:
    sweepstake = (
        db.query(Sweepstake)
        .options(
            joinedload(Sweepstake.slots).joinedload(ParticipantSlot.draw_item),
            selectinload(Sweepstake.items),
            selectinload(Sweepstake.payouts),
            selectinload(Sweepstake.snapshots),
            selectinload(Sweepstake.standings),
            selectinload(Sweepstake.knockout_matches),
        )
        .filter(Sweepstake.id == sweepstake_id)
        .first()
    )
    if not sweepstake:
        raise LookupError("Sweepstake not found")
    ensure_world_cup_support_rows(db, sweepstake)
    if not sweepstake.standings or not sweepstake.knockout_matches:
        return get_sweepstake(db, sweepstake_id)
    return sweepstake


def get_by_view_code(db: Session, code: str) -> Sweepstake | None:
    sweepstake = (
        db.query(Sweepstake)
        .options(
            joinedload(Sweepstake.slots).joinedload(ParticipantSlot.draw_item),
            selectinload(Sweepstake.items),
            selectinload(Sweepstake.payouts),
            selectinload(Sweepstake.snapshots),
            selectinload(Sweepstake.standings),
            selectinload(Sweepstake.knockout_matches),
        )
        .filter(Sweepstake.view_code == code.upper())
        .first()
    )
    if sweepstake:
        ensure_world_cup_support_rows(db, sweepstake)
    return sweepstake


def get_by_admin_token(db: Session, token: str) -> Sweepstake | None:
    sweepstake = (
        db.query(Sweepstake)
        .options(
            joinedload(Sweepstake.slots).joinedload(ParticipantSlot.draw_item),
            selectinload(Sweepstake.items),
            selectinload(Sweepstake.payouts),
            selectinload(Sweepstake.snapshots),
            selectinload(Sweepstake.standings),
            selectinload(Sweepstake.knockout_matches),
        )
        .filter(Sweepstake.admin_token_hash == hash_token(token))
        .first()
    )
    if sweepstake:
        ensure_world_cup_support_rows(db, sweepstake)
    return sweepstake


def update_item(db: Session, sweepstake: Sweepstake, item_id: int, status: str | None, placement: int | None) -> Sweepstake:
    item = next((candidate for candidate in sweepstake.items if candidate.id == item_id), None)
    if item is None:
        raise LookupError("Item not found")
    if status:
        item.status = ItemStatus(status)
    item.placement = placement
    db.commit()
    return get_sweepstake(db, sweepstake.id)


def serialize_sweepstake(sweepstake: Sweepstake, include_hidden: bool = False) -> dict:
    published = sweepstake.draw_status != DrawStatus.draft
    revealed = published and is_revealed(sweepstake.reveal_at)
    visible = revealed or include_hidden
    paid_slots = [slot for slot in sweepstake.slots if slot.paid]
    pot_pence = len(paid_slots) * sweepstake.buy_in_pence
    settings = get_settings()
    snapshot = sweepstake.snapshots[-1] if sweepstake.snapshots else None
    items_by_code = {item.code: item for item in sweepstake.items}
    slots_by_item_id = {slot.draw_item_id: slot for slot in sweepstake.slots if slot.draw_item_id}

    def item_payload(item: DrawItem) -> dict:
        return {
            "id": item.id,
            "name": item.name,
            "code": item.code,
            "group_name": item.group_name,
            "seed_label": item.seed_label,
            "primary_color": item.primary_color,
            "secondary_color": item.secondary_color,
            "status": item.status.value,
            "placement": item.placement,
        }

    def slot_winner_payload(slot: ParticipantSlot | None) -> dict | None:
        if not slot:
            return None
        return {"id": slot.id, "name": slot.name, "email": slot.email}

    def outcome_for(category: PayoutCategory) -> tuple[OutcomeStatus, DrawItem | None]:
        if category == PayoutCategory.champion:
            final = next((match for match in sweepstake.knockout_matches if match.match_no == 104), None)
            if final and final.winner_code:
                return OutcomeStatus.final, items_by_code.get(final.winner_code)
            item = next((candidate for candidate in sweepstake.items if candidate.status == ItemStatus.winner), None)
            return (OutcomeStatus.final, item) if item else (OutcomeStatus.pending, None)
        if category == PayoutCategory.runner_up:
            final = next((match for match in sweepstake.knockout_matches if match.match_no == 104), None)
            if final and final.winner_code and final.home_code and final.away_code:
                loser_code = final.away_code if final.winner_code == final.home_code else final.home_code
                return OutcomeStatus.final, items_by_code.get(loser_code)
            item = next((candidate for candidate in sweepstake.items if candidate.placement == 2), None)
            return (OutcomeStatus.final, item) if item else (OutcomeStatus.pending, None)
        if category == PayoutCategory.third_place:
            third_place = next((match for match in sweepstake.knockout_matches if match.match_no == 103), None)
            if third_place and third_place.winner_code:
                return OutcomeStatus.final, items_by_code.get(third_place.winner_code)
            item = next((candidate for candidate in sweepstake.items if candidate.placement == 3), None)
            return (OutcomeStatus.final, item) if item else (OutcomeStatus.pending, None)
        if category == PayoutCategory.most_goals_scored:
            if not sweepstake.standings:
                return OutcomeStatus.pending, None
            ordered = sorted(sweepstake.standings, key=lambda row: (-row.goals_for, -row.goal_difference, -row.points, row.team_code))
            if not ordered or ordered[0].goals_for == 0:
                return OutcomeStatus.pending, None
            status = OutcomeStatus.final if all(row.is_final for row in sweepstake.standings) else OutcomeStatus.provisional
            return status, items_by_code.get(ordered[0].team_code)
        if category == PayoutCategory.last_place:
            if not sweepstake.standings:
                return OutcomeStatus.pending, None
            ordered = sorted(sweepstake.standings, key=lambda row: (row.points, row.goal_difference, row.goals_for, row.team_code))
            status = OutcomeStatus.final if all(row.is_final for row in sweepstake.standings) else OutcomeStatus.provisional
            return status, items_by_code.get(ordered[0].team_code) if ordered else None
        return OutcomeStatus.pending, None

    return {
        "id": sweepstake.id,
        "title": sweepstake.title,
        "template_type": sweepstake.template_type.value,
        "buy_in_pence": sweepstake.buy_in_pence,
        "currency": sweepstake.currency,
        "view_code": sweepstake.view_code,
        "reveal_at": sweepstake.reveal_at,
        "draw_status": DrawStatus.revealed.value if revealed else sweepstake.draw_status.value,
        "is_revealed": revealed,
        "pot_pence": pot_pence,
        "share_url": f"{settings.public_base_url}/s/{sweepstake.view_code}",
        "slots": [
            {
                "id": slot.id,
                "name": slot.name,
                "email": slot.email,
                "paid": slot.paid,
                "assigned_item": item_payload(slot.draw_item) if visible and slot.draw_item else None,
            }
            for slot in sweepstake.slots
        ],
        "items": [item_payload(item) for item in sweepstake.items] if visible else [],
        "payouts": [
            (
                lambda status, winning_item: {
                    "category": term.category.value,
                    "label": payout_label(term.category),
                    "percentage": term.percentage,
                    "amount_pence": round(pot_pence * term.percentage / 100),
                    "outcome_status": status.value,
                    "winning_item": item_payload(winning_item) if winning_item else None,
                    "winning_slot": slot_winner_payload(slots_by_item_id.get(winning_item.id)) if winning_item else None,
                }
            )(*outcome_for(term.category))
            for term in sweepstake.payouts
        ],
        "standings": [
            {
                "team_code": standing.team_code,
                "group_name": standing.group_name,
                "played": standing.played,
                "wins": standing.wins,
                "draws": standing.draws,
                "losses": standing.losses,
                "goals_for": standing.goals_for,
                "goals_against": standing.goals_against,
                "goal_difference": standing.goal_difference,
                "points": standing.points,
                "rank": standing.rank,
                "is_final": standing.is_final,
            }
            for standing in sorted(sweepstake.standings, key=lambda row: (row.group_name, row.rank or 99, row.team_code))
        ] if visible else [],
        "knockout_matches": [
            {
                "match_no": match.match_no,
                "round_name": match.round_name,
                "home_placeholder": match.home_placeholder,
                "away_placeholder": match.away_placeholder,
                "venue": match.venue,
                "home_code": match.home_code,
                "away_code": match.away_code,
                "home_score": match.home_score,
                "away_score": match.away_score,
                "winner_code": match.winner_code,
                "status": match.status.value,
            }
            for match in sweepstake.knockout_matches
        ] if visible else [],
        "sports_provider_status": snapshot.provider_status if snapshot else "not_configured",
    }
