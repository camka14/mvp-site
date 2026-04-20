# Implement Organization Verification with Stripe Connect Express Accounts

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document is maintained in accordance with [PLANS.md](/Users/elesesy/StudioProjects/mvp-site/PLANS.md) at the `mvp-site` repository root.

## Purpose / Big Picture

Organizations in this product can currently look identical whether they are a trusted payout recipient or an unverified shell. The code also treats any connected Stripe account as equivalent, which means an organization can appear payment-ready without a reviewable verification state. After this change, organizations will onboard through Stripe Connect Express accounts, the app will track whether Stripe has fully verified the organization, and the UI will only show a verified badge when Stripe has finished the required onboarding checks.

The user-visible result is concrete. An organization manager will start onboarding from the org page, complete Stripe-hosted onboarding, return to the app, and see one of four states: unverified, pending, action required, or verified. Verified organizations will get a badge on organization surfaces, the admin dashboard will show a review queue for action-required organizations, and paid organization-hosted flows will only unlock when the organization is either fully verified through the new flow or explicitly grandfathered from the legacy flow.

## Progress

- [x] (2026-04-13T17:36:00Z) Confirmed the current org Stripe integration still uses OAuth-based Connect onboarding in `src/app/api/billing/host/connect/route.ts` and `src/app/api/billing/host/callback/route.ts`.
- [x] (2026-04-13T17:36:00Z) Confirmed organization billing eligibility and org UI badges are currently driven only by `Organizations.hasStripeAccount`.
- [x] (2026-04-13T17:42:00Z) Confirmed Stripe account persistence currently stores only `accountId`, `customerId`, `userId`, `organizationId`, and `email` in `prisma/schema.prisma`.
- [x] (2026-04-13T17:48:00Z) Confirmed Stripe Connect Express onboarding supports hosted onboarding, account links, and webhook/account polling for completion state.
- [x] (2026-04-13T17:51:00Z) Confirmed Stripe’s “additional verifications” document-only enforcement is invite-only and cannot be treated as generally available product behavior in this repo today.
- [x] (2026-04-13T18:05:00Z) Added organization verification enums and Stripe account metadata to `prisma/schema.prisma`, created migration `20260413203000_org_verification_express_accounts`, and regenerated Prisma client under `src/generated/prisma`.
- [x] (2026-04-13T18:18:00Z) Added shared verification helpers in `src/lib/organizationVerification.ts` and server-side sync logic in `src/server/organizationStripeVerification.ts`.
- [x] (2026-04-13T18:29:00Z) Replaced org onboarding in `src/app/api/billing/host/connect/route.ts` with managed Express account creation/reuse and hosted account-link onboarding.
- [x] (2026-04-13T18:34:00Z) Updated onboarding management, legacy org callback handling, and billing webhook handling so org verification state syncs on demand and on `account.updated`.
- [x] (2026-04-13T18:42:00Z) Updated organization/event/admin UI to consume verification state, added org verified badges, and added the admin verification review queue.
- [x] (2026-04-13T18:51:00Z) Added focused regression coverage for managed org onboarding and `account.updated` syncing, then ran targeted Jest and TypeScript validation.

## Surprises & Discoveries

- Observation: The repo already contains a mixed Connect model where both users and organizations reuse the same OAuth callback and the same `stripeAccounts` table row shape.
  Evidence: `src/app/api/billing/host/connect/route.ts` branches only on `organizationId`; `src/app/api/billing/host/callback/route.ts` writes either `org_${id}` or `user_${id}` rows and flips `hasStripeAccount` to `true`.

- Observation: Stripe Express onboarding completion cannot be inferred from the redirect back to the app alone.
  Evidence: Stripe’s Connect Express documentation requires checking `details_submitted`, `charges_enabled`, and webhook updates after the return URL is hit.

- Observation: The repo’s current Connect helper `resolveConnectedAccountId` always picks the newest account row, which would incorrectly route funds to a not-yet-verified managed org account if we add one without extra gating.
  Evidence: `src/lib/stripeConnectAccounts.ts` currently selects the latest row by `updatedAt` and ignores account origin or readiness flags.

- Observation: Stripe’s “additional verifications” product can request government ID documents during Connect onboarding, but Stripe documents it as invite-only.
  Evidence: Stripe’s Connect verification docs describe additional verifications as a private-preview or invite-only capability, so the implementation here must ship without assuming preview access.

## Decision Log

- Decision: Keep user-host payout onboarding on the existing path for now and scope the new Express-account verification flow to organizations.
  Rationale: The user explicitly asked to implement the organization plan with Express accounts, and the current user billing path already underpins non-organization host flows that should not be destabilized in the same change.
  Date/Author: 2026-04-13 / Codex

- Decision: Treat “verified” as a Stripe-derived state, not an admin override.
  Rationale: The product requirement is that the verified badge only appears when all verifications are completed. Admin review is therefore a support queue and audit surface, not a substitute for Stripe completion.
  Date/Author: 2026-04-13 / Codex

- Decision: Preserve legacy organization-connected accounts for billing during migration, but do not award them the verified badge until they reconnect through the new managed onboarding flow.
  Rationale: Existing organizations must continue operating, but the verified badge is reserved for accounts whose verification state the app can now track explicitly.
  Date/Author: 2026-04-13 / Codex

- Decision: Ship the Express-account verification state machine now, and document the Stripe preview-only document-enforcement limitation instead of pretending it is generally available.
  Rationale: The app can immediately enforce verified badges, billing readiness, webhook syncing, and retry flows. Mandatory upfront document collection beyond Stripe’s standard hosted requirements depends on Stripe enabling the preview for this platform.
  Date/Author: 2026-04-13 / Codex

## Outcomes & Retrospective

The app now has an explicit organization verification lifecycle instead of a single “has Stripe account” flag pretending to cover onboarding, verification, and badge eligibility. The finished implementation adds three durable pieces:

1. a managed Stripe-account record for organizations that onboard through the new Express flow
2. a Stripe-derived organization verification state used by the org page, organization cards, and billing gates
3. an admin review queue for organizations stuck in Stripe’s action-required state

Legacy connected organizations are still allowed to use billing during migration, but they do not receive the verified badge until they reconnect through the managed flow. This preserves existing operations without weakening the product rule that the badge only appears once Stripe verification is complete.

Validation results:

    cd /Users/elesesy/StudioProjects/mvp-site
    npx prisma generate
    Result: Passed. Prisma Client regenerated successfully into `src/generated/prisma`.

    cd /Users/elesesy/StudioProjects/mvp-site
    npx tsc --noEmit
    Result: Passed.

    cd /Users/elesesy/StudioProjects/mvp-site
    npm test -- --runInBand --runTestsByPath \
      'src/app/api/billing/host/__tests__/connect.route.test.ts' \
      'src/app/api/billing/host/__tests__/callback.route.test.ts' \
      'src/app/api/billing/host/__tests__/onboarding-link.route.test.ts' \
      'src/app/api/billing/__tests__/webhookRoute.test.ts' \
      'src/server/repositories/__tests__/events.upsert.test.ts' \
      'src/app/organizations/[id]/__tests__/FieldsTabContent.test.tsx'
    Result: Passed. 65 tests passed.

    cd /Users/elesesy/StudioProjects/mvp-site
    git diff --name-only -- '*.ts' '*.tsx' '*.prisma' '*.md' '*.sql' | sed '/^src\\/generated\\//d' | xargs npx eslint
    Result: Passed with existing warnings in `src/app/events/[id]/schedule/components/EventForm.tsx` (`react-hooks/exhaustive-deps`) and the expected Prisma-schema file ignore warning.

## Context and Orientation

This repository is a Next.js App Router application with Prisma-backed Postgres persistence. The Stripe integration lives in `src/app/api/billing/*` and `src/lib/stripeConnectAccounts.ts`. The organization domain model lives in `prisma/schema.prisma`, the generated Prisma client in `src/generated/prisma`, and the app-facing organization type in `src/types/index.ts` and `src/lib/organizationService.ts`.

The current organization payout connection flow is legacy OAuth-based Connect onboarding. `src/app/api/billing/host/connect/route.ts` builds a Stripe OAuth authorize URL, `src/app/api/billing/host/callback/route.ts` exchanges the code, and `src/app/api/billing/host/onboarding-link/route.ts` either creates account links or falls back to OAuth again. Every one of those routes treats organizations and users the same way, and the organization page plus event scheduler only care whether `Organizations.hasStripeAccount` is truthy.

For this change, “Express account” means a Stripe-hosted connected account with Stripe-managed onboarding and the Express dashboard. “Managed org account” means the Stripe account row created by this repo for organization verification, distinct from any legacy OAuth-connected account. “Verification state” means the app-level status derived from Stripe account properties such as `details_submitted`, `charges_enabled`, `payouts_enabled`, `requirements.currently_due`, and `requirements.past_due`.

The admin queue is not a second verifier. It is an internal list of organizations whose Stripe-managed onboarding needs support attention because Stripe still requires more information or has disabled payouts/charges.

## Plan of Work

First, extend the data model in `prisma/schema.prisma` so organizations can store a verification status, review status, and verification timestamps, and so `StripeAccounts` can record whether a row came from legacy OAuth or platform-managed onboarding, whether the row is active for billing, and what Stripe currently says about onboarding completeness. After updating the schema, regenerate the Prisma client so the server routes can write the new fields without runtime or TypeScript drift.

Next, add a server-only verification helper module under `src/lib` or `src/server` that can normalize Stripe account requirement arrays, derive an organization verification status, and atomically persist both the Stripe account snapshot and the organization verification summary. This helper will become the single place to decide whether an org is `UNVERIFIED`, `LEGACY_CONNECTED`, `PENDING`, `ACTION_REQUIRED`, or `VERIFIED`.

Then, patch `src/app/api/billing/host/connect/route.ts` so organization onboarding no longer starts with OAuth. Instead, if the caller is onboarding an organization and Stripe is configured, the route must create or reuse a Stripe Express connected account, persist it as a platform-managed Stripe account row, create an onboarding account link, and return that hosted onboarding URL. The user path remains on the current flow. In local or mock mode, the org flow should still simulate a fully connected state so development and tests stay usable.

After that, patch `src/app/api/billing/host/onboarding-link/route.ts` so organization managers can reopen onboarding when verification is incomplete, and can open the Express dashboard login link when the managed account is fully onboarded. Legacy org accounts should remain operable, but the route should prefer the managed account when one exists. The OAuth callback route should continue supporting user onboarding and legacy org records, but orgs connected that way must land in the legacy-connected state rather than the verified state.

The billing webhook in `src/app/api/billing/webhook/route.ts` must start accepting `account.updated` events, identify whether the changed account belongs to a managed organization Stripe account row, and call the verification sync helper. This keeps the app’s badge and billing-gate state in sync with Stripe even when requirements change after the initial onboarding session.

Once the server flow is stable, update `src/lib/stripeConnectAccounts.ts` and the billing gate code in `src/server/repositories/events.ts` to stop treating the newest account row as authoritative. Organization billing should prefer the active managed account when verified, otherwise fall back to a legacy-connected org account during migration. User-host billing remains unchanged.

Finally, update the app-facing organization shape and UI. `src/types/index.ts`, `src/lib/organizationService.ts`, `src/components/ui/OrganizationCard.tsx`, `src/app/organizations/[id]/page.tsx`, `src/app/organizations/[id]/FieldsTabContent.tsx`, and `src/app/events/[id]/schedule/components/EventForm.tsx` must consume the new verification state. Verified badges appear only on organization surfaces. Paid organization-hosted workflows unlock only when the org is verified or grandfathered via legacy connection. Add an admin verification queue in `src/app/admin/AdminDashboardClient.tsx` and its supporting API route so staff can track orgs stuck in action-required state.

## Concrete Steps

From the repository root `/Users/elesesy/StudioProjects/mvp-site`, implement and validate the work in this order:

1. Update `prisma/schema.prisma` with the new enums and fields, create a migration in `prisma/migrations`, and regenerate Prisma with:

       cd /Users/elesesy/StudioProjects/mvp-site
       npx prisma generate

2. Patch the server helper and billing routes:

       cd /Users/elesesy/StudioProjects/mvp-site
       npm test -- --runInBand --runTestsByPath \
         src/app/api/billing/host/__tests__/connect.route.test.ts \
         src/app/api/billing/host/__tests__/callback.route.test.ts \
         src/app/api/billing/host/__tests__/onboarding-link.route.test.ts

3. Patch the webhook, billing selection helper, and event repository tests:

       cd /Users/elesesy/StudioProjects/mvp-site
       npm test -- --runInBand --runTestsByPath \
         src/app/api/billing/__tests__/webhookRoute.test.ts \
         src/server/repositories/__tests__/events.upsert.test.ts

4. Patch the organization and admin UI plus focused tests:

       cd /Users/elesesy/StudioProjects/mvp-site
       npm test -- --runInBand --runTestsByPath \
         src/app/organizations/[id]/__tests__/FieldsTabContent.test.tsx

5. Run the targeted type-safe verification pass:

       cd /Users/elesesy/StudioProjects/mvp-site
       npx tsc --noEmit

The `Concrete Steps` section must be updated with exact command results as implementation proceeds.

The implementation completed these steps successfully. The exact command transcripts and outcomes now appear in `Outcomes & Retrospective`.

## Validation and Acceptance

Acceptance is behavioral:

1. An organization manager can start onboarding from the org page, receive a Stripe-hosted onboarding URL, and the backend records a platform-managed Stripe account row instead of only flipping `hasStripeAccount`.
2. Returning from onboarding without full completion leaves the organization in `PENDING` or `ACTION_REQUIRED`, not `VERIFIED`.
3. When Stripe reports `details_submitted`, `charges_enabled`, and `payouts_enabled` with no currently due or past due requirements on the managed org account, the organization becomes `VERIFIED` and the verified badge appears on the organization page and organization cards.
4. Paid organization-hosted event flows remain blocked for unverified organizations but continue working for legacy-connected organizations during migration.
5. The admin dashboard shows action-required organizations in a dedicated review queue and allows staff to update internal review status and notes without overriding Stripe-derived verification.

Tests should prove the server logic before the UI proof:

- the connect route creates or reuses Express onboarding for organizations
- the callback route preserves legacy OAuth behavior without awarding a verified badge
- the onboarding-link route reopens onboarding or opens the Express dashboard depending on status
- the webhook route syncs verification state from `account.updated`
- the event repository billing gate respects org verification state

## Idempotence and Recovery

The migration should be additive. Re-running `npx prisma generate` is safe. Reopening onboarding is safe because Stripe account links are single-use by design and the route should always generate a fresh link on retry. If a managed org account row exists but onboarding is incomplete, the connect route must reuse it instead of creating duplicates. If the webhook receives repeated `account.updated` events, the sync helper must converge on the same stored verification state rather than creating new rows.

If a schema or code step fails midway, the safe retry path is to finish the schema update, regenerate Prisma, and rerun the focused tests listed above. Avoid deleting existing legacy Stripe account rows because they remain the migration fallback for already-connected organizations.

## Artifacts and Notes

The most important artifact to capture during implementation is the verification-state mapping. The final code should make the following behaviors explicit:

    no managed org account -> UNVERIFIED
    only legacy OAuth org account -> LEGACY_CONNECTED
    managed org account present, onboarding incomplete but no blocking requirements -> PENDING
    managed org account has currently_due, past_due, or disabled_reason -> ACTION_REQUIRED
    managed org account has details_submitted, charges_enabled, payouts_enabled, and no due requirements -> VERIFIED

The other important artifact is the Stripe platform limitation:

    mandatory document-only additional verification is not generally available
    standard Express onboarding still performs Stripe-managed KYC/KYB and may request documents when Stripe requires them
    if Stripe later enables the preview for this platform, the connect route can be extended to request those additional verifications without redesigning the app-level verification state machine

## Interfaces and Dependencies

Use the existing `stripe` Node SDK already installed in `package.json`. Continue using Next.js route handlers and Prisma writes rather than adding a separate server framework. The implementation should end with these stable concepts in place:

- organization verification status enums persisted in `prisma/schema.prisma`
- Stripe account metadata persisted on `StripeAccounts`
- a server helper that derives and persists organization verification state from a Stripe account snapshot
- org onboarding routes that create and manage Stripe Express accounts
- webhook support for `account.updated`
- UI helpers that answer “is this org verified?” and “can this org use paid billing?”

Revision note (2026-04-13 / Codex): Created the initial ExecPlan after repository and Stripe Connect research so implementation can proceed against a written source of truth.
Revision note (2026-04-13 / Codex): Updated the plan after implementation to record the completed migration, the new admin queue, the final validation commands, and the remaining Stripe preview limitation for mandatory document-only verification.
