# API Reference

Two HTTP surfaces exist: the **Next.js app** (`app/api/**`) and the standalone **Python NLP service** (`nlp/api.py`). All Next.js routes below run on the Node.js runtime (`export const runtime = 'nodejs'`) unless noted, since several depend on the Prisma client.

Routes under `/dashboard/*` and `/chat/*`, plus `/api/protected/*`, are gated by `middleware.ts` — unauthenticated requests are redirected per the `authorized()` callback in `auth.config.ts`.

---

## Next.js app routes

### Chat

#### `POST /api/chat`

Orchestrates a single chat turn: calls the NLP service, then Ollama.

**Body**
```json
{
  "messages": [{ "role": "user", "content": "nearest biryani under 300" }],
  "convoId": "clx1234...",
  "lat": 17.385,
  "lon": 78.4867
}
```

**Response**
```json
{ "reply": "There's a great biryani spot about 800m away that fits your budget..." }
```

Behavior notes:
- `convoId` is passed through to the NLP service as `session_id`, so follow-up messages in the same conversation reuse prior search context.
- If the NLP service call fails, the route does **not** fail the request — it falls back to `{ intent: "nlp_unavailable", cards: [] }` and lets Ollama respond conversationally without structured data.
- On error (e.g. Ollama unreachable), returns `500` with `{ "error": "Failed to communicate with local model." }`.

---

### Conversations

All conversation routes require an authenticated session (`auth()` from `@/auth`); unauthenticated calls return `401`.

#### `GET /api/conversations`

Returns all conversations for the current user, each with its messages, ordered by `updatedAt desc`.

```json
{ "conversations": [ { "convoId": "...", "title": "...", "message": [ /* ... */ ] } ] }
```

#### `POST /api/conversations`

Creates a new, empty conversation titled `"New Chat"` for the current user.

```json
{ "conversation": { "convoId": "...", "title": "New Chat", "message": [] } }
```

#### `GET /api/conversations/[convoId]`

Returns a single conversation (with ordered messages) if it belongs to the current user. `404` if not found or not owned by the caller.

#### `PATCH /api/conversations/[convoId]`

Renames a conversation.

**Body**: `{ "title": "New title" }`

Returns the updated conversation. `404` if not found/not owned.

#### `DELETE /api/conversations/[convoId]`

Deletes a conversation (and, via cascade, its messages/attachments). `404` if not found/not owned.

```json
{ "success": true }
```

---

### Messages

#### `POST /api/messages`

Persists a single message, creating a new conversation on the fly if `convoId` is omitted.

**Body**
```json
{
  "convoId": "clx1234...",
  "clientId": "uuid-generated-client-side",
  "sender": "user",
  "content": "nearest biryani under 300",
  "createdAt": "2026-09-04T12:00:00.000Z"
}
```

- `sender` is `"user"` or anything else (mapped to `ASSISTANT`).
- Deduplication: if `clientId` matches an existing message ID, the existing message is returned as-is (no duplicate created). If no `clientId` is given but `createdAt` matches an existing message with the same content in the same conversation, that's treated as a duplicate too.
- Requires authentication (`401` otherwise). Returns `403` if the conversation exists but belongs to a different user, `404` if `convoId` was given but doesn't exist.

```json
{ "message": { "id": "...", "content": "...", "senderType": "USER", "..." } }
```

---

### Auth

#### `GET|POST /api/auth/[...nextauth]`

Standard NextAuth v5 catch-all route (sign-in, sign-out, callback, session, CSRF, providers) — delegates entirely to `handlers` from `@/auth`. Configured providers: **Google OAuth** and **Credentials** (email + bcrypt-hashed password).

#### `POST /api/auth/register`

Creates a new user with a hashed password.

**Body**: `{ "email": "...", "password": "...", "name"?: "..." }`

- `password` must be ≥ 6 characters.
- `409` if a user with that email already exists.
- On success (`201`): `{ "success": true, "user": { "id", "email", "name" } }`. Note this endpoint does **not** log the user in — the client (`app/register/page.tsx`) separately calls `signIn("credentials", ...)` right after.

#### `POST /api/auth/send-otp`

Generates a 6-digit OTP, stores it as a `VerificationToken` (10-minute expiry, replacing any prior token for that email), and emails it via `nodemailer`/SMTP.

**Body**: `{ "email": "..." }` → `{ "success": true, "message": "OTP sent successfully" }`

#### `POST /api/auth/verify-otp`

Validates a submitted OTP against the stored `VerificationToken`, and if valid and unexpired, sets `user.emailVerified` to the current timestamp and deletes the token.

**Body**: `{ "email": "...", "otp": "123456" }`

- `400` for a missing/invalid/expired token (expired tokens are deleted as a side effect).
- `404` if no user exists for that email (also deletes the token).
- `200`: `{ "success": true, "message": "Email Verified Successfully" }`

#### `POST /api/auth/email-verified`

Lightweight check used by the UI (e.g. the profile dashboard) to poll verification status.

**Body**: `{ "email": "..." }` → `{ "verified": true | false }`

#### `GET|POST /api/auth/protected`

Currently an **empty/unimplemented route file** — matched by the `middleware.ts` matcher (`/api/protected/:path*`) as a placeholder for future protected API endpoints, but has no handlers defined yet.

---

### Data migration

#### `POST /api/migrate-localStorage`

Migrates a client's `localStorage`-held conversation history into Postgres once they sign in. Called automatically by `AuthSyncListener` — not intended to be called manually by the UI.

**Body**
```json
{
  "userId": "clx...",
  "localConversations": [
    {
      "id": "client-generated-uuid",
      "title": "New Chat",
      "updatedAt": "2026-09-04T12:00:00.000Z",
      "messages": [ { "id": "...", "sender": "user", "content": "...", "createdAt": "..." } ]
    }
  ]
}
```

- Idempotent: matches on client-provided conversation/message IDs, so repeated calls (e.g. logging in again) won't create duplicates. If a conversation with the same `id` already exists, its `updatedAt` is bumped only if the incoming data is newer.
- `400` if `userId` is missing or `localConversations` is empty/not an array.

---

## Python NLP service (`nlp/api.py`)

Base URL: `NLP_SERVICE_URL` (default `http://127.0.0.1:8000` in local dev, `http://nlp-service:8000` inside Docker).

#### `GET /`

Health check.

```json
{ "status": "ok", "message": "Geo-Food WebSocket API is running. Connect to /ws/chat." }
```

#### `POST /query`

The primary endpoint — called by the Next.js `/api/chat` route.

**Body**
```json
{
  "query": "nearest biryani under 300",
  "lat": 17.385,
  "lon": 78.4867,
  "top_k": 5,
  "session_id": "convoId-from-nextjs"
}
```

- `session_id` is optional. If provided, the service reuses/creates an in-memory `GeoFoodSession` for that ID so follow-up questions work; if omitted, each call is a fresh, stateless one-off session with no follow-up memory.
- `lat`/`lon` are optional but needed for meaningful distance-based ranking.

**Response** (structured, no prose — this is the contract Ollama's system prompt relies on)
```json
{
  "intent": "search | followup | error | ...",
  "message": "optional short status/error text",
  "cards": [
    {
      "name": "...",
      "score": 0.83,
      "score_components": { "preference_score": 0.7, "rating_score": 0.9, "...": "..." },
      "distance_km": 0.8,
      "is_open_now": true,
      "primary_link": "https://...",
      "evidence": ["..."]
    }
  ]
}
```

If the underlying `GeoFoodSession` isn't available (misconfiguration) or an exception occurs mid-request, this returns `{ "intent": "error", "message": "...", "cards": [] }` with a `200` status — the Next.js caller treats a thrown fetch error (non-2xx or network failure) as its trigger for the `nlp_unavailable` fallback, not this in-band error shape, so a malformed pipeline error here will still reach Ollama as data.

#### `WS /ws/chat?lat=<float>&lon=<float>&top_k=<int>`

A standalone conversational WebSocket, independent from the `/query` + Ollama pipeline used by the main app — useful for manually testing the pipeline's conversational behavior without the Next.js/Ollama layer in between.

- One `GeoFoodSession` is created per WebSocket connection (not shared across connections).
- Client sends plain text messages; server responds with:
  ```json
  { "type": "message", "text": "<natural-language reply from handle_message>" }
  ```
- Unlike `/query`, this returns the pipeline's own rule-based natural-language text (`session.handle_message`, not `handle_message_structured`) — no LLM involved on this path at all.