from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.main import app
from app.models import SportsSyncRun, Sweepstake
from app.sports import (
    FOOTBALL_DATA_PROVIDER,
    FootballDataRateLimitError,
    check_football_data_rate_limit,
    normalize_match,
    recalculate_knockout,
)


engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base.metadata.create_all(bind=engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)


def payload(reveal_at: datetime, slots: int = 48):
    return {
        "title": "World Cup Sweepstake",
        "organiser_email": "organiser@example.com",
        "template_type": "world_cup_2026",
        "buy_in_pence": 500,
        "reveal_at": reveal_at.isoformat(),
        "participants": [{"name": f"Participant {index + 1}", "slots_count": 1, "paid": True} for index in range(slots)],
        "payouts": [{"label": "Winner", "percentage": 70}, {"label": "Runner up", "percentage": 30}],
    }


def test_create_allows_partial_drafts_but_not_more_than_world_cup_slots():
    response = client.post("/api/sweepstakes", json=payload(datetime.now(timezone.utc), slots=10))
    assert response.status_code == 200
    assert response.json()["sweepstake"]["draw_status"] == "draft"
    assert len(response.json()["sweepstake"]["slots"]) == 10

    empty_body = payload(datetime.now(timezone.utc), slots=0)
    empty_body["participants"] = []
    response = client.post("/api/sweepstakes", json=empty_body)
    assert response.status_code == 200
    assert response.json()["sweepstake"]["draw_status"] == "draft"
    assert response.json()["sweepstake"]["slots"] == []

    response = client.post("/api/sweepstakes", json=payload(datetime.now(timezone.utc), slots=49))
    assert response.status_code == 422
    assert "maximum of 48" in response.json()["detail"]


def test_hidden_before_reveal_and_admin_can_see_assignments():
    response = client.post("/api/sweepstakes", json=payload(datetime.now(timezone.utc) + timedelta(days=1)))
    assert response.status_code == 200
    created = response.json()
    assert len(created["view_code"]) == 6
    assert created["view_code"].isdigit()

    public = client.get(f"/api/sweepstakes/code/{created['view_code']}")
    assert public.status_code == 200
    assert public.json()["is_revealed"] is False
    assert public.json()["draw_status"] == "draft"
    assert public.json()["items"] == []
    assert public.json()["audit_metadata"] is None
    assert public.json()["slots"][0]["assigned_item"] is None

    token = created["admin_url"].rsplit("/", 1)[-1]
    admin = client.get("/api/admin/sweepstake", headers={"Authorization": f"Bearer {token}"})
    assert admin.status_code == 200
    assert admin.json()["slots"][0]["assigned_item"] is None
    assert admin.json()["pot_pence"] == 24000

    published = client.post("/api/admin/publish", headers={"Authorization": f"Bearer {token}"})
    assert published.status_code == 200
    assert published.json()["draw_status"] == "generated"
    assert published.json()["slots"][0]["assigned_item"] is not None


def test_revealed_public_view_includes_assignments_and_payouts():
    response = client.post("/api/sweepstakes", json=payload(datetime.now(timezone.utc) - timedelta(minutes=1)))
    assert response.status_code == 200
    created = response.json()
    token = created["admin_url"].rsplit("/", 1)[-1]
    published = client.post("/api/admin/publish", headers={"Authorization": f"Bearer {token}"})
    assert published.status_code == 200

    public = client.get(f"/api/sweepstakes/code/{created['view_code']}")
    body = public.json()
    assert body["is_revealed"] is True
    assert len(body["items"]) == 48
    assert body["payouts"][0]["amount_pence"] == 16800
    assert body["audit_metadata"]["audit_status"] == "verified"
    assert body["audit_metadata"]["draw_algorithm"] == "python_seeded_shuffle_v1"
    assert body["audit_metadata"]["draw_published_at"] is not None
    assert body["audit_metadata"]["assignment_digest"]
    assert "random_seed" not in body["audit_metadata"]
    assert "organiser_email" not in body["audit_metadata"]
    assert len(body["audit_metadata"]["assignments"]) == 48


def test_publish_stores_stable_audit_digest():
    response = client.post("/api/sweepstakes", json=payload(datetime.now(timezone.utc) - timedelta(minutes=1)))
    assert response.status_code == 200
    created = response.json()
    token = created["admin_url"].rsplit("/", 1)[-1]

    published = client.post("/api/admin/publish", headers={"Authorization": f"Bearer {token}"})
    assert published.status_code == 200

    db = TestingSessionLocal()
    try:
        sweepstake = db.query(Sweepstake).filter(Sweepstake.view_code == created["view_code"]).one()
        assert sweepstake.draw_published_at is not None
        assert sweepstake.draw_algorithm == "python_seeded_shuffle_v1"
        assert sweepstake.audit_version == 1
        first_digest = sweepstake.assignment_digest
        assert first_digest is not None
    finally:
        db.close()

    public = client.get(f"/api/sweepstakes/code/{created['view_code']}")
    assert public.json()["audit_metadata"]["assignment_digest"] == first_digest


def test_participant_slot_counts_expand_to_paid_slots():
    body = payload(datetime.now(timezone.utc) - timedelta(minutes=1), slots=0)
    body["participants"] = [
        {"name": "Liam", "slots_count": 2, "paid": True},
        {"name": "Alex", "slots_count": 46, "paid": True},
    ]
    response = client.post("/api/sweepstakes", json=body)
    assert response.status_code == 200

    created = response.json()
    token = created["admin_url"].rsplit("/", 1)[-1]
    published = client.post("/api/admin/publish", headers={"Authorization": f"Bearer {token}"})
    assert published.status_code == 200

    public = client.get(f"/api/sweepstakes/code/{created['view_code']}")
    names = [slot["name"] for slot in public.json()["slots"]]
    assert names.count("Liam") == 2
    assert names.count("Alex") == 46
    assert all(slot["assigned_item"] for slot in public.json()["slots"])


def test_draft_participants_can_be_updated_then_published():
    response = client.post("/api/sweepstakes", json=payload(datetime.now(timezone.utc) - timedelta(minutes=1), slots=2))
    assert response.status_code == 200
    created = response.json()
    token = created["admin_url"].rsplit("/", 1)[-1]

    publish = client.post("/api/admin/publish", headers={"Authorization": f"Bearer {token}"})
    assert publish.status_code == 422
    assert "Exactly 48" in publish.json()["detail"]

    update = client.put(
        "/api/admin/participants",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "participants": [
                {"name": "Liam", "slots_count": 3, "paid": True},
                {"name": "Alex", "slots_count": 45, "paid": True},
            ]
        },
    )
    assert update.status_code == 200
    assert len(update.json()["slots"]) == 48

    publish = client.post("/api/admin/publish", headers={"Authorization": f"Bearer {token}"})
    assert publish.status_code == 200
    assert publish.json()["draw_status"] == "revealed"
    assert all(slot["assigned_item"] for slot in publish.json()["slots"])


def test_draft_participants_can_be_saved_empty():
    response = client.post("/api/sweepstakes", json=payload(datetime.now(timezone.utc), slots=2))
    assert response.status_code == 200
    created = response.json()
    token = created["admin_url"].rsplit("/", 1)[-1]

    update = client.put(
        "/api/admin/participants",
        headers={"Authorization": f"Bearer {token}"},
        json={"participants": []},
    )
    assert update.status_code == 200
    assert update.json()["draw_status"] == "draft"
    assert update.json()["slots"] == []


def test_draft_settings_can_be_updated_before_publish():
    response = client.post("/api/sweepstakes", json=payload(datetime.now(timezone.utc), slots=2))
    assert response.status_code == 200
    created = response.json()
    token = created["admin_url"].rsplit("/", 1)[-1]
    reveal_at = datetime.now(timezone.utc) + timedelta(hours=3)

    update = client.put(
        "/api/admin/settings",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "buy_in_pence": 750,
            "reveal_at": reveal_at.isoformat(),
            "payouts": [
                {"label": "Winner", "percentage": 60},
                {"label": "Runner up", "percentage": 25},
                {"label": "Third place", "percentage": 15},
            ],
        },
    )
    assert update.status_code == 200
    body = update.json()
    assert body["buy_in_pence"] == 750
    assert body["pot_pence"] == 1500
    assert [term["percentage"] for term in body["payouts"]] == [60, 25, 15]

    bad_update = client.put(
        "/api/admin/settings",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "buy_in_pence": 750,
            "reveal_at": reveal_at.isoformat(),
            "payouts": [{"label": "Winner", "percentage": 60}],
        },
    )
    assert bad_update.status_code == 422


def test_payout_categories_are_normalized_and_unique():
    body = payload(datetime.now(timezone.utc), slots=2)
    body["payouts"] = [
        {"category": "champion", "percentage": 60},
        {"category": "runner_up", "percentage": 25},
        {"category": "third_place", "percentage": 15},
    ]
    response = client.post("/api/sweepstakes", json=body)
    assert response.status_code == 200
    payouts = response.json()["sweepstake"]["payouts"]
    assert [term["category"] for term in payouts] == ["champion", "runner_up", "third_place"]
    assert [term["label"] for term in payouts] == ["Champion", "Runner up", "Third place"]
    assert all(term["outcome_status"] == "pending" for term in payouts)

    body["payouts"] = [
        {"category": "champion", "percentage": 50},
        {"category": "champion", "percentage": 50},
    ]
    duplicate = client.post("/api/sweepstakes", json=body)
    assert duplicate.status_code == 422


def test_football_data_match_payload_normalizes_to_world_cup_codes():
    raw = {
        "id": 501,
        "utcDate": "2026-06-11T19:00:00Z",
        "status": "FINISHED",
        "stage": "GROUP_STAGE",
        "group": "GROUP_A",
        "homeTeam": {"name": "United States", "tla": "USA"},
        "awayTeam": {"name": "South Korea", "tla": "KOR"},
        "score": {"winner": "HOME_TEAM", "fullTime": {"home": 2, "away": 1}},
    }

    normalized = normalize_match(raw, 72)

    assert normalized["match_no"] == 73
    assert normalized["group_name"] == "A"
    assert normalized["home_code"] == "USA"
    assert normalized["away_code"] == "KOREA_REPUBLIC"
    assert normalized["home_score"] == 2
    assert normalized["away_score"] == 1
    assert normalized["winner_code"] == "USA"


def test_knockout_placeholders_wait_for_final_group_standings():
    response = client.post("/api/sweepstakes", json=payload(datetime.now(timezone.utc), slots=48))
    assert response.status_code == 200
    created = response.json()

    db = TestingSessionLocal()
    try:
        sweepstake = db.query(Sweepstake).filter(Sweepstake.view_code == created["view_code"]).one()
        match_73 = next(match for match in sweepstake.knockout_matches if match.match_no == 73)
        match_73.home_code = "KOREA_REPUBLIC"
        match_73.away_code = "CANADA"

        recalculate_knockout(sweepstake)
        db.commit()

        assert match_73.home_code is None
        assert match_73.away_code is None

        for standing in sweepstake.standings:
            if standing.group_name == "A":
                standing.rank = {"MEXICO": 1, "KOREA_REPUBLIC": 2}.get(standing.team_code, 3)
                standing.is_final = True
            if standing.group_name == "B":
                standing.rank = {"BOSNIA_AND_HERZEGOVINA": 1, "CANADA": 2}.get(standing.team_code, 3)
                standing.is_final = True

        recalculate_knockout(sweepstake)
        db.commit()

        assert match_73.home_code == "KOREA_REPUBLIC"
        assert match_73.away_code == "CANADA"
    finally:
        db.close()


def test_football_data_rate_guard_stays_below_free_tier():
    db = TestingSessionLocal()
    try:
        db.query(SportsSyncRun).delete()
        for _ in range(9):
            db.add(SportsSyncRun(provider=FOOTBALL_DATA_PROVIDER, status="ok"))
        db.commit()

        try:
            check_football_data_rate_limit(db)
        except FootballDataRateLimitError as exc:
            assert "rate limit" in str(exc)
        else:
            raise AssertionError("Expected football-data.org rate limit guard to block the call")
    finally:
        db.close()


def test_forgot_admin_link_rotates_token_for_matching_email():
    response = client.post("/api/sweepstakes", json=payload(datetime.now(timezone.utc) - timedelta(minutes=1)))
    assert response.status_code == 200
    created = response.json()
    old_token = created["admin_url"].rsplit("/", 1)[-1]

    recovery = client.post("/api/admin/forgot-link", json={"email": "ORGANISER@example.com"})
    assert recovery.status_code == 200
    body = recovery.json()
    assert body["sent_count"] >= 1
    recovered = next(link for link in body["dev_links"] if link["view_code"] == created["view_code"])
    new_token = recovered["admin_url"].rsplit("/", 1)[-1]
    assert new_token != old_token

    old_admin = client.get("/api/admin/sweepstake", headers={"Authorization": f"Bearer {old_token}"})
    assert old_admin.status_code == 403

    new_admin = client.get("/api/admin/sweepstake", headers={"Authorization": f"Bearer {new_token}"})
    assert new_admin.status_code == 200
