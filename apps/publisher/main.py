"""
main.py — FastAPI application entry point for the XHS Publisher service.

Endpoints
---------
GET  /health                      — Liveness + queue connectivity check
GET  /session/status/{user_id}    — Check whether valid cookies exist
POST /session/link                — Store (and validate) a new user session
DELETE /session/unlink/{user_id}  — Remove stored cookies

On startup a background task is launched that continuously polls the
BullMQ Redis queue (``xhs-publish`` by default) for publish jobs.
"""

from __future__ import annotations

import logging

import structlog
from fastapi import FastAPI, HTTPException, status
from fastapi.responses import JSONResponse
from playwright.async_api import async_playwright

from config import settings
from models import (
    HealthResponse,
    JobStatus,
    LinkSessionRequest,
    SessionStatusResponse,
)
from services.queue import queue_worker
from services.session import session_service
from services.stealth import create_stealth_context, close_browser

# ── Structured logging ─────────────────────────────────────────────────────────

structlog.configure(
    wrapper_class=structlog.make_filtering_bound_logger(
        logging.getLevelName(settings.log_level.upper())
    ),
)
log = structlog.get_logger(__name__)

# ── App ────────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="XHS Publisher",
    description="Playwright-powered Xiaohongshu publishing service",
    version="1.0.0",
)


# ── Lifecycle ──────────────────────────────────────────────────────────────────

@app.on_event("startup")
async def on_startup() -> None:
    log.info("app.startup", queue=settings.publisher_queue_name)
    await queue_worker.start()


@app.on_event("shutdown")
async def on_shutdown() -> None:
    log.info("app.shutdown")
    await queue_worker.stop()


# ── Health ─────────────────────────────────────────────────────────────────────

@app.get("/health", response_model=HealthResponse, tags=["meta"])
async def health() -> HealthResponse:
    """
    Liveness probe.

    Returns ``queue: "connected"`` only when Redis is reachable.
    """
    connected = await queue_worker.is_connected()
    return HealthResponse(
        status="ok",
        queue="connected" if connected else "disconnected",
    )


# ── Session management ────────────────────────────────────────────────────────

@app.get(
    "/session/status/{user_id}",
    response_model=SessionStatusResponse,
    tags=["session"],
)
async def session_status(user_id: str) -> SessionStatusResponse:
    """
    Check whether *user_id* has stored XHS cookies.

    Does **not** perform a live browser validation (use POST /session/link
    with ``validate=true`` for that).
    """
    cookies = await session_service.load_session(user_id)
    return SessionStatusResponse(
        user_id=user_id,
        has_session=cookies is not None,
        valid=None,  # not validated here
    )


@app.post(
    "/session/link",
    response_model=SessionStatusResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["session"],
)
async def link_session(body: LinkSessionRequest) -> SessionStatusResponse:
    """
    Receive pre-encrypted cookies from the browser-capture flow, validate
    them against XHS, and persist them in the database.

    The ``encrypted_cookies`` field must be produced by:
    ``encrypt_cookies(raw_cookies, aes_key)`` — see services/session.py.
    """
    from services.session import decrypt_cookies  # local import

    log.info("session.link", user_id=body.user_id)

    # 1 — Decrypt to verify the payload is well-formed
    try:
        cookies = decrypt_cookies(body.encrypted_cookies, settings.aes_key)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to decrypt cookies: {exc}",
        ) from exc

    if not cookies:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cookie list is empty after decryption",
        )

    # 2 — Live browser validation
    # We inject the freshly-decrypted cookies directly into a throwaway
    # context instead of loading them from DB (they aren't stored yet).
    valid = False
    async with async_playwright() as pw:
        browser, context = await create_stealth_context(pw)
        try:
            import contextlib
            from playwright.async_api import TimeoutError as PWTimeout

            await context.add_cookies(cookies)
            page = await context.new_page()
            try:
                await page.goto(
                    settings.xhs_profile_url,
                    wait_until="networkidle",
                    timeout=30_000,
                )
                current_url = page.url
                valid = (
                    "xiaohongshu.com/user/profile" in current_url
                    and "login" not in current_url
                )
                log.info(
                    "session.link.validate_result",
                    user_id=body.user_id,
                    url=current_url,
                    valid=valid,
                )
            except PWTimeout:
                log.warning("session.link.validate_timeout", user_id=body.user_id)
            finally:
                with contextlib.suppress(Exception):
                    await page.close()
        finally:
            await context.close()
            await close_browser(browser)

    # 3 — Store (overwrite previous session)
    stored = await session_service.store_session(body.user_id, cookies)
    if not stored:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to persist session to database",
        )

    return SessionStatusResponse(
        user_id=body.user_id,
        has_session=True,
        valid=valid,
    )


@app.delete(
    "/session/unlink/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["session"],
)
async def unlink_session(user_id: str) -> None:
    """Remove stored XHS cookies for *user_id*."""
    log.info("session.unlink", user_id=user_id)
    await session_service.clear_session(user_id)


# ── Exception handlers ────────────────────────────────────────────────────────

@app.exception_handler(Exception)
async def generic_exception_handler(request, exc: Exception) -> JSONResponse:
    log.error("unhandled_exception", error=str(exc), exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Internal server error"},
    )
