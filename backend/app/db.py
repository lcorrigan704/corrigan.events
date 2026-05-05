from collections.abc import Generator

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import get_settings


class Base(DeclarativeBase):
    pass


engine = create_engine(
    get_settings().database_url,
    connect_args={"check_same_thread": False}
    if get_settings().database_url.startswith("sqlite")
    else {},
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    from app import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    if get_settings().database_url.startswith("sqlite"):
        inspector = inspect(engine)
        sweepstake_columns = {column["name"] for column in inspector.get_columns("sweepstakes")}
        if "organiser_email" not in sweepstake_columns:
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE sweepstakes ADD COLUMN organiser_email VARCHAR(255)"))
        payout_columns = {column["name"] for column in inspector.get_columns("payout_terms")} if inspector.has_table("payout_terms") else set()
        if "category" not in payout_columns:
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE payout_terms ADD COLUMN category VARCHAR(17)"))
                connection.execute(
                    text(
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
                )
