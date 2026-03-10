# XHS Publisher — Python/Playwright service

## Overview

This service is responsible for:
- Receiving publish jobs from a **BullMQ** Redis queue (`xhs-publish`)
- Using **Playwright** (Chromium + stealth) to log in as the user and publish their note on Xiaohongshu
- Exposing a small **FastAPI** HTTP API for health checks and session (cookie) management

## Directory Layout

```
publisher/
├── Dockerfile
├── requirements.txt
├── .env.example          ← copy to .env and fill in secrets
├── config.py             ← Pydantic Settings (all env vars)
├── models.py             ← shared Pydantic data models
├── main.py               ← FastAPI app + lifecycle hooks
└── services/
    ├── __init__.py
    ├── session.py        ← AES-GCM cookie encryption + DB storage
    ├── stealth.py        ← Chromium launch with anti-detection
    ├── publisher.py      ← XHS UI automation (upload → fill → submit)
    └── queue.py          ← BullMQ-compatible Redis queue worker
```

## Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL DSN, e.g. `postgresql://user:pass@host/db` |
| `REDIS_URL` | Redis DSN, e.g. `redis://host:6379/0` |
| `AES_KEY` | 64-char hex string (32 bytes) for AES-256-GCM cookie encryption |
| `R2_ACCOUNT_ID` | Cloudflare R2 account id |
| `R2_ACCESS_KEY_ID` | R2 access key |
| `R2_SECRET_ACCESS_KEY` | R2 secret key |
| `R2_BUCKET_NAME` | R2 bucket name |
| `R2_PUBLIC_URL` | CDN base URL, e.g. `https://pub-xxx.r2.dev` |
| `LOG_LEVEL` | `DEBUG` / `INFO` / `WARNING` (default `INFO`) |
| `HEADLESS` | `true` (default) or `false` for visual debugging |
| `PUBLISHER_QUEUE_NAME` | BullMQ queue name (default `xhs-publish`) |
| `MAX_CONCURRENT_JOBS` | Parallel publish jobs (default `2`) |

## Running Locally

```bash
# 1. Install dependencies
pip install -r requirements.txt
playwright install chromium

# 2. Copy and edit env
cp .env.example .env

# 3. Start
uvicorn main:app --port 8001 --reload
```

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Liveness + Redis connectivity |
| `GET` | `/session/status/{user_id}` | Check if cookies exist |
| `POST` | `/session/link` | Store (+ validate) new session cookies |
| `DELETE` | `/session/unlink/{user_id}` | Remove stored cookies |

## BullMQ Integration

The worker consumes from `bull:xhs-publish:wait` (Redis LIST).  
It is compatible with BullMQ's default key schema; no special BullMQ Node.js
dependency is required on the Python side.

Job payload (`data` field in the BullMQ job hash):

```json
{
  "job_id":    "uuid of publish_jobs row",
  "user_id":   "uuid of the user",
  "note_type": "image",
  "title":     "笔记标题 (≤20 chars)",
  "content":   "笔记正文 (≤1000 chars)",
  "image_keys": ["r2-object-key-1.jpg", "r2-object-key-2.jpg"],
  "topics":    ["旅行", "美食"]
}
```

## Database Schema (expected)

```sql
-- Users table must have this column:
ALTER TABLE users ADD COLUMN IF NOT EXISTS xhs_encrypted_cookies TEXT;

-- Publish jobs table:
CREATE TABLE IF NOT EXISTS publish_jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES users(id),
  status          TEXT NOT NULL DEFAULT 'pending',
  error_message   TEXT,
  published_url   TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```
