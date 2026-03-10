"""
services/publisher.py — Core XHS publishing automation via Playwright.

Flow
----
1. Load user cookies from DB and inject them into a stealth browser context.
2. Navigate to the XHS creator publish page.
3. Upload images (downloaded from R2/CDN to a temp directory first).
4. Fill in title and content.
5. (Optional) add topics/hashtags.
6. Click publish and capture the resulting note URL.
7. Update the ``publish_jobs`` row in Postgres with status + URL.
"""

from __future__ import annotations

import asyncio
import os
import tempfile
import time
from pathlib import Path
from typing import Any

import httpx
import psycopg2
import psycopg2.extras
import structlog
from playwright.async_api import Page, TimeoutError as PWTimeout
from playwright.async_api import async_playwright

from config import settings
from models import PublishJob, JobStatus
from services.session import session_service
from services.stealth import create_stealth_context, close_browser

log = structlog.get_logger(__name__)


# ── DB helpers ────────────────────────────────────────────────────────────────

def _update_job_status(
    job_id: str,
    status: JobStatus,
    *,
    error_message: str | None = None,
    published_url: str | None = None,
) -> None:
    """Synchronous Postgres update — called via run_in_executor."""
    conn = psycopg2.connect(settings.database_url)
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE publish_jobs
                   SET status         = %s,
                       error_message  = %s,
                       published_url  = %s,
                       updated_at     = NOW()
                 WHERE id = %s
                """,
                (status.value, error_message, published_url, job_id),
            )
        conn.commit()
    finally:
        conn.close()


async def _set_job_status(
    job_id: str,
    status: JobStatus,
    **kwargs: Any,
) -> None:
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _update_job_status, job_id, status, **(kwargs))


# ── Image download ─────────────────────────────────────────────────────────────

async def _download_images(image_keys: list[str], tmp_dir: str) -> list[Path]:
    """
    Download images from R2 / CDN into *tmp_dir*.

    *image_keys* may be:
    - bare object keys  → prefixed with ``settings.r2_public_url``
    - full https:// URLs → used as-is
    """
    paths: list[Path] = []
    async with httpx.AsyncClient(timeout=60) as client:
        for idx, key in enumerate(image_keys):
            url = key if key.startswith("http") else f"{settings.r2_public_url}/{key}"
            log.info("image.download", index=idx, url=url)
            resp = await client.get(url, follow_redirects=True)
            resp.raise_for_status()

            # Guess extension from Content-Type
            ct = resp.headers.get("content-type", "image/jpeg")
            ext = ".jpg"
            if "png" in ct:
                ext = ".png"
            elif "webp" in ct:
                ext = ".webp"
            elif "gif" in ct:
                ext = ".gif"

            dest = Path(tmp_dir) / f"img_{idx:02d}{ext}"
            dest.write_bytes(resp.content)
            paths.append(dest)
            log.info("image.saved", path=str(dest), size=len(resp.content))

    return paths


# ── XHS UI automation ─────────────────────────────────────────────────────────

async def _human_delay(ms: int | None = None) -> None:
    """Wait a random-ish interval to mimic human pacing."""
    base = ms if ms is not None else settings.ui_delay_ms
    jitter = int(base * 0.3)
    delay = (base + (int(time.time() * 1000) % jitter)) / 1000
    await asyncio.sleep(delay)


async def _upload_images(page: Page, image_paths: list[Path]) -> None:
    """
    Upload local image files through the XHS creator image picker.

    XHS uses a hidden <input type="file"> element; we trigger it via
    Playwright's ``set_input_files`` API which bypasses the native dialog.
    """
    log.info("xhs.upload_images", count=len(image_paths))

    # Wait for the file input to be present in the DOM
    file_input_selector = 'input[type="file"][accept*="image"]'
    await page.wait_for_selector(file_input_selector, state="attached", timeout=15_000)

    await page.set_input_files(file_input_selector, [str(p) for p in image_paths])

    # Wait until all thumbnails have loaded (XHS shows upload previews)
    await page.wait_for_selector(".upload-img-item, .note-image-item", timeout=60_000)
    log.info("xhs.upload_images.done")


async def _fill_title(page: Page, title: str) -> None:
    """Type the note title into the title input."""
    log.debug("xhs.fill_title", length=len(title))
    # Try common selectors for the title field
    selectors = [
        'input[placeholder*="标题"]',
        'textarea[placeholder*="标题"]',
        '#title',
        '.title-input',
        '[data-testid="title-input"]',
    ]
    for sel in selectors:
        try:
            el = await page.wait_for_selector(sel, state="visible", timeout=5_000)
            if el:
                await el.click()
                await el.fill(title)
                await _human_delay()
                log.info("xhs.fill_title.done", selector=sel)
                return
        except PWTimeout:
            continue
    raise RuntimeError("Could not locate title input on XHS publish page")


async def _fill_content(page: Page, content: str) -> None:
    """Type the note body text into the content editor."""
    log.debug("xhs.fill_content", length=len(content))
    selectors = [
        '.ql-editor',                          # Quill editor
        '[contenteditable="true"][data-placeholder*="正文"]',
        'textarea[placeholder*="正文"]',
        'textarea[placeholder*="内容"]',
        '#content',
        '.content-input',
    ]
    for sel in selectors:
        try:
            el = await page.wait_for_selector(sel, state="visible", timeout=5_000)
            if el:
                await el.click()
                # For contenteditable divs use keyboard; for inputs use fill()
                tag = await el.evaluate("e => e.tagName.toLowerCase()")
                if tag in ("input", "textarea"):
                    await el.fill(content)
                else:
                    await el.evaluate(
                        "(el, text) => { el.innerText = text; el.dispatchEvent(new Event('input', {bubbles:true})); }",
                        content,
                    )
                await _human_delay()
                log.info("xhs.fill_content.done", selector=sel)
                return
        except PWTimeout:
            continue
    raise RuntimeError("Could not locate content editor on XHS publish page")


async def _add_topics(page: Page, topics: list[str]) -> None:
    """Add hashtag topics (#话题) to the note."""
    if not topics:
        return
    log.info("xhs.add_topics", topics=topics)
    for topic in topics:
        try:
            # Click the topic / hashtag button
            topic_btn = page.locator('button:has-text("#"), [data-testid="topic-btn"]')
            if await topic_btn.count() > 0:
                await topic_btn.first.click()
                await _human_delay(400)
                search_input = page.locator('input[placeholder*="搜索话题"], input[placeholder*="搜索"]')
                await search_input.fill(topic)
                await _human_delay(800)
                first_result = page.locator('.topic-item, .search-result-item').first
                await first_result.click()
                await _human_delay(400)
        except Exception as exc:  # noqa: BLE001
            log.warning("xhs.add_topics.error", topic=topic, error=str(exc))


async def _submit_publish(page: Page) -> str | None:
    """
    Click the final publish button and return the URL of the new note
    (if detectable), or ``None``.
    """
    log.info("xhs.submit")
    submit_selectors = [
        'button:has-text("发布")',
        'button[data-testid="publish-btn"]',
        '.publish-btn',
        'button:has-text("提交")',
    ]
    for sel in submit_selectors:
        try:
            btn = await page.wait_for_selector(sel, state="visible", timeout=5_000)
            if btn:
                await btn.click()
                log.info("xhs.submit.clicked", selector=sel)
                break
        except PWTimeout:
            continue

    # After submission XHS typically redirects to a success page or the note
    try:
        await page.wait_for_url(
            lambda url: "xiaohongshu.com" in url and ("success" in url or "/explorer/" in url or "/note/" in url),
            timeout=30_000,
        )
        published_url = page.url
        log.info("xhs.submit.success", url=published_url)
        return published_url
    except PWTimeout:
        # Fallback: try to extract note URL from current page
        log.warning("xhs.submit.no_redirect", current_url=page.url)
        return page.url if "xiaohongshu.com" in page.url else None


# ── Main entry point ──────────────────────────────────────────────────────────

async def run_publish_job(job: PublishJob) -> None:
    """
    Execute a single publish job end-to-end.

    This is the function called by the queue worker for each incoming job.
    """
    log = structlog.get_logger(__name__).bind(job_id=job.job_id, user_id=job.user_id)
    log.info("publish.start")

    # Mark as processing immediately
    await _set_job_status(job.job_id, JobStatus.PROCESSING)

    with tempfile.TemporaryDirectory(prefix="xhs_pub_") as tmp_dir:
        try:
            # 1 — Download images from R2
            image_paths = await _download_images(job.image_keys, tmp_dir)

            # 2 — Launch stealth browser
            async with async_playwright() as pw:
                browser, context = await create_stealth_context(pw)
                try:
                    # 3 — Load user session (cookies)
                    cookies = await session_service.load_session(job.user_id)
                    if not cookies:
                        raise ValueError(f"No session found for user {job.user_id}")
                    await context.add_cookies(cookies)

                    page = await context.new_page()

                    # 4 — Navigate to creator publish page
                    log.info("xhs.navigate", url=settings.xhs_creator_url)
                    await page.goto(
                        settings.xhs_creator_url,
                        wait_until="networkidle",
                        timeout=30_000,
                    )

                    # Bail out early if we ended up on the login page
                    if "login" in page.url or "signin" in page.url:
                        raise ValueError(
                            f"User {job.user_id} session is invalid/expired — landed on login page"
                        )

                    await _human_delay(1000)

                    # 5 — Upload images
                    await _upload_images(page, image_paths)
                    await _human_delay()

                    # 6 — Fill title
                    await _fill_title(page, job.title)

                    # 7 — Fill content
                    await _fill_content(page, job.content)

                    # 8 — Add topics (best-effort)
                    await _add_topics(page, job.topics)

                    await _human_delay(1200)

                    # 9 — Submit
                    published_url = await _submit_publish(page)

                    # 10 — Update DB as done
                    await _set_job_status(
                        job.job_id,
                        JobStatus.DONE,
                        published_url=published_url,
                    )
                    log.info("publish.done", published_url=published_url)

                finally:
                    await context.close()
                    await close_browser(browser)

        except Exception as exc:  # noqa: BLE001
            log.error("publish.failed", error=str(exc), exc_info=True)
            await _set_job_status(
                job.job_id,
                JobStatus.FAILED,
                error_message=str(exc)[:2000],
            )
            raise
