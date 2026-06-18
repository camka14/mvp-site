# Staff and Official Operations Expansion

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document follows `PLANS.md` in the repository root. Keep this file self-contained so a contributor can resume the work from the plan alone.

## Purpose / Big Picture

Facilities and event organizers need one operations workflow for staff, officials, shifts, scoring, time worked, and payroll. The key product split is that an invite grants access or creates a person in the event official pool, while a schedule assignment asks that person to work a specific match or shift. After this work, managers can collect staff availability, build conflict-aware event and official schedules, publish assignments for self-service acceptance, let officials clock in and submit scores from mobile, and turn approved actual time into pay runs that can be exported or synced. Staff and officials can see their own assignments without needing event-management permissions.

The user-visible proof is a web Staff tab that contains operations scheduling and time-clock review, a Finance tab that turns approved labor into auditable pay runs and exports, and a mobile official schedule that opens assigned matches for check-in and score submission.

## Progress

- [x] (2026-06-18 America/Los_Angeles) Reviewed current staff, role, compensation, labor, pay-run, official, match, profile schedule, mobile schedule, and watch official app structures.
- [x] (2026-06-18 America/Los_Angeles) Chose to extend `EventStaffAssignments`, `StaffPayRun`, and current official match contracts instead of creating a parallel staffing system.
- [x] (2026-06-18 America/Los_Angeles) Clarified the invite model: keep invites for access/onboarding and move accept/decline to scheduled assignments.
- [ ] Implement availability and assignment schema migrations.
- [ ] Add backend services and route tests for conflict detection, self-serve assignment acceptance, and time clock.
- [ ] Add web organization Staff operations UI and event schedule assignment controls.
- [ ] Add mobile official schedule/self-serve operations UI and route it into existing match scoring screens.
- [ ] Add payroll export records and provider-neutral sync handoff.
- [ ] Validate with targeted Jest, TypeScript, mobile compile, and browser/mobile smoke tests.

## Surprises & Discoveries

- Observation: The schema already has enough payroll foundation to avoid a second payroll model.
  Evidence: `prisma/schema.prisma` has `StaffCompensationRates`, `OrganizationRoleCompensationRates`, `EventStaffAssignments`, `TeamStaffLaborEntries`, `StaffPayRun`, and `StaffPayRunItem`.

- Observation: Match official assignment currently lives in two places: event-level official eligibility and match-level assignment data.
  Evidence: `EventOfficials` stores event official users, allowed positions, and fields; `Matches` stores `officialId`, `officialIds`, `officialCheckedIn`, and `teamOfficialId`.

- Observation: Mobile already has the right scoring destination for officials.
  Evidence: `composeApp/src/commonMain/kotlin/com/razumly/mvp/matchDetail/MatchDetailScreen.kt` shows official score controls only for checked-in officials, and `ProfileMyScheduleScreen.kt` already opens matches from a profile schedule.

- Observation: The current payroll/accounting work intentionally posts QuickBooks JournalEntries, not true payroll payouts.
  Evidence: `docs/quickbooks-accounting-connection-execplan.md` states the sync does not create employees, payroll records, checks, payroll tax records, or broader transaction imports.

- Observation: The current event official setup already distinguishes organization and non-organization events.
  Evidence: Organization-hosted event setup searches active organization staff and only assigns users with `OFFICIAL` staff type. Non-organization event setup can stage event-scoped `STAFF` invites with `OFFICIAL` in `staffTypes`.

## Decision Log

- Decision: Keep invites as access/onboarding records and create assignment responses on scheduled assignment rows.
  Rationale: An invite means "you can join this organization or event official pool." It is not granular enough to represent "work Match 12 on Court 2 at 6:30 PM." Accepting or declining must therefore apply to a scheduled assignment, while invite status continues to represent access/onboarding.
  Date/Author: 2026-06-18 / Codex

- Decision: Keep the organization Staff tab as the web home for staff and official operations, and keep the Finance tab as the home for pay runs, exports, and provider sync.
  Rationale: Organization tabs already expose `staff` to owners and staff/role managers and `finance` to billing/payment managers. Operations scheduling belongs with staff management; payroll approval and accounting handoff belongs with finance.
  Date/Author: 2026-06-18 / Codex

- Decision: Add assignment workflow fields to `EventStaffAssignments` instead of creating a new generic shift table.
  Rationale: `EventStaffAssignments` already has event scope, staff member, user, planned time, actual time, rate overrides, and a pay-run link through `StaffPayRunItem.eventStaffAssignmentId`. Adding shift and official-slot metadata keeps labor, time clock, and payroll connected.
  Date/Author: 2026-06-18 / Codex

- Decision: Treat `Matches.officialIds` and related official fields as the scheduling/display contract while using `EventStaffAssignments` as the operational ledger for offers, acceptance, time clock, and payroll.
  Rationale: Existing web, mobile, Wear OS, and watchOS scoring flows already read match official assignments. Replacing that contract would risk score-submission regressions. Mirroring accepted official shifts into match official assignments gives current screens continuity while adding operations state.
  Date/Author: 2026-06-18 / Codex

- Decision: Put self-serve official operations in mobile under Profile, next to or inside My Schedule, not under Event Management.
  Rationale: Officials often should not have `events.manage`. Event Management is host/admin scope. Assigned officials need a personal work queue that opens match detail for score submission.
  Date/Author: 2026-06-18 / Codex

## Outcomes & Retrospective

Planning only. No implementation has been started from this plan yet.

## Context and Orientation

The backend and web source of truth is `/Users/elesesy/StudioProjects/mvp-site`. The mobile app is `/Users/elesesy/StudioProjects/mvp-app`.

Important current web/backend files:

- `prisma/schema.prisma` contains the current staff, official, match, labor, pay-run, and accounting sync models.
- `src/lib/organizationPermissions.ts` defines organization permissions. There is no dedicated scheduling permission yet; current relevant permissions are `staff.manage`, `roles.manage`, `events.manage`, `billing.manage`, and `payments.manage`.
- `src/server/accessControl.ts` implements organization permission checks through organization owner, staff membership, roles, and role permissions.
- `src/server/finance/staffPayRuns.ts` creates and mutates `StaffPayRun` and `StaffPayRunItem` rows.
- `src/server/finance/financeAccess.ts` gates finance and compensation operations.
- `src/server/officials/eventOfficials.ts` reads active event official rows.
- `src/server/scheduler/officialStaffing.ts` assigns official slots during event scheduling.
- `src/app/organizations/[id]/organizationTabs.ts` defines organization tabs. `Staff` and `Finance` already exist.
- `src/app/organizations/[id]/RoleRosterManager.tsx` is the current Staff tab manager for invites, staff list, roles, and compensation rates.
- `src/app/organizations/[id]/OrganizationFinancePanel.tsx` is the current Finance tab and payroll ledger UI.
- `src/app/api/profile/schedule/route.ts` returns the authenticated user's schedule to web/mobile.
- `src/app/api/events/[eventId]/matches/[matchId]/route.ts` handles match updates, official check-in, actual times, score, segments, and incident operations.

Important current mobile files:

- `composeApp/src/commonMain/kotlin/com/razumly/mvp/profile/ProfileHomeScreen.kt` already has a `My Schedule` action.
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/profile/ProfileMyScheduleScreen.kt` renders the personal schedule and opens events or matches.
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/profile/ProfileComponent.kt` loads `api/profile/schedule` and routes a schedule match into match detail.
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/matchDetail/MatchDetailScreen.kt` contains official check-in, score controls, segment timing, and incident submission.
- `wearApp/` and `iosApp/watchApp/` already contain compact official match workflows for watches.

Terms used in this plan:

An availability window is a time range when a staff member says they are available, unavailable, or prefer to work. A shift is a planned work period assigned to a staff member. A match official assignment is a shift tied to a match official slot such as center official, assistant official, scorekeeper, or line judge. A time-clock entry is the actual clock-in and clock-out time captured for a shift. A pay run is the internal payroll batch represented by `StaffPayRun`.

An invite is not a shift. It is an access or onboarding record in `Invites`. For organization-hosted events, officials are usually already organization staff members with the `OFFICIAL` staff type. For non-organization events, the event form may create event-scoped `STAFF` invites with `OFFICIAL` in `staffTypes`. In both cases, the invite only establishes that the user can be in the event official pool. Schedule acceptance must live on the assignment record.

## Plan of Work

### Milestone 1: Data Model and Contract

Add additive Prisma fields and models for availability, assignment workflow, and export records.

Keep `EventStaffAssignments.status` as the existing labor accounting state with values such as `PLANNED`, `ACTUAL`, and `CANCELLED`. Add a separate assignment lifecycle enum so payroll calculations do not depend on offer/accept UI states. Suggested enum:

    StaffAssignmentStatusEnum:
      DRAFT
      OFFERED
      ACCEPTED
      DECLINED
      CONFIRMED
      CLOCKED_IN
      CLOCKED_OUT
      NO_SHOW
      CANCELLED

Add these fields to `EventStaffAssignments`:

    assignmentStatus StaffAssignmentStatusEnum @default(DRAFT)
    assignmentKind StaffAssignmentKindEnum @default(EVENT_SHIFT)
    matchId String?
    fieldId String?
    eventOfficialId String?
    officialPositionId String?
    officialSlotIndex Int?
    inviteId String?
    offeredAt DateTime?
    acceptedAt DateTime?
    declinedAt DateTime?
    declineReason String?
    confirmedAt DateTime?
    clockInSource String?
    clockOutSource String?
    clockInNote String?
    clockOutNote String?
    conflictSnapshot Json?
    publishedAt DateTime?

Suggested assignment kinds:

    EVENT_SHIFT
    OFFICIAL_MATCH
    SCOREKEEPER
    FIELD_CREW
    FRONT_DESK
    COACHING
    TEAM_LABOR

Add indexes for `organizationId`, `userId`, `eventId`, `matchId`, `fieldId`, `assignmentStatus`, `assignmentKind`, and planned time ranges. Prisma does not provide native range exclusion constraints in the schema file, so conflict prevention should be enforced in services and route tests first. If production needs hard database-level protection later, add a SQL migration using Postgres range/exclusion constraints for accepted/confirmed/clocked assignments.

Add `StaffAvailabilityWindows`:

    id String @id
    createdAt DateTime @default(now())
    updatedAt DateTime @updatedAt
    organizationId String
    staffMemberId String
    userId String
    eventId String?
    startsAt DateTime
    endsAt DateTime
    status StaffAvailabilityStatusEnum
    note String?
    createdBy String?
    updatedBy String?

Suggested availability statuses:

    AVAILABLE
    UNAVAILABLE
    PREFERRED

Add `StaffAvailabilityRules` for recurring weekly availability after one-time windows work:

    id String @id
    organizationId String
    staffMemberId String
    userId String
    dayOfWeek Int
    startMinute Int
    endMinute Int
    timezone String
    effectiveFrom DateTime
    effectiveTo DateTime?
    status StaffAvailabilityStatusEnum

Add `StaffPayrollExportRecords` even though `StaffPayRun` already has aggregate export fields. The aggregate fields are useful in the table, but individual export attempts are needed for audit, retries, and provider sync:

    id String @id
    createdAt DateTime @default(now())
    organizationId String
    payRunId String
    format String
    provider String?
    status String
    fileName String?
    fileId String?
    payloadHash String?
    providerBatchId String?
    exportedByUserId String?
    errorMessage String?
    metadata Json?

When an official assignment is accepted or confirmed, mirror the user into the matching `Matches.officialIds` assignment object. When an official clocks in for a match assignment, set the matching official assignment's `checkedIn` state and preserve existing `officialCheckedIn` compatibility for older single-official screens.

Keep `Invites` as the onboarding/access table. Do not move invite records into the schedule model. Instead, allow an assignment to optionally reference the invite that introduced the official through `inviteId`. This lets the product show "pending invite" beside an assignment offer without making invite status stand in for assignment status.

Acceptance for this milestone: Prisma generates successfully, migrations are additive, existing staff/pay-run/schedule tests still pass, and route tests can create an availability window and an official match assignment without breaking existing match official serialization.

### Milestone 2: Backend Services and Permissions

Create a server module under `src/server/staff/`:

- `availability.ts` normalizes availability windows and recurring rules.
- `assignmentConflicts.ts` checks conflicts.
- `assignments.ts` creates, offers, accepts, declines, confirms, cancels, clocks in, clocks out, and syncs assignment state to matches.
- `assignmentPayroll.ts` converts clocked or approved assignments into pay-run inputs using existing compensation rates.

Conflict detection should return structured warnings and blockers, not just strings. Each conflict should include:

    code
    severity
    assignmentId
    staffMemberId
    userId
    start
    end
    message
    blocking

Check at least these conflicts:

- The same user has overlapping accepted, confirmed, or clocked assignments.
- The user has an `UNAVAILABLE` window overlapping the proposed shift.
- The user has not accepted the underlying organization/event access invite when the assignment requires confirmed access.
- The event official is not eligible for the requested official position.
- The event official is restricted to specific fields and the match is on a different field.
- The assignment would edit a labor row that is already in an approved or paid pay run.
- The match is locked or completed and the operation would change its official assignment.

Add organization permissions only if the current split is not enough. Recommended additions:

    staff.schedule
    staff.timeclock
    staff.payroll

Map the default owner/staff/host roles conservatively. Owners get all. Default Staff and Host can manage schedules only if the current product expects broad staff access; otherwise managers must opt roles into these permissions. Default Official receives no management permissions, only self-serve access to their own assignments.

Add APIs:

- `GET /api/organizations/[id]/staff/operations` returns staff members, roles, availability, assignments, conflicts, and filters for managers.
- `POST /api/organizations/[id]/staff/availability` creates or updates availability for managers.
- `POST /api/organizations/[id]/staff/assignments` creates/offers shifts and official match assignments.
- `PATCH /api/organizations/[id]/staff/assignments/[assignmentId]` confirms, cancels, edits, or publishes assignments.
- `POST /api/organizations/[id]/staff/assignments/[assignmentId]/send-offer` sends or re-sends the schedule assignment offer. If the user still has a pending access invite, include that invite state in the response and notification.
- `GET /api/profile/official-operations` returns the current user's own official shifts, availability, conflicts, and relevant matches.
- `POST /api/profile/official-operations/[assignmentId]/accept` accepts an offered assignment.
- `POST /api/profile/official-operations/[assignmentId]/decline` declines an offered assignment with an optional reason.
- `POST /api/profile/official-operations/[assignmentId]/clock-in` records actual start and check-in.
- `POST /api/profile/official-operations/[assignmentId]/clock-out` records actual end and actual minutes.

The self-serve profile routes must not require `events.manage` or `staff.manage`; they should require the authenticated user to be the assignment's `userId` and the assignment to be in a self-service eligible state.

If a profile route sees a pending access invite, it should guide the user to accept the invite before allowing clock-in or score submission. Accepting the invite and accepting the assignment are two different actions. A user may accept organization/event access but decline a particular match assignment.

Acceptance for this milestone: route tests prove managers can create and publish assignments, officials can accept/decline only their own assignments, clock-in updates actual time and match official check-in, conflicts block invalid accepted/confirmed assignments, and locked payroll rows cannot be edited.

### Milestone 3: Web Staff and Official Operations

Keep the top-level organization tab as `Staff`. Add sub-sections inside the existing Staff tab, likely by splitting `RoleRosterManager.tsx` into smaller components:

- Directory: current invites, roles, staff list, and compensation rates.
- Availability: calendar/list for one-time availability and recurring weekly rules.
- Schedule: staff shifts and official match assignments by day, event, field, role, status, and person.
- Time Clock: clocked-in, missing clock-out, no-show, and manager-adjustment review.
- Officials: event official eligibility, positions, fields, and assignment coverage.

Do not put payroll creation in the Staff tab. The Staff tab should show whether approved actual time is ready for payroll, but `OrganizationFinancePanel.tsx` should remain the place to create, approve, mark paid, export, and sync pay runs.

Keep the existing event form concept of an official pool. For organization-hosted events, the pool is selected from active organization officials. For non-organization events, the pool may include existing users and event-scoped staff invites. Add a clear transition from pool to schedule: once officials are in the pool, managers schedule them to specific matches or shifts from Staff operations or the event schedule page.

On event schedule pages, add an official assignment drawer or panel next to existing match scheduling controls. The event schedule view should show assignment coverage and conflicts in context:

- Empty official slots.
- Offered but not accepted.
- Accepted.
- Clocked in.
- Conflict.
- Declined/no-show.

When a manager manually assigns an official from a match row, the UI should create or update the corresponding `EventStaffAssignments` row and then mirror into the match official assignment contract. The match row should not bypass the operations ledger.

Publishing a schedule should send assignment offers, not rewrite invite status. If the official has a pending invite, the notification should say both that they have been invited to the event/organization official pool and that there is a scheduled assignment waiting.

Acceptance for this milestone: in a browser, a manager can open an organization Staff tab, add availability, assign an official to a scheduled match, see a conflict before publish, publish the offer, and see the assignment status update after the official accepts from the self-serve route.

### Milestone 4: Mobile Official Operations and Schedule Placement

Put official self-serve operations in the mobile Profile area because it is personal work, not event management. There are two acceptable UI shapes:

1. Add a dedicated Profile action called `Official Schedule`, visible when `/api/profile/official-operations` returns assignments or when the user has active official staff membership.
2. Extend the existing `My Schedule` screen with an `Officiating` filter and assignment actions on official match cards.

Recommended first implementation: add a dedicated `Official Schedule` profile action that reuses the existing schedule components. This avoids cluttering participant schedules with payroll/time-clock actions and keeps the workflow obvious for officials.

Add mobile files:

- `composeApp/src/commonMain/kotlin/com/razumly/mvp/profile/ProfileOfficialOperationsScreen.kt`
- DTOs for `api/profile/official-operations` under the existing network DTO structure.
- Repository method `getOfficialOperations()`.
- Profile component state, config, and action similar to `MySchedule`.

The official schedule card should show event name, match teams, field, time, position, assignment status, conflict warning, and actions:

- Accept.
- Decline.
- Clock in.
- Clock out.
- Open score.

The `Open score` action should route to the existing `MatchDetailScreen`. Score submission should remain in match detail because it already handles official check-in, segment timing, direct scoring, and incidents. Clock-in for an official match assignment should also set the match official check-in state so existing score controls become available.

If the card is tied to a pending event or organization invite, show the invite state separately from the assignment state. The card can ask the user to accept access first, then accept or decline the specific assignment.

For organization managers on mobile, add staff operations later under `OrganizationDetail`. The current `OrganizationDetailTab` enum has `OVERVIEW`, `EVENTS`, `TEAMS`, `RENTALS`, and `STORE`; add `STAFF` only for users with staff scheduling/management permission. This is secondary to self-serve official work because managers can use the web Staff tab first.

Wear OS and watchOS should keep the compact official match app. After profile official operations exist, update watch repositories only if the new endpoint returns better assigned-match metadata than `api/profile/schedule`.

Acceptance for this milestone: a mobile official can open Profile, tap Official Schedule, accept an assignment, clock in, open match detail, submit a score or incident, clock out, and see the assignment status update after refresh.

### Milestone 5: Payroll Export and Sync

Keep `StaffPayRun` as the internal payroll source of truth. When creating a draft pay run, include eligible `EventStaffAssignments` where:

- `assignmentStatus` is `CLOCKED_OUT` or manager-approved equivalent.
- `status` is `ACTUAL`.
- `actualMinutes` is present for hourly work or the wage type is flat/salary.
- The assignment is not already linked to a pay-run item.
- The assignment is not cancelled, declined, no-show without manager approval, or already paid.

Update pay-run detail rows to show assignment source metadata: event, match, field, position, planned time, actual time, clock source, and acceptance status. If a manager adjusts actual time after a pay run is approved or paid, require void/reissue or an adjustment item rather than silently changing a paid row.

Use `StaffPayrollExportRecords` for every export or payroll-provider attempt. Continue updating the existing `StaffPayRun.exportedAt`, `exportedByUserId`, `exportCount`, and `lastExportFormat` fields for list display.

Supported first exports:

- Current CSV, expanded with assignment ids and time-clock fields.
- Provider-neutral CSV mapping profile for common payroll upload columns.
- QuickBooks accounting JournalEntry sync stays in the existing accounting integration and must be labeled as accounting sync, not payroll payout.

True payroll-provider API sync should be a separate provider connection after manual exports are reliable. If added, create `OrganizationPayrollConnections` instead of overloading `OrganizationAccountingConnections`, because accounting systems and payroll systems have different scopes, secrets, employee identity, tax, and payout semantics.

Acceptance for this milestone: a finance manager can create a pay run from accepted/clocked assignments, export it, see an export record, retry failed exports, sync approved/paid pay runs to the existing QuickBooks accounting path when configured, and avoid editing paid assignment time by accident.

## Concrete Steps

Run commands from `/Users/elesesy/StudioProjects/mvp-site` unless noted.

1. Add Prisma enums, fields, and models described in Milestone 1, then create an additive migration.
2. Run:

       npx prisma generate
       npx prisma migrate dev

3. Add server modules under `src/server/staff/` and route tests for the new APIs.
4. Update `src/server/scheduler/officialStaffing.ts` or the route that persists scheduled matches so official slots create or update operational assignment rows when a schedule is generated or published.
5. Add Staff tab UI components under `src/app/organizations/[id]/staff/` or split from `RoleRosterManager.tsx`.
6. Update event schedule match assignment controls to write through staff assignment APIs.
7. Add mobile DTOs, repository method, profile state, and `ProfileOfficialOperationsScreen.kt` in `/Users/elesesy/StudioProjects/mvp-app`.
8. Update watch/Wear schedule loading only if the new endpoint becomes the better official source.
9. Add pay-run export records and update `src/server/finance/staffPayRuns.ts`, `OrganizationFinancePanel.tsx`, and tests.

## Validation and Acceptance

Backend validation:

    npm test -- --runInBand --runTestsByPath src/app/api/organizations/__tests__/organizationStaffOperationsRoutes.test.ts src/app/api/profile/__tests__/officialOperationsRoute.test.ts src/server/staff/__tests__/assignmentConflicts.test.ts src/server/finance/__tests__/staffPayRuns.test.ts
    npx tsc --noEmit
    git diff --check

Web browser validation:

- Start the app with local env and database.
- Open `/organizations/{organizationId}/staff`.
- Add availability for a staff member.
- Offer that staff member an official match assignment.
- Confirm a visible conflict when the same staff member is assigned to overlapping matches.
- Accept the assignment through the self-serve route or mobile screen.
- Clock in and confirm the corresponding match unlocks official score controls.
- Clock out and confirm the assignment becomes eligible for a draft pay run.

Mobile validation from `/Users/elesesy/StudioProjects/mvp-app`:

    ./gradlew :composeApp:compileDebugKotlinAndroid

Then smoke test on Android/iOS:

- Sign in as an assigned official.
- Open Profile.
- Open Official Schedule.
- Accept, clock in, open score, submit score, clock out.
- Refresh and confirm status persisted.

Payroll validation:

- Create a draft pay run for the date range containing clocked-out assignments.
- Confirm pay-run items include source assignment ids and actual minutes.
- Export CSV and confirm a `StaffPayrollExportRecords` row is created.
- Approve or mark paid and confirm source actual times are locked from silent edits.
- If QuickBooks is configured, sync the approved or paid pay run through the existing accounting sync path and confirm it remains labeled as accounting.

## Idempotence and Recovery

All schema changes should be additive. Existing match official fields remain in place. If migration or code generation fails, fix the additive migration instead of resetting the database. If official assignment mirroring fails midway, re-run the sync service for the affected event: it should be written idempotently by matching on `eventId`, `matchId`, `userId`, `officialPositionId`, and `officialSlotIndex`.

Self-serve operations should be retry-safe. Accepting an already accepted assignment returns the current assignment. Declining a confirmed or clocked assignment should fail with a clear error. Clocking in twice should keep the first `actualStart` unless a manager explicitly adjusts it.

Payroll exports are append-only records. Failed export records should not delete pay-run items. Retrying creates a new export record and updates the aggregate `StaffPayRun` export fields only on success.

## Artifacts and Notes

Current checked source evidence:

    Staff roles and permissions: src/lib/organizationPermissions.ts
    Staff tab route and visibility: src/app/organizations/[id]/organizationTabs.ts
    Current staff management UI: src/app/organizations/[id]/RoleRosterManager.tsx
    Current payroll UI: src/app/organizations/[id]/OrganizationFinancePanel.tsx
    Current payroll service: src/server/finance/staffPayRuns.ts
    Current profile schedule endpoint: src/app/api/profile/schedule/route.ts
    Current mobile profile schedule: composeApp/src/commonMain/kotlin/com/razumly/mvp/profile/ProfileMyScheduleScreen.kt
    Current mobile official scoring: composeApp/src/commonMain/kotlin/com/razumly/mvp/matchDetail/MatchDetailScreen.kt

## Interfaces and Dependencies

Primary new backend interfaces:

    GET /api/organizations/[id]/staff/operations
    POST /api/organizations/[id]/staff/availability
    POST /api/organizations/[id]/staff/assignments
    PATCH /api/organizations/[id]/staff/assignments/[assignmentId]
    GET /api/profile/official-operations
    POST /api/profile/official-operations/[assignmentId]/accept
    POST /api/profile/official-operations/[assignmentId]/decline
    POST /api/profile/official-operations/[assignmentId]/clock-in
    POST /api/profile/official-operations/[assignmentId]/clock-out

Primary client contracts:

    StaffAvailabilityWindow
    StaffAssignment
    StaffAssignmentConflict
    StaffOfficialOperationsSnapshot
    StaffPayrollExportRecord

Existing APIs to keep compatible:

    GET /api/profile/schedule
    PATCH /api/events/[eventId]/matches/[matchId]
    POST /api/events/[eventId]/matches/[matchId]/score
    POST /api/organizations/[id]/finance/pay-runs
    PATCH /api/organizations/[id]/finance/pay-runs/[payRunId]
    POST /api/organizations/[id]/finance/integrations/quickbooks/pay-runs/[payRunId]/sync

Change log:

- 2026-06-18: Created initial cross-platform staff and official operations ExecPlan.
- 2026-06-18: Updated plan to keep invites as access/onboarding and move accept/decline to scheduled assignment rows.
