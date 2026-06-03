# Redis Cache, Rate Limit, and Realtime Fanout

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan follows the requirements in `PLANS.md` at the repository root.

## Purpose / Big Picture

BracketIQ currently works without Redis, but several backend capabilities are process-local or database-only. After this change, the backend will have a reusable Redis layer for short-lived cache entries, route-level rate limiting, and cross-process match realtime fanout. A user can see the change working by starting the app with `REDIS_URL` set, hitting cached public organization API responses, seeing abuse-sensitive routes return HTTP 429 when a limit is exceeded, and running multiple server processes that receive the same match realtime messages through Redis Pub/Sub. When `REDIS_URL` is absent, the app should still start and should use safe local fallbacks where appropriate.

## Progress

- [x] (2026-06-03 20:25Z) Read `PLANS.md`, package configuration, Prisma singleton, custom websocket server, realtime publisher, auth routes, and public organization API routes.
- [x] (2026-06-03 20:25Z) Resolved current `node-redis` documentation with Context7 and confirmed client URL setup, dedicated Pub/Sub connections, and `SET`/expiration option syntax.
- [x] (2026-06-03 20:27Z) Added `redis` as an npm dependency.
- [x] (2026-06-03 20:31Z) Added a lazy Redis client helper that does not connect at import time.
- [x] (2026-06-03 20:34Z) Added reusable JSON cache helpers with Redis as the primary backend and an in-memory fallback when Redis is not configured.
- [x] (2026-06-03 20:37Z) Cached public organization catalog, events, products, rentals, and teams APIs with a 30-second TTL and visible cache-status headers.
- [x] (2026-06-03 20:42Z) Added reusable route-level rate limiting with Redis as the primary backend and in-memory fallback, then applied it to selected auth and realtime-token routes.
- [x] (2026-06-03 20:49Z) Added Redis Pub/Sub publishing from match update route handlers and subscription fanout in `server.mjs`.
- [x] (2026-06-03 20:56Z) Added focused Jest coverage for cache, rate limiting, and realtime envelope behavior.
- [x] (2026-06-03 21:01Z) Ran targeted tests and TypeScript validation.

## Surprises & Discoveries

- Observation: Match realtime currently uses `globalThis.__mvpMatchRealtimeBroadcast` from `server.mjs`, so updates only reach clients connected to the same Node process.
  Evidence: `src/server/realtime/matchRealtime.ts` calls the process-local broadcaster, and `server.mjs` stores connected websocket clients in a local `Map`.

- Observation: The route tests import auth handlers directly and often reuse localhost-style requests.
  Evidence: `src/app/api/auth/__tests__/authRoutes.test.ts` imports route functions such as `POST as LOGIN_POST`; rate limiting should bypass by default in Jest to avoid unrelated test churn.

- Observation: The concrete generic type returned by `createClient({ url })` did not assign cleanly to a broad `ReturnType<typeof createClient>` alias under the repository TypeScript settings.
  Evidence: `npx tsc --noEmit` failed on `src/lib/redis.ts` until the Redis helper exposed a narrow local interface containing only the commands the app uses.

## Decision Log

- Decision: Redis must be optional for local development and tests. If `REDIS_URL` is not set, cache and rate limit helpers use process-local memory where useful, and realtime remains process-local.
  Rationale: The repository currently starts without Redis. Making Redis mandatory would turn an infrastructure improvement into a breaking local setup change.
  Date/Author: 2026-06-03 / Codex

- Decision: The first public API cache integration will use short TTLs instead of write-path invalidation.
  Rationale: Short-TTL caching gives immediate read performance value without touching many event, product, rental, team, or organization mutation paths. This keeps the first integration low risk.
  Date/Author: 2026-06-03 / Codex

- Decision: Rate limiting will be route-level, not Next middleware.
  Rationale: Route handlers already run in the Node server context and can use the Redis client helper. Middleware can run in different runtimes and would be a larger architecture shift.
  Date/Author: 2026-06-03 / Codex

- Decision: Realtime Redis messages will use an envelope with an origin id and the existing client-facing message nested inside it.
  Rationale: The publishing process can still broadcast immediately to its own websocket clients while other processes receive the Redis message. The origin id lets a process ignore its own Redis echo and prevents duplicate messages.
  Date/Author: 2026-06-03 / Codex

## Outcomes & Retrospective

Implemented the first Redis integration slice. The app now has a lazy Redis client, JSON cache helpers with memory fallback, public organization API caching, route-level rate limiting with memory fallback, and Redis Pub/Sub fanout for match realtime across server processes. Validation passed with targeted Jest suites and `npx tsc --noEmit`. A full multi-process Redis websocket manual test still requires a running Redis service and two local server processes.

## Context and Orientation

The repository is a TypeScript Next.js App Router application with a custom Node server in `server.mjs`. Database access uses Prisma through `src/lib/prisma.ts`, which lazily creates one Prisma client per process. Auth routes live under `src/app/api/auth`. Public organization read APIs live under `src/app/api/public/organizations/[slug]`. Match update route handlers call `publishEventMatchChanges` from `src/server/realtime/matchRealtime.ts`. The custom websocket server in `server.mjs` accepts `/api/realtime/matches` upgrades and stores websocket clients in memory by `eventId`.

Redis is an in-memory data store accessed over the network. In this plan it has three roles. A cache stores short-lived JSON responses so repeated public reads avoid repeat database work. A rate limiter counts requests by route and identity inside a time window so repeated abusive requests can receive HTTP 429. Pub/Sub means publish/subscribe: one process publishes a message to a named Redis channel, and every process subscribed to that channel receives the message.

## Plan of Work

First, add the `redis` package and create `src/lib/redis.ts`. This module should lazily connect only when `REDIS_URL` is present. It should log connection errors, return `null` when Redis is unavailable, and avoid throwing during normal request handling.

Second, create `src/server/cache.ts`. This module should expose functions to read and write JSON values by key with a TTL in seconds. It should use Redis when configured and otherwise use a bounded in-memory map with expiration. Public organization catalog routes should use these helpers for short-lived cache entries and set a cache-status response header.

Third, create `src/server/rateLimit.ts`. This module should expose fixed-window request counting by policy name, limit, and window length. Route helpers should derive an identity from forwarded IP headers. When a limit is exceeded, the helper should return a standard JSON HTTP 429 response with `Retry-After` and rate-limit headers. In Jest, route-level limiting should be bypassed by default, while direct rate limiter tests should still exercise the limiter.

Fourth, update realtime publishing. `src/server/realtime/matchRealtime.ts` should continue to produce the same client-facing `match.changed` message, broadcast locally through the existing global hook, and publish a Redis envelope when Redis is configured. `server.mjs` should create a Redis subscriber when `REDIS_URL` exists, listen on the match realtime channel, ignore envelopes from its own origin id, and rebroadcast remote messages through the same local websocket client map.

Finally, add focused Jest tests for the helper modules and update existing realtime tests. Run targeted tests first, then `npx tsc --noEmit`.

## Concrete Steps

From `C:\Users\samue\Documents\Code\mvp-site`, install the dependency:

    npm install redis

Then edit the files named in the plan. After the edits, run targeted tests:

    npm test -- src/server/__tests__/cache.test.ts src/server/__tests__/rateLimit.test.ts src/server/realtime/__tests__/matchRealtime.test.ts

Then run TypeScript:

    npx tsc --noEmit

If broader confidence is needed, run:

    npm run test:ci

## Validation and Acceptance

The helper tests should show that JSON values can be cached and expire, that rate limit counters allow requests until the configured limit and then block with reset metadata, and that realtime publishing builds a Redis envelope without changing the client-facing websocket message.

With a local Redis server available, set `REDIS_URL` to the Redis URL and start the app:

    $env:REDIS_URL='redis://localhost:6379'
    npm run dev:plain

Call a cached public organization endpoint twice. The first successful response should include a cache miss or local bypass status, and the second should include a cache hit when Redis or memory cache is active. Exceeding a configured route limit should return HTTP 429 with a JSON body containing `Too many requests`.

For realtime, start two server processes with the same Redis URL and connect websocket clients to the same event on both processes. A match update issued through one process should reach clients connected to the other process.

## Idempotence and Recovery

All code changes are additive or narrowly scoped. If Redis is unavailable, the app should continue without crashing. Running tests repeatedly should be safe because cache and rate-limit test helpers will clear in-memory state. If a Redis connection fails, the client helper should retry later instead of permanently poisoning the process.

## Artifacts and Notes

Context7 confirmed that `node-redis` supports URL-based clients with `createClient({ url })`, dedicated Pub/Sub connections, and key expiration options such as `EX`.

Validation evidence:

    npm test -- src/server/__tests__/cache.test.ts src/server/__tests__/rateLimit.test.ts src/server/realtime/__tests__/matchRealtime.test.ts
    PASS src/server/__tests__/rateLimit.test.ts
    PASS src/server/__tests__/cache.test.ts
    PASS src/server/realtime/__tests__/matchRealtime.test.ts
    Test Suites: 3 passed, 3 total
    Tests: 11 passed, 11 total

    npm test -- src/app/api/auth/__tests__/authRoutes.test.ts src/app/api/auth/verify/__tests__/route.test.ts src/app/api/auth/google/mobile/__tests__/googleMobileRoute.test.ts src/app/api/auth/apple/mobile/__tests__/appleMobileRoute.test.ts
    Test Suites: 4 passed, 4 total
    Tests: 25 passed, 25 total

    npx tsc --noEmit
    exited successfully

    node --check server.mjs
    exited successfully

## Interfaces and Dependencies

The `redis` npm package is the only new dependency.

`src/lib/redis.ts` must export:

    getRedisClient(): Promise<RedisClient | null>
    isRedisConfigured(): boolean
    closeRedisClient(): Promise<void>

`src/server/cache.ts` must export:

    getJsonCache<T>(key: string): Promise<CacheReadResult<T>>
    setJsonCache(key: string, value: unknown, ttlSeconds: number): Promise<CacheWriteResult>
    getOrSetJsonCache<T>(key: string, ttlSeconds: number, loader: () => Promise<T | null>): Promise<CacheLoadResult<T>>

`src/server/rateLimit.ts` must export:

    checkRateLimit(options: RateLimitOptions): Promise<RateLimitResult>
    applyRateLimit(req: NextRequest, policy: RateLimitPolicy): Promise<NextResponse | null>

`src/server/realtime/matchRealtime.ts` must continue to export `publishEventMatchChanges` with the same synchronous return type so existing route handlers do not need to await it.
