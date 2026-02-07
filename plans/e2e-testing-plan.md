# E2E Testing Suite for MVP Site (Playwright + Scheduler Parity)

This ExecPlan is a living document. The sections Progress, Surprises & Discoveries, Decision Log, and Outcomes & Retrospective must be kept up to date as work proceeds.

This ExecPlan is maintained in accordance with mvp-site/PLANS.md from the repository root.

## Purpose / Big Picture

After this work, the MVP site will have a full end-to-end test suite that exercises the core user flows (event creation, event joining, rental creation, rental purchasing) and validates the backend scheduler against the legacy Python brackets logic. A developer can run a single Playwright command locally and see green tests that prove the UI makes correct API calls, payments can be exercised in test mode, and the schedule generation logic produces deterministic, expected bracket structures and error messages for edge cases. This will materially reduce regressions in the scheduler and critical booking flows.

## Progress

- [x] (2026-02-06 00:00Z) Drafted ExecPlan with dependency-aware tasks and validation steps.
- [x] (2026-02-06 11:10Z) Implement Playwright tooling, configs, and scripts.
- [x] (2026-02-06 11:40Z) Add deterministic database seeding and reset for E2E.
- [x] (2026-02-06 12:55Z) Implement scheduler parity E2E tests.
- [x] (2026-02-06 15:10Z) Implement UI E2E tests for event creation, joining, rental creation, rental purchasing.
- [x] (2026-02-06 15:16Z) Validate locally and document CI/staging readiness (last recorded run: `event-create.spec.ts` passed; full suite still needs a complete run).

## Surprises & Discoveries

- Scheduler fixtures are generated via a TypeScript helper (`e2e/scripts/generate-scheduler-fixtures.ts`) using `serializeMatchesLegacy` + canonicalization, rather than a direct Python export.

## Decision Log

- Decision: Use Playwright as the E2E runner and keep tests in a dedicated mvp-site/e2e directory.
  Rationale: Playwright is the requested framework and supports both UI and API testing with request fixtures, letting us validate frontend payloads and backend scheduler responses in one suite.
  Date/Author: 2026-02-06 / Codex

- Decision: Use Prisma-driven seed scripts to provide deterministic fixtures for auth, events, rentals, and scheduler tests.
  Rationale: The backend schedule route loads relations from the database; deterministic fixtures are needed to make scheduler output stable and comparable to the legacy Python logic.
  Date/Author: 2026-02-06 / Codex

- Decision: Normalize scheduler outputs in tests to ignore random UUIDs and compare by matchId and logical links.
  Rationale: Match IDs are random UUIDs in the TypeScript scheduler, so stable comparisons require canonicalization.
  Date/Author: 2026-02-06 / Codex

- Decision: Enforce UTC timezone and single-worker execution in Playwright config.
  Rationale: Time-dependent scheduling and shared DB state become flaky when tests run in different timezones or concurrently.
  Date/Author: 2026-02-06 / Codex

- Decision: Add a safety guard and migration/reset step to the E2E seed script.
  Rationale: Seeding is destructive; the guard prevents wiping non-test databases and ensures schema consistency before data is inserted.
  Date/Author: 2026-02-06 / Codex

- Decision: Use Playwright global setup to run `npm run seed:e2e` and generate auth storage states for host/participant users.
  Rationale: Keeps test auth deterministic and removes repeated UI login from each spec.
  Date/Author: 2026-02-06 / Codex

- Decision: Generate scheduler fixtures via a TypeScript generator (`e2e/scripts/generate-scheduler-fixtures.ts`) using the in-repo scheduler types and `serializeMatchesLegacy`.
  Rationale: Produces deterministic, canonical fixtures that can be regenerated alongside scheduler changes while preserving legacy ordering.
  Date/Author: 2026-02-06 / Codex

- Decision: Use the real schedule create flow (`/events/[id]/schedule?create=1`) for the event creation E2E test.
  Rationale: Keeps E2E parity with production behavior and avoids maintaining custom E2E-only routes.
  Date/Author: 2026-02-07 / Codex

## Outcomes & Retrospective

- Playwright harness implemented (`playwright.config.ts`) with baseURL support, UTC timezone, single-worker execution, and webServer orchestration (dev vs prod).
- Deterministic seeding implemented (`prisma/seed.e2e.ts`) with guard (`E2E_SEED=1` or `DATABASE_URL` containing `e2e`) and a `seed:e2e` script wired via `prisma.config.ts`.
- Global setup runs seeding and writes auth storage states to `e2e/.auth` for host and participant users.
- Scheduler fixtures stored in `e2e/fixtures/scheduler/*.json` with canonicalization helpers and a generator script for regeneration.
- Core E2E specs implemented: `scheduler.spec.ts`, `event-create.spec.ts`, `event-join.spec.ts`, `rental-create.spec.ts`, `rental-purchase.spec.ts`.
- Optional debug specs exist for troubleshooting (`e2e/debug-*.spec.ts`).
- Event creation E2E now uses the real schedule create route rather than a custom `/e2e` page.
- Validation status: last recorded Playwright run passed `event-create.spec.ts`; the full suite still needs a complete run on a configured E2E database.

## Context and Orientation

The codebase is a Next.js 16 app in mvp-site/ with API routes under mvp-site/src/app/api and scheduler logic under mvp-site/src/server/scheduler. Auth relies on JWT cookies generated by mvp-site/src/lib/authServer.ts and enforced by requireSession in mvp-site/src/lib/permissions.ts. Events are stored in the Prisma schema under mvp-site/prisma/schema.prisma and loaded for scheduling via loadEventWithRelations in mvp-site/src/server/repositories/events.ts. The schedule route for events lives at mvp-site/src/app/api/events/[eventId]/schedule/route.ts and the general scheduling route (eventDocument payload) is mvp-site/src/app/api/events/schedule/route.ts. The legacy Python bracket logic that must be matched is in mvp-build-bracket/src/brackets.py; use it as the reference for expected bracket structure, byes, and double-elimination links.

Frontend flows to cover:

Event creation and scheduling uses the schedule page at mvp-site/src/app/events/[id]/schedule/page.tsx, which calls eventService.scheduleEvent (mvp-site/src/lib/eventService.ts) to POST to /api/events/schedule or /api/events/[id]/schedule.

Event joining uses the discover flow (mvp-site/src/app/discover/components/EventDetailSheet.tsx) which calls registrationService (mvp-site/src/lib/registrationService.ts) for /api/events/[eventId]/registrations/self and paymentService.joinEvent (mvp-site/src/lib/paymentService.ts) for /api/events/[eventId]/participants.

Rental creation and purchasing uses the organization fields UI (mvp-site/src/app/organizations/[id]/FieldsTabContent.tsx) to navigate into the schedule page with rental query params, and paymentService.createPaymentIntent to POST /api/billing/purchase-intent.

## Plan of Work

The work proceeds in three layers. First, install Playwright and establish a robust test harness with a base URL, web server settings, UTC timezone, and deterministic seeding. Second, add backend scheduler parity tests that call the schedule API routes directly and compare canonical outputs to fixtures derived from brackets.py behavior. Third, add UI end-to-end tests for event creation, joining, rental creation, and rental purchasing, each asserting that frontend API calls carry the exact expected parameters. Tests must remain deterministic by using fixed IDs, fixed dates, and a controlled seed dataset. The plan also adds optional Stripe test-mode steps that can be enabled when all Stripe keys and the local Stripe webhook relay are configured.

## Dependency Graph

T1 ─┬─ T3 ─┬─ T4
    │      ├─ T5
    │      ├─ T6
    │      └─ T7
T2 ─┘      └─ T8

## Tasks

### T1: Add Playwright tooling and configuration
- depends_on: []
- location: mvp-site/package.json, mvp-site/playwright.config.ts, mvp-site/e2e/
- description: Add Playwright test dependencies, a Playwright config with baseURL support (defaulting to http://localhost:3000 and overridable via E2E_BASE_URL), a webServer command for local runs, UTC timezone configuration, and npm scripts (for example, test:e2e and test:e2e:ui). Configure projects for at least Chromium. Enforce workers=1 by default to avoid DB contention. Create a stub e2e/global-setup.ts (no-op) so the config can reference it without failing before T3 fills it in.
- validation: Run npm run test:e2e -- --list and verify Playwright detects tests without running.

### T2: Create deterministic E2E seed/reset scripts
- depends_on: []
- location: mvp-site/prisma.config.ts, mvp-site/prisma/seed.e2e.ts (or mvp-site/scripts/e2e/seed.ts), mvp-site/package.json
- description: Implement a seed script that first validates a safety guard (for example, require E2E_SEED=1 or DATABASE_URL containing _e2e) to avoid wiping non-test databases. Run prisma generate and prisma migrate reset --force (or prisma db push) against the test database before seeding. Seed deterministic fixtures: host and participant users with hashed passwords, their UserData profiles, at least one organization with fields, a priced rental time slot, a free event and a paid event for join tests, and tournament/league events with teams, divisions, fields, and time slots for scheduler tests. Use fixed IDs and fixed ISO timestamps. Integrate with Prisma’s seed configuration and provide an npm script (e.g., seed:e2e) that runs the script.
- validation: Run npm run seed:e2e with the guard enabled and verify key rows exist (optionally via a short prisma client check or Prisma Studio).

### T3: Add Playwright fixtures for auth and API helpers
- depends_on: [T1, T2]
- location: mvp-site/e2e/fixtures/auth.ts, mvp-site/e2e/fixtures/api.ts, mvp-site/e2e/global-setup.ts
- description: Replace the stub global-setup with real logic that runs the seed script and generates multiple storage states (host and participant) via /api/auth/login. Add fixtures to load those storage states in UI tests. Add a lightweight bypass helper that can set an auth cookie or Authorization header for API-only tests without UI login. Ensure tests can switch between real UI login and bypass modes.
- validation: Run a small auth smoke test that confirms an authenticated page call returns 200 and that unauthenticated calls fail with 401.

### T4: Scheduler parity E2E tests (API-level)
- depends_on: [T1, T2, T3]
- location: mvp-site/e2e/scheduler.spec.ts, mvp-site/e2e/fixtures/scheduler/*.json
- description: Add API-level tests using Playwright’s request fixture to POST to /api/events/schedule with eventDocument payloads. Create canonicalized fixtures by deriving match trees from brackets.py (either via a small Python helper that outputs canonical JSON or by a documented manual translation); commit those fixtures. Use canonicalization to map matches by matchId and compare bracket structure to expected fixtures. Include cases:
  - Tournament with perfect bracket (8 teams, single elimination).
  - Tournament with byes (6 teams) confirming seeding logic and bracket structure.
  - Tournament with double elimination verifying loser-bracket linkage.
  - League scheduling with no time slots returning the expected ScheduleError message.
  - Event start == end extension behavior for league schedules.
- validation: Run the scheduler test file and confirm all cases pass, and that a deliberate fixture mismatch fails with a clear diff.

### T5: Event creation E2E (UI + request assertions)
- depends_on: [T1, T2, T3]
- location: mvp-site/e2e/event-create.spec.ts
- description: Use the schedule page create flow (events/[id]/schedule?create=1) to create an event. If the route requires an existing event record, use a pre-seeded draft event ID from T2; otherwise generate a new ID. Intercept the POST to /api/events/schedule (or /api/events/[id]/schedule) and assert that the payload includes required fields (event id, hostId, teamSizeLimit, eventType, fieldIds/timeSlotIds as expected). Verify the UI transitions out of create mode and displays the event title.
- validation: Run the test and confirm request assertions pass and the page shows the created event name.

### T6: Event joining E2E (UI + request assertions)
- depends_on: [T1, T2, T3]
- location: mvp-site/e2e/event-join.spec.ts
- description: Navigate to discover, open an event detail sheet, and join as self. Assert that /api/events/[eventId]/registrations/self is called with the correct eventId and that /api/events/[eventId]/participants receives the correct user payload when paymentService.joinEvent is used. Cover both paid and free event cases seeded in T2, and check for proper success messaging.
- validation: The test should show the “registered” state and the API payload assertions should pass.

### T7: Rental creation E2E (UI + request assertions)
- depends_on: [T1, T2, T3]
- location: mvp-site/e2e/rental-create.spec.ts
- description: Log in as a host, open an organization’s field availability, create a rental slot, and assert that /api/time-slots POST and /api/fields updates include the correct field id, start/end times, repeating flag, and price. Ensure the slot is displayed in the UI after creation.
- validation: The created rental slot appears in the UI and request payloads match expected values.

### T8: Rental purchase E2E (UI + request assertions + optional Stripe)
- depends_on: [T1, T2, T3]
- location: mvp-site/e2e/rental-purchase.spec.ts
- description: As a participant, select a rental slot in the organization fields view and flow into the schedule page. Assert that /api/billing/purchase-intent receives the correct payload (user, event, timeSlot, organization). If STRIPE_SECRET_KEY, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY, and STRIPE_WEBHOOK_SECRET are set, complete the payment using Stripe test card 4242 4242 4242 4242 (exp 12/34, CVC 123) inside the Payment Element iframe and verify the success confirmation. If Stripe keys are not present, assert that the mock payment intent path is used and the UI handles it gracefully.
- validation: The purchase intent call is correct; payment completes in test mode or the mock path completes without errors.

## Parallel Execution Groups

Wave 1: T1 and T2 can run immediately in parallel.

Wave 2: T3 can start after T1 and T2 are done.

Wave 3: T4, T5, T6, T7, and T8 can run after T3 is done, with T4 prioritized due to scheduler risk.

## Testing Strategy

Use Playwright for all E2E and API-level tests. Scheduler parity tests use Playwright’s request fixture for direct API calls, while UI tests use Chromium with real auth and network interception. Keep tests deterministic by using fixed IDs and timestamps from the seed script and canonicalizing scheduler outputs. Enforce UTC timezone in Playwright config and set workers=1 for local runs until per-worker isolation is introduced.

## Risks & Mitigations

Scheduler tests may be brittle if they compare raw IDs; mitigate by canonicalizing to matchId-based structures.

Stripe UI testing can be flaky due to iframe timing; mitigate with explicit waits and a fallback to the mock payment intent path if Stripe keys are absent.

Concurrent tests can clash on shared seeded data; mitigate by serializing tests or scoping IDs per test.

## Concrete Steps

All commands are run from mvp-site/ unless stated otherwise.

1. Install Playwright and set up config:

   npm install -D @playwright/test
   npx playwright install

2. Add seed/reset scripts and run seeding (ensure DATABASE_URL targets an E2E database and the guard is set):

   E2E_SEED=1 npm run seed:e2e

3. Run E2E tests:

   npm run test:e2e

4. Run only scheduler tests if needed:

   npx playwright test e2e/scheduler.spec.ts

## Validation and Acceptance

The acceptance criteria is a clean Playwright run that covers scheduler parity and all listed UI flows. Specifically:

- Running npm run test:e2e completes with all tests passing.
- Scheduler parity tests pass for perfect bracket, byes, and double elimination, with canonicalized outputs matching fixtures derived from brackets.py.
- Event creation, event joining, rental creation, and rental purchase tests pass and assert correct request payloads.
- A payment flow passes either by completing Stripe test-mode payment or using the mock payment intent when Stripe keys are absent.

## Idempotence and Recovery

Seeding is idempotent by design and begins with a reset step to clear prior data. The seed script must refuse to run unless an explicit guard is set (for example E2E_SEED=1 or a DATABASE_URL suffix). If a test run fails due to stale data, rerun npm run seed:e2e with the guard enabled and then rerun the failing spec. If Playwright browsers are missing, rerun npx playwright install.

## Artifacts and Notes

Seeded test users (example, to be finalized in the seed script):

- Host user: host@example.com / password123!
- Participant user: player@example.com / password123!

Expected fixture storage:

- Scheduler fixtures: mvp-site/e2e/fixtures/scheduler/*.json
- Auth storage states: mvp-site/e2e/.auth/host.json, mvp-site/e2e/.auth/participant.json
- Scheduler fixture generator: mvp-site/e2e/scripts/generate-scheduler-fixtures.ts

## Interfaces and Dependencies

Playwright configuration defines baseURL, webServer settings, UTC timezone, workers=1, and a global setup hook. The tests use Playwright’s request fixture and page.route interception. Prisma seeding uses the generated Prisma Client and guards against wiping non-test databases. Stripe test card data follows Stripe’s testing documentation (card 4242 4242 4242 4242, any future expiry, any CVC).

Relevant env vars:
- `E2E_BASE_URL` (override base URL)
- `E2E_WEB_SERVER` (`dev` or `prod` to control webServer command)
- `E2E_SEED` (seed guard)
- `E2E_SEED_COMMAND` (override seed command)

At the end of the implementation, the following new files should exist:

- mvp-site/playwright.config.ts
- mvp-site/e2e/global-setup.ts
- mvp-site/e2e/fixtures/scheduler/*.json
- mvp-site/e2e/*.spec.ts
- mvp-site/prisma/seed.e2e.ts (or equivalent script under mvp-site/scripts/e2e/)

Plan change note (2026-02-06): Updated tasks and guidance to add a global-setup stub, explicit seed safety guard and migration step, multi-user auth storage states, UTC timezone enforcement, and Stripe env gating based on the plan review feedback to prevent ordering errors and test flakiness.
Implementation note (2026-02-06): Completed Playwright harness, seed guard/reset, auth storage, scheduler fixtures, and UI specs; added a TS fixture generator for scheduler outputs.
Implementation note (2026-02-07): Removed the `/e2e/event-create` helper route and refactored the event creation spec to use the real schedule create flow.
