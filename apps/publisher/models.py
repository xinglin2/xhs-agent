"""
models.py — Pydantic data models shared across the publisher service.
"""

from __future__ import annotations

from enum import Enum
from typing import Any
from pydantic import BaseModel, Field


# ── Enums ─────────────────────────────────────────────────────────────────────

class JobStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    DONE = "done"
    FAILED = "failed"


class NoteType(str, Enum):
    IMAGE = "image"   # 图文 note (images + text)
    VIDEO = "video"   # 视频 note  (currently not implemented)


# ── Queue job payload ─────────────────────────────────────────────────────────

class PublishJob(BaseModel):
    """
    Schema for a job message on the BullMQ 'xhs-publish' queue.

    The Node.js producer serialises this as the BullMQ job *data* field.
    """

    job_id: str = Field(..., description="UUID of the publish_jobs row in Postgres")
    user_id: str = Field(..., description="UUID of the owning user")

    note_type: NoteType = NoteType.IMAGE

    title: str = Field(..., max_length=20, description="笔记标题 (≤20 chars)")
    content: str = Field(..., max_length=1000, description="笔记正文 (≤1000 chars)")

    # Ordered list of R2 object keys (or full CDN URLs) for images.
    # The publisher downloads them and uploads through XHS's own uploader.
    image_keys: list[str] = Field(default_factory=list, min_length=1, max_length=9)

    # Optional: topics/hashtags to append (e.g. ["旅行", "美食"])
    topics: list[str] = Field(default_factory=list)

    # BullMQ may pass extra metadata — we accept but ignore unknown fields
    class Config:
        extra = "allow"


# ── API request / response schemas ────────────────────────────────────────────

class LinkSessionRequest(BaseModel):
    user_id: str
    # Raw cookies as returned by Playwright's context.cookies() on the client,
    # then serialised to JSON and Base64+AES-GCM encrypted by the browser
    # capture flow before being sent here.
    encrypted_cookies: str


class SessionStatusResponse(BaseModel):
    user_id: str
    has_session: bool
    valid: bool | None = None   # None = not validated yet; True/False = checked


class HealthResponse(BaseModel):
    status: str
    queue: str


# ── Internal DB row helpers ───────────────────────────────────────────────────

class UserRow(BaseModel):
    id: str
    encrypted_cookies: str | None = None

    class Config:
        from_attributes = True


class PublishJobRow(BaseModel):
    id: str
    user_id: str
    status: JobStatus
    error_message: str | None = None
    published_url: str | None = None

    class Config:
        from_attributes = True
