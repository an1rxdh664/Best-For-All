# Best Of All

A hyperlocal food & beverage discovery platform with a conversational AI layer. Instead of scrolling through generic listings, users describe what they want in plain language ("nearest biryani under 300", "best dessert place near me that's open now") and get matched, location-aware recommendations — with a particular focus on surfacing newly opened places that haven't been indexed by the big aggregators yet.

This is a pilot build, intentionally scoped to a single city with manually seeded/enriched shop data rather than a global, PostGIS-backed system.

> 📚 Looking for deeper docs? See the [`docs/`](./docs) folder:
> - [Architecture](./docs/ARCHITECTURE.md) — how the three services fit together
> - [Setup Guide](./docs/SETUP.md) — local dev, Docker, and environment variables
> - [NLP Pipeline](./docs/NLP_PIPELINE.md) — how a query becomes a ranked list of places
> - [API Reference](./docs/API_REFERENCE.md) — every HTTP/WebSocket endpoint
> - [Database Schema](./docs/DATABASE.md) — Prisma models and relations
> - [Security Notes](./docs/SECURITY.md) — **read this before deploying anywhere**

---

## What it does

1. A user opens the chat UI and (optionally) shares their browser geolocation.
2. They type a natural-language request — a dish, a budget, a vibe, a follow-up like "show me the second one."
3. A Python NLP service parses intent, queries OpenStreetMap (via Overpass) and optionally Google Places / Foursquare, scores and ranks candidate places, and returns **structured JSON** (no prose).
4. That JSON is handed to a local LLM (Ollama, running `llama3.2`) as context, which turns it into a natural, conversational reply.
5. Conversations and messages are persisted per-user in Postgres (Neon), with a localStorage fallback for anonymous/offline use that migrates to the database automatically on sign-in.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4 |
| Auth | NextAuth v5 (beta) — Google OAuth + email/password credentials, OTP email verification |
| Database | PostgreSQL on [Neon](https://neon.tech) (serverless), Prisma ORM 7 with the `@prisma/adapter-pg` driver adapter |
| NLP service | Python, FastAPI, BeautifulSoup — rule-based intent parsing and geo-search (no LLM call inside this layer) |
| Generative layer | [Ollama](https://ollama.com) running `llama3.2` locally — the only LLM in the pipeline |
| Geodata sources | OpenStreetMap Overpass API (primary), Google Places API and Foursquare (fallback/enrichment) |
| Deployment | Docker Compose (`ollama`, `nlp-service`, `web` services) |

See [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for a full diagram and request-flow walkthrough.

## Project structure

```
.
├── app/                      # Next.js App Router
│   ├── api/                  # Route handlers (chat, auth, conversations, messages)
│   ├── chat/                 # Chat UI page
│   ├── dashboard/            # Post-login landing page
│   ├── register/             # Sign-up page
│   └── verify-otp/           # Email OTP verification page
├── components/
│   ├── chat/                 # Sidebar, ChatCanvas, MascotFace
│   ├── AuthSyncListener.tsx  # Migrates localStorage chats to DB on login
│   └── ProfileDashboard.tsx  # Account modal (profile picture → dashboard)
├── hooks/
│   └── useChat.ts            # All chat state, persistence, and API orchestration
├── lib/
│   ├── prisma.ts             # Prisma client (pg driver adapter over Neon)
│   └── migrateChatHistory.ts # localStorage → Postgres migration helper
├── nlp/                      # Standalone Python FastAPI service
│   ├── api.py                # FastAPI app: POST /query, WS /ws/chat
│   ├── final.py               # GeoFoodSession — conversational context wrapper
│   ├── Phase_2.py             # Core geo-search, scraping, scoring pipeline
│   └── nlp_layer.py           # Rule-based card/summary formatting (no LLM)
├── prisma/
│   └── schema.prisma          # User, Conversation, Message, Attachment, etc.
├── auth.config.ts             # Edge-safe NextAuth config (used by middleware)
├── auth.ts                    # Full NextAuth config (Prisma adapter, Node-only)
├── middleware.ts               # Route protection for /dashboard and /chat
├── docker-compose.yml          # ollama + nlp-service + web
└── Dockerfile                  # Multi-stage build for the Next.js app
```

## Prerequisites

- Node.js 20+
- Python 3.11+
- A PostgreSQL database (this project targets [Neon](https://neon.tech)'s serverless Postgres, but any Postgres works)
- [Ollama](https://ollama.com) installed locally, or Docker with the bundled `ollama` service
- Docker + Docker Compose, if you want the containerized setup (GPU passthrough optionally via NVIDIA Container Toolkit)

## Quick start (local dev, no Docker)

```bash
# 1. Install JS dependencies
npm install

# 2. Set up environment variables (see docs/SETUP.md for the full list)
cp .env.example .env.local   # create this file — see Setup Guide

# 3. Generate the Prisma client and run migrations
npx prisma generate
npx prisma migrate deploy

# 4. Start the Python NLP service (in a separate terminal)
cd nlp
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn api:app --reload --port 8000

# 5. Start Ollama and pull the model (in a separate terminal)
ollama serve
ollama pull llama3.2

# 6. Start the Next.js dev server
npm run dev
```

Visit `http://localhost:3000`.

## Quick start (Docker Compose)

```bash
docker compose up --build
```

This brings up three services: `ollama` (+ `ollama-init` to auto-pull the model), `nlp-service`, and `web`. See [`docs/SETUP.md`](./docs/SETUP.md) for required `.env` values, GPU configuration, and troubleshooting steps for common issues (Overpass rate-limit warnings, Prisma adapter not being picked up, etc).

## Status

This is an active pilot. Known rough edges and near-term plans are tracked in [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md#known-limitations--roadmap).