# XHS Agent 🌸

> **为海外创作者打造的小红书内容助手**  
> The AI-powered tool for foreigners to create and publish authentic Xiaohongshu content.

---

## What It Does

- 🌍 **Input in any language** → generates native-sounding Chinese XHS posts
- 📸 **Image processing** → auto-crops to XHS ratios with aesthetic filters
- 📋 **One-click copy** → formatted text ready to paste
- 🚀 **Auto-publish** → posts directly to your linked XHS account (opt-in)
- 🔧 **Admin panel** → manage API keys, view logs, monitor usage

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 + Tailwind + shadcn/ui |
| API | Node.js + Fastify |
| Publisher | Python + Playwright |
| Database | PostgreSQL (Drizzle ORM) |
| Queue | BullMQ + Redis |
| Storage | Cloudflare R2 |
| LLM | OpenAI GPT-4o |
| Deploy | Railway |

---

## Quick Start (Local Dev)

### Prerequisites
- Node.js 22+, pnpm 10+
- Python 3.11+
- Docker + Docker Compose

### Setup

```bash
# 1. Clone and install
git clone https://github.com/your-org/xhs-agent
cd xhs-agent
pnpm install

# 2. Copy env file
cp .env.example .env
# Fill in: OPENAI_API_KEY, R2_* credentials

# 3. Start all services
docker compose up -d postgres redis

# 4. Run DB migrations
pnpm db:migrate

# 5. Start dev servers
pnpm dev
# → Web:       http://localhost:3000
# → API:       http://localhost:3001
# → Publisher: http://localhost:8001
```

---

## Environment Variables

See `.env.example` for all required variables.

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `REDIS_URL` | ✅ | Redis connection string |
| `JWT_SECRET` | ✅ | JWT signing secret (min 32 chars) |
| `JWT_REFRESH_SECRET` | ✅ | Refresh token secret |
| `AES_KEY` | ✅ | 32-byte hex key for cookie encryption |
| `OPENAI_API_KEY` | ✅ | OpenAI API key |
| `R2_ACCOUNT_ID` | ✅ | Cloudflare R2 account ID |
| `R2_ACCESS_KEY_ID` | ✅ | R2 access key |
| `R2_SECRET_ACCESS_KEY` | ✅ | R2 secret key |
| `R2_BUCKET_NAME` | ✅ | R2 bucket name |
| `R2_PUBLIC_URL` | ✅ | CDN/public URL for R2 bucket |

---

## Project Structure

```
xhs-agent/
├── apps/
│   ├── web/          # Next.js 14 frontend
│   ├── api/          # Fastify REST API
│   └── publisher/    # Python Playwright publisher
├── packages/
│   ├── shared/       # Shared TypeScript types
│   ├── db/           # Drizzle ORM schema
│   └── logger/       # Structured logging
├── infra/
│   ├── docker/       # Dockerfiles
│   └── railway/      # Railway configs
└── .github/
    └── workflows/    # CI/CD
```

---

## Publishing Disclaimer

The auto-publish feature uses browser automation (Playwright) to post on your behalf. This may violate Xiaohongshu's Terms of Service. Use at your own risk. The clipboard copy feature is always available as a safe alternative.

---

*Phase 3: Implementation — In Progress*
