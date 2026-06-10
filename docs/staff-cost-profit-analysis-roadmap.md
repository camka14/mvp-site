# Staff Cost and Profit Analysis Roadmap

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document follows `PLANS.md` in the repository root. Any contributor who changes this plan must keep it self-contained, update the living sections, and preserve enough detail for a novice contributor to implement the feature without relying on prior conversation.

## Purpose / Big Picture

BracketIQ organization owners need to understand whether events, rentals, leagues, tournaments, teams, and other sales are profitable. After this feature is implemented, an organization owner or finance-capable staff member can enter staff compensation rules, assign staff to events and teams, add custom event, team, or organization costs, and see generated profit analysis that updates when registrations, refunds, staff wages, staff assignments, team registrations, or rental payments change.

The first user-visible goal is an event finance tab that explains actual profit, potential open-spot revenue, and projected profit with clear line items. Team finance must also be first-class: teams can have registration costs for events, staff or coach labor costs, and custom team costs. The broader organization goal is a finance area that summarizes sales, refunds, Stripe fees, staff labor, team costs, custom costs, and rental revenue across time.

## Progress

- [x] (2026-06-09 19:34Z) Created the initial roadmap on branch `feature/staff-cost-profit-analysis-plan`.
- [x] (2026-06-09 19:34Z) Confirmed current staff roles already live in `prisma/schema.prisma` as `OrganizationRoles`, with staff assignments to roles through `StaffMembers.roleId`.
- [x] (2026-06-09 19:34Z) Confirmed field rental actuals should use existing bills, bill payments, and refunds rather than a new rental price history model.
- [x] (2026-06-09 19:42Z) Added team finance scope for team profit, team staff costs, and event registration costs paid by teams.
- [x] (2026-06-09 20:04Z) Implemented additive Prisma schema, SQL migration, and generated Prisma client output for compensation history, event staff assignments, team staff labor entries, and custom financial line items.
- [x] (2026-06-09 20:04Z) Implemented initial pure finance calculation helpers for event revenue, team registration costs, refunds, fees, staff labor, team staff labor, custom costs, and event open-spot potential revenue.
- [x] (2026-06-09 20:04Z) Added focused Jest coverage for team registration bills as event revenue, the same bills as team costs, event-team snapshot bills, staff labor costs, and missing wage warnings.
- [x] (2026-06-09 20:14Z) Applied the additive finance migration to the local `mvp` database on `localhost:5433` and verified Prisma reports the database schema is up to date.
- [x] (2026-06-09 20:14Z) Connected finance calculations to Prisma-backed event/team repository loaders and read-only event/team finance API routes.
- [x] (2026-06-09 20:14Z) Added focused route tests for event and team finance access and payload handoff.
- [x] (2026-06-09 20:43Z) Added create endpoints and mutation helpers for staff/role compensation rates, event staff labor, team staff labor, and custom organization/event/team/event-team finance line items.
- [x] (2026-06-09 20:43Z) Added focused Jest coverage for compensation history writes, labor entry validation, custom line item scope attachment, and finance write route permissions.
- [x] (2026-06-09 22:19Z) Added service start/end dates to custom financial line items and updated local Prisma migration/generation so costs can be classified as actual or future by date.
- [x] (2026-06-09 22:19Z) Added the event finance tab with summary cards, profit/loss/potential/future-cost analysis, responsive line item views, and custom dated event cost creation.
- [x] (2026-06-09 22:19Z) Added focused tests, typecheck validation, local migration validation, and browser smoke screenshots for the event finance/date-range slice.
- [x] (2026-06-09 22:32Z) Added the organization staff Compensation view for role default rates and individual staff override rates with wage type, amount, and effective date inputs.
- [x] (2026-06-09 23:20Z) Added the team finance UI in the organization team detail modal with team registration costs, team staff costs, custom team costs, focused tests, typecheck validation, and browser smoke checks for custom and staff costs.
- [x] (2026-06-09 23:51Z) Add a dedicated organization Finance/Payroll tab with organization rollups, pay-run list, and pay-run creation entry points.
- [x] (2026-06-09 23:51Z) Add Prisma pay-run models for `StaffPayRun` and `StaffPayRunItem`, including payout status, approval fields, and source links to event staff labor and team staff labor.
- [x] (2026-06-10 00:38Z) Browser-test team registration payments and refunds changing team profit in the rendered team finance UI.
- [x] (2026-06-10 00:38Z) Extend generated line item calculation for rental sales and organization-level rollups.
- [x] (2026-06-10 00:38Z) Add organization finance UI for cross-event and rental analysis.
- [x] (2026-06-10 00:38Z) Add focused team refund browser QA, organization finance/payroll browser QA, pay-run tests, migration validation, type checks, and targeted Jest coverage.
- [x] (2026-06-10 02:52Z) Added generated finance line item source/customer metadata, `Source - Customer` labels for registrations and refunds when names are available, quantity/unit display in the organization finance table, generated-row source/customer action popovers, disappearing finance table scrollbars, path-backed organization tabs, and selected-customer URLs.

## Surprises & Discoveries

- Observation: The repo already has an organization role table. `StaffMembers` has `roleId`, and `OrganizationRoles` plus `OrganizationRolePermissions` support the current staff role and permission model.
  Evidence: `prisma/schema.prisma` contains `model StaffMembers`, `model OrganizationRoles`, and `model OrganizationRolePermissions`.

- Observation: The existing `EventTeamStaffAssignments` model is team-roster related and should not be reused as the general event labor source.
  Evidence: `EventTeamStaffAssignments` stores `eventTeamId`, `userId`, and a team staff role. It does not store event-level start time, end time, actual hours, or payroll rate selection.

- Observation: Field rentals already have sales-facing records through `TimeSlots`, `Bills`, and `BillPayments`.
  Evidence: `TimeSlots` has `price`, `Bills` has `ownerType`, `eventId`, `slotId`, and `totalAmountCents`, and `BillPayments` has `amountCents`, `status`, refund amount, tax, and Stripe fee fields.

- Observation: Team registration billing already uses `Bills.ownerType = TEAM` and event billing routes.
  Evidence: `BillsOwnerTypeEnum` contains `TEAM`, `Bills` stores `ownerType`, `ownerId`, `eventId`, and payment fields, and `src/app/api/events/[eventId]/participants/route.ts` creates team registration bills with `ownerType: 'TEAM'`.

- Observation: The repo has two team concepts that must be kept distinct in finance reporting. `CanonicalTeams` maps to the physical table named `Teams` and represents the reusable organization team. `Teams` maps to the physical table named `EventTeams` and represents a team's event-specific snapshot.
  Evidence: `prisma/schema.prisma` has `model CanonicalTeams @@map("Teams")` and `model Teams @@map("EventTeams")`, with event snapshots storing `parentTeamId`.

- Observation: Prisma 7 generated duplicate default index names for the role compensation effective-date indexes because the long model and field names truncate to the same name.
  Evidence: `npx prisma validate` failed until the schema used explicit `map` names `OrgRoleCompRates_role_effectiveFrom_idx` and `OrgRoleCompRates_role_effectiveTo_idx`.

- Observation: `npx prisma generate` introduced trailing whitespace in generated files.
  Evidence: `git diff --check` reported generated-file whitespace before the whitespace cleanup; it passed after mechanically stripping trailing whitespace from generated Prisma output.

- Observation: Pay-run item source links follow the repo's ID-centric modeling, so `StaffPayRun` does not expose a Prisma relation named `items`.
  Evidence: Browser QA of `/organizations/org_1?tab=finance` initially returned `Internal Server Error`; the server log showed `Unknown field items for include statement on model StaffPayRun`. `src/server/finance/staffPayRuns.ts` now loads pay runs and `StaffPayRunItem` rows separately and groups items by `payRunId`.

- Observation: A single organization pay run correctly batches every unpaid event/team labor row in the selected date range, not just the labor row used for a team-specific browser fixture.
  Evidence: Browser QA created `Browser QA payroll` for June 1-9, 2026 and the pay-run table showed 5 items totaling `$268.00`, then `PAID / PAID` after approval and mark-paid actions.

- Observation: Generated organization finance rows needed source and customer metadata before the UI could link them reliably. The previous line item payload only carried the generated row source id, which was usually a bill id rather than the event, rental, organization, team, or customer destination.
  Evidence: `src/server/finance/financeRepository.ts` now enriches bill rows with batched event, field, user, canonical team, and event-team lookups before calling `buildOrganizationFinanceSummary`.

## Decision Log

- Decision: Use the existing `OrganizationRoles` table instead of adding a second organization role table.
  Rationale: Role identity and permissions already exist. Compensation should extend those roles through new compensation history rows, not create a parallel role system.
  Date/Author: 2026-06-09 / Codex

- Decision: Store compensation history in separate tables for role defaults and staff member overrides.
  Rationale: Wages and salaries can change over time. Historical event analysis must use the rate that was active when the event happened, while future events should use the current active rate.
  Date/Author: 2026-06-09 / Codex

- Decision: Treat analysis rows as a mix of generated line items and custom line items.
  Rationale: Staff cost, registration revenue, refunds, fees, and rental revenue should update from source records. Manual costs such as supplies, permits, awards, food, or external field rentals should be editable custom line items.
  Date/Author: 2026-06-09 / Codex

- Decision: Do not add field rental price history in this feature.
  Rationale: Field rental actuals should come from existing fixed rental prices, bills, payments, and refunds. Historical price changes are not required for actual rental reporting because the actual paid/refunded records carry the financial result.
  Date/Author: 2026-06-09 / Codex

- Decision: Use paid bill/payment records for actual event revenue instead of multiplying current event price by current registrations.
  Rationale: Actuals must reflect real paid amounts and refunds. Event price changes matter only for future projections and open participant capacity.
  Date/Author: 2026-06-09 / Codex

- Decision: Missing wage data must be visible as an analysis warning, not silently calculated as zero.
  Rationale: A zero labor cost can make an event look profitable when the organization simply has not entered wage data.
  Date/Author: 2026-06-09 / Codex

- Decision: Team finance is a first-class scope alongside event and organization finance.
  Rationale: Teams can generate revenue and costs independently of a single event, and event registration fees paid by a team are revenue to the event or organization but a cost to the team.
  Date/Author: 2026-06-09 / Codex

- Decision: A team event registration bill is classified differently depending on the report view.
  Rationale: In event or organization analysis, a paid team registration is revenue. In team analysis, that same paid bill is a registration cost for the team. The finance calculation service must classify the same source record based on the requested scope instead of duplicating the bill.
  Date/Author: 2026-06-09 / Codex

- Decision: Team staff cost needs its own labor-entry source and should not rely only on current `TeamStaffAssignments` or `EventTeamStaffAssignments`.
  Rationale: Current team staff assignment tables identify coaches, managers, or team staff, but they do not store paid hours, rate overrides, or an event/team cost allocation period. Finance needs explicit labor entries while still linking back to team staff assignments when useful.
  Date/Author: 2026-06-09 / Codex

- Decision: Implement the first calculation layer as pure TypeScript helpers before repository/API/UI wiring.
  Rationale: This makes the accounting rules testable without database setup and proves the core classification behavior: team bills are revenue in event reports and costs in team reports.
  Date/Author: 2026-06-09 / Codex

- Decision: For the first backend slice, staff compensation writes require both staff-management and billing-management access, while custom finance line items use billing or payment management access.
  Rationale: Compensation rates are sensitive staff data, so they should be stricter than ordinary finance ledger edits. This uses existing permissions without introducing new role-permission names before the UI clarifies the final access model.
  Date/Author: 2026-06-09 / Codex

- Decision: Use service start/end dates to classify manually entered costs as actual or future, independent of whether the event itself has started.
  Rationale: A past-dated line item should affect current losses even for a future event, while future-dated custom costs and planned staff labor should be visible as future costs that reduce projected profit but do not inflate current losses.
  Date/Author: 2026-06-09 / Codex

- Decision: Implement staff payment operations first as internal pay runs, not direct provider payouts.
  Rationale: A pay run lets an organization review, approve, and mark staff labor as paid while preserving wage, minute, and amount snapshots. Direct Gusto, Check, Dwolla, Stripe, or other payout-provider integrations can be added later without changing the core finance history.
  Date/Author: 2026-06-09 / Codex

- Decision: Store pay-run source links on each item rather than only on the pay run header.
  Rationale: A single pay run can include multiple event and team labor rows from different dates, teams, and events. Item-level source links make it possible to trace every payable amount back to the event or team labor record that generated it.
  Date/Author: 2026-06-09 / Codex

- Decision: Keep generated finance rows read-only, but make their item names clickable action popovers when source or customer targets are known.
  Rationale: Generated rows should continue to be edited through their true source records, not through the custom line-item editor. A popover with "Go to source" and "Go to customer" gives managers traceability without implying the generated row itself can be edited.
  Date/Author: 2026-06-10 / Codex

- Decision: Introduce path-backed organization tabs while preserving existing `?tab=` query compatibility.
  Rationale: New links such as `/organizations/org_1/finance` and `/organizations/org_1/customers/teams/team_1` support browser back navigation and direct sharing. Existing links that use `?tab=finance` still resolve to the same active tab during the transition.
  Date/Author: 2026-06-10 / Codex

## Outcomes & Retrospective

The initial roadmap established that the feature should extend the current organization role, team, and payment systems instead of duplicating them. The first implementation pass now provides the data foundation and pure accounting helpers. The main remaining risk is defining the exact event and team staff labor user workflows, because the current UI has officials, team staff assignments, and event-team staff assignments but not a single labor-entry surface with hours and compensation-rate resolution.

2026-06-09 implementation outcome: The data foundation, first calculation layer, local migration, repository loaders, read-only event/team finance routes, and create endpoints now exist. `prisma/schema.prisma` and `prisma/migrations/20260609194200_add_staff_team_finance_analysis/migration.sql` add compensation rates, event labor, team labor, and custom line item tables. `src/server/finance/financeAnalysis.ts` returns event and team summaries from plain objects. `src/server/finance/financeRepository.ts` loads bills, bill payments, compensation rates, labor entries, participant counts, and custom line items into those helpers. `src/server/finance/financeAccess.ts` centralizes finance access checks. `src/server/finance/financeMutations.ts` creates compensation history, event staff labor, team staff labor, and scoped custom line items with same-organization validation. `src/app/api/events/[eventId]/finance/route.ts` and `src/app/api/teams/[id]/finance/route.ts` expose read-only summaries. `src/app/api/organizations/[id]/finance/compensation/route.ts`, `src/app/api/organizations/[id]/finance/line-items/route.ts`, `src/app/api/events/[eventId]/finance/staff/route.ts`, and `src/app/api/teams/[id]/finance/staff/route.ts` expose the first write APIs. Focused tests prove the classification rules, missing wage warning behavior, compensation history behavior, labor entry validation, custom line item scope attachment, and route access handoff. Remaining work is UI, organization/rental rollups, update/delete workflows for finance records, compensation management workflows, and broader browser tests.

2026-06-09 event finance/date-range outcome: The event schedule page now exposes a manager-only Finance tab for organization events. `src/app/events/[id]/schedule/components/EventFinancePanel.tsx` renders actual revenue, actual costs, actual profit/loss, future costs, potential open-spot profit, projected outcome, desktop table rows, mobile line item cards, and a custom event cost form with service start/end dates. `prisma/migrations/20260609213000_add_finance_line_item_service_dates/migration.sql` adds service dates to custom line items and backfills the start date from `occurredAt` where available. `src/server/finance/financeAnalysis.ts` classifies dated costs into actual, future, potential, or warning rows. Past/current costs affect current profit or loss; future costs reduce projected profit; potential open-spot revenue remains a yellow projected value. Validation passed with targeted finance Jest tests, `npx tsc --noEmit`, `npx prisma migrate status`, Browser interaction checks, and refreshed screenshots in `output/finance-event-summary-desktop.png` and `output/finance-event-mobile-line-items.png`. Remaining work is compensation UI, event/team labor-entry UI, team finance UI, organization rollups, line-item edit/delete workflows, and broader browser tests.

2026-06-09 compensation UI outcome: The organization staff surface now has a Compensation segmented view for users with both staff management and billing management access. `src/app/organizations/[id]/RoleRosterManager.tsx` loads compensation history through `GET /api/organizations/[id]/finance/compensation`, shows current role default rates and staff override rates, and saves new effective-dated rows through the existing compensation write endpoint. `src/app/api/organizations/[id]/finance/compensation/route.ts` now supports the read endpoint behind the same staff-compensation permission gate used for writes. Focused route and component tests cover the read payload and role-default save body, and a rendered Playwright smoke test created a local Staff role default of `$20.00/hr`. Remaining work for this area is richer history browsing, editing or voiding bad rate rows, and event/team labor-entry screens that consume these rates.

2026-06-09 team finance UI outcome: The organization team detail modal now includes a team finance panel for manageable organization teams. `src/components/ui/TeamFinancePanel.tsx` loads `GET /api/teams/[id]/finance`, renders team registration costs, staff costs, future costs, custom team costs, and generated line items, and posts new custom costs and team staff labor through the existing finance write endpoints. Focused tests cover summary rendering, custom cost submission, staff cost submission, and team detail mounting. Browser smoke testing added a custom team cost and a staff labor cost and verified the rendered projected loss changed. Remaining work is a full browser payment/refund scenario for team registration bills and organization-level finance/payroll rollups.

2026-06-10 organization finance/payroll outcome: The organization detail page now includes a Finance tab for owners and finance-capable staff. `src/app/organizations/[id]/OrganizationFinancePanel.tsx` renders date-filtered gross sales, refunds and fees, current profit, projected profit, staff costs, custom costs, warnings, organization line items, and an internal staff pay-run table with create, approve, mark-paid, and void actions. `prisma/migrations/20260609235100_add_staff_pay_runs/migration.sql` adds `StaffPayRun`, `StaffPayRunItem`, pay-run status enums, payout status enums, approval fields, paid fields, provider reference fields, and item-level source links to event staff assignments and team staff labor entries. `src/server/finance/staffPayRuns.ts` creates draft pay runs from unpaid staff labor and prevents duplicate pay-run items for already-linked labor rows. Browser QA verified a $100 team registration payment became a team cost, a $25 refund added a generated team refund row, and the rendered team loss changed from `-$172.00` to `-$147.00`. Browser QA also verified the organization Finance tab rendered rollups and that a `Browser QA payroll` pay run could be created, approved, and marked `PAID / PAID`. Validation passed with targeted Jest coverage, `npx prisma validate`, `npx prisma migrate status`, `npx tsc --noEmit`, and `git diff --check`.

2026-06-10 generated line item navigation outcome: Generated organization finance rows now carry source and customer metadata when the underlying bill or labor source can be resolved. Registration and refund rows with known names display as `Source Name - Customer Name`, generated rows can open a source/customer action popover, quantity and units appear in the organization finance table, and the line-item scroll area uses a scroll-only scrollbar that hides after inactivity. Organization tabs now have path URLs such as `/organizations/org_1/finance`, while selected customers have deep links such as `/organizations/org_1/customers/users/user_1` and `/organizations/org_1/customers/teams/team_1`. Focused Jest tests cover the calculation labels, finance panel popover actions, and tab path helpers; `npx tsc --noEmit` passes.

## Context and Orientation

This repo is a Next.js App Router app with TypeScript, Mantine UI, Prisma, and Postgres. Prisma models live in `prisma/schema.prisma`. Server-side business logic commonly lives under `src/server`, API routes live under `src/app/api`, client services live under `src/lib`, and organization UI lives under `src/app/organizations/[id]`.

The current organization staff system uses these files and models:

`prisma/schema.prisma` defines `StaffMembers`, `OrganizationRoles`, and `OrganizationRolePermissions`. A `StaffMembers` row links a user to an organization and can reference an `OrganizationRoles` row through `roleId`. `OrganizationRoles` stores the role name, kind, system key, and default flags. `OrganizationRolePermissions` stores permissions assigned to a role.

`src/server/organizationRoles.ts` creates and reads default organization roles. `src/lib/organizationPermissions.ts` defines permission constants such as `STAFF_MANAGE`, `ROLES_MANAGE`, `BILLING_MANAGE`, `PAYMENTS_MANAGE`, and `REFUNDS_MANAGE`.

`src/app/organizations/[id]/RoleRosterManager.tsx` is the current staff role roster UI. `src/app/organizations/[id]/organizationTabs.ts` controls the tabs shown on the organization page. `src/app/organizations/[id]/page.tsx` hosts the organization detail UI.

The current payment and rental system uses these models:

`Bills` stores expected charges and can reference an organization, event, rental slot, or occurrence. `BillPayments` stores payment status, paid amount, refunded amount, tax, and Stripe fee fields. `RefundRequests` stores refund requests. `TimeSlots` stores rental slot timing and price. `Fields` stores organization fields and links rental slot ids through `rentalSlotIds`.

The current team system uses these models:

`CanonicalTeams` represents reusable teams, such as organization teams that can register for multiple events. Prisma maps this model to the physical database table named `Teams`. `TeamRegistrations` stores users on a canonical team. `TeamStaffAssignments` stores team staff such as coaches or managers for a canonical team.

`Teams` represents event-specific team snapshots. Prisma maps this model to the physical database table named `EventTeams`. These rows can point back to a canonical team through `parentTeamId`. `EventTeamStaffAssignments` stores team staff for an event-team snapshot. It should remain a roster or staffing-assignment table, not the only source for paid labor costs.

Team registration payments use the billing system. `Bills.ownerType` can be `TEAM`, and event registration flows create team-owned bills for team registrations. For event and organization reporting, those paid bills are revenue. For team reporting, those same paid bills are costs to the team.

Definitions used in this plan:

A generated line item is a row shown in finance analysis that is calculated from source records. Examples are paid registrations, team registration costs, refunds, Stripe fees, staff labor, team staff labor, and rental payments. Users do not edit generated rows directly; they edit the underlying staff wage, assignment, payment, refund, bill, team registration, or registration record.

A custom line item is a manually entered cost or adjustment. Examples are supplies, uniforms, awards, permits, external field rental costs, marketing, cleanup, food, security, travel, equipment, team payouts, or a one-off payout.

Actual profit means confirmed net revenue minus actual costs. Confirmed net revenue should come from paid records and refunds, not from the current event price.

Potential open-spot revenue means the revenue still available from empty event capacity. It should use the current event price and current missing participant count. This value should be displayed in yellow because it is possible but not guaranteed.

Projected profit means actual profit plus potential open-spot revenue minus projected costs that have not happened yet. When projected costs are unknown, the UI should state which inputs are missing.

Team profit means confirmed team revenue minus team costs. Team revenue can include team dues, team products, sponsorships, or other future team-specific sales. Team costs include event registration bills paid by the team, refunds that affect those costs, Stripe fees when the team pays them, staff or coach labor assigned to the team, and custom team costs. For the initial implementation, team registration costs for events are required; team revenue outside event registration can be added if source records exist.

## Roadmap

Milestone 1 establishes the data foundation. Add Prisma models and migrations for role compensation history, staff compensation override history, event staff assignments, team staff labor entries, and custom financial line items. This milestone should not build the full dashboard. Its acceptance is that Prisma generates successfully, the app can create and read the new records through tests, and existing organization staff role and team billing tests still pass.

Milestone 2 adds compensation management to the organization staff area. Organization owners and users with the chosen finance or staff compensation permission should be able to set a default wage or salary for each existing organization role and override an individual staff member's compensation. The UI should make the time range explicit with effective start and end dates. Its acceptance is that a role wage change creates a new history range and does not overwrite historical ranges.

Milestone 3 adds event staff assignments. Event managers should be able to assign organization staff members to an event, choose the role used for that event, and enter planned hours and actual hours. The calculation engine should choose the staff member override rate first, then the role default rate, based on the event date or assignment start time. Its acceptance is that an event with two staff assignments produces two generated staff cost line items with the expected amounts.

Milestone 4 adds team staff labor and team finance inputs. Team managers or organization staff with finance access should be able to attach paid labor to a canonical team or an event-team snapshot. A team labor entry should be able to reference `TeamStaffAssignments` or `EventTeamStaffAssignments` when the labor comes from an existing team staff member, but it must store planned or actual minutes so hourly, salary-prorated, and flat rates can be calculated. Its acceptance is that a team with a paid coach entry produces a generated team staff cost line item.

Milestone 5 adds custom financial line items. Event managers should be able to add custom event costs. Team managers or finance-capable organization staff should be able to add custom team costs. Organization owners should be able to add organization-wide custom costs. The same table should support all scopes so organization-level reports can show every cost while event-level and team-level reports can show only costs that affect the selected scope. Its acceptance is that a custom team cost appears in the team finance view and the organization finance ledger without duplicate data.

Milestone 6 builds the finance calculation service. Add a server-side analysis module that returns a normalized list of generated and custom line items, plus summary totals. Actual event revenue should use `Bills` and `BillPayments`, including refund amounts and Stripe fees. Event price should be used for open-spot projections only. Team registration bills should become event revenue in event reports and team costs in team reports. Rental sales should be included in organization analysis through existing rental bills, payments, and refunds. Its acceptance is that tests cover paid registration revenue, team registration costs, partial refunds, Stripe fees, staff labor, team staff labor, missing wage warnings, and potential open-spot revenue.

Milestone 7 adds the event finance tab. The event page should show actual profit or loss, potential open-spot revenue, projected profit, and line item detail. Profit should be green, loss should be red, and potential profit should be yellow, with text labels so the result is not color-only. Generated rows should link back to their source where possible. Custom rows should be editable in place or through a modal. Team registration payments should appear as event revenue. Its acceptance is that a browser smoke test can open an event and verify the summary cards, line item table, team registration revenue, and warning state.

Milestone 8 adds the team finance view. A canonical team page or organization team detail modal should show team profit or loss, event registration costs, staff or coach costs, and custom team costs. For event-team snapshots, the view should be able to filter to one event while still linking back to the canonical team when `parentTeamId` exists. Its acceptance is that a user can open a team and see the team registration bill for an event classified as a cost, not revenue.

Milestone 9 adds the organization finance dashboard. The organization page should get a finance tab or finance section that summarizes sales, refunds, costs, labor, team costs, Stripe fees, rental revenue, event profitability, team profitability, and margin over a date range. It should include table and chart views. Its acceptance is that a user can filter by date range and see event, team, rental, and custom cost line items roll into organization totals.

Milestone 10 hardens permissions, privacy, and auditability. Compensation data is sensitive and should not be visible to every staff member who can manage events or teams. Add or reuse permissions deliberately, test unauthorized access, and record enough created-by and updated-by metadata for finance changes. Its acceptance is that a staff member with event or team management access but without compensation access can see profitability totals only if allowed, and cannot see individual wage details unless explicitly permitted.

Milestone 11 adds internal staff pay runs. A pay run is a batch of staff labor costs for a chosen organization and service period. The pay run header should store the organization, period start, period end, status, payout status, total amount, item count, approval fields, paid fields, and optional provider reference fields. Each pay-run item should store a snapshot of the staff member, user, event, team, source labor row, wage type, rate, paid minutes, service dates, amount, status, payout status, approval fields, and paid fields. Its acceptance is that Prisma can create pay runs and items, an organization finance manager can list pay runs, and a draft pay run can be created from event/team staff labor without duplicating already-pay-run-linked labor rows.

Milestone 12 adds organization payroll UI. The organization page should show a Finance/Payroll tab for owners and staff with billing or payment management access. The tab should show organization revenue, refunds, fees, custom costs, staff labor costs, net profit or loss, future costs, line-item detail, a pay-run table, and a form to create a draft pay run for a date range. Its acceptance is that browser QA can open an organization, see finance totals, create a draft pay run, and observe the new pay run in the table.

## Plan of Work

Start with the Prisma schema. Add `OrganizationRoleCompensationRates` with `organizationRoleId`, `organizationId`, `wageType`, `amountCents`, `effectiveFrom`, `effectiveTo`, and audit fields. Add `StaffCompensationRates` with `staffMemberId`, `organizationId`, `wageType`, `amountCents`, `effectiveFrom`, `effectiveTo`, and audit fields. Use cents for money to match existing price fields and avoid floating point rounding. Use a string enum or Prisma enum for wage type with values such as `HOURLY`, `SALARY`, and `FLAT_PER_EVENT`.

Add `EventStaffAssignments` for event-level labor. This should reference `eventId`, `organizationId`, `staffMemberId`, optional `organizationRoleId`, optional planned start and end times, optional actual start and end times, optional planned minutes, optional actual minutes, status, and notes. Do not reuse `EventTeamStaffAssignments` because that model is for team staff assignments, not event payroll or operations labor.

Add `TeamStaffLaborEntries` or a similarly named model for team-level labor. It should reference `organizationId`, optional `teamId` for a canonical team, optional `eventTeamId` for an event-team snapshot, optional `eventId` when the team labor is tied to a specific event, optional `staffMemberId` when the person is organization staff, `userId` for the person performing the work, optional `teamStaffAssignmentId` or `eventTeamStaffAssignmentId`, optional planned and actual time fields, optional rate override, status, and notes. The calculation engine should resolve compensation from the organization staff member when `staffMemberId` exists. If the person is not organization staff and no rate override exists, return a missing-rate warning instead of using zero.

Add `FinancialLineItems` for custom line items only. It should include `organizationId`, optional `eventId`, optional `teamId`, optional `eventTeamId`, scope, category, title, description, `amountCents`, quantity or units if needed, status, occurred date, created by, and updated by. Generated analysis line items should not be stored in this table. They should be returned by the finance analysis service at read time.

Create server modules under `src/server/finance`. Suggested files are `src/server/finance/compensationRates.ts`, `src/server/finance/eventFinance.ts`, `src/server/finance/teamFinance.ts`, `src/server/finance/organizationFinance.ts`, and `src/server/finance/lineItems.ts`. Keep calculation functions pure where possible so tests can pass in plain objects and assert exact totals.

Create API routes under `src/app/api/organizations/[id]/finance`, `src/app/api/events/[eventId]/finance`, and `src/app/api/teams/[id]/finance` or a similar existing route pattern. If event-team snapshot finance needs an event-specific route, use `src/app/api/events/[eventId]/teams/[teamId]/finance` so the route aligns with existing event-team billing routes. Routes must require a session and check organization, event, or team access. Compensation management should require a stricter permission than ordinary event or team management.

Extend `src/lib/organizationPermissions.ts` only after deciding the exact permission names. Reasonable additions are `finance.view`, `finance.manage`, and `staff.compensation.manage`. If the existing `BILLING_MANAGE` and `PAYMENTS_MANAGE` permissions are enough for first release, document that choice in this plan before implementation.

Extend organization services in `src/lib/organizationService.ts` or create `src/lib/financeService.ts` if finance calls are broad enough to deserve a separate client service. Prefer a separate finance service once event, team, and organization analysis endpoints exist.

Add UI in phases. First add compensation controls near the staff/role management experience, likely in `src/app/organizations/[id]/RoleRosterManager.tsx` or a sibling component. Then add the event finance tab in the event detail or schedule area. Then add team finance to the canonical team detail surface and event-team detail surface. Then add the organization finance tab by extending `src/app/organizations/[id]/organizationTabs.ts` and `src/app/organizations/[id]/page.tsx`.

## Concrete Steps

Work from the repository root:

    cd /Users/elesesy/StudioProjects/mvp-site

Confirm the branch:

    git status --short --branch

Expected branch line:

    ## feature/staff-cost-profit-analysis-plan

Before implementation starts, inspect the relevant current files:

    sed -n '520,575p' prisma/schema.prisma
    sed -n '590,665p' prisma/schema.prisma
    sed -n '733,762p' prisma/schema.prisma
    sed -n '860,930p' prisma/schema.prisma
    sed -n '960,1020p' prisma/schema.prisma
    sed -n '1038,1135p' prisma/schema.prisma
    sed -n '1300,1345p' prisma/schema.prisma
    sed -n '270,420p' 'src/app/api/events/[eventId]/participants/route.ts'
    sed -n '1,220p' src/server/organizationRoles.ts
    sed -n '1,220p' src/lib/organizationPermissions.ts

Add the Prisma migration with:

    npx prisma migrate dev --name add_staff_team_finance_analysis

If the local database contains data that must not be reset, stop and use the repo's safe local Prisma migration workflow instead of dropping data. After any schema change, run:

    npx prisma generate

Add focused Jest coverage as each milestone lands. For route and calculation tests, prefer targeted commands such as:

    npm test -- --runInBand --runTestsByPath src/server/finance/__tests__/eventFinance.test.ts
    npm test -- --runInBand --runTestsByPath src/server/finance/__tests__/teamFinance.test.ts
    npm test -- --runInBand --runTestsByPath src/server/finance/__tests__/financeAnalysis.test.ts
    npm test -- --runInBand --runTestsByPath src/app/api/organizations/__tests__/organizationFinanceRoutes.test.ts

Run the repo-wide type check before considering a milestone complete:

    npx tsc --noEmit

Current validation evidence from 2026-06-09:

    npx prisma migrate deploy
    # Applying migration `20260609194200_add_staff_team_finance_analysis`
    # All migrations have been successfully applied.

    npx prisma migrate status
    # Database schema is up to date!

    npx prisma validate
    # The schema at prisma/schema.prisma is valid

    npm test -- --runInBand --runTestsByPath src/server/finance/__tests__/financeAnalysis.test.ts src/app/api/events/__tests__/eventFinanceRoute.test.ts src/app/api/teams/__tests__/teamFinanceRoute.test.ts
    # Test Suites: 3 passed, 3 total
    # Tests: 9 passed, 9 total

    npm test -- --runInBand --runTestsByPath src/server/finance/__tests__/financeAnalysis.test.ts src/server/finance/__tests__/financeMutations.test.ts src/app/api/events/__tests__/eventFinanceRoute.test.ts src/app/api/events/__tests__/eventFinanceStaffRoute.test.ts src/app/api/teams/__tests__/teamFinanceRoute.test.ts src/app/api/teams/__tests__/teamFinanceStaffRoute.test.ts src/app/api/organizations/__tests__/organizationFinanceWriteRoutes.test.ts
    # Test Suites: 7 passed, 7 total
    # Tests: 23 passed, 23 total

    npx tsc --noEmit
    # exited 0

    git diff --check -- prisma/schema.prisma prisma/migrations src/generated/prisma src/server/finance docs/staff-cost-profit-analysis-roadmap.md
    # exited 0

For UI milestones, start the app:

    npm run dev

Then open the relevant event or organization page and verify the visible behavior described in the milestone acceptance text.

## Validation and Acceptance

The feature is complete when a seeded or locally created organization can demonstrate the following behavior.

An owner can open the organization staff area, edit the default compensation for an existing role such as Staff, Host, or Official, and add an individual override for one staff member. Changing a rate creates a new effective range and keeps prior history.

An event manager can assign staff members to an event with planned or actual hours. The event finance tab then shows generated staff cost rows such as one staff member at four hours times an hourly rate and one official at a flat event rate.

An event manager can add a custom event cost. That cost appears in the event finance line item table and also appears in the organization finance ledger when filtering to that event or date range.

Actual event revenue comes from paid records and refunds. A partially refunded registration reduces actual profit. Stripe fees reduce net revenue when the report is configured to show net profit.

A team registration bill paid by a team appears as event revenue in the event finance tab and as a team cost in the team finance view. A partial refund reduces event revenue and reduces the team's registration cost.

A team manager or organization finance user can add team staff labor for a coach, manager, or other team staff member. If the person is also an organization staff member with an active compensation rate, the team finance view shows a generated staff cost. If the person has no resolvable rate, the team finance view shows a missing-rate warning.

A team manager or organization finance user can add a custom team cost such as uniforms, travel, equipment, tournament fees, or team payouts. That cost appears in the team finance view and rolls up into organization finance without being duplicated.

Potential open-spot revenue is yellow and uses current event price times missing participant capacity. It must be labeled as potential, not actual. Actual profit is green when positive and red when negative.

Rental sales are included in organization-level sales and profit reporting through existing rental bills, payments, and refunds. No field rental price-history model is needed for this release.

Missing compensation data produces an explicit warning row or alert. It must not silently use zero labor cost.

Run these checks before a pull request:

    npm test -- --runInBand --runTestsByPath src/server/finance/__tests__/eventFinance.test.ts
    npm test -- --runInBand --runTestsByPath src/server/finance/__tests__/teamFinance.test.ts
    npm test -- --runInBand --runTestsByPath src/server/finance/__tests__/organizationFinance.test.ts
    npm test -- --runInBand --runTestsByPath src/app/api/organizations/__tests__/organizationFinanceRoutes.test.ts
    npm test -- --runInBand --runTestsByPath src/app/api/teams/__tests__/teamFinanceRoutes.test.ts
    npm test -- --runInBand --runTestsByPath src/app/organizations/[id]/__tests__/RoleRosterManager.test.tsx
    npx tsc --noEmit

For bracketed Next.js paths in zsh, quote the path:

    npm test -- --runInBand --runTestsByPath 'src/app/organizations/[id]/__tests__/RoleRosterManager.test.tsx'

## Idempotence and Recovery

Schema changes must be additive at first. Do not drop or rename existing staff, role, event, payment, or rental fields during the first implementation. New tables can be created safely and filled gradually.

If a migration fails locally because Prisma wants to reset the database, stop and inspect the migration status before proceeding. Use a backup or the repo's safe migration process rather than wiping useful local data.

If compensation history ranges overlap, route validation should reject the change or close the prior active range in the same transaction. The user should see a clear error instead of allowing two active rates for the same role or staff member at the same time.

If a staff member has no active override and the role has no active default rate, the finance calculation should return a missing-rate warning and omit that labor amount from profit totals or mark the total as incomplete. Do not invent a default wage.

If a generated line item looks wrong, fix the source data. For staff costs, edit staff compensation, event assignment hours, or team labor hours. For revenue or team registration costs, edit or reconcile bills, payments, refunds, or registrations. For custom costs, edit the `FinancialLineItems` row.

If a team event-registration bill has both a canonical team id and an event-team snapshot id, the report should resolve both ids and avoid double counting. The same bill should appear once in the event report and once in the team report with scope-specific classification.

## Artifacts and Notes

Initial branch:

    feature/staff-cost-profit-analysis-plan

Relevant existing schema anchors:

    StaffMembers.roleId links organization staff to OrganizationRoles.
    OrganizationRoles stores role name, kind, system key, and default flags.
    OrganizationRolePermissions stores permission strings by role.
    CanonicalTeams maps to the physical Teams table and represents reusable teams.
    Teams maps to the physical EventTeams table and represents event-specific team snapshots.
    TeamRegistrations stores canonical team members.
    TeamStaffAssignments and EventTeamStaffAssignments store team staff identity but not payroll hours.
    Events.price is useful for projections.
    Bills and BillPayments are the better source for actual paid revenue, refunds, tax, and Stripe fees.
    Bills.ownerType = TEAM identifies team-owned bills.
    TimeSlots.price and rental-related bills are the better source for rental sales actuals.

Suggested generated event analysis rows:

    Revenue: paid registrations
    Revenue: paid team registrations
    Revenue reduction: refunds
    Revenue reduction: Stripe processing fees
    Cost: staff labor from event staff assignments
    Cost: custom event line items
    Potential: open participant spots multiplied by current event price

Suggested generated team analysis rows:

    Revenue: team dues or team sales, if source records exist
    Cost: event registration bills paid by the team
    Cost reduction: refunds on team registration bills
    Cost: Stripe fees paid by the team, when applicable
    Cost: team staff or coach labor
    Cost: custom team line items

Suggested organization analysis rows:

    Revenue: event registration payments
    Revenue: rental payments
    Revenue: store or product payments, if included in the first release
    Revenue reduction: refunds
    Revenue reduction: Stripe fees
    Cost: staff labor
    Cost: team staff labor
    Cost: custom organization line items
    Cost: custom event line items
    Cost: custom team line items

## Interfaces and Dependencies

New Prisma models should use cents for money amounts and DateTime fields for effective ranges. A contributor may choose exact model names during implementation, but the following stable concepts must exist:

    Organization role compensation rate:
      organizationRoleId
      organizationId
      wageType
      amountCents
      effectiveFrom
      effectiveTo

    Staff compensation rate:
      staffMemberId
      organizationId
      wageType
      amountCents
      effectiveFrom
      effectiveTo

    Event staff assignment:
      eventId
      organizationId
      staffMemberId
      organizationRoleId
      planned or actual time fields
      status

    Team staff labor entry:
      organizationId
      optional teamId for the canonical team
      optional eventTeamId for the event-team snapshot
      optional eventId
      optional staffMemberId
      userId
      optional teamStaffAssignmentId
      optional eventTeamStaffAssignmentId
      planned or actual time fields
      optional rate override
      status

    Custom financial line item:
      organizationId
      optional eventId
      optional teamId
      optional eventTeamId
      scope
      category
      title
      amountCents
      occurredAt
      createdBy

The finance calculation API should return a typed summary with line items. The exact TypeScript names can be finalized during implementation, but the shape must distinguish actual, projected, and warning data. A reasonable return shape is:

    EventFinanceSummary:
      eventId
      actualRevenueCents
      actualCostCents
      actualProfitCents
      potentialRevenueCents
      projectedProfitCents
      lineItems
      warnings

    TeamFinanceSummary:
      teamId
      optional eventTeamId
      actualRevenueCents
      actualCostCents
      actualProfitCents
      eventRegistrationCostCents
      staffCostCents
      lineItems
      warnings

    FinanceLineItem:
      id
      sourceType
      sourceId
      scope
      label
      category
      amountCents
      classification
      status
      isGenerated

The classification should support at least revenue, refund, fee, labor cost, team registration cost, custom cost, potential revenue, and warning.

For salary allocation, use a clearly documented conversion. The initial implementation should treat salary as an annual amount and prorate by assigned hours using an organization setting or constant for annual work hours. If no setting exists, use 2,080 annual hours as the first version default and record that decision here before implementation. Salary staff without assigned event hours should not generate event labor cost unless the feature adds an explicit allocation rule.

## Revision Notes

2026-06-09 / Codex: Created the initial self-contained roadmap so the feature can be implemented later without relying on chat history. The plan records the user's decisions to use actual staff data, current organization roles, compensation history, custom line items, paid registration and refund actuals, and fixed rental sale records.

2026-06-09 / Codex: Added team finance to the roadmap. The update makes team registration bills a cost in team reports, keeps the same bills as revenue in event and organization reports, adds team staff labor entries, and expands custom line items to support team and event-team scopes.

2026-06-09 / Codex: Started implementation. Added additive Prisma schema and SQL migration, regenerated Prisma client files, added pure event/team finance summary helpers, and added focused Jest tests for the core accounting behavior. The next implementation step is to load real Prisma data into these helpers through server repositories and API routes.

2026-06-09 / Codex: Applied the local migration and continued implementation. Added `src/server/finance/financeRepository.ts`, read-only event and team finance API routes, and route tests. The next implementation step is write APIs and UI for entering compensation rates, event labor, team labor, and custom line items.
