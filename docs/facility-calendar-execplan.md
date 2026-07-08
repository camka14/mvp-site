# Facility Grouping and Facility Calendar

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document follows `PLANS.md` in the repository root. It is self-contained so a contributor can resume the work from only this file and the current repository.

## Purpose / Big Picture

Facilities and event organizers need rental customers and managers to understand where a court, field, or other resource physically belongs. After this work, an organization can have multiple facilities, each facility can contain multiple fields or courts, and rental selection screens can show the facility name beside the selected resources. The existing resource calendar is the facility operations surface: it can layer fields/courts, rentals, reservations, events, games, maintenance blocks, staff assignments, official assignments, and conflicts while summary metrics stay collapsible.

The first user-visible proof is that fields returned for an organization carry a facility identity and rental UI labels can say, for example, "Downtown Sports Center - Court 2" instead of only "Court 2". Existing rental windows remain powered by `TimeSlots`, so this change does not create a duplicate availability source.

The July 2026 slice adds a manager details workspace beside that schedule. Managers can switch from the schedule to a facility details view with a facility list, resource list, and an inline editor panel. New facilities and resources are drafted locally, resources are always assigned to the selected facility, and one Save changes action persists the created or edited facilities first and then the resources that depend on them.

## Progress

- [x] (2026-06-18 America/Los_Angeles) Reviewed the current organization fields/rentals tab, `Fields`, `TimeSlots`, finance actuals, and `docs/staff-official-operations-execplan.md`.
- [x] (2026-06-18 America/Los_Angeles) Decided the first slice adds a `Facilities` parent for physical grouping and keeps `TimeSlots` as the rental/event window source of truth.
- [x] (2026-06-18 America/Los_Angeles) Implemented additive Prisma schema and migration for `Facilities` plus `Fields.facilityId`.
- [x] (2026-06-18 America/Los_Angeles) Added server helpers and API routes to list and create facilities without duplicating organization or field ownership data.
- [x] (2026-06-18 America/Los_Angeles) Hydrated facility data in `fieldService` and exposed it through client types.
- [x] (2026-06-18 America/Los_Angeles) Updated rental-facing field labels so resources are visibly grouped under a facility.
- [x] (2026-06-18 America/Los_Angeles) Added focused tests and ran targeted validation.
- [x] (2026-06-18 America/Los_Angeles) Added a manager-facing facility operations summary over the selected calendar resources.
- [x] (2026-06-18 America/Los_Angeles) Verified the built organization Fields tab in browser on desktop and mobile viewports.
- [x] (2026-06-18 America/Los_Angeles) Added facility metadata to field API payloads and updated mobile rental labels to preserve facility context in `mvp-app`.
- [x] (2026-06-18 America/Los_Angeles) Added a facility calendar feed helper that normalizes rentals, rental reservations, events, games, maintenance blocks, staff assignments, official assignments, and conflicts into one derived feed.
- [x] (2026-06-18 America/Los_Angeles) Folded the derived feed into the existing resource calendar with manager layer filters and red conflict cards instead of adding a second calendar panel.
- [x] (2026-07-08 America/Los_Angeles) Reviewed the existing modal-based facility/resource management flow, the Customers tab split-list layout, and the facility/resource service contracts for a new inline details workspace.
- [x] (2026-07-08 America/Los_Angeles) Replaced manager modal entry points on the Facilities tab with a details workspace and a schedule/details view switch.
- [x] (2026-07-08 America/Los_Angeles) Added local draft state, undo, and batched save for created and edited facilities/resources.
- [x] (2026-07-08 America/Los_Angeles) Validated focused Facilities tab behavior and the shared resource sports input.

## Surprises & Discoveries

- Observation: The staff and official operations plan already chose to extend existing staff and official tables instead of introducing a parallel staffing system.
  Evidence: `docs/staff-official-operations-execplan.md` records the decision to extend `EventStaffAssignments` and keep `Matches.officialIds` as the display/scoring contract.

- Observation: The current rental calendar already uses `TimeSlots` for rental windows and `Fields.rentalSlotIds` to attach those windows to resources.
  Evidence: `prisma/schema.prisma` has `Fields.rentalSlotIds` and `TimeSlots.scheduledFieldIds`, and `src/app/organizations/[id]/fieldCalendar.ts` renders rental entries from `field.rentalSlots`.

- Observation: This worktree did not have `node_modules`, but the main checkout had dependencies installed.
  Evidence: focused Jest and TypeScript validation were run from this worktree with `NODE_PATH` and `PATH` pointing at `/Users/elesesy/StudioProjects/mvp-site/node_modules`.

- Observation: Prisma 7 generation writes trailing whitespace into generated client files.
  Evidence: `git diff --check` failed only in `src/generated/prisma` after generation; a mechanical whitespace strip made the check pass without code changes.

- Observation: The production server in this worktree needs the main checkout `.env` plus `.env.local` for local browser QA.
  Evidence: Starting `npm run start` without those env files redirected the org page to login and login failed with `DATABASE_URL is not set`; restarting with both files loaded allowed seeded host login and the organization Fields tab to render.

- Observation: Mobile rentals load resources through `GET /api/fields?ids=...`, not through the web `fieldService` hydration path.
  Evidence: `mvp-app` `RentalAvailabilityLoader` calls `fieldRepository.getFields(...)`, and `FieldRepository` decodes `FieldsResponseDto` from `api/fields?ids=...`.

- Observation: Mobile `Field` is also a Room entity, so API-only facility metadata should not be added as persisted constructor fields.
  Evidence: Android unit-test compilation failed in Room/KSP when ignored facility fields were constructor params; moving them to ignored body properties kept the table schema stable while allowing JSON hydration.

- Observation: Plain `npx tsc --noEmit` is currently blocked by an unrelated untracked affiliate preview script.
  Evidence: TypeScript reported `scripts/preview-affiliate-org-logo-fit.ts(483,65): Property 'path' does not exist on type '{}'` and related `logo.bucket`/`logo.path` errors. The focused Facilities tab Jest suite and `git diff --check` pass.

## Decision Log

- Decision: Add `Facilities` as the physical parent of fields/courts and do not add `FacilityOperatingHours` in the first slice.
  Rationale: A facility is the durable physical place a customer recognizes. Operating hours are useful later for facility operations metrics, but rental availability already has a source of truth in `TimeSlots`. Adding both now would duplicate "open inventory" semantics.
  Date/Author: 2026-06-18 / Codex

- Decision: Keep `Fields` as the resource table and add `facilityId` there.
  Rationale: Current event scheduling, match assignment, rentals, public pages, and discover flows already use field ids. Replacing `Fields` would cause avoidable cross-client churn. A facility parent gives multi-location grouping while preserving existing resource ids.
  Date/Author: 2026-06-18 / Codex

- Decision: Do not add staff assignment facility fields in this slice.
  Rationale: The staff/official operations plan already owns assignment workflow. This slice should make field-to-facility ownership available first; later staff assignment work can reference `fieldId` and derive facility context through that resource.
  Date/Author: 2026-06-18 / Codex

- Decision: Compute utilization, revenue per court-hour, open inventory, and unresolved conflicts from generated field calendar entries.
  Rationale: `TimeSlots` remain the rental inventory source of truth. Facility operating hours, maintenance blocks, and staff assignments are not modeled yet, so the summary should not introduce a parallel availability source.
  Date/Author: 2026-06-18 / Codex

- Decision: Attach facility payloads directly to field API responses used by rentals.
  Rationale: Web already hydrates facility data through `fieldService`, but mobile rental flows fetch fields directly from `/api/fields`. Returning the nested facility with each field keeps clients aligned without introducing a second facility lookup contract for rental selection.
  Date/Author: 2026-06-18 / Codex

- Decision: Keep mobile facility metadata off the persisted Room schema.
  Rationale: The app only needs the facility name for rental display labels. Persisting a partial facility snapshot on `Field` would duplicate web facility state and require an avoidable local database migration.
  Date/Author: 2026-06-18 / Codex

- Decision: Do not add persisted facility calendar rows for the current manager view.
  Rationale: The calendar can be derived from existing rental slots, rental booking items, event/match hydration, assignment rows, and maintenance-like blocks already attached to resources. A persisted calendar table would risk becoming a duplicate source of truth before we have a concrete offline/audit use case.
  Date/Author: 2026-06-18 / Codex

- Decision: Keep the schedule view as the default Facilities tab view and add a manager-only details workspace switch.
  Rationale: The existing tab already behaves as the schedule surface and focused tests exercise that calendar on initial render. Defaulting to schedule preserves current manager behavior while making the new facility/resource editor one click away.
  Date/Author: 2026-07-08 / Codex

- Decision: Draft facilities and resources in one local workspace and save facilities before resources.
  Rationale: A resource requires a concrete facility id. Saving newly drafted facilities first gives resources created under those draft facilities a real `facilityId` before `fieldService.createField` or `fieldService.updateField` is called.
  Date/Author: 2026-07-08 / Codex

## Outcomes & Retrospective

The first slice is complete. Organizations now have a `Facilities` model, organization fields can carry `facilityId`, existing organization fields are backfilled to deterministic default facilities, and new organization field creation assigns either a validated requested facility or the organization's default facility. `fieldService` hydrates facility records by id and the organization rental/field calendar uses facility-scoped labels such as "River City Sports Complex - Main" when facility data is available.

The second slice adds the first facility calendar aggregation layer in the organization Fields tab for managers. It shows utilization, revenue per court-hour, open inventory, and unresolved conflicts for the selected resources in the current calendar range. The summary is derived from the same generated event, match, and rental slot entries that power the calendar, so it does not duplicate rental availability.

The cross-client rental slice now exposes nested facility metadata from the fields API and lets `mvp-app` show facility-scoped rental labels from the same field response it already loads. The mobile entity keeps facility metadata in ignored API-only properties so Room remains unchanged.

The facility calendar slice now keeps the existing resource calendar as the single manager operating surface. It uses the derived `buildFacilityCalendarFeed` output to layer maintenance blocks, staff assignments, official assignments, and unresolved conflicts directly onto the resource calendar while existing generated entries continue to show open rentals, reservations, events, and games.

This work intentionally does not add persisted facility calendar records, persisted mobile facility snapshots, or a new parallel staff assignment model. Facility operating hours exist as organization/facility operations metadata; rental availability remains powered by `TimeSlots`.

The July 2026 inline details slice is complete. The schedule view now shows the calendar sidebar and calendar only, with a manager switch to Facility details and an Edit schedule action. Facility details renders facility and resource columns plus an inline editor panel, supports drafting new facilities and resources without modals, disables resource creation until a facility is selected, tracks edits with an undo stack, and saves facilities before resources so newly drafted resources receive the saved facility id.

## Context and Orientation

The backend and web source of truth is this repository, `mvp-site`.

Important files:

- `prisma/schema.prisma` defines `Fields`, `TimeSlots`, `Events`, `Matches`, `Organizations`, staff, and finance models.
- `src/app/api/fields/route.ts` lists and creates fields.
- `src/app/api/fields/[id]/route.ts` reads, updates, and deletes one field.
- `src/server/fieldFacilityPayload.ts` attaches facility payloads to raw field rows for API responses.
- `src/lib/fieldService.ts` hydrates fields with rental slots and field blocking data.
- `src/app/organizations/[id]/FieldsTabContent.tsx` is the current organization rental/field calendar.
- `src/app/organizations/[id]/fieldCalendar.ts` turns hydrated fields into calendar entries.
- `docs/staff-official-operations-execplan.md` describes future staff and official assignment operations. It should derive facility context from fields rather than introducing a separate location source.

Terms:

A facility is a physical location owned or operated by an organization, such as "Downtown Sports Center". A resource is a playable or rentable unit inside a facility, such as "Court 1" or "Turf A". In the current code, resources are represented by `Fields`. A time slot is a recurring or one-time window used by events or rentals; it remains represented by `TimeSlots`.

## Plan of Work

First, add `Facilities` and `Fields.facilityId` with an additive migration. Existing fields that belong to an organization should be backfilled to a default facility for that organization. This gives every existing organization resource a facility grouping without asking users to manually repair data before the feature can render.

Next, add a small server helper for facility ids and default facility creation. Use it from field creation so new organization fields do not remain ungrouped when a facility is omitted. Add `GET /api/facilities` for service hydration and `POST /api/facilities` for manager-created facilities. The route should enforce organization field-management permission.

Then update the client type layer and `fieldService` so fields include `facilityId` and optional `facility`. The service should hydrate facilities by id once per field list, similar to existing ID-centric hydration patterns in this repo.

Finally, update the rental-facing field labels in `FieldsTabContent.tsx` so selected resources show their facility context. This first UI change is intentionally small: it proves the data model and avoids reworking the full calendar before the server aggregation endpoint exists.

After the resource grouping slice, add a calendar summary helper that aggregates the generated field calendar entries. It should calculate rentable inventory hours, booked-overlap hours, open inventory hours, potential rental revenue, revenue per court-hour, and unresolved overlap conflicts. Render those metrics above the manager calendar and group facility rollups by `Fields.facilityId` when multiple facilities are selected.

For mobile parity, attach facility payloads to the existing field API responses rather than adding a mobile-only facility fetch. `mvp-app` should decode that metadata for rental labels but keep the local Room `Field` schema unchanged.

For the manager details workspace, keep `FieldsTabContent.tsx` responsible for switching between schedule and details views. Move the management UI into a dedicated client component under `src/app/organizations/[id]/fieldsTab/FacilityDetailsWorkspace.tsx`. That component should initialize draft rows from `organization.facilities` and `organization.fields`, render columns for facilities and resources, show the selected facility or resource editor in the right panel, maintain an undo history of previous draft snapshots, and expose Save changes only when the local draft differs from the baseline. The save path should call `facilityService.createFacility` or `facilityService.updateFacility` for changed facilities, build a mapping from draft facility ids to saved facility ids, then call `fieldService.createField` or `fieldService.updateField` for changed resources.

## Concrete Steps

Run commands from the repository root.

1. Edit `prisma/schema.prisma` and add `Facilities` plus `Fields.facilityId`.
2. Add a migration under `prisma/migrations/` that creates `Facilities`, adds `Fields.facilityId`, backfills default facilities, and indexes `organizationId` and `facilityId`.
3. Add `src/server/facilities.ts` with helpers for default facility ids, normalization, and permission-safe creation.
4. Add `src/app/api/facilities/route.ts`.
5. Update `src/types/index.ts` with `Facility`, `Field.facilityId`, and `Field.facility`.
6. Update `src/lib/fieldService.ts` to hydrate facilities and include facility payloads in field updates/creates.
7. Update `src/app/organizations/[id]/FieldsTabContent.tsx` to show facility-scoped resource labels.
8. Add tests for facility hydration and rental label behavior.
9. Add `buildFacilityCalendarSummary` tests for utilization, revenue per court-hour, open inventory, unresolved conflicts, and facility grouping.
10. Render the manager facility operations summary in `FieldsTabContent.tsx` and add a component test.
11. Attach facility payloads in `GET /api/fields`, `GET /api/fields/[id]`, and field create/update responses for mobile parity.
12. Update `mvp-app` rental resource labels to use nested facility names when present without changing the Room schema.
13. Add facility management controls to assign resources from the facility create/edit modal while persisting only `Fields.facilityId`.
14. Add facility-first resource filtering for manager calendars and public rental selection, including an unassigned-resource group.
15. Build `buildFacilityCalendarFeed` as the derived feed across rentals, reservations, events, games, maintenance, staff, officials, and conflicts.
16. Render feed-only operations records directly on the existing resource calendar, add manager layer filters to the left rail, and show unresolved conflicts as red calendar cards.
17. Add `FacilityDetailsWorkspace` with a facility column, resource column, inline facility/resource editors, local draft creation, undo, and batched save.
18. Update `FieldsTabContent.tsx` so manager schedule view shows only the schedule rail/calendar plus an Edit schedule button, while details view shows Facility details, + Facility, + Resource, Save changes, and Undo controls.
19. Extract the tags-style resource sports picker into a reusable component so both the existing resource modal and the inline resource editor use the same pill/dropdown behavior.

## Validation and Acceptance

Run:

    NODE_PATH=/Users/elesesy/StudioProjects/mvp-site/node_modules PATH=/Users/elesesy/StudioProjects/mvp-site/node_modules/.bin:$PATH jest --runInBand --runTestsByPath src/app/api/facilities/__tests__/route.test.ts src/lib/__tests__/fieldService.test.ts src/app/api/fields/__tests__/fieldRoutes.test.ts 'src/app/api/fields/[id]/__tests__/route.test.ts' 'src/app/organizations/[id]/__tests__/FieldsTabContent.test.tsx'
    DATABASE_URL='postgresql://user:pass@localhost:5432/bracketiq' NODE_PATH=/Users/elesesy/StudioProjects/mvp-site/node_modules PATH=/Users/elesesy/StudioProjects/mvp-site/node_modules/.bin:$PATH prisma validate
    NODE_PATH=/Users/elesesy/StudioProjects/mvp-site/node_modules PATH=/Users/elesesy/StudioProjects/mvp-site/node_modules/.bin:$PATH tsc --noEmit
    git diff --check

Validation results from this slice:

    PASS: 6 focused Jest suites, 30 tests
    PASS: prisma validate
    PASS: tsc --noEmit
    PASS: git diff --check
    PASS: npm run build
    PASS: Browser smoke test of http://localhost:3107/organizations/org_1?tab=fields after seeded host login
    PASS: focused fields/facilities API Jest suites, 15 tests
    PASS: mvp-app :composeApp:compileKotlinMetadata
    PASS: mvp-app :composeApp:testDebugUnitTest --tests "com.razumly.mvp.eventSearch.RentalFieldDisplayLabelTest"
    PASS: FieldsTabContent focused Jest suite, 12 tests, after facility modal assignment and facility-first filtering
    PASS: tsc --noEmit after facility modal assignment and facility-first filtering
    PASS: FieldsTabContent focused Jest suite, 17 tests, after integrated calendar layers and conflict cards
    PASS: fieldCalendarHydration focused Jest suite, 2 tests
    PASS: tsc --noEmit after integrated calendar layers
    PASS: git diff --check after integrated calendar layers
    PASS: npm run build after integrated calendar layers
    PASS: Browser smoke test of http://localhost:3000/organizations/org_1?tab=fields with left-side layer filters, conflict filtering, staff selection mode, and red conflict card rendering
    PASS: FieldsTabContent focused Jest suite, 43 tests, after inline facility/resource details workspace
    PASS: CreateFieldModal focused Jest suite, 2 tests, after extracting shared sports picker
    PASS: git diff --check after inline facility/resource details workspace
    BLOCKED: npx tsc --noEmit by unrelated untracked script scripts/preview-affiliate-org-logo-fit.ts typing errors around logo.path/logo.bucket

Acceptance for the first slice:

- A field row can carry `facilityId`.
- Existing organization fields are backfilled to one default facility per organization.
- `fieldService.listFields({ organizationId })` returns fields with `facility` attached when possible.
- Rental selections and field filters visibly include facility context when a facility name is known.
- No new operating-hours availability source is introduced.
- Managers see utilization, revenue per court-hour, open inventory, and unresolved conflicts above the field calendar.
- The manager summary remains visible and stable after filtering fields.
- The summary stacks on a 390px mobile viewport without horizontal overflow.
- The fields API includes nested facility metadata when a field has `facilityId`.
- Mobile rental labels include facility context without persisting a duplicate facility table or field snapshot.
- Facility create/edit can assign resources by patching the selected resources' `facilityId`; facilities do not store their own resource-id list.
- The Facilities tab shows unassigned resources and lets managers filter the calendar by facility before selecting resources.
- Public rental selection can be scoped by facility before selecting resources, while checkout still serializes the existing rental params.
- Managers can filter the existing resource calendar by rentals, reservations, events, games, maintenance blocks, staff assignments, official assignments, and conflicts.
- Unresolved conflicts render as red calendar cards on the calendar body and are derived from existing feed inputs instead of persisted as a second calendar source.
- Managers can switch from Schedule to Facility details and see a facility column, a resource column scoped to the selected facility, and an inline details panel.
- In Facility details, + Resource is disabled when no facility is selected, and each new resource is assigned to the selected facility.
- Managers can create a facility, create resources under that unsaved facility, undo draft changes, then click Save changes once to persist the facility and its resources.
- The schedule view hides the facility management cards and inline details controls, leaving the schedule rail and calendar as the primary surface.

## Idempotence and Recovery

The migration is additive. Re-running the migration should not duplicate default facilities because the default ids are deterministic per organization. If a field has no organization, leave `facilityId` null. If a field has an organization and no matching default facility, the server helper can create one before assigning new fields.

If facility hydration fails in the client, fields should still render using their existing field name. Facility display is an enhancement, not a blocker for existing rentals.

## Artifacts and Notes

Current source evidence:

    Fields model: prisma/schema.prisma
    Rental windows: TimeSlots in prisma/schema.prisma
    Rental calendar renderer: src/app/organizations/[id]/fieldCalendar.ts
    Fields API facility payload helper: src/server/fieldFacilityPayload.ts
    Field service hydration: src/lib/fieldService.ts
    Mobile rental labels: /Users/elesesy/StudioProjects/mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/eventSearch/tabs/rentals/RentalSchedulingUtils.kt
    Staff/official plan: docs/staff-official-operations-execplan.md
    Browser screenshot: output/playwright/facility-calendar-integrated-conflicts.png

## Interfaces and Dependencies

Primary new server contract:

    GET /api/facilities?ids=facility_1,facility_2
    GET /api/facilities?organizationId=org_1
    POST /api/facilities

Primary new client contracts:

    Facility
    Field.facilityId
    Field.facility

Existing contracts kept compatible:

    Field.$id
    Field.rentalSlotIds
    Field.facilityId
    Field.facility
    TimeSlot.scheduledFieldIds
    Event.fieldIds
    Match.fieldId

Change log:

- 2026-06-18: Created initial facility grouping and facility calendar ExecPlan.
- 2026-06-18: Completed the first facility grouping implementation slice and recorded validation.
- 2026-06-18: Added manager facility calendar metrics and recorded build/browser validation.
- 2026-06-18: Added field API facility payloads and mobile rental label parity without changing mobile persistence.
- 2026-06-18: Added facility-modal resource assignment and facility-first resource filtering while keeping `Fields.facilityId` as the source of truth.
- 2026-06-18: Added the derived facility calendar feed and folded feed-only records into the existing resource calendar with layer filters and red conflict cards.
- 2026-07-08: Began the inline manager details workspace slice so facility/resource creation and editing can happen without modals while preserving the schedule calendar.
- 2026-07-08: Completed the inline manager details workspace with draft creation, undo, batched facility-before-resource saves, and focused Jest coverage.
