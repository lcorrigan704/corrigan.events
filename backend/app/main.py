from collections import defaultdict
import secrets
from time import monotonic

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db, init_db
from app.email import admin_created_email, admin_recovery_email, enqueue_email
from app.schemas import (
    AdminLinkRecovery,
    AdminLinkRequest,
    DraftSettingsUpdate,
    ItemUpdate,
    ParticipantListUpdate,
    PortalAdminLinkRead,
    PortalSweepstakeRead,
    SweepstakeCreate,
    SweepstakeCreated,
    SweepstakeRead,
)
from app.services import (
    create_sweepstake,
    get_by_admin_token,
    get_by_view_code,
    portal_delete_sweepstake,
    portal_generate_admin_link,
    portal_sweepstakes,
    publish_sweepstake,
    recover_admin_links,
    replace_participants,
    serialize_sweepstake,
    update_draft_settings,
    update_item,
)
from app.sports import sync_world_cup_snapshot

settings = get_settings()
app = FastAPI(title="Sweepstakes Corrigan Events API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

rate_window: dict[str, list[float]] = defaultdict(list)


@app.on_event("startup")
def startup() -> None:
    init_db()


def rate_limit(request: Request, limit: int = 80, window_seconds: int = 60, bucket: str = "global") -> None:
    forwarded_for = request.headers.get("x-forwarded-for", "").split(",", 1)[0].strip()
    host = forwarded_for or (request.client.host if request.client else "unknown")
    identity = f"{host}:{bucket}"
    now = monotonic()
    rate_window[identity] = [seen for seen in rate_window[identity] if now - seen < window_seconds]
    if len(rate_window[identity]) >= limit:
        raise HTTPException(status_code=429, detail="Too many requests")
    rate_window[identity].append(now)


def require_admin(authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing admin token")
    token = authorization.removeprefix("Bearer ").strip()
    sweepstake = get_by_admin_token(db, token)
    if not sweepstake:
        raise HTTPException(status_code=403, detail="Invalid admin token")
    return sweepstake


def require_portal(authorization: str | None = Header(default=None)) -> None:
    if not settings.portal_token:
        raise HTTPException(status_code=404, detail="Not found")
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing portal token")
    token = authorization.removeprefix("Bearer ").strip()
    if not secrets.compare_digest(token, settings.portal_token):
        raise HTTPException(status_code=403, detail="Invalid portal token")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/sweepstakes", response_model=SweepstakeCreated)
def create(payload: SweepstakeCreate, request: Request, db: Session = Depends(get_db)):
    rate_limit(request, limit=20)
    try:
        sweepstake, token = create_sweepstake(db, payload)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    data = serialize_sweepstake(sweepstake, include_hidden=True)
    admin_url = f"{settings.public_base_url}/admin/{token}"
    enqueue_email(
        db,
        sweepstake.organiser_email,
        f"Your admin link for {sweepstake.title}",
        admin_created_email(sweepstake.title, admin_url, data["share_url"], sweepstake.view_code, str(sweepstake.reveal_at)),
    )
    db.commit()
    return {
        "admin_url": admin_url,
        "view_code": sweepstake.view_code,
        "share_url": data["share_url"],
        "sweepstake": data,
    }


@app.get("/api/sweepstakes/code/{view_code}", response_model=SweepstakeRead)
def participant_view(view_code: str, request: Request, db: Session = Depends(get_db)):
    rate_limit(request, limit=240, bucket=f"participant:{view_code.upper()}")
    sweepstake = get_by_view_code(db, view_code)
    if not sweepstake:
        raise HTTPException(status_code=404, detail="Sweepstake not found")
    return serialize_sweepstake(sweepstake)


@app.get("/api/admin/sweepstake", response_model=SweepstakeRead)
def admin_view(sweepstake=Depends(require_admin)):
    return serialize_sweepstake(sweepstake, include_hidden=True)


@app.get("/api/portal/sweepstakes", response_model=list[PortalSweepstakeRead])
def owner_portal(request: Request, db: Session = Depends(get_db), _portal=Depends(require_portal)):
    rate_limit(request, limit=60, bucket="portal")
    return portal_sweepstakes(db)


@app.post("/api/portal/sweepstakes/{sweepstake_id}/admin-link", response_model=PortalAdminLinkRead)
def owner_portal_admin_link(
    sweepstake_id: int,
    request: Request,
    db: Session = Depends(get_db),
    _portal=Depends(require_portal),
):
    rate_limit(request, limit=20, bucket="portal-admin-link")
    try:
        admin_url = portal_generate_admin_link(db, sweepstake_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail="Sweepstake not found") from exc
    return {"admin_url": admin_url}


@app.delete("/api/portal/sweepstakes/{sweepstake_id}")
def owner_portal_delete_sweepstake(
    sweepstake_id: int,
    request: Request,
    db: Session = Depends(get_db),
    _portal=Depends(require_portal),
):
    rate_limit(request, limit=20, bucket="portal-delete")
    try:
        portal_delete_sweepstake(db, sweepstake_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail="Sweepstake not found") from exc
    return {"message": "Sweepstake deleted"}


@app.post("/api/admin/forgot-link", response_model=AdminLinkRecovery)
def forgot_admin_link(payload: AdminLinkRequest, request: Request, db: Session = Depends(get_db)):
    rate_limit(request, limit=10, bucket=f"forgot-admin:{payload.email}")
    recovered_links = recover_admin_links(db, payload.email)
    for link in recovered_links:
        enqueue_email(
            db,
            payload.email,
            f"Admin link for {link['title']}",
            admin_recovery_email(link["title"], link["admin_url"], link["view_code"]),
        )
    db.commit()
    dev_links = recovered_links if settings.is_development else []
    return {
        "message": "If a matching draw exists, the admin link and participant code will be sent to that email address.",
        "sent_count": len(recovered_links),
        "dev_links": dev_links,
    }


@app.put("/api/admin/participants", response_model=SweepstakeRead)
def put_participants(payload: ParticipantListUpdate, db: Session = Depends(get_db), sweepstake=Depends(require_admin)):
    try:
        updated = replace_participants(db, sweepstake, payload.participants)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return serialize_sweepstake(updated, include_hidden=True)


@app.put("/api/admin/settings", response_model=SweepstakeRead)
def put_draft_settings(payload: DraftSettingsUpdate, db: Session = Depends(get_db), sweepstake=Depends(require_admin)):
    try:
        updated = update_draft_settings(db, sweepstake, payload)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return serialize_sweepstake(updated, include_hidden=True)


@app.post("/api/admin/publish", response_model=SweepstakeRead)
def publish(db: Session = Depends(get_db), sweepstake=Depends(require_admin)):
    try:
        updated = publish_sweepstake(db, sweepstake)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return serialize_sweepstake(updated, include_hidden=True)


@app.patch("/api/admin/items/{item_id}", response_model=SweepstakeRead)
def patch_item(item_id: int, payload: ItemUpdate, db: Session = Depends(get_db), sweepstake=Depends(require_admin)):
    try:
        updated = update_item(db, sweepstake, item_id, payload.status, payload.placement)
    except (LookupError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return serialize_sweepstake(updated, include_hidden=True)


@app.post("/api/admin/sync-sports", response_model=SweepstakeRead)
async def sync_sports(db: Session = Depends(get_db), sweepstake=Depends(require_admin)):
    await sync_world_cup_snapshot(db, sweepstake)
    return serialize_sweepstake(sweepstake, include_hidden=True)
