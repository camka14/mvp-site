# Staff Payroll Step 1: Internal Manual Payroll Ledger

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document follows the repository rules in `PLANS.md`.

## Purpose / Big Picture

This step strengthens BracketIQ's internal payroll ledger before any QuickBooks or embedded payroll integration is added. After this change, an organization finance manager can create a staff pay run with a scheduled pay date, export that pay run for a manual or external payroll process, see when and by whom it was exported, and later record the manual payout provider and reference. This preserves BracketIQ as the source of truth for staff labor and payroll review while leaving room to connect QuickBooks or another provider in a later step.

## Progress

- [x] (2026-06-10 10:00 America/Los_Angeles) Reviewed existing `StaffPayRun`, `StaffPayRunItem`, pay-run API routes, server service, and finance UI.
- [x] (2026-06-10 10:35 America/Los_Angeles) Added additive Prisma fields and migration for scheduled pay date and export tracking.
- [x] (2026-06-10 10:45 America/Los_Angeles) Updated pay-run server service and API validation to persist scheduled pay date and export metadata.
- [x] (2026-06-10 11:00 America/Los_Angeles) Updated organization finance UI to create pay runs with scheduled pay date and to show/export manual payroll metadata.
- [x] (2026-06-10 11:10 America/Los_Angeles) Added Jest coverage for server, API route, and UI behavior.
- [x] (2026-06-10 11:55 America/Los_Angeles) Ran Prisma generation, local migration, targeted tests, TypeScript, diff check, and an in-app browser smoke check.

## Surprises & Discoveries

- Observation: The current manual payroll layer already has draft, approve, mark-paid, void, provider references, item transfer references, and CSV export. Step 1 should therefore improve traceability rather than create another payroll model.
  Evidence: `src/server/finance/staffPayRuns.ts` already exposes `createDraftStaffPayRun`, `updateStaffPayRunStatus`, `MARK_PAID`, `VOID`, and `UPDATE_ITEM_TRANSFERS`.

- Observation: Real local finance data had paid and void pay runs in the same filtered export set.
  Evidence: Browser smoke test on `http://localhost:3001/organizations/org_1/finance` showed paid and void pay runs before clicking `Export filtered CSV`.

- Observation: Export recording needs to be allowed for locked pay runs because it is audit metadata, not a status or payout mutation.
  Evidence: The filtered browser export included a void row and successfully updated visible export state to `CSV #1` after allowing `RECORD_EXPORT` on void pay runs.

## Decision Log

- Decision: Keep `StaffPayRun` and `StaffPayRunItem` as the canonical internal ledger and add fields to `StaffPayRun` rather than introducing a separate payroll batch table.
  Rationale: Existing finance analysis, UI, and API routes already depend on pay runs. A second model would duplicate state and create reconciliation problems before provider integration exists.
  Date/Author: 2026-06-10 / Codex

- Decision: Treat QuickBooks as a later provider connection and keep this step provider-agnostic.
  Rationale: The user has an Intuit account ready, but step 1 is the internal/manual foundation. A provider-neutral ledger gives QuickBooks a stable sync target in the next step.
  Date/Author: 2026-06-10 / Codex

- Decision: Permit `RECORD_EXPORT` for paid and void pay runs while preserving their locks for status, transfer, and payout changes.
  Rationale: CSV export is an audit handoff event. Blocking it for void rows breaks filtered exports and prevents managers from recording what was included in an external payroll/accounting handoff.
  Date/Author: 2026-06-10 / Codex

## Outcomes & Retrospective

Implemented. Organization finance managers can now assign a scheduled pay date when creating a staff pay run, export pay runs to CSV, and see export metadata in the pay-run table and detail modal. Export metadata includes last export timestamp, exporting user id, export count, and export format. The local database migration was applied; `npx prisma migrate dev` exited non-zero after applying it because Prisma requested interactive confirmation for an unrelated existing `Events.divisions` drift warning, and `npx prisma migrate status` then reported the schema is up to date.

Validation completed:

    npx prisma generate
    npx prisma migrate dev (applied migration, then exited non-zero on unrelated interactive drift warning)
    npx prisma migrate status
    npm test -- --runInBand --runTestsByPath src/server/finance/__tests__/staffPayRuns.test.ts 'src/app/api/organizations/__tests__/organizationFinanceRoutes.test.ts' 'src/app/organizations/[id]/__tests__/OrganizationFinancePanel.test.tsx' src/components/ui/__tests__/TeamFinancePanel.test.tsx
    npx tsc --noEmit
    git diff --check

Browser smoke test: opened `http://localhost:3001/organizations/org_1/finance`, verified `Pay date` and `Export` columns, clicked `Export filtered CSV`, confirmed visible rows changed to `CSV #1`, and opened a pay-run detail modal confirming `Exported ... (CSV #1)`.

## Context and Orientation

Payroll in this repository currently lives in the finance area. The Prisma schema is in `prisma/schema.prisma`. The service that creates and mutates staff pay runs is `src/server/finance/staffPayRuns.ts`. The API routes are `src/app/api/organizations/[id]/finance/pay-runs/route.ts` for listing and creating pay runs and `src/app/api/organizations/[id]/finance/pay-runs/[payRunId]/route.ts` for status updates. The organization finance UI is `src/app/organizations/[id]/OrganizationFinancePanel.tsx`.

A pay run is a batch of staff pay items for a date range. A pay item is one staff member's amount from event labor or team labor. Manual payroll means BracketIQ records and exports the pay run, but the actual money movement and tax handling happen outside BracketIQ.

## Plan of Work

First, add fields to `StaffPayRun` for `scheduledPayDate`, `exportedAt`, `exportedByUserId`, `exportCount`, and `lastExportFormat`. These are additive nullable/default fields, so existing data remains valid.

Second, add a service action for recording exports. Exporting CSV in the browser should update the ledger so managers can see that a batch was handed off externally. This action should not change pay-run status; it only records traceability.

Third, update the create pay-run API and UI so scheduled pay date can be set up front. Update the CSV export to include scheduled pay date and export metadata. Update the pay-run details and list table to show scheduled pay date and export status.

Fourth, update tests for server pay-run creation/export recording and UI create/export behavior.

## Concrete Steps

From `/Users/elesesy/StudioProjects/mvp-site`, edit the files named above, create a Prisma migration, run `npx prisma generate`, run targeted tests, and run `npx tsc --noEmit`.

## Validation and Acceptance

Acceptance is met when a finance manager can create a pay run with a scheduled pay date, export that pay run, and then see export metadata in the pay-run list/details. The targeted Jest suites for pay runs and organization finance must pass, and TypeScript must compile.

## Idempotence and Recovery

The migration is additive. Re-running Prisma generate is safe. If tests fail, keep the migration and schema but fix the service/UI contract until all targeted tests pass.

## Artifacts and Notes

No implementation transcript yet.

## Interfaces and Dependencies

`StaffPayRun` must include:

    scheduledPayDate DateTime?
    exportedAt DateTime?
    exportedByUserId String?
    exportCount Int @default(0)
    lastExportFormat String?

`updateStaffPayRunStatus` must accept a new action `RECORD_EXPORT` with `exportFormat`.
