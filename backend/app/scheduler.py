from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.email import send_pending_emails
from app.models import Sweepstake, TemplateType
from app.sports import sync_world_cup_sweepstakes_from_provider

scheduler = AsyncIOScheduler(timezone="UTC")


async def sync_world_cup_sweepstakes() -> None:
    db: Session = SessionLocal()
    try:
        sweepstakes = db.query(Sweepstake).filter(Sweepstake.template_type == TemplateType.world_cup_2026).all()
        if sweepstakes:
            await sync_world_cup_sweepstakes_from_provider(db, sweepstakes)
    finally:
        db.close()


async def send_email_outbox() -> None:
    db: Session = SessionLocal()
    try:
        await send_pending_emails(db)
    finally:
        db.close()


def start_scheduler() -> None:
    if not scheduler.running:
        scheduler.add_job(sync_world_cup_sweepstakes, "interval", hours=1, id="wc2026-hourly-sync", replace_existing=True)
        scheduler.add_job(send_email_outbox, "interval", minutes=1, id="email-outbox", replace_existing=True)
        scheduler.start()


def stop_scheduler() -> None:
    if scheduler.running:
        scheduler.shutdown(wait=False)
