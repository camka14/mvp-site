# Migrate mvp-site off Appwrite to DigitalOcean self-hosted stack

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Reference: follow `mvp-site/PLANS.md` from the repository root; this document must be maintained in accordance with those rules. This plan builds on the REST routing assumptions in `mvp-site/plans/rest_function_calls_execplan.md` and should keep the same path and method shapes unless explicitly revised here.

## Purpose / Big Picture

Replace Appwrite with a self-hosted DigitalOcean stack so the MVP runs entirely on Postgres, Next.js APIs, and DigitalOcean Spaces without any Appwrite SDK, endpoints, or configuration. After this change, developers can start the app with `DATABASE_URL`, `AUTH_SECRET`, and Spaces credentials only, and all event creation, billing, messaging, templates, and registration flows still work. Success is visible when Appwrite references are removed, API requests flow through Next.js route handlers backed by Prisma, and key UI flows (create event, join event, create organization, upload a file, and sign a waiver) succeed against the new backend.

## Progress

- [x] (2026-02-04 00:00Z) Audited `mvp-site` for Appwrite references and captured them in Context and Orientation.
- [ ] Replace Appwrite data access with Prisma-backed API routes and repositories.
- [ ] Migrate Appwrite function calls to self-hosted Next.js route handlers.
- [ ] Replace Appwrite auth confirmation and ID generation.
- [ ] Remove Appwrite dependencies, configuration, docs, and tests.
- [ ] Migrate data from Appwrite to Postgres and validate parity.

## Surprises & Discoveries

- Observation: The repo already contains Prisma-backed API routes (for auth, users, and event scheduling) and server-side scheduling/repository code, so we can extend those patterns instead of inventing new infrastructure.
  Evidence: `mvp-site/src/app/api/auth/login/route.ts` and `mvp-site/src/app/api/events/schedule/route.ts` use Prisma and return Appwrite-shaped responses via `serializeEventAppwrite`.
- Observation: The current auth documentation mentions `JWT_SECRET`, but the runtime uses `AUTH_SECRET` in `src/lib/authServer.ts`.
  Evidence: `mvp-site/src/lib/authServer.ts` reads `process.env.AUTH_SECRET`.

## Decision Log

- Decision: Keep Appwrite-style response fields (`$id`, `$createdAt`, `$updatedAt`) in API responses during migration to avoid mass UI/type refactors, and continue using `apiMappers` to normalize IDs where needed.
  Rationale: Existing UI types and services expect Appwrite-shaped data; preserving shape reduces risk and scope while we swap backend plumbing.
  Date/Author: 2026-02-04 / Codex
- Decision: Replace Appwrite Functions with explicit Next.js route handlers and Prisma repositories rather than building a generic “Appwrite adapter.”
  Rationale: The new stack must enforce permissions and business logic on the server; explicit route handlers keep security and validation clear and align with existing `/api` patterns.
  Date/Author: 2026-02-04 / Codex
- Decision: Standardize ID creation via a new helper (for both server and client) that uses `crypto.randomUUID()`.
  Rationale: Appwrite’s `ID.unique()` is the only remaining SDK-driven ID generation; a single helper keeps IDs consistent and avoids new dependencies.
  Date/Author: 2026-02-04 / Codex
- Decision: Implement geospatial event filtering in Postgres using a simple bounding box + Haversine calculation first, with PostGIS as an optional follow-up.
  Rationale: We need functional parity with Appwrite’s `Query.distanceLessThan` immediately; the simpler approach is adequate for MVP-scale data and is easier to ship quickly.
  Date/Author: 2026-02-04 / Codex

## Outcomes & Retrospective

Plan created and ready for implementation. No code changes have been applied yet.

## Context and Orientation

Appwrite is wired in through the SDK client defined in `mvp-site/src/app/appwrite.ts`, which exports `account`, `databases` (Appwrite TablesDB), `functions`, `storage`, `avatars`, and `ID`. These exports are consumed across service modules and client components. Database access via Appwrite appears in `mvp-site/src/lib/eventService.ts`, `mvp-site/src/lib/organizationService.ts`, `mvp-site/src/lib/teamService.ts`, `mvp-site/src/lib/fieldService.ts`, `mvp-site/src/lib/leagueService.ts`, `mvp-site/src/lib/sportsService.ts`, `mvp-site/src/lib/productService.ts`, `mvp-site/src/lib/billService.ts`, `mvp-site/src/lib/refundRequestService.ts`, `mvp-site/src/lib/signedDocumentService.ts`, and `mvp-site/src/lib/chatService.ts`, while Appwrite Function executions are used in `mvp-site/src/lib/paymentService.ts`, `mvp-site/src/lib/registrationService.ts`, `mvp-site/src/lib/familyService.ts`, `mvp-site/src/lib/boldsignService.ts`, `mvp-site/src/lib/chatService.ts`, and portions of `mvp-site/src/lib/eventService.ts` and `mvp-site/src/lib/productService.ts`.

Client components call Appwrite directly in `mvp-site/src/app/discover/page.tsx`, `mvp-site/src/app/discover/components/EventDetailSheet.tsx`, `mvp-site/src/app/organizations/[id]/page.tsx`, `mvp-site/src/app/organizations/[id]/FieldsTabContent.tsx`, and `mvp-site/src/app/events/[id]/schedule/components/EventForm.tsx` (using `ID.unique()` or `databases.listRows`). API routes still use Appwrite in `mvp-site/src/app/api/documents/confirm-password/route.ts` and `mvp-site/src/app/api/documents/record-signature/route.ts` via the Appwrite `Client`, `Account`, and `Functions` classes.

Appwrite configuration is present in `mvp-site/.env.local` and is referenced in `mvp-site/README.md`. Tests rely on Appwrite mocks in `mvp-site/test/mocks/appwrite.ts`, Appwrite-related unit tests under `mvp-site/src/lib/__tests__`, and Appwrite environment defaults in `mvp-site/test/setupTests.ts`. Documentation and plans still reference Appwrite or Appwrite schema in `mvp-site/Relationships.md`, `mvp-site/plans/text-waiver-templates-and-signing.md`, `mvp-site/plans/referee-structure.md`, and `mvp-site/plans/organization-store-tab.md`.

The self-hosted stack already exists in partial form. Prisma is configured in `mvp-site/prisma/schema.prisma` and `mvp-site/src/lib/prisma.ts`. Auth uses JWTs via `mvp-site/src/lib/authServer.ts` and `mvp-site/src/lib/permissions.ts`, with API routes in `mvp-site/src/app/api/auth/*`. Storage is implemented with DigitalOcean Spaces or local filesystem in `mvp-site/src/lib/storageProvider.ts` and file routes under `mvp-site/src/app/api/files`. Event scheduling already runs through Prisma-backed route handlers in `mvp-site/src/app/api/events/schedule/route.ts` and server helpers in `mvp-site/src/server/*`, and the client already has a generic `apiRequest` helper in `mvp-site/src/lib/apiClient.ts` and normalization helpers in `mvp-site/src/lib/apiMappers.ts`.

“Self-hosted DO option” means the Next.js app runs on DigitalOcean App Platform or a droplet, Postgres is the system of record via `DATABASE_URL`, auth sessions are signed with `AUTH_SECRET`, and file uploads go to DigitalOcean Spaces via `DO_SPACES_*` environment variables. All backend logic must live in Next.js route handlers or server modules in this repo.

## Plan of Work

Start by aligning data models and migration concerns. Compare the existing Prisma schema in `mvp-site/prisma/schema.prisma` with the Appwrite collections used by the services above, add any missing models or fields, and ensure that created/updated timestamps map cleanly to Appwrite-style `$createdAt` and `$updatedAt` when serializing. Decide on ID parity: for every Appwrite collection, the Postgres `id` should store the same string `$id` so relationships (arrays of IDs) remain valid during migration. Build a migration script inside the repo that can fetch Appwrite data via HTTP, transform to Prisma inputs, and upsert into Postgres in a deterministic order (organizations, users, teams, events, fields, time slots, matches, products, subscriptions, templates, signed documents, chats, messages, bills, refund requests, and registrations). Ensure the script is idempotent by using `upsert` on primary keys and by leaving `createdAt` intact where possible.

Next, replace Appwrite Functions with self-hosted Next.js routes. Implement route handlers in `mvp-site/src/app/api` that mirror the paths currently used in `functions.createExecution` calls. That means endpoints for event creation and updates, participant joins/leaves, billing purchase intents/refunds/Stripe connect links, messaging push notifications, family link management, event registration flows, template creation/signing, and signed-document recording. Each handler should validate inputs with `zod`, check auth with `requireSession`, enforce ownership rules using the same logic as the Appwrite functions previously enforced, and call Prisma repositories to read/write data. The responses should be JSON with the same shapes the UI expects today (including `$id` fields). If a handler needs to call external APIs (Stripe, BoldSign), keep the request/response handling in server-only modules under `mvp-site/src/server` or `mvp-site/src/lib` (server-safe) and avoid leaking secrets to the client.

Then, migrate client-side service modules away from Appwrite. Replace every `databases.*` call with an `apiRequest` call to the new Next.js API routes, and replace `functions.createExecution` calls with direct `apiRequest` calls using method and path from the new handlers. Replace `Query.*` usage by passing explicit query parameters or request bodies to the route handler; the server should translate those into Prisma `where`/`orderBy` clauses. Replace `ID.unique()` with a new helper (for example `createId()` in `mvp-site/src/lib/id.ts`), and use it in components that need a client-generated ID (such as pre-creating event IDs for routing). Remove `src/app/appwrite.ts` and all Appwrite imports once the services compile.

After the service layer moves, update tests and mocks. Replace `mvp-site/test/mocks/appwrite.ts` with mocks for `apiRequest` or direct mocks of the new repositories, update unit tests in `mvp-site/src/lib/__tests__` to assert on HTTP payloads or repository calls instead of Appwrite SDK calls, and remove Appwrite environment defaults from `mvp-site/test/setupTests.ts`. Add new tests for the new API endpoints where critical business logic lives (billing, registration gating, template signing, and chat messaging), and ensure the existing schedule tests still pass.

Finally, remove Appwrite dependencies and config. Delete Appwrite entries from `mvp-site/package.json` and `mvp-site/package-lock.json`, remove Appwrite configuration from `.env.local` and `README.md`, and update or mark legacy any docs and plans that still reference Appwrite. Update the deployment notes so the app is configured only with Postgres, auth, and Spaces variables. Cut over data by running the migration script and verifying counts and sample records between Appwrite and Postgres before disabling Appwrite.

## Concrete Steps

Run the Appwrite inventory to confirm there are no missing references and to validate removal at the end. From `/home/camka/Projects/MVP`, execute:

    rg -n "appwrite" mvp-site

Create a new ID helper and plan to replace `ID.unique()` with it. The helper should live at `mvp-site/src/lib/id.ts` and expose a single `createId()` function returning a UUID string using `crypto.randomUUID()`.

Add or extend Prisma models as needed, then run migrations from `/home/camka/Projects/MVP/mvp-site`:

    npx prisma migrate dev

Build new API route handlers under `mvp-site/src/app/api` for each domain listed in the Plan of Work. Use existing routes as a template (such as `mvp-site/src/app/api/events/schedule/route.ts`) and ensure each handler returns Appwrite-shaped JSON, including `$id` fields and timestamps.

Update service modules in `mvp-site/src/lib` and client components listed in Context to use `apiRequest` instead of `databases`/`functions`, and replace all `ID.unique()` usage with `createId()` or server-generated IDs.

Create a migration script (for example `mvp-site/scripts/migrate-appwrite-to-postgres.ts`) that reads Appwrite collections, maps them to Prisma models, and upserts data. Run it from `/home/camka/Projects/MVP/mvp-site` after configuring Appwrite credentials for the migration step only.

Update tests and run them from `/home/camka/Projects/MVP/mvp-site`:

    npm run test:ci
    npx tsc --noEmit

Finally, run the dev server to validate core flows:

    npm run dev

## Validation and Acceptance

Appwrite must be completely removed from runtime code. The command `rg -n "appwrite" mvp-site/src` should return no matches. The app should boot with `DATABASE_URL`, `AUTH_SECRET`, and optional `DO_SPACES_*` only, and no `NEXT_PUBLIC_APPWRITE_*` variables. Key flows must work end-to-end: creating an organization and event, scheduling the event, joining as a player or team, creating a product and initiating a payment intent, sending a chat message, uploading a profile image, and creating or signing a template. All updated Jest tests must pass (`npm run test:ci`), and TypeScript must compile (`npx tsc --noEmit`).

## Idempotence and Recovery

All migrations should be safe to re-run. The Appwrite-to-Postgres migration script must use `upsert` operations keyed on IDs so re-execution does not create duplicates. Keep a backup of Appwrite data (exported JSON) and a Postgres snapshot before cutover. If any step fails, revert to Appwrite by retaining a branch with the old service layer and by keeping Appwrite environment variables available until the new backend is validated.

## Artifacts and Notes

Include concise migration and validation evidence in this plan as work proceeds. Examples should be indented blocks, such as:

    rg -n "appwrite" mvp-site/src
    (no output)

    npm run test:ci
    PASS src/lib/__tests__/eventService.test.ts
    ...

Keep a short mapping note inside the migration script that documents how Appwrite collections map to Prisma models, for example:

    Appwrite collection "events" -> Prisma model Events (id=$id, createdAt=$createdAt, updatedAt=$updatedAt)

## Interfaces and Dependencies

Create a shared ID helper at `mvp-site/src/lib/id.ts` with this signature:

    export const createId = (): string => { /* returns UUID */ };

Route handlers should live under `mvp-site/src/app/api` and must be explicit about their responsibilities. For each domain, define an API surface and map it to service usage. At a minimum, implement routes for:

    POST   /api/events                  (create event)
    PATCH  /api/events/:eventId         (update event)
    DELETE /api/events/:eventId         (delete event)
    POST   /api/events/:eventId/participants (join)
    DELETE /api/events/:eventId/participants (leave)
    POST   /api/billing/purchase-intent
    POST   /api/billing/refund
    POST   /api/billing/host/connect
    POST   /api/billing/host/onboarding-link
    POST   /api/messaging/topics/:topicId/messages
    GET    /api/family/children
    POST   /api/family/children
    POST   /api/family/links
    POST   /api/events/:eventId/registrations/self
    POST   /api/events/:eventId/registrations/child
    POST   /api/organizations/:orgId/templates
    POST   /api/events/:eventId/sign
    POST   /api/documents/signed

Each route must validate input with `zod`, call `requireSession` for authentication, enforce access rules, and use Prisma for persistence. The response JSON must preserve Appwrite-style fields (`$id`, `$createdAt`, `$updatedAt`) because UI types expect them.

Repository helpers should be added under `mvp-site/src/server/repositories` to keep route handlers thin. For example, create `events.ts`, `organizations.ts`, `teams.ts`, `fields.ts`, `billing.ts`, `products.ts`, `templates.ts`, `registrations.ts`, and `messaging.ts` with focused functions such as:

    export async function createEvent(payload: EventPayload, tx?: PrismaClient): Promise<EventRecord>
    export async function updateEvent(id: string, payload: EventPayload, tx?: PrismaClient): Promise<EventRecord>
    export async function listOrganizationsByOwner(ownerId: string): Promise<OrganizationRecord[]>
    export async function listTeamsByUser(userId: string): Promise<TeamRecord[]>

Service modules in `mvp-site/src/lib` should only call `apiRequest` and should no longer import from `appwrite` or `@/app/appwrite`. Update or replace tests to mock `apiRequest` or these repositories directly.

Plan change note: Initial plan created after Appwrite reference audit to guide migration to the self-hosted DigitalOcean stack (2026-02-04).
