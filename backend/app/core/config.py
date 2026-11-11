from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://bank:bank@localhost:5444/banking"
    secret_key: str = "dev-only-change-me-dev-only-change-me"
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 15
    refresh_token_days: int = 30
    # Numbers typed without a country code (e.g. "8 912 ...") are read as this region.
    default_phone_region: str = "RU"

    environment: str = "development"  # "production" turns on the startup safety checks
    # Demo-only features (fake deposits, simulated SMS inbox, simulated card purchases).
    demo_mode: bool = True

    # Currency rates are cached on the server so the free APIs are called at most this often.
    rates_cache_seconds: int = 3600
    certificate_interval_seconds: float = 5.0  # one new certificate per user per this many seconds (0 = no limit)

    # Sign-in throttling (failed attempts per window)
    login_max_failures: int = 5
    login_window_seconds: int = 900

    # Payment PIN
    pin_max_attempts: int = 5
    pin_lock_minutes: int = 15

    # One-time codes for larger payments
    otp_threshold_cents: int = 5000  # payments of $50.00 or more need a code
    otp_ttl_seconds: int = 300
    otp_max_attempts: int = 5
    # Only the web dev build needs CORS; native apps ignore it. Env var: JSON list.
    cors_origins: list[str] = ["http://localhost:8081", "http://127.0.0.1:8081"]


settings = Settings()


DEFAULT_SECRET = "dev-only-change-me-dev-only-change-me"


def production_problems(cfg: Settings) -> list[str]:
    """Things that must be fixed before this server may run in production. Empty = fine."""
    if cfg.environment != "production":
        return []
    problems = []
    if cfg.secret_key == DEFAULT_SECRET or len(cfg.secret_key) < 32:
        problems.append("SECRET_KEY must be set to a random value of at least 32 characters")
    if "bank:bank@" in cfg.database_url:
        problems.append("DATABASE_URL still uses the default development password")
    insecure = [o for o in cfg.cors_origins if o.startswith("http://")]
    if insecure:
        problems.append(f"CORS_ORIGINS must not contain plain-http origins: {insecure}")
    return problems
