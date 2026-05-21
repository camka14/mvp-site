# Add Private-to-Organization Account Visibility

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan follows the repository requirements in `PLANS.md`. The repository is a Next.js App Router application with TypeScript, Mantine UI, Prisma, and Postgres.

## Purpose / Big Picture

Users who belong to an organization need a privacy setting that controls whether people outside their organization can find them through account search. After this change, a signed-in user can mark their account as public or private-to-organizations during onboarding and later from the edit profile page. Public accounts stay searchable. Private-to-organization accounts are hidden from generic user search unless the viewer is the same user, an admin, or belongs to at least one of the same organizations as the target account.

This is security-sensitive because client UI cannot be trusted to hide private accounts. The server route that returns user search results must enforce the visibility rule before returning users.

## Progress

- [x] (2026-05-21 19:40Z) Created this ExecPlan and identified the relevant modules: `prisma/schema.prisma`, `src/server/userPrivacy.ts`, `src/app/api/users/route.ts`, `src/app/api/users/[id]/route.ts`, `src/app/onboarding/page.tsx`, `src/app/profile/page.tsx`, `src/lib/userService.ts`, `src/lib/auth.ts`, and `src/types/index.ts`.
- [x] (2026-05-21 19:54Z) Added `accountVisibility` to the Prisma `UserData` model, created migration `20260521193000_add_user_account_visibility`, and regenerated Prisma client files.
- [x] (2026-05-21 19:56Z) Added `src/lib/accountVisibility.ts` so UI, services, and API routes share accepted values and normalization.
- [x] (2026-05-21 20:02Z) Enforced private-to-organization filtering in generic user search on the server.
- [x] (2026-05-21 20:08Z) Added onboarding controls for account visibility and automatic home organization assignment when the user already belongs to an organization.
- [x] (2026-05-21 20:11Z) Added a private-account checkbox to the profile details edit form.
- [x] (2026-05-21 20:18Z) Added and updated Jest tests for visibility filtering, user patch validation, and onboarding persistence.
- [x] (2026-05-21 20:23Z) Ran focused Jest tests, `npx tsc --noEmit`, and applied the local migration with `npx prisma migrate deploy`.

## Surprises & Discoveries

- Observation: Existing user privacy already lives in `src/server/userPrivacy.ts` and currently only hides minor identities.
  Evidence: `isVisibleInGenericSearch` currently returns only `!isMinorAtUtcDate(user.dateOfBirth)`.
- Observation: Organization membership is already represented by `StaffMembers`, while organization ownership lives on `Organizations.ownerId`.
  Evidence: `src/app/api/organizations/route.ts` returns organizations for a user by combining owned organizations and staff-member organization ids.

- Observation: The first onboarding test pass succeeded but emitted React act warnings because the new organization lookup completed after some synchronous assertions.
  Evidence: Rerunning `npm test -- --runInBand src/app/onboarding/__tests__/page.test.tsx` after waiting for the organization load state completed with no console warnings.

## Decision Log

- Decision: Store the setting on `UserData.accountVisibility` as text with values `PUBLIC` and `PRIVATE_TO_ORGS`.
  Rationale: The app already stores similar user preferences as strings, and a shared normalizer keeps API input strict without requiring a Prisma enum migration.
  Date/Author: 2026-05-21 / Codex

- Decision: Enforce private account visibility in generic user search, not in ID-based hydration.
  Rationale: The user requested that outsiders cannot search the account. ID-based hydration is used by event, team, chat, and org surfaces that often need to render known participants; filtering those rows would create regressions outside the stated search-discovery requirement.
  Date/Author: 2026-05-21 / Codex

- Decision: Treat shared organization membership as either owning the same organization or having a `StaffMembers` row in the same organization.
  Rationale: Owners may not have a `StaffMembers` row, while staff do. Both should be considered part of the organization for account discovery.
  Date/Author: 2026-05-21 / Codex

## Outcomes & Retrospective

Implemented the private-to-organization visibility setting end to end. The database has an additive `UserData.accountVisibility` column with default `PUBLIC`. Generic user search now hides `PRIVATE_TO_ORGS` accounts from outsiders and still allows self, admins, and shared-organization viewers. Onboarding now asks organization users whether their account should be private and saves a home organization when one is available. The profile edit form now includes a private-account checkbox. Focused tests and typechecking passed.

## Context and Orientation

`UserData` is the Prisma model for user profile data in `prisma/schema.prisma`. The app maps database rows to legacy client fields such as `$id` through `src/server/legacyFormat.ts`. Client-side user objects use the `UserData` TypeScript interface in `src/types/index.ts`.

`src/server/userPrivacy.ts` centralizes server-side identity visibility. It exports `publicUserSelect`, `currentUserSelect`, `createVisibilityContext`, `applyUserPrivacy`, and `isVisibleInGenericSearch`. The generic search endpoint in `src/app/api/users/route.ts` loads candidate users, filters test email accounts, filters minor accounts, and returns the remaining rows. This is the correct place to enforce private-account discovery because all client user search calls go through `userService.searchUsers`, which calls `/api/users?query=...`.

`src/app/onboarding/page.tsx` is the first-run page where signed-in users choose their starting intent. It currently saves only `onboardingIntent`. `src/app/profile/page.tsx` owns the profile edit form and already imports Mantine `Checkbox`, making it the natural place to add the private-account checkbox in the profile details section.

## Plan of Work

First, add `accountVisibility` to `UserData` with default `PUBLIC` and create a Postgres migration that is safe to run on an existing database. Then add `src/lib/accountVisibility.ts` with constants and a normalizer.

Next, update server-side selects and normalization so account visibility appears on user payloads. Extend `createVisibilityContext` so a signed-in viewer gets a set of user ids that share any of the viewer's organizations. Update `isVisibleInGenericSearch` so adult public users remain searchable, private users are searchable only by self, admins, or shared-organization viewers, and minors remain excluded from generic search.

Then update user create and patch routes to validate the new field. The profile service and auth storage normalizers will normalize missing or old rows to `PUBLIC`.

Finally, update onboarding and profile UI. On onboarding, signed-in users will see a privacy checkbox. If they already belong to one organization and have no home organization set, selecting any onboarding path will also set `homePageOrganizationId` to that organization. If they belong to multiple organizations, the page will show a select control so the saved homepage is explicit.

## Concrete Steps

All commands run from `C:\Users\samue\Documents\Code\mvp-site`.

After editing `prisma/schema.prisma`, create `prisma/migrations/20260521193000_add_user_account_visibility/migration.sql` with an additive column and index. Run:

    npx prisma generate

After code changes, run focused tests:

    npm test -- --runInBand src/app/api/users/__tests__/usersRoute.test.ts
    npm test -- --runInBand src/app/api/users/__tests__/userByIdRoute.test.ts
    npm test -- --runInBand src/app/onboarding/__tests__/page.test.tsx
    npx tsc --noEmit

If local database migration is desired in this same implementation pass, run:

    npx prisma migrate deploy

## Validation and Acceptance

The server behavior is accepted when a Jest test shows a private adult user is omitted from `/api/users?query=...` for an outsider, but included for a viewer who shares an organization with that user. A separate patch-route test should show `accountVisibility: "private_to_orgs"` is normalized to `PRIVATE_TO_ORGS` and an unknown value returns HTTP 400.

The onboarding behavior is accepted when the component test shows that a signed-in user with one existing organization saves `onboardingIntent`, `accountVisibility`, and `homePageOrganizationId` in a single `updateUser` call. Guest onboarding should still route without persisting a selection.

The profile edit behavior is accepted by typechecking and by confirming the save payload includes the current account visibility value.

## Idempotence and Recovery

The migration is additive and can be safely deployed once. The migration uses `ADD COLUMN IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS` so retrying after a partial local run does not fail. If `npx prisma generate` changes generated files, keep those changes with the schema because the repository stores generated Prisma client output.

If a test mock fails because `createVisibilityContext` now queries shared organization users, update only the affected mock defaults to return empty arrays. Do not weaken the production search check to satisfy mocks.

## Artifacts and Notes

The key database shape is:

    UserData.accountVisibility TEXT NOT NULL DEFAULT 'PUBLIC'

The accepted values are:

    PUBLIC
    PRIVATE_TO_ORGS

Validation evidence:

    npx prisma generate
    ✔ Generated Prisma Client (7.7.0) to .\src\generated\prisma

    npm test -- --runInBand src/app/api/users/__tests__/usersRoute.test.ts
    PASS src/app/api/users/__tests__/usersRoute.test.ts
    Tests: 13 passed, 13 total

    npm test -- --runInBand src/app/api/users/__tests__/userByIdRoute.test.ts
    PASS src/app/api/users/__tests__/userByIdRoute.test.ts
    Tests: 12 passed, 12 total

    npm test -- --runInBand src/app/onboarding/__tests__/page.test.tsx
    PASS src/app/onboarding/__tests__/page.test.tsx
    Tests: 6 passed, 6 total

    npx tsc --noEmit
    Completed with exit code 0.

    npx prisma migrate deploy
    Applying migration `20260521193000_add_user_account_visibility`
    All migrations have been successfully applied.

## Interfaces and Dependencies

In `src/lib/accountVisibility.ts`, define:

    export type AccountVisibility = 'PUBLIC' | 'PRIVATE_TO_ORGS';
    export const PUBLIC_ACCOUNT_VISIBILITY = 'PUBLIC';
    export const PRIVATE_TO_ORGS_ACCOUNT_VISIBILITY = 'PRIVATE_TO_ORGS';
    export const normalizeAccountVisibility = (value: unknown): AccountVisibility => ...
    export const parseAccountVisibility = (value: unknown): AccountVisibility | null => ...
    export const isPrivateToOrganizationsVisibility = (value: unknown): boolean => ...

`parseAccountVisibility` is strict for API validation. `normalizeAccountVisibility` defaults missing or invalid stored values to `PUBLIC` so old cached client data remains safe and stable.

Revision note 2026-05-21: Initial plan created before implementation to document the schema, server enforcement, onboarding, and profile work.

Revision note 2026-05-21: Updated after implementation to record completed files, tests, TypeScript validation, and local migration deployment.
