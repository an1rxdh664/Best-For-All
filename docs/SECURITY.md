# Security Notes

Read this before deploying this project anywhere reachable from the internet, and before making the repository public.

## Findings

### `next.config.ts`: `typescript.ignoreBuildErrors: true`

This was added as a temporary unblock during active development. It means the production build will succeed even if there are real type errors, which can mask bugs (including ones with security implications, like an incorrectly typed auth check). Remove this before a production release and fix any underlying type errors.

### Empty `/api/protected` route

`app/api/auth/protected/route.ts` is currently an empty file with no exported handlers, despite being matched by `middleware.ts`'s route matcher. This isn't a vulnerability by itself (an empty route file exports nothing, so Next.js has no handler to invoke), but it's worth resolving — either implement it or remove it from the matcher — so its presence doesn't create confusion about what's actually protected.

### `NextAuth` Edge/Node split is a hardening point, not just a build fix

The reason `auth.config.ts` and `auth.ts` are split (see [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md#authentication-architecture)) is partly about avoiding Edge Runtime crashes, but it's also worth remembering as a security boundary: `middleware.ts` only ever sees the Edge-safe config (providers + the `authorized()` callback), and never has access to the Prisma adapter or raw credential-checking logic. Keep it that way — don't import `auth.ts` into `middleware.ts` even if a future refactor seems to make it convenient, since that reintroduces the Node/Edge conflict this split was built to avoid.

### JWT session secret

`AUTH_SECRET` (or `NEXTAUTH_SECRET`) is what signs session JWTs. Make sure this is:
- Set to a long, random value (`openssl rand -base64 32` or `npx auth secret`) — never left blank or using a development placeholder in any deployed environment.
- Different per environment (dev/staging/prod) — a shared secret across environments means a token issued in one is valid in another.
- Not committed to source control.

### OTP verification flow

`/api/auth/send-otp` and `/api/auth/verify-otp` implement a 6-digit, 10-minute email OTP flow. Points worth hardening before wider deployment:
- There's currently no visible rate limiting on `send-otp` — an attacker could request many OTPs for a target email in quick succession (mailbox flooding) or attempt to brute-force a 6-digit OTP against `verify-otp` within its 10-minute window (1,000,000 possibilities is brute-forceable quickly without a rate limit or attempt cap). Consider adding both.
- OTPs are stored in plaintext in `VerificationToken.token`. For a 6-digit, short-lived, single-use code this is a common and reasonable tradeoff, but note it explicitly if a security review asks about it.

### SMTP credentials

`SMTP_USER` / `SMTP_PASSWORD` (used for sending OTP emails via `nodemailer`) should be treated as sensitive as any other secret — scoped to a dedicated sending account/app password rather than a personal email account's main credentials where possible.

### Password hashing

Passwords are hashed with `bcryptjs` at a cost factor of 10 (`bcrypt.hash(password, 10)`) — a reasonable default. No password complexity requirements are enforced beyond a 6-character minimum length (`app/api/auth/register/route.ts`); consider whether that minimum is sufficient for your threat model before wider release.

## General checklist before going beyond local/pilot use

- [ ] Remove `typescript.ignoreBuildErrors` from `next.config.ts`.
- [ ] Add rate limiting to `/api/auth/send-otp` and `/api/auth/verify-otp`.
- [ ] Set a strong, environment-specific `AUTH_SECRET`.
- [ ] Set `AUTH_TRUST_HOST=true` only in environments where you control/trust the reverse proxy setting the `Host` header.
- [ ] Review CORS/network exposure of the NLP service (`nlp-service:8000`) and Ollama (`ollama:11434`) — in the current Docker Compose setup neither has authentication, and both are only intended to be reachable from the `web` service, not the public internet. Don't publish their ports externally in a production deployment.