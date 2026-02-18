# Add Secure Razumly Admin Constants Tab

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

PLANS.md is checked into this repository at `PLANS.md`, and this document is maintained in accordance with that file.

## Purpose / Big Picture

After this change, trusted Razumly administrators can open an Admin tab in the web app and manage database-backed constants from one place instead of editing records manually in SQL. The tab will let them view and edit Sports, Divisions, and League Scoring Config records. Access must be locked down so only verified Razumly email accounts can use it.

## Progress

- [x] (2026-02-18 19:27Z) Mapped existing auth/session flow and navigation surface; confirmed no current secure Razumly-admin check exists.
- [ ] Implement Razumly-admin authorization helper (verified Razumly email + optional allow-list support).
- [ ] Add secure admin API routes for constants listing and record patch updates.
- [ ] Add Admin UI page and nav tab visibility logic based on secure access check.
- [ ] Add targeted automated tests for admin authorization and admin constants routes.
- [ ] Run targeted test commands and record outcomes.

## Surprises & Discoveries

- Observation: Session tokens currently always set `isAdmin: false` in login/register, so existing `session.isAdmin` cannot gate new secure admin functionality.
  Evidence: `src/app/api/auth/login/route.ts` and `src/app/api/auth/register/route.ts` hard-code `isAdmin: false`.

- Observation: Division type options are currently code-driven in `src/lib/divisionTypes.ts`, while table-driven constants available today are `Sports`, `Divisions`, and `LeagueScoringConfigs`.
  Evidence: schema and route scan across `prisma/schema.prisma` and `src/app/api`.

## Decision Log

- Decision: Implement a dedicated Razumly-admin authorization helper that checks `AuthUser.email`, `AuthUser.emailVerifiedAt`, and Razumly domain, instead of relying on `session.isAdmin`.
  Rationale: Security must be based on verified account identity, and current session admin flag is not authoritative.
  Date/Author: 2026-02-18 / Codex

- Decision: Add a dedicated `/admin` page and an `Admin` navigation tab rather than refactoring the large Profile page into tabs.
  Rationale: Minimizes regression risk in a very large profile component and keeps admin tooling isolated.
  Date/Author: 2026-02-18 / Codex

## Outcomes & Retrospective

Pending implementation.

## Context and Orientation

The web app is a Next.js app under `src/app`. Authentication/session utilities live in `src/lib` and server-side route handlers live in `src/app/api`. The top navigation component is `src/components/layout/Navigation.tsx`.

The constants to manage are backed by database tables exposed in Prisma schema:
- `Sports` in `prisma/schema.prisma` and read route `src/app/api/sports/route.ts`.
- `Divisions` in `prisma/schema.prisma` and used by event routes.
- `LeagueScoringConfigs` in `prisma/schema.prisma` with read route `src/app/api/league-scoring-configs/[id]/route.ts`.

## Plan of Work

First, add `src/server/razumlyAdmin.ts` to centralize the admin eligibility check:
- user must exist in `AuthUser`
- user email must end with Razumly admin domain (default `razumly.com`)
- `emailVerifiedAt` must be set
- optional environment allow-list `RAZUMLY_ADMIN_EMAILS` can further restrict approved addresses.

Then add admin API routes:
- `GET /api/admin/access` for UI visibility checks.
- `GET /api/admin/constants` to fetch constants + editable field metadata.
- `PATCH /api/admin/constants/[kind]/[id]` to update supported fields per constant kind.

Next, add `src/app/admin/page.tsx` and a client component for editing constants. Use Mantine tabs and an edit modal with JSON patch editing scoped to editable fields.

Finally, update `src/components/layout/Navigation.tsx` to conditionally show an `Admin` tab by calling `/api/admin/access` for authenticated users.

## Concrete Steps

From repository root `/home/camka/Projects/MVP/mvp-site`:

1. Implement server auth helper and API routes.
2. Implement admin page/client UI and navigation integration.
3. Add/adjust tests.
4. Run targeted tests:
   - `npm test -- src/server/__tests__/razumlyAdmin.test.ts`
   - `npm test -- src/app/api/admin/__tests__/accessRoute.test.ts src/app/api/admin/constants/__tests__/route.test.ts src/app/api/admin/constants/[kind]/[id]/__tests__/route.test.ts`

## Validation and Acceptance

Acceptance is met when:
- A verified `@razumly.com` account can see `Admin` in top navigation and open `/admin`.
- Non-admin users do not see the nav tab and receive `403` from admin constants routes.
- Admin page lists Sports, Divisions, and League Scoring Config rows.
- Editing and saving a row updates the DB and refreshes the displayed data.
- Targeted tests pass.

## Idempotence and Recovery

All changes are additive and safe to re-run. Route tests use mocks and do not mutate real data. Admin UI writes only through the secure admin API. If a patch payload is invalid, API returns `400` with no database change.

## Artifacts and Notes

Will capture key test outputs after implementation.

## Interfaces and Dependencies

New server helper in `src/server/razumlyAdmin.ts`:

    export type RazumlyAdminStatus = {
      allowed: boolean;
      email: string | null;
      verified: boolean;
      reason?: 'missing_user' | 'missing_email' | 'unverified_email' | 'invalid_domain' | 'not_allow_listed';
    };

    export const evaluateRazumlyAdminAccess(userId: string, client?: PrismaClientLike): Promise<RazumlyAdminStatus>;
    export const requireRazumlyAdmin(req: NextRequest): Promise<AuthContext & { adminEmail: string }>;
    export const resolveRazumlyAdminFromToken(token: string | null): Promise<{ session: SessionToken | null; status: RazumlyAdminStatus }>;

Revision note (2026-02-18): Initial plan created before code changes to satisfy ExecPlan requirement for this feature.
