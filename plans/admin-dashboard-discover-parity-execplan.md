# Build A Secure Admin Discover Dashboard

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with `PLANS.md` at the repository root (`mvp-site/PLANS.md`).

## Purpose / Big Picture

After this change, verified internal staff accounts can open `/admin` and browse all platform data from one page: events (including drafts), organizations, fields, and users. The admin dashboard behaves like discover for events and organizations but removes distance filtering and enforces pagination at 50 rows per page. Access remains secure because every admin route verifies the current session user server-side and checks that the verified auth email belongs to an allowed internal domain.

## Progress

- [x] (2026-03-31 21:35Z) Audited existing admin surface (`/admin` constants editor, `/api/admin/access`, `src/server/razumlyAdmin.ts`) and existing discover/list routes for events, organizations, fields, users.
- [x] (2026-03-31 22:05Z) Implemented multi-domain server-side admin validation (`@razumly.com` and `@bracket-iq.com`) in `src/server/razumlyAdmin.ts` and expanded helper unit tests.
- [x] (2026-03-31 22:20Z) Added admin-only paginated API routes for events, organizations, fields, and users (`src/app/api/admin/*/route.ts`) with default/max page size 50.
- [x] (2026-03-31 22:35Z) Replaced constants-only `/admin` UI with a tabbed dashboard for Events, Organizations, Fields, and Users, and preserved constants editor at `/admin/constants`.
- [x] (2026-03-31 22:45Z) Added/updated Jest coverage for server domain checks and all new `/api/admin/*` routes.
- [x] (2026-03-31 22:52Z) Ran targeted Jest suites and eslint checks for touched admin files.
- [x] (2026-03-31 23:10Z) Adjusted admin eligibility to allow internal-domain accounts regardless of `emailVerifiedAt`, and disabled client caching for `/api/admin/access` in top navigation.

## Surprises & Discoveries

- Observation: The web admin flow already has robust server-side plumbing (`resolveRazumlyAdminFromToken`, `requireRazumlyAdmin`) and the navigation already conditionally shows the Admin link by calling `/api/admin/access`.
  Evidence: `src/app/admin/page.tsx`, `src/app/api/admin/access/route.ts`, and `src/components/layout/Navigation.tsx` all rely on that helper chain.
- Observation: Existing generic routes do not satisfy this feature directly: users search caps at 20, fields list has no pagination, and discover event visibility relies on `session.isAdmin` instead of domain-based admin status.
  Evidence: `src/app/api/users/route.ts`, `src/app/api/fields/route.ts`, and `src/app/api/events/search/route.ts`.
- Observation: Preserving constants editing without regression is easiest by giving it its own route (`/admin/constants`) and keeping `/admin` focused on discover-style data tabs.
  Evidence: Existing constants client includes a full-page layout and editing modal workflow that does not compose cleanly inside the new tabbed dashboard.
- Observation: Running npm scripts from a UNC path in PowerShell invokes `cmd.exe`, which cannot keep a UNC cwd and fails to find local binaries.
  Evidence: Initial `npm run test` failed with `UNC paths are not supported`; rerunning through `wsl.exe bash -lc` succeeded.

## Decision Log

- Decision: Keep using the existing `RazumlyAdmin` helper names for compatibility, but extend its domain logic to support both internal domains instead of renaming the module.
  Rationale: Renaming would touch many imports and test fixtures without user-visible value; extending behavior in place minimizes risk.
  Date/Author: 2026-03-31 / Codex.
- Decision: Add dedicated `/api/admin/*` listing routes instead of reusing `/api/events`, `/api/organizations`, `/api/fields`, and `/api/users` directly.
  Rationale: Admin requirements (draft inclusion, user search breadth, page-size contract, and domain-based access gate) differ from public and session-role routes.
  Date/Author: 2026-03-31 / Codex.
- Decision: Preserve constants editing by moving it to `/admin/constants` and linking from the new dashboard header.
  Rationale: This avoids regressing existing admin functionality while keeping the main `/admin` page aligned to the requested data-browsing tabs.
  Date/Author: 2026-03-31 / Codex.
- Decision: Remove `emailVerifiedAt` as a hard requirement for admin eligibility; domain match remains server-enforced.
  Rationale: Product requirement is domain-based admin access for internal accounts; requiring verification blocked valid internal users from seeing admin navigation.
  Date/Author: 2026-03-31 / Codex.

## Outcomes & Retrospective

Completed. The admin dashboard now serves discover-style event and organization browsing without distance filters, includes paginated field and user tabs, and keeps constants editing available on a dedicated route. Access checks now allow verified users from both required internal domains.

## Context and Orientation

The web app lives in `src/app`. The current `/admin` page (`src/app/admin/page.tsx`) renders `AdminConstantsClient`, which currently only edits constants. Admin authorization is implemented in `src/server/razumlyAdmin.ts` and enforced by routes such as `src/app/api/admin/constants/route.ts`.

Discover behavior is implemented in `src/app/discover/page.tsx`, with card components in `src/components/ui/EventCard.tsx` and `src/components/ui/OrganizationCard.tsx`. Data routes for core entities live in:

- `src/app/api/events/route.ts` and `src/app/api/events/search/route.ts`
- `src/app/api/organizations/route.ts`
- `src/app/api/fields/route.ts`
- `src/app/api/users/route.ts`

The new admin dashboard must be implemented in this repo (web surface) and must not rely on client-only checks. Every new admin data API must call `requireRazumlyAdmin` so server-side session + email-domain verification controls access.

## Plan of Work

First, update the admin access evaluator in `src/server/razumlyAdmin.ts` so allowed domains include both `razumly.com` and `bracket-iq.com`, while still requiring `emailVerifiedAt`. Update `src/server/__tests__/razumlyAdmin.test.ts` to assert the new domain behavior and preserve allow-list behavior.

Next, add four new route handlers under `src/app/api/admin/`:

- `events/route.ts`: paginated event listing (`limit`, `offset`, optional `query`) returning discover-friendly event payloads and always including drafts.
- `organizations/route.ts`: paginated organizations listing with optional query.
- `fields/route.ts`: paginated fields listing with optional query and lightweight organization metadata.
- `users/route.ts`: paginated users listing with optional query; search across first name, last name, username, and email by joining to `AuthUser` ids.

Each route will enforce admin access via `requireRazumlyAdmin`, normalize pagination to max 50, and return `{ items..., total, limit, offset }`.

Then, replace `src/app/admin/AdminConstantsClient.tsx` with a tabbed admin console that:

- keeps existing constants editing behavior as one tab,
- adds Events and Organizations tabs rendered via discover card components (no location/distance filter),
- adds Fields and Users tabs rendered as tables,
- adds users search input with debounced fetch,
- supports next/previous pagination controls based on `offset`, `limit`, and `total`.

Finally, add route tests for new admin APIs and run targeted Jest suites covering updated helper logic and admin endpoints.

## Concrete Steps

From repository root (`\\wsl.localhost\Ubuntu\home\camka\Projects\MVP\mvp-site`):

1. Implement backend auth and routes.
2. Implement admin dashboard client tabs and pagination wiring.
3. Add or update Jest tests under `src/server/__tests__` and `src/app/api/admin/**/__tests__`.
4. Run targeted test commands:
   - `npm run test -- src/server/__tests__/razumlyAdmin.test.ts`
   - `npm run test -- src/app/api/admin/__tests__/accessRoute.test.ts`
   - `npm run test -- src/app/api/admin/events/__tests__/route.test.ts`
   - `npm run test -- src/app/api/admin/organizations/__tests__/route.test.ts`
   - `npm run test -- src/app/api/admin/fields/__tests__/route.test.ts`
   - `npm run test -- src/app/api/admin/users/__tests__/route.test.ts`

This section will be updated with exact output snippets once commands are executed.

## Validation and Acceptance

Acceptance criteria:

1. A signed-in user with verified `@razumly.com` or verified `@bracket-iq.com` email receives `allowed: true` from `/api/admin/access`.
2. `/admin` shows tabs for Events, Organizations, Fields, Users (and Constants), and loads data without distance filtering.
3. Events tab includes draft (`UNPUBLISHED`) events.
4. Users tab supports search and paginates with 50-item pages.
5. All new admin list endpoints reject non-admin callers with HTTP 403.
6. Targeted Jest suites pass.

## Idempotence and Recovery

All changes are additive in route/UI layers and can be rerun safely. If any route change fails tests, revert only the affected admin route file and its paired test, then rerun targeted suites before continuing. No schema migration is required for this feature.

## Artifacts and Notes

Validation excerpts:

    $ wsl.exe bash -lc "cd /home/camka/Projects/MVP/mvp-site && npm run test -- src/server/__tests__/razumlyAdmin.test.ts src/app/api/admin/__tests__/accessRoute.test.ts src/app/api/admin/events/__tests__/route.test.ts src/app/api/admin/organizations/__tests__/route.test.ts src/app/api/admin/fields/__tests__/route.test.ts src/app/api/admin/users/__tests__/route.test.ts"
    PASS src/app/api/admin/events/__tests__/route.test.ts
    PASS src/app/api/admin/users/__tests__/route.test.ts
    PASS src/server/__tests__/razumlyAdmin.test.ts
    PASS src/app/api/admin/organizations/__tests__/route.test.ts
    PASS src/app/api/admin/fields/__tests__/route.test.ts
    PASS src/app/api/admin/__tests__/accessRoute.test.ts
    Test Suites: 6 passed, 6 total

    $ wsl.exe bash -lc "cd /home/camka/Projects/MVP/mvp-site && npx eslint src/app/admin/AdminDashboardClient.tsx src/app/admin/page.tsx src/app/admin/constants/page.tsx src/app/api/admin/events/route.ts src/app/api/admin/organizations/route.ts src/app/api/admin/fields/route.ts src/app/api/admin/users/route.ts src/server/razumlyAdmin.ts"
    (no lint errors)

## Interfaces and Dependencies

Server interfaces to implement:

- `GET /api/admin/events?limit=<n>&offset=<n>&query=<optional>`
- `GET /api/admin/organizations?limit=<n>&offset=<n>&query=<optional>`
- `GET /api/admin/fields?limit=<n>&offset=<n>&query=<optional>`
- `GET /api/admin/users?limit=<n>&offset=<n>&query=<optional>`

All routes must call:

    const session = await requireRazumlyAdmin(req);

and return JSON payloads with stable pagination metadata:

    {
      ...collection,
      total: number,
      limit: number,
      offset: number
    }

UI dependencies to reuse:

- `src/components/layout/Navigation.tsx`
- `src/components/ui/EventCard.tsx`
- `src/components/ui/OrganizationCard.tsx`
- Mantine components already used in `src/app/admin/AdminConstantsClient.tsx`.

Revision note (2026-03-31): Finalized the ExecPlan after implementation and validation, including route/UI completion, test evidence, and a documented workaround for UNC npm execution.
Revision note (2026-03-31): Updated plan after post-deploy bug report where internal `@razumly.com` user could not see Admin nav; fixed eligibility and nav cache behavior.
