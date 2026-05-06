from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "sweepstakes.corrigan.events"
    app_env: str = "development"
    database_url: str = "sqlite:///./sweepstakes.db"
    public_base_url: str = "http://localhost:5173"
    cors_origins: str = "http://localhost:5173,http://localhost:8000"
    wc2026_api_key: str | None = None
    wc2026_api_url: str = "https://api.football-data.org/v4"
    wc2026_competition_code: str = "WC"
    wc2026_season: int = 2026
    wc2026_rate_limit_per_minute: int = 9
    portal_token: str | None = None
    resend_api_key: str | None = None
    resend_from_email: str = "Sweepstakes <noreply@corrigan.events>"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def is_development(self) -> bool:
        return self.app_env.lower() in {"dev", "development", "local", "test"}


@lru_cache
def get_settings() -> Settings:
    return Settings()
