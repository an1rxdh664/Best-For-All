# Setup Guide

This guide covers local development (no Docker), full Docker Compose, and the environment variables each service needs.

## 1. Prerequisites

- **Node.js** 20+
- **Python** 3.11+
- **PostgreSQL** database — this project is built against [Neon](https://neon.tech)'s serverless Postgres, but any Postgres 13+ instance works
- **Ollama** — [install locally](https://ollama.com/download), or use the Dockerized service
- **Docker + Docker Compose**, if using the containerized workflow
- **NVIDIA Container Toolkit**, only if you want GPU passthrough for Ollama inside Docker

## 2. Environment variables

Create a `.env.local` (for Next.js, local dev) and a `nlp/.env` (for the Python service). Nothing below should be committed with real values — see [`docs/SECURITY.md`](./SECURITY.md).

### Root `.env` / `.env.local` (Next.js app)

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | Postgres connection string (Neon or otherwise). Used by Prisma via `@prisma/adapter-pg`. |
| `AUTH_SECRET` (or `NEXTAUTH_SECRET`) | Yes | Secret used to sign JWTs/session tokens. Generate with `npx auth secret` or `openssl rand -base64 32`. |
| `GOOGLE_CLIENT_ID` | For Google login | OAuth client ID from Google Cloud Console. |
| `GOOGLE_CLIENT_SECRET` | For Google login | OAuth client secret. |
| `AUTH_TRUST_HOST` | In Docker | Set to `true`. Required for NextAuth v5 to trust the `Host` header when running behind Docker's networking. |
| `NEXTAUTH_URL` / `AUTH_URL` | In Docker/prod | Public URL of the app, e.g. `http://localhost:3000`. |
| `NEXTAUTH_URL_INTERNAL` / `AUTH_URL_INTERNAL` | In Docker | Internal container URL, e.g. `http://web:3000`. |
| `NLP_SERVICE_URL` | Yes | Base URL of the Python NLP service. Local dev default: `http://127.0.0.1:8000`. In Docker: `http://nlp-service:8000`. |
| `OLLAMA_HOST` | Yes | Base URL of the Ollama server. Local dev default: `http://127.0.0.1:11434`. In Docker: `http://ollama:11434`. |
| `OLLAMA_MODEL` | Yes | Model tag to use, e.g. `llama3.2` or `llama3.2:1b`. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | For OTP email verification | Credentials for the SMTP account used to send the 6-digit email verification code (`nodemailer`). |

### `nlp/.env` (Python NLP service)

| Variable | Required | Description |
|---|---|---|
| `GOOGLE_PLACES_API_KEY` | Optional | Enables Google Places search/enrichment when Overpass results are thin. |
| `FOURSQUARE_API_KEY` | Optional | Enables Foursquare search as an additional fallback. |
| `GOOGLE_SEARCH_API_KEY` | Optional | Enables Google Custom Search image lookups for place cards (`nlp_layer.py`). |
| `GOOGLE_CSE_ID` | Optional | Custom Search Engine ID paired with the key above. |


## 3. Local development (no Docker)

```bash
# --- Next.js app ---
npm install
npx prisma generate
npx prisma migrate deploy   # applies migrations in prisma/migrations
npm run dev                 # http://localhost:3000
```

```bash
# --- NLP service (separate terminal) ---
cd nlp
python -m venv venv
source venv/bin/activate     # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn api:app --reload --port 8000
```

```bash
# --- Ollama (separate terminal) ---
ollama serve
ollama pull llama3.2
```

By default, `useChat.ts` calls the browser Geolocation API on page load; you'll get a permission prompt in the chat UI. If you deny it, `lat`/`lon` are sent as `null` and the NLP service falls back to whatever default behavior `Phase_2.py` has for missing coordinates (results will not be distance-ranked meaningfully).

## 4. Docker Compose

```bash
docker compose up --build
```

This starts:

| Service | Purpose | Notes |
|---|---|---|
| `ollama` | LLM runtime | Exposes `11434`. Has a GPU reservation block by default — **remove `deploy.resources` from `docker-compose.yml` if your machine has no NVIDIA GPU**, or the service will fail to start. |
| `ollama-init` | One-shot init container | Waits for `ollama`'s healthcheck, then runs `ollama pull "$OLLAMA_MODEL"` automatically so you don't have to pull the model by hand. |
| `nlp-service` | Python FastAPI app | Built from `nlp/Dockerfile`. Reads `nlp/.env`. |
| `web` | Next.js app | Depends on `ollama-init` completing and `nlp-service` being healthy before starting. Reads `.env` and `.env.local`. |

Compose wires internal service-to-service URLs automatically via the `environment:` block on `web` (`NLP_SERVICE_URL=http://nlp-service:8000`, `OLLAMA_HOST=http://ollama:11434`) — you don't need to set these yourself in Docker, only for local (non-Docker) dev.

### GPU passthrough

If you do have an NVIDIA GPU and want to use it for Ollama inside Docker:

1. Install the [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) on the host.
2. Leave the `deploy.resources.reservations.devices` block in `docker-compose.yml` as-is.
3. Verify with `docker exec -it <ollama_container> nvidia-smi` after startup.

If you don't have a GPU, delete that block; Ollama will fall back to CPU inference (noticeably slower, especially for larger models — consider `llama3.2:1b` for CPU-only setups).

### Manually pulling a model

`ollama-init` should handle this automatically, but if you need to do it by hand:

```bash
docker exec -it best-for-all-ollama-1 ollama pull llama3.2
```

(Container name may differ — check with `docker ps`.)

## 5. Database migrations

Migrations live in `prisma/migrations/` and are checked into the repo. To apply them:

```bash
npx prisma migrate deploy
```

To create a new migration after editing `prisma/schema.prisma`:

```bash
npx prisma migrate dev --name <description>
```

If Prisma seems to ignore the `@prisma/adapter-pg` driver adapter (queries behave as if it isn't wired up), check:

1. `schema.prisma`'s `generator client` block includes `previewFeatures = ["driverAdapters"]`.
2. You've re-run `npx prisma generate` after any schema change (Prisma 7+ required — see `package.json`).
3. `lib/prisma.ts` is constructing the client with `new PrismaClient({ adapter })`, not a bare `new PrismaClient()`.

## 6. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Repeated `Overpass ... attempt N failed` warnings in NLP service logs | Public Overpass mirrors are rate-limiting or timing out — not a missing API key | Expected under load on free infra. Options: self-host Overpass, cache results, or rely on the Google Places fallback (needs `GOOGLE_PLACES_API_KEY`). |
| `AdapterError` from NextAuth on startup | Edge Runtime trying to load Node-only packages (`pg`, `ws`) | Make sure `middleware.ts` only imports `auth.config.ts` (not `auth.ts`), and that route handlers needing the adapter import from `auth.ts`. |
| NextAuth session/cookie issues inside Docker | Missing `AUTH_TRUST_HOST` | Set `AUTH_TRUST_HOST=true` in the `web` service environment. |
| `ollama` container fails to start in Compose | No NVIDIA GPU on host but GPU reservation still present | Remove the `deploy.resources` block from the `ollama` service in `docker-compose.yml`. |
| Ollama returns "model not found" | Model not pulled yet | Wait for `ollama-init` to finish, or pull manually (see above). |
| `useSearchParams()` build error | Next.js 16 requires a `Suspense` boundary around components using `useSearchParams()` | Already handled in `app/verify-otp/page.tsx` — replicate that pattern (wrap the component using the hook in `<Suspense>`) for any new pages that need it. |
| TypeScript build errors are silently passing | `next.config.ts` has `typescript.ignoreBuildErrors: true` | Temporary unblock from development — remove and fix underlying errors before a production release. |