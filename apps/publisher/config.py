"""
config.py — Pydantic Settings for the XHS Publisher service.

All values are read from environment variables (or a .env file).
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Database ──────────────────────────────────────────────────────────────
    database_url: str  # e.g. postgresql://user:pass@host:5432/dbname

    # ── Redis ─────────────────────────────────────────────────────────────────
    redis_url: str  # e.g. redis://host:6379/0

    # ── Encryption ────────────────────────────────────────────────────────────
    # 32-byte key expressed as a 64-character hex string, used for AES-256-GCM
    aes_key: str

    # ── Cloudflare R2 ─────────────────────────────────────────────────────────
    r2_account_id: str
    r2_access_key_id: str
    r2_secret_access_key: str
    r2_bucket_name: str
    r2_public_url: str  # CDN base URL, e.g. https://pub-xxx.r2.dev

    # ── App tunables ──────────────────────────────────────────────────────────
    log_level: str = "INFO"
    headless: bool = True          # set False for visual debugging
    publisher_queue_name: str = "xhs-publish"

    # How long (seconds) the queue worker waits for a new job before re-polling
    queue_poll_timeout: int = 5

    # Concurrency cap: how many publish jobs can run in parallel
    max_concurrent_jobs: int = 2

    # Milliseconds to wait between UI interactions (anti-detection jitter)
    ui_delay_ms: int = 800

    # XHS creator page URL
    xhs_creator_url: str = "https://creator.xiaohongshu.com/publish/publish"
    # XHS login check URL (redirects to login if not authenticated)
    xhs_profile_url: str = "https://www.xiaohongshu.com/user/profile/me"


settings = Settings()  # type: ignore[call-arg]
