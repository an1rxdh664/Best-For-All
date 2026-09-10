# Database Schema

PostgreSQL (Neon), managed via Prisma ORM. Schema source: `prisma/schema.prisma`. Migration history: `prisma/migrations/`.

The Prisma client is generated to a custom output path (`lib/generated/prisma`) rather than the default `node_modules/.prisma`, and is instantiated with the `@prisma/adapter-pg` driver adapter over a `pg.Pool` (see `lib/prisma.ts`) instead of Prisma's built-in connection engine.

## Entity overview

```
User ──< Account            (NextAuth OAuth accounts, e.g. Google)
User ──< Session            (NextAuth sessions — present in schema; JWT strategy means this table
                              is not the active session mechanism, see note below)
User ──1 UserPreferences    (per-user system prompt override, model info)
User ──< Conversation ──< Message ──< Attachment
VerificationToken            (standalone — email OTP verification, keyed by email + token)
```

## Models

### `User` (table: `users`)

| Field | Type | Notes |
|---|---|---|
| `id` | `String` (cuid) | Primary key |
| `name` | `String?` | Defaults to the local part of the email at registration if not supplied |
| `email` | `String?` unique | |
| `emailVerified` | `DateTime?` | Set by `/api/auth/verify-otp` on successful OTP check |
| `image` | `String?` | Profile picture (populated by Google OAuth) |
| `password` | `String?` | bcrypt hash; `null` for OAuth-only accounts |
| `createdAt` / `updatedAt` | `DateTime` | |

Relations: `accounts`, `sessions`, `conversations`, `userPreferences`.

### `Account` (table: `accounts`)

Standard Auth.js/NextAuth OAuth account linkage (provider, tokens, scopes). Unique on `[provider, providerAccountId]`.

### `Session` (table: `sessions`)

Standard Auth.js session table (`sessionToken`, `userId`, `expires`). **Note**: `auth.config.ts` sets `session: { strategy: "jwt" }`, so in the current configuration sessions are stateless JWTs, not rows in this table — this model exists as part of the standard PrismaAdapter schema and would become active if the session strategy were switched to `"database"`.

### `VerificationToken` (table: `verification_tokens`)

| Field | Type | Notes |
|---|---|---|
| `identifier` | `String` | The email address |
| `token` | `String` unique | The 6-digit OTP (also usable for Auth.js's own email-link flows, though this project's OTP routes manage it directly) |
| `expires` | `DateTime` | 10 minutes from creation, enforced in `/api/auth/verify-otp` |

Unique on `[identifier, token]`. Previous tokens for an email are deleted before a new one is issued (`/api/auth/send-otp`).

### `UserPreferences` (table: `user_preferences`)

| Field | Type | Notes |
|---|---|---|
| `userId` | `String` (PK, FK → `User.id`) | One-to-one with `User` |
| `systemPromptOverride` | `String?` (`@db.Text`) | Reserved for a future per-user custom system prompt |
| `modelInfo` | `Json?` | Reserved for future per-user model configuration |

This model exists in the schema but isn't yet populated or read anywhere in the current route handlers — it's forward-looking storage for per-user LLM customization.

### `Conversation` (table: `converstations` — note the schema's `@@map` has a typo)

| Field | Type | Notes |
|---|---|---|
| `convoId` | `String` (cuid, PK) | |
| `userId` | `String` (FK → `User.id`, cascade delete) | |
| `title` | `String` | Defaults to `"New Chat"`; renamed via `PATCH /api/conversations/[convoId]` or auto-set from the first message's text client-side |
| `isArchieved` | `Boolean` | Default `false` — not currently exposed by any route (reserved for a future archive feature); note the field name mirrors the same typo pattern as the table map |
| `isPinned` | `Boolean` | Default `false` — likewise not yet wired to a route |
| `userModelConfig` | `Json?` | Reserved for per-conversation model overrides |
| `createdAt` / `updatedAt` | `DateTime` | `updatedAt` is bumped on new messages and renames to drive sort order |

Indexed on `[userId, updatedAt desc]` to make "list my conversations, most recent first" efficient.

### `Message` (table: `messages`)

| Field | Type | Notes |
|---|---|---|
| `id` | `String` (cuid, PK) | Can be supplied by the client (`clientId`) at creation time for idempotent writes/offline sync |
| `convoId` | `String` (FK → `Conversation.convoId`, cascade delete) | |
| `senderType` | `SenderType` enum (`USER`, `ASSISTANT`, `SYSTEM`) | Only `USER`/`ASSISTANT` are currently written by the app |
| `content` | `String` (`@db.Text`) | |
| `tokenUsed` | `Int` | Default `0` — reserved for future token-usage tracking; not currently populated by any route |
| `metaData` | `Json?` | Reserved for future structured metadata (e.g. attaching the NLP service's raw cards to a message) |
| `createdAt` | `DateTime` | Can be supplied by the client to preserve original timestamps during localStorage migration |

Indexed on `[convoId, createdAt asc]` for efficient ordered retrieval within a conversation.

### `Attachment` (table: `attachments`)

| Field | Type | Notes |
|---|---|---|
| `id` | `String` (cuid, PK) | |
| `messageId` | `String` (FK → `Message.id`, cascade delete) | |
| `filePath` | `String` | |
| `fileType` | `String` | |

Defined in the schema but not currently created or read by any route handler — reserved for a future file-attachment feature in chat.

## Migrations

| Migration | What it added |
|---|---|
| `20260819212334_init` | Base NextAuth tables: `User`, `Account`, `Session`, `VerificationToken` |
| `20260820082513_add_user_password` | Added `password` to `User` for the Credentials provider |
| `20260824083101_add_chat_schema` | Added `Conversation`, `Message`, `Attachment`, `UserPreferences`, and the `SenderType` enum |

To apply migrations: `npx prisma migrate deploy`. To create a new one after a schema change: `npx prisma migrate dev --name <description>`.

## Driver adapter note

`schema.prisma`'s `generator client` block must include `previewFeatures = ["driverAdapters"]` for `lib/prisma.ts`'s `new PrismaClient({ adapter })` construction (using `@prisma/adapter-pg`) to actually take effect — without it, Prisma silently falls back to its default connection engine instead of routing through the provided `pg.Pool`/adapter. Always re-run `npx prisma generate` after touching the schema.
