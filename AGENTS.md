<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This project runs Next.js **16.2.10** with React **19.2.4** — both have breaking changes versus older training data (App Router conventions, async `cookies()`/`headers()`, route handler signatures, caching defaults). Read the relevant guide in `node_modules/next/dist/docs/` (especially `01-app/03-api-reference/`) before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# LinHub

Multi-model AI assistant web app. Users chat with LLMs (OpenAI / Anthropic / Google / DeepSeek / Zhipu / Xiaomi) configured by an admin, with tools (web search via Tavily, vision, MCP servers, knowledge-base RAG, artifacts, memory), usage billing, subscription plans, and an admin console.

- **Runtime**: Next.js 16 (App Router) + React 19 + TypeScript (strict) + Tailwind v4 + Drizzle ORM (PostgreSQL with `pgvector`).
- **Auth**: `better-auth` (email/password, sessions stored in DB). First registered user becomes admin.
- **AI**: Vercel AI SDK (`ai` v7) with multi-provider registry resolved from DB at runtime.

## Commands

```bash
npm run dev          # dev server (http://localhost:3000)
npm run build        # production build
npm run lint         # eslint (flat config, eslint.config.mjs)
npm run db:push      # push drizzle schema -> DB (drizzle-kit)
npm run db:studio    # drizzle-kit studio
```

There is **no test runner** configured. For typechecking use `npx tsc --noEmit`.

Local Postgres (with pgvector) is provided via `docker-compose up -d` (exposed on host port **5433**, user/db `linhub`). The schema lives in `src/lib/server/db/schema.ts`.

Required env vars (see `.env.example`): `DATABASE_URL`, `BETTER_AUTH_SECRET`, `ENCRYPTION_KEY` (≥32 chars, AES-256; rotating it breaks stored provider API keys). `assertEnv()` in `src/lib/server/env.ts` fails fast on missing config.

## Architecture & layer rules

- `src/app/(app)/` — authenticated UI routes (chat, projects, knowledge, skills, billing, settings, admin). Route group `(app)` shares the app shell.
- `src/app/api/` — Route Handlers. `api/admin/**` requires admin; most others require a session.
- `src/lib/server/` — **server-only** code (DB, auth, billing, LLM, crypto, rate-limiting, payment, SSRF guard). Never import anything under here into client components.
- `src/lib/data/` — `DataService` abstraction selected by `NEXT_PUBLIC_DATA_SOURCE` (`mock` = offline UI demo, `api` = real backend). Frontend reads data through `getDataService()`, not directly.
- `src/components/` — React components (`chat/`, `artifacts/`, `shell/`, `ui/`, `auth/`). `ui/` holds primitives (button, dialog, input…) built on `radix-ui` + `cva` + `tailwind-merge`.
- `src/lib/hooks/`, `src/lib/types.ts` — shared client types and hooks.

### Conventions every edit should follow

- **Path alias**: import via `@/*` (maps to `src/*`). Do not use relative paths that cross `lib/server` into client code.
- **Auth in route handlers**: call `requireSession()` for user routes, `requireAdmin()` for `api/admin/**`. They throw `{ status: 401|403 }`. Most read endpoints also call `await ensureSeeded()` first to bootstrap default settings/providers.
- **Errors**: throw `BillingError` (from `src/lib/server/billing.ts`) for user-facing billing/permission errors — its message is shown verbatim to the user without admin-debug suffixes.
- **Secrets**: provider API keys are encrypted at rest (`encryptSecret`/`decryptSecret` in `src/lib/server/crypto.ts`) and masked in API responses (`maskSecret`). Never return raw keys.
- **SSRF**: any server-side fetch of a user-supplied URL (MCP, web tools, image fetch) must go through `assertSafeUrl()` in `src/lib/server/net-guard.ts`. `ALLOW_LOCAL_MCP=true` / non-production relaxes localhost blocking.
- **LLM resolution**: models are looked up via `resolveModel(modelId)` in `src/lib/server/llm/registry.ts` (joins provider + decrypts key + maps to the right SDK). Cost is computed with `computeCostCents()`. Add new provider kinds here and in `DEFAULT_BASE_URLS`.
- **Rate limiting / billing**: chat & expensive endpoints call `rateLimit(...)` and `assertCanSpend(userId)` before work, then `recordUsage(...)` after. Don't bypass pre-checks.
- **IDs**: use `crypto.randomUUID().replace(/-/g, "").slice(0, 16)` (see the local `uid()` helpers) — keep the same scheme when inserting rows.
- **Streaming route**: `api/chat/route.ts` exports `maxDuration = 300` and streams via the AI SDK; preserve that pattern when adding streaming endpoints.
- **Chinese is the working language** for UI strings, code comments, and error messages — match the surrounding files.

## Gotchas

- Next.js 16 makes `cookies()`, `headers()`, `params`, and `searchParams` **async** — always `await` them. Check `node_modules/next/dist/docs/` when touching route handlers or server components.
- `DATABASE_URL` default in `drizzle.config.ts` points at port **5433** (compose-mapped), not 5432.
- `usePlural: true` in the better-auth drizzle adapter — auth table names are plural (`users`, `sessions`, …) and the schema must stay aligned.
- Provider kinds `zhipu` and `xiaomi` reuse the OpenAI-compatible client (`.chat(slug)`), not their own SDK.
- Money is stored as integer **cents** (`balanceCents`, `*_cents` columns, `computeCostCents`) — never use floats for money.
- `PAYMENT_MOCK_ENABLED=true` makes orders succeed instantly; **never** enable in production.
