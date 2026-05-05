import json
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import GroupStanding, KnockoutMatch, MatchStatus, SportsSnapshot, SportsSyncRun, Sweepstake, TemplateType, WorldCupFixture
from app.templates import WORLD_CUP_2026_GROUPS

FOOTBALL_DATA_PROVIDER = "football-data.org"
TEAM_NAME_ALIASES = {
    "CAPE_VERDE": "CABO_VERDE",
    "CURAÇAO": "CURACAO",
    "CURACAO": "CURACAO",
    "CÔTE_DIVOIRE": "COTE_DIVOIRE",
    "COTE_D_IVOIRE": "COTE_DIVOIRE",
    "IVORY_COAST": "COTE_DIVOIRE",
    "DR_CONGO": "CONGO_DR",
    "CONGO_DR": "CONGO_DR",
    "IRAN": "IR_IRAN",
    "IRAN_IR": "IR_IRAN",
    "KOREA_REPUBLIC": "KOREA_REPUBLIC",
    "SOUTH_KOREA": "KOREA_REPUBLIC",
    "TURKEY": "TÜRKIYE",
    "TURKIYE": "TÜRKIYE",
    "UNITED_STATES": "USA",
    "UNITED_STATES_OF_AMERICA": "USA",
    "USA": "USA",
}


def code_for_name(name: str | None) -> str | None:
    if not name:
        return None
    code = (
        name.upper()
        .replace(" ", "_")
        .replace("/", "_")
        .replace("'", "")
        .replace("-", "_")
        .replace(".", "")
    )[:32]
    return TEAM_NAME_ALIASES.get(code, code)


def normalize_group_name(group_name: Any) -> str | None:
    if not group_name:
        return None
    group = str(group_name).strip().upper().replace("GROUP_", "").replace("GROUP ", "")
    return group[-1] if len(group) == 1 or group.startswith(("A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L")) else group


def status_from_provider(value: Any) -> MatchStatus:
    normalized = str(value or "scheduled").lower()
    if normalized in {"finished", "complete", "completed", "ft", "after_extra_time", "after_penalties"}:
        return MatchStatus.completed
    if normalized in {"live", "in_play", "playing", "first_half", "second_half", "half_time", "paused"}:
        return MatchStatus.live
    if normalized in {"postponed"}:
        return MatchStatus.postponed
    if normalized in {"cancelled", "canceled"}:
        return MatchStatus.cancelled
    return MatchStatus.scheduled


def nested_get(payload: dict[str, Any], *paths: str) -> Any:
    for path in paths:
        cursor: Any = payload
        for part in path.split("."):
            if not isinstance(cursor, dict) or part not in cursor:
                cursor = None
                break
            cursor = cursor[part]
        if cursor is not None:
            return cursor
    return None


def match_list(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [entry for entry in payload if isinstance(entry, dict)]
    if isinstance(payload, dict):
        for key in ("matches", "fixtures", "data", "response"):
            value = payload.get(key)
            if isinstance(value, list):
                return [entry for entry in value if isinstance(entry, dict)]
    return []


def normalize_match(raw: dict[str, Any], index: int) -> dict[str, Any]:
    home_name = nested_get(raw, "home.name", "home_team.name", "teams.home.name", "homeTeam.name", "homeTeam.shortName", "home")
    away_name = nested_get(raw, "away.name", "away_team.name", "teams.away.name", "awayTeam.name", "awayTeam.shortName", "away")
    home_score = nested_get(
        raw,
        "home_score",
        "score.home",
        "goals.home",
        "score.fullTime.home",
        "score.regularTime.home",
        "score.penalties.home",
        "scores.home",
    )
    away_score = nested_get(
        raw,
        "away_score",
        "score.away",
        "goals.away",
        "score.fullTime.away",
        "score.regularTime.away",
        "score.penalties.away",
        "scores.away",
    )
    match_no = nested_get(raw, "match_no", "matchNumber", "match_number") or index + 1
    stage = nested_get(raw, "stage", "round", "competition_stage.name") or "Group"
    group_name = nested_get(raw, "group", "group_name", "group.name")
    home_code = code_for_name(home_name) or nested_get(raw, "home.code", "home_team.code", "teams.home.code", "homeTeam.tla")
    away_code = code_for_name(away_name) or nested_get(raw, "away.code", "away_team.code", "teams.away.code", "awayTeam.tla")
    status = status_from_provider(nested_get(raw, "status", "status.short", "fixture.status.short"))
    provider_winner = nested_get(raw, "score.winner")
    winner_code = None
    if status == MatchStatus.completed and home_score is not None and away_score is not None and int(home_score) != int(away_score):
        winner_code = home_code if int(home_score) > int(away_score) else away_code
    elif status == MatchStatus.completed and provider_winner == "HOME_TEAM":
        winner_code = home_code
    elif status == MatchStatus.completed and provider_winner == "AWAY_TEAM":
        winner_code = away_code
    return {
        "match_no": int(match_no),
        "stage": str(stage),
        "group_name": normalize_group_name(group_name),
        "venue": nested_get(raw, "venue", "venue.name", "fixture.venue.name"),
        "kickoff_at": parse_datetime(nested_get(raw, "kickoff_at", "date", "fixture.date", "utcDate")),
        "home_code": home_code,
        "away_code": away_code,
        "home_score": int(home_score) if home_score is not None else None,
        "away_score": int(away_score) if away_score is not None else None,
        "winner_code": winner_code,
        "status": status,
        "payload_json": json.dumps(raw),
    }


def parse_datetime(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


def reset_standings(sweepstake: Sweepstake) -> dict[str, GroupStanding]:
    standings = {standing.team_code: standing for standing in sweepstake.standings}
    for group_name, teams in WORLD_CUP_2026_GROUPS.items():
        for index, team in enumerate(teams):
            code = code_for_name(team)
            if not code:
                continue
            standing = standings.get(code)
            if not standing:
                standing = GroupStanding(sweepstake_id=sweepstake.id, team_code=code, group_name=group_name, rank=index + 1)
                standings[code] = standing
            standing.group_name = group_name
            standing.played = standing.wins = standing.draws = standing.losses = 0
            standing.goals_for = standing.goals_against = standing.goal_difference = standing.points = 0
            standing.is_final = False
    return standings


def apply_group_result(standing: GroupStanding, goals_for: int, goals_against: int) -> None:
    standing.played += 1
    standing.goals_for += goals_for
    standing.goals_against += goals_against
    standing.goal_difference = standing.goals_for - standing.goals_against
    if goals_for > goals_against:
        standing.wins += 1
        standing.points += 3
    elif goals_for == goals_against:
        standing.draws += 1
        standing.points += 1
    else:
        standing.losses += 1


def recalculate_standings(db: Session, sweepstake: Sweepstake) -> None:
    standings = reset_standings(sweepstake)
    for standing in standings.values():
        if standing.id is None:
            db.add(standing)

    group_fixtures = [
        fixture
        for fixture in sweepstake.fixtures
        if fixture.status == MatchStatus.completed
        and fixture.group_name
        and fixture.home_code in standings
        and fixture.away_code in standings
        and fixture.home_score is not None
        and fixture.away_score is not None
    ]
    for fixture in group_fixtures:
        apply_group_result(standings[fixture.home_code], fixture.home_score, fixture.away_score)
        apply_group_result(standings[fixture.away_code], fixture.away_score, fixture.home_score)

    for group_name in WORLD_CUP_2026_GROUPS:
        rows = [row for row in standings.values() if row.group_name == group_name]
        rows.sort(key=lambda row: (-row.points, -row.goal_difference, -row.goals_for, row.team_code))
        group_completed = sum(1 for fixture in group_fixtures if fixture.group_name == group_name)
        for rank, row in enumerate(rows, start=1):
            row.rank = rank
            row.is_final = group_completed >= 6


def resolve_group_placeholder(placeholder: str, sweepstake: Sweepstake) -> str | None:
    standings_by_group = {}
    for standing in sweepstake.standings:
        standings_by_group.setdefault(standing.group_name, []).append(standing)
    for rows in standings_by_group.values():
        rows.sort(key=lambda row: row.rank or 99)

    lower = placeholder.lower()
    if lower.startswith("group ") and "winner" in lower:
        group = placeholder.split(" ")[1]
        rows = standings_by_group.get(group) or []
        if not rows or not all(row.is_final for row in rows):
            return None
        return rows[0].team_code
    if lower.startswith("group ") and "runner" in lower:
        group = placeholder.split(" ")[1]
        rows = standings_by_group.get(group) or []
        if not rows or not all(row.is_final for row in rows):
            return None
        return rows[1].team_code if len(rows) > 1 else None
    if "third place" in lower:
        groups_part = placeholder.removeprefix("Group ").split(" third place")[0]
        groups = [part.strip() for part in groups_part.split("/") if part.strip()]
        candidates = []
        for group in groups:
            rows = standings_by_group.get(group) or []
            if not rows or not all(row.is_final for row in rows):
                return None
            if len(rows) > 2:
                candidates.append(rows[2])
        candidates.sort(key=lambda row: (-row.points, -row.goal_difference, -row.goals_for, row.team_code))
        return candidates[0].team_code if candidates else None
    if lower.startswith("winner match ") or lower.startswith("loser match "):
        match_no = int(placeholder.rsplit(" ", 1)[-1])
        source = next((match for match in sweepstake.knockout_matches if match.match_no == match_no), None)
        if not source or not source.winner_code:
            return None
        if lower.startswith("winner"):
            return source.winner_code
        if source.home_code and source.away_code:
            return source.away_code if source.winner_code == source.home_code else source.home_code
    return None


def recalculate_knockout(sweepstake: Sweepstake) -> None:
    item_codes = {item.code for item in sweepstake.items}
    for match in sweepstake.knockout_matches:
        fixture = next((fixture for fixture in sweepstake.fixtures if fixture.match_no == match.match_no), None)
        provider_home_code = fixture.home_code if fixture and fixture.home_code in item_codes else None
        provider_away_code = fixture.away_code if fixture and fixture.away_code in item_codes else None

        match.home_code = provider_home_code or resolve_group_placeholder(match.home_placeholder, sweepstake)
        match.away_code = provider_away_code or resolve_group_placeholder(match.away_placeholder, sweepstake)

        if fixture:
            match.home_score = fixture.home_score
            match.away_score = fixture.away_score
            match.status = fixture.status
            match.winner_code = fixture.winner_code if fixture.winner_code in item_codes else None
        elif match.status != MatchStatus.completed:
            match.home_score = None
            match.away_score = None
            match.winner_code = None


class FootballDataRateLimitError(RuntimeError):
    pass


def check_football_data_rate_limit(db: Session) -> None:
    settings = get_settings()
    since = datetime.now(timezone.utc) - timedelta(seconds=60)
    recent_calls = (
        db.query(func.count(SportsSyncRun.id))
        .filter(SportsSyncRun.provider == FOOTBALL_DATA_PROVIDER)
        .filter(SportsSyncRun.status.in_(["pending", "ok", "failed"]))
        .filter(SportsSyncRun.started_at >= since)
        .scalar()
    )
    if recent_calls >= settings.wc2026_rate_limit_per_minute:
        raise FootballDataRateLimitError("football-data.org free-tier rate limit guard active")


async def fetch_football_data_wc_matches(db: Session) -> tuple[dict[str, Any] | None, str, str | None]:
    settings = get_settings()
    if not settings.wc2026_api_key:
        sync_run = SportsSyncRun(provider=FOOTBALL_DATA_PROVIDER, status="skipped")
        db.add(sync_run)
        sync_run.status = "skipped"
        sync_run.message = "football-data.org API token is not configured"
        sync_run.finished_at = datetime.now(timezone.utc)
        db.commit()
        return None, "not_configured", sync_run.message
    try:
        check_football_data_rate_limit(db)
    except FootballDataRateLimitError as exc:
        sync_run = SportsSyncRun(provider=FOOTBALL_DATA_PROVIDER, status="skipped")
        db.add(sync_run)
        sync_run.status = "skipped"
        sync_run.message = str(exc)
        sync_run.finished_at = datetime.now(timezone.utc)
        db.commit()
        return None, "rate_limited", str(exc)

    sync_run = SportsSyncRun(provider=FOOTBALL_DATA_PROVIDER, status="pending")
    db.add(sync_run)
    db.flush()
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            response = await client.get(
                f"{settings.wc2026_api_url.rstrip('/')}/competitions/{settings.wc2026_competition_code}/matches",
                params={"season": settings.wc2026_season},
                headers={"X-Auth-Token": settings.wc2026_api_key},
            )
            response.raise_for_status()
        sync_run.status = "ok"
        sync_run.finished_at = datetime.now(timezone.utc)
        db.commit()
        return response.json(), "ok", None
    except httpx.HTTPStatusError as exc:
        status = "rate_limited" if exc.response.status_code == 429 else f"error:{exc.response.status_code}"
        sync_run.status = "failed"
        sync_run.message = status
        sync_run.finished_at = datetime.now(timezone.utc)
        db.commit()
        return None, status, status
    except httpx.HTTPError as exc:
        sync_run.status = "failed"
        sync_run.message = exc.__class__.__name__
        sync_run.finished_at = datetime.now(timezone.utc)
        db.commit()
        return None, f"error:{exc.__class__.__name__}", exc.__class__.__name__


def apply_matches_payload(db: Session, sweepstake: Sweepstake, payload: dict[str, Any] | None, provider_status: str) -> SportsSnapshot:
    snapshot = sweepstake.snapshots[-1] if sweepstake.snapshots else None
    if not snapshot:
        snapshot = SportsSnapshot(sweepstake_id=sweepstake.id, provider=FOOTBALL_DATA_PROVIDER)
        db.add(snapshot)

    if sweepstake.template_type != TemplateType.world_cup_2026:
        snapshot.provider_status = "not_applicable"
        snapshot.payload_json = "{}"
    elif not payload:
        snapshot.provider_status = provider_status
    else:
        snapshot.provider_status = provider_status
        snapshot.payload_json = json.dumps(payload)
        existing = {fixture.match_no: fixture for fixture in sweepstake.fixtures}
        for index, raw_match in enumerate(match_list(payload)):
            normalized = normalize_match(raw_match, index)
            fixture = existing.get(normalized["match_no"])
            if not fixture:
                fixture = WorldCupFixture(sweepstake_id=sweepstake.id, match_no=normalized["match_no"])
                db.add(fixture)
                sweepstake.fixtures.append(fixture)
            for key, value in normalized.items():
                setattr(fixture, key, value)
        recalculate_standings(db, sweepstake)
        recalculate_knockout(sweepstake)

    snapshot.synced_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(snapshot)
    return snapshot


async def sync_world_cup_snapshot(db: Session, sweepstake: Sweepstake) -> SportsSnapshot:
    payload, status, _message = await fetch_football_data_wc_matches(db)
    return apply_matches_payload(db, sweepstake, payload, status)


async def sync_world_cup_sweepstakes_from_provider(db: Session, sweepstakes: list[Sweepstake]) -> None:
    payload, status, _message = await fetch_football_data_wc_matches(db)
    for sweepstake in sweepstakes:
        apply_matches_payload(db, sweepstake, payload, status)
