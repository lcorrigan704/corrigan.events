import hashlib
import secrets
import string
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app.models import Sweepstake

CODE_ALPHABET = "0123456789"
APP_TIMEZONE = ZoneInfo("Europe/London")


def generate_view_code(db: Session) -> str:
    while True:
        code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(6))
        exists = db.query(Sweepstake).filter(Sweepstake.view_code == code).first()
        if not exists:
            return code


def generate_admin_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def random_seed() -> str:
    return "".join(secrets.choice(string.ascii_letters + string.digits) for _ in range(24))


def is_revealed(reveal_at: datetime) -> bool:
    reveal_at_aware = reveal_at if reveal_at.tzinfo else reveal_at.replace(tzinfo=APP_TIMEZONE)
    return datetime.now(timezone.utc) >= reveal_at_aware
