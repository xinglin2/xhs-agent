"""
services/session.py — Cookie storage, encryption, and session validation.
"""

from __future__ import annotations

import base64
import json
import os
import asyncio
import contextlib
from typing import Any

import psycopg2
import psycopg2.extras
import structlog
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from playwright.async_api import BrowserContext

from config import settings

log = structlog.get_logger(__name__)


# ── Low-level crypto helpers ───────────────────────────────────────────────────

def encrypt_cookies(cookies: list[dict[str, Any]], key_hex: str) -> str:
    """AES-256-GCM encrypt a list of cookie dicts → Base64 string."""
    key = bytes.fromhex(key_hex)
    aesgcm = AESGCM(key)
    nonce = os.urandom(12)
    plaintext = json.dumps(cookies).encode("utf-8")
    ciphertext = aesgcm.encrypt(nonce, plaintext, None)
    return base64.b64encode(nonce + ciphertext).decode("ascii")


def decrypt_cookies(encrypted: str, key_hex: str) -> list[dict[str, Any]]:
    """AES-256-GCM decrypt → original list of cookie dicts."""
    key = bytes.fromhex(key_hex)
    aesgcm = AESGCM(key)
    data = base64.b64decode(encrypted)
    nonce, ciphertext = data[:12], data[12:]
    plaintext = aesgcm.decrypt(nonce, ciphertext, None)
    return json.loads(plaintext.decode("utf-8"))


# ── Database helpers ───────────────────────────────────────────────────────────

def _get_connection():
    """Return a new psycopg2 connection. Caller must close it."""
    return psycopg2.connect(settings.database_url)


def _fetch_encrypted_cookies(user_id: str) -> str | None:
    """Synchronous DB read — run from an executor to stay non-blocking."""
    conn = _get_connection()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT xhs_encrypted_cookies FROM users WHERE id = %s",
                (user_id,),
            )
            row = cur.fetchone()
            if row is None:
                return None
            return row["xhs_encrypted_cookies"]
    finally:
        conn.close()


def _upsert_encrypted_cookies(user_id: str, encrypted: str | None) -> None:
    """Synchronous DB write — run from an executor to stay non-blocking."""
    conn = _get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE users
                   SET xhs_encrypted_cookies = %s,
                       updated_at = NOW()
                 WHERE id = %s
                """,
                (encrypted, user_id),
            )
            if cur.rowcount == 0:
                log.warning("session.upsert.no_row", user_id=user_id)
        conn.commit()
    finally:
        conn.close()


# ── SessionService ─────────────────────────────────────────────────────────────

class SessionService:
    """
    Manage XHS browser sessions (cookie-based) for users.

    All public methods are async; blocking DB calls are dispatched to the
    default thread-pool executor so they don't stall the event loop.
    """

    # ── Store ──────────────────────────────────────────────────────────────

    async def store_session(self, user_id: str, cookies: list[dict[str, Any]]) -> bool:
        """
        Encrypt *cookies* and persist them in the ``users`` table.

        Returns ``True`` on success, ``False`` on DB error.
        """
        log.info("session.store", user_id=user_id, cookie_count=len(cookies))
        try:
            encrypted = encrypt_cookies(cookies, settings.aes_key)
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                None, _upsert_encrypted_cookies, user_id, encrypted
            )
            return True
        except Exception as exc:  # noqa: BLE001
            log.error("session.store.error", user_id=user_id, error=str(exc))
            return False

    # ── Load ───────────────────────────────────────────────────────────────

    async def load_session(self, user_id: str) -> list[dict[str, Any]] | None:
        """
        Return the decrypted cookie list, or ``None`` when no session exists.
        """
        log.debug("session.load", user_id=user_id)
        try:
            loop = asyncio.get_event_loop()
            encrypted = await loop.run_in_executor(
                None, _fetch_encrypted_cookies, user_id
            )
            if not encrypted:
                return None
            return decrypt_cookies(encrypted, settings.aes_key)
        except Exception as exc:  # noqa: BLE001
            log.error("session.load.error", user_id=user_id, error=str(exc))
            return None

    # ── Validate ───────────────────────────────────────────────────────────

    async def validate_session(
        self,
        user_id: str,
        browser_context: BrowserContext,
    ) -> bool:
        """
        Inject the stored cookies into *browser_context* and navigate to the
        XHS profile page to verify the session is still alive.

        Returns ``True`` if the user appears logged in.
        """
        log.info("session.validate", user_id=user_id)
        cookies = await self.load_session(user_id)
        if cookies is None:
            log.warning("session.validate.no_cookies", user_id=user_id)
            return False

        try:
            await browser_context.add_cookies(cookies)
            page = await browser_context.new_page()
            try:
                await page.goto(settings.xhs_profile_url, wait_until="networkidle", timeout=30_000)
                # XHS redirects unauthenticated requests to the login page.
                # A logged-in user stays on a URL containing "/user/profile/".
                current_url = page.url
                logged_in = (
                    "xiaohongshu.com/user/profile" in current_url
                    and "login" not in current_url
                )
                log.info(
                    "session.validate.result",
                    user_id=user_id,
                    url=current_url,
                    logged_in=logged_in,
                )
                return logged_in
            finally:
                with contextlib.suppress(Exception):
                    await page.close()
        except Exception as exc:  # noqa: BLE001
            log.error("session.validate.error", user_id=user_id, error=str(exc))
            return False

    # ── Clear ──────────────────────────────────────────────────────────────

    async def clear_session(self, user_id: str) -> None:
        """Remove the encrypted cookies from the DB (set to NULL)."""
        log.info("session.clear", user_id=user_id)
        try:
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                None, _upsert_encrypted_cookies, user_id, None
            )
        except Exception as exc:  # noqa: BLE001
            log.error("session.clear.error", user_id=user_id, error=str(exc))


# Module-level singleton
session_service = SessionService()
