from datetime import datetime, timezone

import httpx
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import EmailOutbox, EmailStatus


def enqueue_email(db: Session, recipient: str, subject: str, body_text: str) -> EmailOutbox:
    email = EmailOutbox(recipient=recipient.strip().lower(), subject=subject, body_text=body_text)
    db.add(email)
    return email


async def send_pending_emails(db: Session, limit: int = 25) -> int:
    settings = get_settings()
    emails = (
        db.query(EmailOutbox)
        .filter(EmailOutbox.status.in_([EmailStatus.pending, EmailStatus.failed]))
        .filter(EmailOutbox.attempts < 5)
        .order_by(EmailOutbox.created_at.asc())
        .limit(limit)
        .all()
    )
    sent = 0
    for email in emails:
        email.attempts += 1
        if not settings.resend_api_key:
            email.status = EmailStatus.failed
            email.last_error = "RESEND_API_KEY is not configured"
            continue
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.post(
                    "https://api.resend.com/emails",
                    headers={"Authorization": f"Bearer {settings.resend_api_key}"},
                    json={
                        "from": settings.resend_from_email,
                        "to": [email.recipient],
                        "subject": email.subject,
                        "text": email.body_text,
                    },
                )
                response.raise_for_status()
            email.status = EmailStatus.sent
            email.sent_at = datetime.now(timezone.utc)
            email.last_error = None
            sent += 1
        except httpx.HTTPError as exc:
            email.status = EmailStatus.failed
            email.last_error = exc.__class__.__name__
    db.commit()
    return sent


def admin_created_email(title: str, admin_url: str, share_url: str, view_code: str, reveal_at: str) -> str:
    return (
        f"Your sweepstake is ready.\n\n"
        f"Draw: {title}\n"
        f"Admin link: {admin_url}\n"
        f"Participant code: {view_code}\n"
        f"Participant link: {share_url}\n"
        f"Reveal time: {reveal_at}\n\n"
        "Keep the admin link private. Payments are managed outside the app."
    )


def admin_recovery_email(title: str, admin_url: str, view_code: str) -> str:
    return (
        f"Admin link recovery for {title}.\n\n"
        f"Admin link: {admin_url}\n"
        f"Participant code: {view_code}\n\n"
        "If you did not request this, you can ignore this email."
    )
