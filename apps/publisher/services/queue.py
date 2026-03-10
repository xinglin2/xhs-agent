"""
services/queue.py — BullMQ-compatible Redis queue worker.

BullMQ (Node.js) stores jobs in Redis using the following key schema
(prefix defaults to "bull"):

    bull:{queue}:wait         — LIST  (LPUSH / BRPOPLPUSH)
    bull:{queue}:active       — LIST  (jobs being processed)
    bull:{queue}:completed    — ZSET
    bull:{queue}:failed       — ZSET
    bull:{queue}:{id}         — HASH  (job data; field "data" is JSON payload)

This worker:
1. BRPOPLPUSHes a job id from ``wait`` → ``active``.
2. Fetches the job HASH and parses the ``data`` field.
3. Dispatches to ``run_publish_job``.
4. On success: ZADDs the job id to ``completed``; DELetes the job HASH.
5. On failure: ZADDs to ``failed`` with current timestamp; stores error.
"""

from __future__ import annotations

import asyncio
import json
import time
from typing import Any

import aioredis
import structlog

from config import settings
from models import PublishJob

log = structlog.get_logger(__name__)

# ── Key helpers ───────────────────────────────────────────────────────────────

BULL_PREFIX = "bull"


def _key(queue: str, suffix: str) -> str:
    return f"{BULL_PREFIX}:{queue}:{suffix}"


def _wait_key(queue: str) -> str:
    return _key(queue, "wait")


def _active_key(queue: str) -> str:
    return _key(queue, "active")


def _completed_key(queue: str) -> str:
    return _key(queue, "completed")


def _failed_key(queue: str) -> str:
    return _key(queue, "failed")


def _job_key(queue: str, job_id: str) -> str:
    return _key(queue, job_id)


# ── Queue worker ──────────────────────────────────────────────────────────────

class QueueWorker:
    """
    Long-running async worker that consumes jobs from the BullMQ Redis queue.

    Attributes
    ----------
    queue_name:
        The BullMQ queue name (e.g. ``"xhs-publish"``).
    concurrency:
        Maximum number of jobs processed simultaneously.
    """

    def __init__(
        self,
        queue_name: str | None = None,
        concurrency: int | None = None,
    ) -> None:
        self.queue_name = queue_name or settings.publisher_queue_name
        self.concurrency = concurrency or settings.max_concurrent_jobs
        self._redis: aioredis.Redis | None = None
        self._semaphore: asyncio.Semaphore | None = None
        self._running = False

    # ── Lifecycle ──────────────────────────────────────────────────────────

    async def start(self) -> None:
        """Connect to Redis and begin polling the queue."""
        log.info("queue_worker.start", queue=self.queue_name, concurrency=self.concurrency)
        self._redis = await aioredis.from_url(
            settings.redis_url,
            encoding="utf-8",
            decode_responses=True,
        )
        self._semaphore = asyncio.Semaphore(self.concurrency)
        self._running = True
        asyncio.create_task(self._poll_loop())

    async def stop(self) -> None:
        """Signal the worker to stop after finishing current jobs."""
        log.info("queue_worker.stop")
        self._running = False
        if self._redis:
            await self._redis.close()

    async def is_connected(self) -> bool:
        """Ping Redis; used by the /health endpoint."""
        if self._redis is None:
            return False
        try:
            return await self._redis.ping()
        except Exception:  # noqa: BLE001
            return False

    # ── Poll loop ──────────────────────────────────────────────────────────

    async def _poll_loop(self) -> None:
        """
        Main loop: block-pop a job id from the wait list, then process it.

        Uses ``BRPOPLPUSH`` (Redis < 7) with a timeout so we can check
        ``self._running`` periodically. Falls back to
        ``LMOVE … RIGHT LEFT`` on Redis ≥ 7.
        """
        while self._running:
            try:
                job_id = await self._pop_job()
                if job_id is None:
                    # Timed out — loop again
                    continue

                log.info("queue_worker.job_received", job_id=job_id)
                asyncio.create_task(self._handle_job(job_id))

            except aioredis.RedisError as exc:
                log.error("queue_worker.redis_error", error=str(exc))
                await asyncio.sleep(5)
            except Exception as exc:  # noqa: BLE001
                log.error("queue_worker.unexpected_error", error=str(exc))
                await asyncio.sleep(2)

    async def _pop_job(self) -> str | None:
        """
        Atomically move one job id from *wait* to *active*.

        Returns the raw job id string, or ``None`` on timeout.
        """
        wait_key = _wait_key(self.queue_name)
        active_key = _active_key(self.queue_name)
        timeout = settings.queue_poll_timeout

        # Try LMOVE (Redis ≥ 6.2) first, fall back to BRPOPLPUSH
        try:
            result = await self._redis.lmove(wait_key, active_key, "RIGHT", "LEFT")  # type: ignore[union-attr]
            if result is None:
                await asyncio.sleep(timeout)
            return result
        except aioredis.ResponseError:
            # Redis < 6.2 — use BRPOPLPUSH
            result = await self._redis.brpoplpush(wait_key, active_key, timeout=timeout)  # type: ignore[union-attr]
            return result

    # ── Job handling ───────────────────────────────────────────────────────

    async def _handle_job(self, job_id: str) -> None:
        """Fetch, parse, run, and finalise a single job with concurrency control."""
        # Lazy import to avoid circular deps at module load time
        from services.publisher import run_publish_job  # noqa: PLC0415

        async with self._semaphore:  # type: ignore[union-attr]
            raw_payload = await self._fetch_job_payload(job_id)
            if raw_payload is None:
                log.error("queue_worker.job_missing", job_id=job_id)
                await self._move_to_failed(job_id, "job data not found in Redis")
                return

            try:
                job = PublishJob.model_validate(raw_payload)
            except Exception as exc:  # noqa: BLE001
                log.error("queue_worker.parse_error", job_id=job_id, error=str(exc))
                await self._move_to_failed(job_id, f"parse error: {exc}")
                return

            try:
                await run_publish_job(job)
                await self._move_to_completed(job_id)
            except Exception as exc:  # noqa: BLE001
                await self._move_to_failed(job_id, str(exc))

    async def _fetch_job_payload(self, job_id: str) -> dict[str, Any] | None:
        """
        Retrieve the job's Redis HASH and parse the ``data`` field.

        BullMQ stores job metadata in a hash at ``bull:{queue}:{id}``.
        The ``data`` field contains the JSON-serialised job payload.
        """
        hash_key = _job_key(self.queue_name, job_id)
        raw = await self._redis.hgetall(hash_key)  # type: ignore[union-attr]
        if not raw:
            return None
        data_str = raw.get("data", "{}")
        try:
            payload = json.loads(data_str)
        except json.JSONDecodeError:
            return None
        # Ensure job_id is available in the payload
        payload.setdefault("job_id", job_id)
        return payload

    # ── State transitions ──────────────────────────────────────────────────

    async def _move_to_completed(self, job_id: str) -> None:
        active_key = _active_key(self.queue_name)
        completed_key = _completed_key(self.queue_name)
        ts = time.time()
        pipe = self._redis.pipeline(transaction=True)  # type: ignore[union-attr]
        pipe.lrem(active_key, 1, job_id)
        pipe.zadd(completed_key, {job_id: ts})
        await pipe.execute()
        log.info("queue_worker.job_completed", job_id=job_id)

    async def _move_to_failed(self, job_id: str, reason: str) -> None:
        active_key = _active_key(self.queue_name)
        failed_key = _failed_key(self.queue_name)
        ts = time.time()

        # Store failure reason back on the job hash
        hash_key = _job_key(self.queue_name, job_id)
        pipe = self._redis.pipeline(transaction=True)  # type: ignore[union-attr]
        pipe.hset(hash_key, "failedReason", reason)
        pipe.lrem(active_key, 1, job_id)
        pipe.zadd(failed_key, {job_id: ts})
        await pipe.execute()
        log.error("queue_worker.job_failed", job_id=job_id, reason=reason)


# ── Module-level singleton ─────────────────────────────────────────────────────
queue_worker = QueueWorker()
