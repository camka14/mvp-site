# Team open registration and payments

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan follows `PLANS.md` at the repository root. It covers the backend, web UI, and payment flow in this repository and depends on the matching mobile work in `C:\Users\samue\StudioProjects\mvp-app\plans\team-open-registration-payments-execplan.md`.

## Purpose / Big Picture

Team managers will be able to open a team for public registration, optionally charge a registration cost when the billing owner has Stripe connected, and let users register or leave without manually editing the roster. A user can see this working by opening a readonly team detail modal, pressing Register for team, completing payment if required, and seeing their membership appear on the team.

## Progress

- [x] (2026-04-20 18:35Z) Created this backend/site ExecPlan and linked it to the mobile ExecPlan.
- [x] (2026-04-20) Updated Prisma schema, migration, generated client, shared TypeScript team types, and team API serializers.
- [x] (2026-04-20) Implemented server-side registration reservation, self-register, leave, purchase-intent, and webhook activation flow.
- [x] (2026-04-20) Updated site services and TeamDetailModal UI for open registration, cost guard, readonly register/leave, and jersey number editing.
- [x] (2026-04-20) Added focused service tests and ran validation commands.

## Surprises & Discoveries

- Observation: The working tree already contains unrelated organization/public-embed changes and generated Prisma changes before this feature begins.
  Evidence: `git status --short` shows modified organization routes, generated Prisma files, scheduler files, and untracked public embed files. This plan must preserve those changes and avoid reverting generated files that may belong to another task.

## Decision Log

- Decision: Store the team cost in `registrationPriceCents`.
  Rationale: A cents field avoids ambiguity and matches the mobile payment contract for exact integer money values.
  Date/Author: 2026-04-20 / Codex

- Decision: Use `STARTED` for pending paid team registration reservations and `LEFT` for voluntary departures.
  Rationale: Event registration already uses a pending reservation status before payment, and `LEFT` already exists as a team membership concept.
  Date/Author: 2026-04-20 / Codex

- Decision: Resolve the paid team billing owner as organization first, then user/team owner.
  Rationale: The user selected this behavior during planning, and it matches organization-owned teams charging through organization Stripe accounts.
  Date/Author: 2026-04-20 / Codex

## Outcomes & Retrospective

Implemented backend and site support for open team registration. `CanonicalTeams` now stores `openRegistration` and `registrationPriceCents`, and `TeamMembershipStatusEnum` includes `STARTED`. The registration helper locks teams, cleans stale paid reservations, rejects duplicates and full teams, counts `ACTIVE + STARTED` memberships against capacity, creates `ACTIVE` free registrations, creates `STARTED` paid reservations, activates paid reservations from Stripe webhook metadata, and leaves teams by marking registrations `LEFT`.

The site team modal now edits open registration settings, guards paid price entry behind Stripe capability, saves jersey numbers through `playerRegistrations`, and shows readonly Register/Leave actions. Paid team registration uses the existing PaymentModal and `purchaseType=team_registration`; free registration and leave call the new self-service endpoints.

Validation completed on Windows:

- `npx prisma generate` passed.
- `npm test -- --runInBand src/lib/__tests__/teamService.test.ts src/lib/__tests__/paymentService.test.ts` passed.
- `npx tsc --noEmit --pretty false` passed.
- `npm run lint` passed with 10 pre-existing warnings outside the team-registration changes.

## Context and Orientation

Canonical teams are stored in Prisma model `CanonicalTeams`, which maps to the database table named `Teams`. Team memberships are stored in `TeamRegistrations`. The existing event paid registration flow lives in `src/app/api/billing/purchase-intent/route.ts` and creates a temporary event registration before creating a Stripe PaymentIntent. The webhook in `src/app/api/billing/webhook/route.ts` later activates successful purchases. Team registration should mirror that shape so capacity is protected before money is collected.

The web team detail modal lives in `src/components/ui/TeamDetailModal.tsx`. It already displays jersey numbers but does not let managers edit them. Team service calls live in `src/lib/teamService.ts`, payment helpers live in `src/lib/paymentService.ts`, and shared TypeScript types live in `src/types/index.ts`.

## Plan of Work

First, add schema and type support. `CanonicalTeams` gains `openRegistration` and `registrationPriceCents`; `TeamMembershipStatusEnum` gains `STARTED`. Team serializers and route schemas return and accept these fields with safe defaults. Generated Prisma output must be updated without discarding unrelated local generated changes.

Second, add server registration helpers. A helper locks the team row, verifies open registration, removes stale `STARTED` rows, rejects duplicate active or pending membership, counts `ACTIVE + STARTED` against `teamSize`, and creates either `ACTIVE` for free registration or `STARTED` for paid reservation. Leaving a team sets the caller's registration to `LEFT` and removes the team from user membership lists without deleting history.

Third, extend billing. `purchase-intent` accepts a `team_registration` purchase, reserves the team slot before creating the PaymentIntent, puts team and registration IDs in metadata, and uses the existing connected-account transfer resolver with organization-first priority. The webhook activates the reserved registration after Stripe succeeds.

Fourth, update web UI. The team edit modal gets an open-registration checkbox, a guarded cost input, and jersey-number inputs. Readonly team detail gets Register for team and Leave Team actions. Paid teams open the existing PaymentModal; free teams call the self-registration endpoint.

## Concrete Steps

Run commands from `C:\Users\samue\Documents\Code\mvp-site` unless otherwise noted.

1. Edit Prisma schema, migration files, generated client, server helpers, billing routes, webhook route, shared types, services, and UI files described above.
2. Run Prisma generation if available through the repository package scripts or `npx prisma generate`.
3. Run focused Jest tests for team routes, billing purchase intent, webhook activation, services, and modal behavior.
4. Run typecheck/build and lint if the focused tests pass.

## Validation and Acceptance

Acceptance is met when a free open team lets a non-member register without payment, a paid open team creates a `STARTED` team registration before creating a PaymentIntent and activates it after webhook success, full teams reject concurrent pending registrations, active members can leave into `LEFT`, and managers can edit player jersey numbers from the site modal.

## Idempotence and Recovery

The migration is additive and should be safe to apply once. If Prisma generation rewrites files with unrelated local changes, review the diff before continuing and preserve all existing work. If Stripe API calls are mocked in tests, verify that reservation cleanup runs when PaymentIntent creation throws.

## Artifacts and Notes

Use the existing PaymentIntent flow instead of introducing Checkout Sessions because this application must reserve team capacity before payment and activate registration from webhook metadata after success.

## Interfaces and Dependencies

At completion, team API responses include `openRegistration`, `registrationPriceCents`, `organizationId`, `createdBy`, and `playerRegistrations` with jersey data. New endpoints exist at `POST /api/teams/[id]/registrations/self` and `DELETE /api/teams/[id]/registrations/self`. Billing purchase intents support metadata `purchase_type=team_registration`, `team_id`, `registration_id`, and `user_id`.

