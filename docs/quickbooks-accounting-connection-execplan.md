# QuickBooks Accounting Connection Foundation

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document follows `PLANS.md` in the repository root.

## Purpose / Big Picture

BracketIQ already has an internal staff payroll ledger. The next useful step is to let an organization connect a QuickBooks Online company so payroll exports and accounting sync can later post to that company instead of staying as CSV-only handoffs. After this change, a finance manager can open the organization Finance tab, see whether QuickBooks is connected, launch the Intuit OAuth flow, and have BracketIQ store the connected QuickBooks company id (`realmId`) and encrypted OAuth tokens. This step does not post pay runs to QuickBooks yet; it establishes the secure connection foundation required before any sync can be implemented.

## Progress

- [x] (2026-06-10 12:10 America/Los_Angeles) Confirmed the user has an Intuit account ready and chose QuickBooks Online connection foundation as the next step after manual payroll export tracking.
- [x] (2026-06-10 12:18 America/Los_Angeles) Reviewed Intuit OAuth 2.0 documentation, current Stripe Connect state handling, organization finance access checks, and finance UI loading.
- [x] (2026-06-10 09:02 America/Los_Angeles) Add provider-neutral accounting connection schema, migration, generated Prisma types, and token encryption helper.
- [x] (2026-06-10 09:05 America/Los_Angeles) Add QuickBooks OAuth state, authorize URL, token exchange, token refresh, connection listing, connection upsert, and disconnect helpers.
- [x] (2026-06-10 09:08 America/Los_Angeles) Add organization finance API routes for QuickBooks connect/disconnect/callback and include safe connection status in finance payloads.
- [x] (2026-06-10 09:11 America/Los_Angeles) Add organization finance UI connection card and tests.
- [x] (2026-06-10 09:17 America/Los_Angeles) Update README/dev wrapper/env documentation and run validation.

## Surprises & Discoveries

- Observation: Intuit OAuth returns the connected QuickBooks company id as `realmId`, and that value is required for later QuickBooks API endpoint URLs.
  Evidence: Official Intuit OAuth docs describe the callback response containing `code`, `state`, and `realmId`.

- Observation: Intuit access tokens are short-lived and refresh tokens rotate; BracketIQ must store the latest refresh token from every refresh response.
  Evidence: Official Intuit FAQ states access tokens last 3,600 seconds, refresh tokens are valid for 100 days if used, and the refresh token value can change after refresh.

- Observation: The repo has no generic encrypted-token storage helper.
  Evidence: Searching `src` for encryption helpers found OAuth tokens such as Apple and Gmail stored or used directly, but no reusable `encrypt`/`decrypt` utility.

- Observation: Stripe Connect already has the right state-token and safe redirect pattern.
  Evidence: `src/app/api/billing/host/stripeConnectState.ts` signs a short-lived JWT state with `AUTH_SECRET`, sanitizes same-origin return URLs, and appends result query parameters on callback.

## Decision Log

- Decision: Store QuickBooks in a new provider-neutral `OrganizationAccountingConnections` table instead of adding QuickBooks fields to `Organizations`.
  Rationale: QuickBooks is one provider now, but payroll/accounting may later support other providers. A separate table keeps connection state, tokens, status, and provider metadata isolated from core organization profile data.
  Date/Author: 2026-06-10 / Codex

- Decision: Encrypt Intuit access and refresh tokens before writing them to the database.
  Rationale: OAuth tokens are sensitive secrets. The database should not contain plaintext tokens even in local development. The helper derives an AES-GCM key from `INTEGRATION_TOKEN_ENCRYPTION_KEY` when present, otherwise `AUTH_SECRET`.
  Date/Author: 2026-06-10 / Codex

- Decision: Request only `com.intuit.quickbooks.accounting` for the first QuickBooks connection.
  Rationale: This first step needs company/accounting access for future expense or journal-entry sync. Payroll-specific Intuit scopes are more limited and should be added only when the exact API workflow is selected.
  Date/Author: 2026-06-10 / Codex

- Decision: Do not post staff pay runs to QuickBooks in this step.
  Rationale: Pay-run posting needs mapping decisions: vendors versus employees, expense accounts, classes/locations, payroll liabilities, and whether to create journal entries, bills, checks, or external payroll references. Those should be explicit after the connection exists.
  Date/Author: 2026-06-10 / Codex

## Outcomes & Retrospective

Implemented the QuickBooks Online accounting connection foundation. Organization finance payloads now include safe accounting connection status, the finance tab renders a QuickBooks connection card, and finance managers can start connect, see local configuration errors in place, or disconnect an existing stored connection. OAuth state is signed, callback redirects are constrained to same-origin URLs, Intuit tokens are exchanged server-side, and stored tokens are encrypted before database writes.

This step intentionally does not create QuickBooks vendors, expenses, bills, checks, journal entries, or pay-run sync records. The next implementation step should add accounting mapping settings and a draft export/sync object for approved staff pay runs.

## Context and Orientation

The current organization finance surface is `src/app/organizations/[id]/OrganizationFinancePanel.tsx`. It loads data from `GET /api/organizations/[id]/finance`, which is implemented by `src/app/api/organizations/[id]/finance/route.ts`. Finance permission is checked through `src/server/finance/financeAccess.ts`.

The current internal payroll ledger is implemented by `StaffPayRun` and `StaffPayRunItem` in `prisma/schema.prisma` and by `src/server/finance/staffPayRuns.ts`. A pay run can be created, approved, marked paid, voided, and exported as CSV. The previous step added scheduled pay dates and export metadata.

QuickBooks Online OAuth uses an authorization URL at `https://appcenter.intuit.com/connect/oauth2`, a token endpoint at `https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer`, and a callback query that includes `code`, `state`, and `realmId` when successful. `state` must be validated to prevent cross-site request forgery. The redirect URI registered in the Intuit developer app must exactly match the callback URL BracketIQ sends.

## Plan of Work

First, add Prisma enums for accounting providers and connection status, then add `OrganizationAccountingConnections`. It stores one connection per organization and provider, the external company id (`realmId` for QuickBooks), visible metadata such as scopes and environment, encrypted token fields, expiry timestamps, status, and audit fields. Add an additive SQL migration and regenerate Prisma.

Second, add server helpers under `src/server/integrations`. `secretCrypto.ts` will encrypt and decrypt token strings using AES-256-GCM. `quickBooksConnection.ts` will build signed OAuth state tokens, build the Intuit authorization URL, exchange codes and refresh tokens, sanitize connection status for client payloads, upsert the connected company, and mark a connection disconnected.

Third, add API routes. `POST /api/organizations/[id]/finance/integrations/quickbooks/connect` checks finance access and returns an Intuit authorization URL. `GET /api/integrations/quickbooks/callback` validates state, exchanges the code for tokens, stores the connection, and redirects back to the organization finance tab without leaving code or token values in the browser URL. `POST /api/organizations/[id]/finance/integrations/quickbooks/disconnect` marks the connection disconnected and clears stored token fields. `GET /api/organizations/[id]/finance` should include a safe `accountingConnections` payload so the finance panel can render current state.

Fourth, update the organization finance UI. Add a compact QuickBooks card near the Staff pay runs section showing connected/disconnected status, company id, environment, scopes, last connection date, and buttons for Connect/Reconnect or Disconnect. The connect button calls the connect API and navigates the browser to the returned authorization URL. The disconnect button calls the disconnect API and reloads finance data.

Fifth, add tests for the encryption helper, QuickBooks server helpers, OAuth routes, finance route payload, and finance panel connect/disconnect behavior. Update README and the dev wrapper so ngrok dev sessions set `INTUIT_REDIRECT_URI` to `/api/integrations/quickbooks/callback`.

## Concrete Steps

Run all commands from `/Users/elesesy/StudioProjects/mvp-site`.

After schema changes:

    npx prisma generate

For local database verification:

    npx prisma migrate status

For focused tests:

    npm test -- --runInBand --runTestsByPath src/server/integrations/__tests__/quickBooksConnection.test.ts src/app/api/organizations/__tests__/organizationFinanceRoutes.test.ts src/app/api/organizations/__tests__/quickBooksFinanceIntegrationRoutes.test.ts src/app/api/integrations/quickbooks/__tests__/callback.route.test.ts 'src/app/organizations/[id]/__tests__/OrganizationFinancePanel.test.tsx' src/server/finance/__tests__/staffPayRuns.test.ts src/components/ui/__tests__/TeamFinancePanel.test.tsx

For static checks:

    npx tsc --noEmit
    git diff --check

## Validation and Acceptance

Acceptance is met when a finance manager can see a QuickBooks connection card on the organization Finance page, click Connect, and receive an Intuit OAuth URL with the expected client id, accounting scope, exact callback URL, and signed state. A callback with a mocked token response must store an `OrganizationAccountingConnections` row with encrypted tokens and redirect back to the finance tab with `quickbooks=return`. Disconnect must change the visible status to disconnected and clear token fields.

Because a real Intuit OAuth consent flow requires a developer app, configured redirect URI, and user interaction outside this repo, automated tests mock Intuit token exchange. Browser smoke testing should verify the local card and configuration-error state; a real OAuth round trip can be performed after `INTUIT_CLIENT_ID`, `INTUIT_CLIENT_SECRET`, and a matching `INTUIT_REDIRECT_URI` are configured.

## Idempotence and Recovery

The migration is additive. Re-running `npx prisma generate` is safe. If the callback is hit twice with the same code, Intuit may reject the second token exchange; the route should redirect with `quickbooks=error&reason=token_exchange_failed` and must not expose tokens. Disconnect is idempotent: calling it on an already disconnected or missing connection leaves the organization without active QuickBooks credentials.

## Artifacts and Notes

- Added migration `prisma/migrations/20260610121500_add_organization_accounting_connections/migration.sql`.
- Added server helpers `src/server/integrations/secretCrypto.ts` and `src/server/integrations/quickBooksConnection.ts`.
- Added routes:
  - `src/app/api/organizations/[id]/finance/integrations/quickbooks/connect/route.ts`
  - `src/app/api/organizations/[id]/finance/integrations/quickbooks/disconnect/route.ts`
  - `src/app/api/integrations/quickbooks/callback/route.ts`
- Updated `src/app/api/organizations/[id]/finance/route.ts` and `src/app/organizations/[id]/OrganizationFinancePanel.tsx`.
- Updated README environment documentation and `scripts/dev-with-ngrok.mjs` so ngrok dev sessions set `INTUIT_REDIRECT_URI`.
- Validation:
  - `npx prisma generate` passed.
  - `npm test -- --runInBand --runTestsByPath src/server/integrations/__tests__/quickBooksConnection.test.ts src/app/api/organizations/__tests__/organizationFinanceRoutes.test.ts src/app/api/organizations/__tests__/quickBooksFinanceIntegrationRoutes.test.ts src/app/api/integrations/quickbooks/__tests__/callback.route.test.ts 'src/app/organizations/[id]/__tests__/OrganizationFinancePanel.test.tsx' src/server/finance/__tests__/staffPayRuns.test.ts src/components/ui/__tests__/TeamFinancePanel.test.tsx` passed: 7 suites, 47 tests.
  - `npx tsc --noEmit` passed.
  - `git diff --check` passed after trimming generated Prisma whitespace.
  - `npx prisma migrate deploy` applied the migration locally, and `npx prisma migrate status` reports the database schema is up to date.
  - Browser smoke test on `http://localhost:3001/organizations/org_1/finance` loaded seeded finance data, showed the QuickBooks card as `Not connected`, and clicking `Connect` showed `QuickBooks is not configured.` in the QuickBooks card when Intuit env vars were absent.

## Interfaces and Dependencies

Environment variables:

    INTUIT_CLIENT_ID
    INTUIT_CLIENT_SECRET
    INTUIT_REDIRECT_URI (optional callback override)
    INTUIT_ENVIRONMENT (optional, sandbox or production, defaults to sandbox)
    INTUIT_SCOPES (optional, defaults to com.intuit.quickbooks.accounting)
    INTEGRATION_TOKEN_ENCRYPTION_KEY (optional, falls back to AUTH_SECRET)

Prisma model to add:

    OrganizationAccountingConnections

Server helper modules to add:

    src/server/integrations/secretCrypto.ts
    src/server/integrations/quickBooksConnection.ts

API routes to add:

    src/app/api/organizations/[id]/finance/integrations/quickbooks/connect/route.ts
    src/app/api/organizations/[id]/finance/integrations/quickbooks/disconnect/route.ts
    src/app/api/integrations/quickbooks/callback/route.ts
