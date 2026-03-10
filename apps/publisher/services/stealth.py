"""
services/stealth.py — Chromium browser / context factory with anti-detection.
"""

from __future__ import annotations

import structlog
from playwright.async_api import Browser, BrowserContext, Playwright

from config import settings

log = structlog.get_logger(__name__)

# A realistic macOS / Chrome 126 user-agent string
_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/126.0.0.0 Safari/537.36"
)

_CHROMIUM_ARGS = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-blink-features=AutomationControlled",
    "--disable-dev-shm-usage",
    "--disable-web-security",
    "--disable-features=IsolateOrigins,site-per-process",
    "--disable-infobars",
    "--window-size=1280,800",
]


async def launch_browser(playwright: Playwright) -> Browser:
    """
    Launch a persistent Chromium instance with stealth CLI flags.

    Prefer calling :func:`create_stealth_context` which wraps this.
    """
    log.info("browser.launch", headless=settings.headless)
    return await playwright.chromium.launch(
        headless=settings.headless,
        args=_CHROMIUM_ARGS,
    )


async def create_stealth_context(
    playwright: Playwright,
    *,
    browser: Browser | None = None,
) -> tuple[Browser, BrowserContext]:
    """
    Create (or reuse) a Chromium browser and return a stealth-configured
    ``BrowserContext``.

    Usage::

        async with async_playwright() as pw:
            browser, ctx = await create_stealth_context(pw)
            page = await ctx.new_page()
            # … do work …
            await ctx.close()
            await browser.close()

    Returns
    -------
    (Browser, BrowserContext)
        Caller is responsible for closing both when done.
    """
    if browser is None:
        browser = await launch_browser(playwright)

    context = await browser.new_context(
        viewport={"width": 1280, "height": 800},
        user_agent=_USER_AGENT,
        locale="zh-CN",
        timezone_id="Asia/Shanghai",
        # Mimic a normal desktop browser; don't advertise WebDriver
        extra_http_headers={
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
            "Sec-CH-UA": '"Not/A)Brand";v="8", "Chromium";v="126", "Google Chrome";v="126"',
            "Sec-CH-UA-Mobile": "?0",
            "Sec-CH-UA-Platform": '"macOS"',
        },
    )

    # ── playwright-stealth ────────────────────────────────────────────────────
    # stealth_async patches all pages created from this context.
    # We open a throwaway page, apply stealth, then close it so that the
    # patch is in effect for every subsequent page in the context.
    try:
        from playwright_stealth import stealth_async  # type: ignore[import]

        warmup_page = await context.new_page()
        await stealth_async(warmup_page)
        await warmup_page.close()
        log.info("browser.stealth.applied")
    except ImportError:
        log.warning(
            "browser.stealth.skipped",
            reason="playwright-stealth not installed — running without stealth patches",
        )

    # ── Override navigator properties via init script ─────────────────────────
    # Belt-and-suspenders: even if stealth_async already does this, we make
    # sure `navigator.webdriver` is gone and the Chrome object looks real.
    await context.add_init_script(
        """
        // Hide webdriver flag
        Object.defineProperty(navigator, 'webdriver', {
            get: () => undefined,
        });

        // Spoof Chrome runtime
        if (!window.chrome) {
            window.chrome = { runtime: {} };
        }

        // Realistic plugin list
        Object.defineProperty(navigator, 'plugins', {
            get: () => [1, 2, 3, 4, 5],
        });

        // Non-zero language array
        Object.defineProperty(navigator, 'languages', {
            get: () => ['zh-CN', 'zh', 'en'],
        });
        """
    )

    log.info("browser.context.created")
    return browser, context


async def close_browser(browser: Browser) -> None:
    """Gracefully close the browser and all its contexts."""
    try:
        await browser.close()
        log.info("browser.closed")
    except Exception as exc:  # noqa: BLE001
        log.warning("browser.close.error", error=str(exc))
