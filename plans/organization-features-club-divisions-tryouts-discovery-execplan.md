# Add Organization Feature Modes, Club Divisions, Tryouts, and Division Discovery Filters

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan follows `PLANS.md` at the repository root and must remain compliant with it. The backend and web application live in `/Users/elesesy/StudioProjects/mvp-site`. The related Kotlin Multiplatform mobile application lives in `/Users/elesesy/StudioProjects/mvp-app`. Both repositories can contain unrelated work; implementation must preserve it and stage only files intentionally changed for this feature.

## Purpose / Big Picture

After this work, an organization owner can enable only the parts of BracketIQ that the organization needs: club and team tools, facility and rental tools, or general event-management tools. A club can maintain reusable divisions such as `Girls U14 Competitive` with a current total per-player price. Those divisions appear on the public organization page and make clubs searchable by sport, gender, age, skill, distance, and division price.

Clubs can also create a first-class Tryout event. The organizer selects one or more club divisions, assigns each selected division to one or more dated timeslots, and assigns every timeslot to an organization resource or an event-local custom resource. BracketIQ uses the normal event registration flow for internal tryouts and the official external link for affiliate tryouts. Tryouts do not create matches, standings, brackets, or league schedules.

Event discovery gains the same division age, skill, gender, and price filters. A filter combination must match one division row; BracketIQ must not combine the age from one division with the skill or price from another division.

This implementation intentionally does not add a program table. The organization owns reusable divisions directly, and each tryout event groups the divisions selected for that tryout.

## Progress

- [x] (2026-07-11) Read `PLANS.md` and audited the current Prisma organization, division, event, timeslot, event-tag, and organization-tag models.
- [x] (2026-07-11) Audited the web organization tabs, organization create/edit modal, event form division state, division type catalog, event search route, and organization list route.
- [x] (2026-07-11) Confirmed that the event form already carries separate `skillDivisionTypeId` and `ageDivisionTypeId` values but persists only a composite `divisionTypeId` on `Divisions`.
- [x] (2026-07-11) Confirmed that `TimeSlots.divisions` and `TimeSlots.scheduledFieldIds` already support assigning selected divisions to resources without a new scheduling table.
- [x] (2026-07-11) Created this implementation plan. No schema or application implementation was performed during planning.
- [x] (2026-07-12) Added organization feature flags, division scope/status/source fields, normalized age/skill fields, and the `TRYOUT` event type through an additive migration on `codex/organization-club-tryouts`.
- [x] (2026-07-12) Added dry-run-by-default event-division normalization and organization-feature backfill scripts. Production execution remains a deployment step after migration review.
- [x] (2026-07-12) Added organization-scoped division APIs, authorization, validation, organization management UI, public response hydration, and feature-aware organization navigation.
- [x] (2026-07-12) Added web Tryout event creation with locked Tryouts tagging, organization-division snapshotting, per-division timeslot/resource validation, normal individual registration behavior, and affiliate outbound-link compatibility. Tryouts never invoke the match scheduler.
- [x] (2026-07-12) Added same-row division filtering to event and organization search APIs and shared web Discover controls.
- [x] (2026-07-12) Updated affiliate division mapping normalization so legacy and reviewed manual mappings persist canonical composite, skill, and age ids. Mappings may also identify a reviewed source organization division through `sourceDivisionId`.
- [x] (2026-07-12) Added mobile decode, display, and server-backed Discover filter parity for Tryouts and division filters. Mobile Tryout creation is intentionally excluded because Tryouts are organization-managed on the web.
- [ ] Run the migration against an isolated local database, execute backfill audits, and complete browser verification. Applying the migration to the primary workspace database is deferred until the isolated branches are reviewed and merged.

## Surprises & Discoveries

- Observation: The current web event form already models age and skill separately in `divisionDetails`, including `skillDivisionTypeId`, `skillDivisionTypeName`, `ageDivisionTypeId`, and `ageDivisionTypeName`, but `prisma/schema.prisma` stores only the composite `Divisions.divisionTypeId`.
  Evidence: `src/app/events/[id]/schedule/components/eventForm/schema.ts` validates the separate values, while `prisma/schema.prisma` currently contains only `divisionTypeId` and `ratingType` on `Divisions`.

- Observation: The composite division id is deterministic and already has parsing helpers.
  Evidence: `src/lib/divisionTypes.ts` builds values such as `skill_open_age_u14` in `buildCompositeDivisionTypeId` and parses them in `parseCompositeDivisionTypeId`; the parser is currently module-private and must be exported or wrapped for migration/backfill and API normalization.

- Observation: `ageCutoffLabel` is not an age label. It describes an eligibility cutoff message or date rule, so it cannot replace a persisted `ageDivisionTypeId`.
  Evidence: `syncEventDivisions` in `src/server/repositories/events.ts` derives `ageCutoffLabel` from `evaluateDivisionAgeEligibility`, while the age group itself remains embedded in `divisionTypeId`.

- Observation: The existing schedule model already provides the tryout assignment shape.
  Evidence: `TimeSlots` in `prisma/schema.prisma` has `divisions String[]`, `scheduledFieldId`, `scheduledFieldIds`, `startDate`, start/end minute fields, and repeating controls. The event form already validates division-to-slot assignments for scheduled event types.

- Observation: Organization navigation is currently permission- and data-driven rather than capability-driven, and Events is always included.
  Evidence: `buildOrganizationTabs` in `src/app/organizations/[id]/organizationTabs.ts` starts with Overview, Reviews, and Events, then adds Teams and Facilities when permissions or existing data require them.

- Observation: BracketIQ already exposes one canonical division-option endpoint.
  Evidence: `GET /api/division-types` returns global genders, global ages, and sport-owned skills. Discover should reuse this endpoint instead of introducing hardcoded filter choices.

- Observation: Mobile already models separate age and skill ids inside `DivisionDetail`, so normalized backend fields fit the existing mobile event payload rather than requiring a new mobile concept.
  Evidence: `core/model/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/DivisionDetail.kt` contains `skillDivisionTypeId` and `ageDivisionTypeId`.

- Observation: Older organization payloads and existing organization-tab tests omit `enabledFeatures` entirely.
  Evidence: Treating an absent feature array as `EVENT_MANAGEMENT` hid legacy Teams and Facilities tabs. Navigation now treats an absent field as legacy-permissive, while an explicit feature array is authoritative.

- Observation: Prisma generation on this checkout adds trailing spaces to generated documentation comments, creating unrelated changes in every generated model.
  Evidence: Stripping generated trailing whitespace reduced the generated diff from more than one hundred files to the seven schema-dependent files.

- Observation: Affiliate status and event type are independent contracts.
  Evidence: Existing affiliate behavior uses `affiliateUrl`, while leagues and tournaments retain their actual `eventType`. Tryouts therefore remain `TRYOUT` with an optional affiliate URL rather than being rejected or converted to `AFFILIATE`.

- Observation: The Android production source compiles in the isolated mobile worktree after copying ignored machine-only SDK and Firebase configuration, but the focused JVM test task is blocked before the new tests run.
  Evidence: `:composeApp:compileDebugKotlinAndroid` passes. `:composeApp:testDebugUnitTest` first encounters the existing Maps manifest placeholder and then unrelated stale common-test fixture signatures and missing fee-breakdown symbols.

## Decision Log

- Decision: Reuse the existing `Divisions` table for both reusable organization divisions and event divisions.
  Rationale: The table already owns division identity, sport, gender, price, capacity, age eligibility, rating data, field mappings, and event scheduling configuration. A scope field and snapshot link are sufficient to distinguish the two lifecycles without creating a parallel division model.
  Date/Author: 2026-07-11 / Codex.

- Decision: Add explicit `scope` and `status` values instead of treating every row with a null `eventId` as an organization division.
  Rationale: Explicit scope prevents orphaned or partially migrated rows from silently becoming public club offerings and makes API authorization and filtering unambiguous.
  Date/Author: 2026-07-11 / Codex.

- Decision: Persist `skillDivisionTypeId` and `ageDivisionTypeId` while retaining the composite `divisionTypeId` for compatibility.
  Rationale: Existing event forms, API responses, registration data, and mobile clients already use the composite identifier. Explicit columns make indexed database filtering possible without breaking older clients.
  Date/Author: 2026-07-11 / Codex.

- Decision: Do not add `ageLabel` or a standalone `skillLevel` column.
  Rationale: Display names come from `/api/division-types`, and both age and skill have canonical ids. `ageCutoffLabel` remains reserved for eligibility cutoff messaging.
  Date/Author: 2026-07-11 / Codex.

- Decision: Do not add `priceBasis` or `teamSize` to club divisions.
  Rationale: A club division price is always the current total per-player price in cents. Tryouts register individual players, so team size and variable price bases do not apply.
  Date/Author: 2026-07-11 / Codex.

- Decision: Snapshot selected organization divisions into event-scoped division rows when a Tryout event is saved.
  Rationale: A reusable organization division can belong to many tryouts, and later edits to club pricing or eligibility must not rewrite a historical or already-published tryout. `sourceDivisionId` preserves traceability.
  Date/Author: 2026-07-11 / Codex.

- Decision: The organization division `price` is the current total price for a player to join that club division. The event-scoped Tryout division `price` is the fee to attend that tryout and defaults to zero until the organizer explicitly changes it.
  Rationale: Copying season dues into a tryout would create an incorrect charge. Both values remain total per-player prices but represent different purchases.
  Date/Author: 2026-07-11 / Codex.

- Decision: Reuse `TimeSlots` for Tryout sessions and do not add a tryout-session table.
  Rationale: The existing model already links one timeslot to one or more division ids and one or more resource ids and participates in resource conflict validation.
  Date/Author: 2026-07-11 / Codex.

- Decision: Keep Clubs inside the Organizations Discover tab rather than adding a duplicate top-level Clubs tab.
  Rationale: An organization can be both a club and a facility or event manager. The existing multi-tag model is designed for this overlap. Selecting the curated Club tag should activate club-specific filters and be deep-linkable without duplicating organization results.
  Date/Author: 2026-07-11 / Codex.

- Decision: Organization feature flags are operational capabilities, while organization tags remain public classification.
  Rationale: Permissions determine who may act, feature flags determine which tools are enabled, and tags describe the organization to search users. Keeping these concepts separate avoids silently changing public classification whenever an owner hides a management tool.
  Date/Author: 2026-07-11 / Codex.

- Decision: Existing data remains visible even when a feature is disabled.
  Rationale: Feature switches must hide unused creation and management surfaces without orphaning previously published events, teams, facilities, or rentals. Tabs with existing records stay accessible for viewing and cleanup, but new creation is gated by the feature.
  Date/Author: 2026-07-11 / Codex.

- Decision: Tryout creation and editing remain web organization-management workflows; mobile supports reading, filtering, registration, and affiliate outbound actions only.
  Rationale: Tryouts require organization-owned division catalog selection and resource scheduling, and the product requirement limits creation to organization managers. Excluding Tryout from the mobile new-event picker avoids exposing a partial or unauthorized creation flow.
  Date/Author: 2026-07-12 / Codex.

## Outcomes & Retrospective

The isolated web and mobile branches now implement the core contract: organization feature modes, reusable club divisions, web-only Tryout creation, locked Tryouts tagging, division snapshots and resource schedules, same-row Discover filters, affiliate mapping normalization, and mobile Tryout read/filter behavior. Static web validation, focused web tests, and Android production compilation pass. Database migration/backfill execution and browser/device workflow verification remain deployment-stage work because the primary workspaces and their local database are actively used by unrelated work.

## Context and Orientation

`prisma/schema.prisma` defines the database. `Organizations` currently has one facility-related capability boolean, `operatesAthleticFacility`, but no general feature set. `Divisions` is the canonical division source of truth for events through `Divisions.eventId`; the legacy event-level division id array has already been removed as an authoritative backend store. `Divisions` currently stores a composite `divisionTypeId`, gender, rating type, price, capacity, sport, and event-specific scheduling and bracket fields.

In this plan, an organization division means a reusable club offering stored in `Divisions` with organization scope, an `organizationId`, and no `eventId`. An event division means a division snapshot owned by one event through `eventId`. A Tryout event copies selected organization divisions into event divisions so registration and timeslot code continue to work against event-owned rows.

`src/lib/divisionTypes.ts` is the canonical web/server vocabulary for genders, age ids, and sport-specific skill ids. `GET /api/division-types` in `src/app/api/division-types/route.ts` exposes those values to clients. Names are presentation data; ids are persisted and filtered.

`src/server/repositories/events.ts` is the central event persistence path. `syncEventDivisions` queries and upserts division rows and serializes event division details. It must persist the two normalized ids and preserve `sourceDivisionId` when saving Tryout snapshots.

`src/app/events/[id]/schedule/components/EventForm.tsx` and its modules under `eventForm/` implement web event creation and editing. `eventRules.ts` decides which event types use timeslots and resources. `schema.ts` validates event drafts. `buildEventDraft.ts`, `eventStateMapping.ts`, and `defaultValues.ts` move values between API events and form state.

`src/app/api/events/search/route.ts` is the paginated event Discover backend. It already filters events by tags, sports, dates, distance, price, and division identifiers, then hydrates division details. `src/app/api/organizations/route.ts` is the paginated organization backend. It currently filters by tags and text and hydrates affiliate rental facilities. Both routes must apply club/event division predicates before pagination.

`src/app/discover/page.tsx` owns web Discover state and renders Events, Organizations, Rentals, and Teams. Organization tags already support selecting Club. `src/lib/eventService.ts` defines `EventFilters` and sends paginated search requests.

On mobile, `EventFilter.kt`, `EventSearchComponent.kt`, `EventSearchScreen.kt`, `BillingRepository.kt`, and `EventRepository.kt` are the corresponding filter, state, UI, and HTTP seams. `DivisionDetail.kt` already has explicit age and skill ids. `EventType.kt` must gain `TRYOUT` before decoding the new event type.

## Data Contract

Add these enums and columns in `prisma/schema.prisma`:

    enum OrganizationFeatureEnum {
      CLUB_TEAMS
      FACILITIES_RENTALS
      EVENT_MANAGEMENT
    }

    enum DivisionScopeEnum {
      ORGANIZATION
      EVENT
    }

    enum DivisionStatusEnum {
      ACTIVE
      INACTIVE
      ARCHIVED
    }

    enum EventsEventTypeEnum {
      TOURNAMENT
      EVENT
      LEAGUE
      WEEKLY_EVENT
      TRYOUT
      AFFILIATE
    }

Add `enabledFeatures OrganizationFeatureEnum[] @default([EVENT_MANAGEMENT])` to `Organizations`. Older clients that omit the field must continue to create a usable event-management organization. New web and mobile organization forms must require at least one selected feature.

Add these columns to `Divisions`:

    scope               DivisionScopeEnum  @default(EVENT)
    status              DivisionStatusEnum @default(ACTIVE)
    sourceDivisionId    String?
    skillDivisionTypeId String?
    ageDivisionTypeId   String?
    description         String?
    registrationUrl     String?
    sourceUrl           String?
    lastVerifiedAt      DateTime?

Keep `divisionTypeId`, `ratingType`, `gender`, `price`, `maxParticipants`, and the existing schedule/bracket fields. Do not add `ageLabel`, `skillLevel`, `priceBasis`, `teamSize`, `minAge`, or `maxAge` to `Divisions` in this milestone.

Add indexes on `(scope, status, organizationId)`, `(scope, status, eventId)`, `(scope, status, sportId, ageDivisionTypeId)`, `(scope, status, sportId, skillDivisionTypeId)`, `(scope, status, gender)`, `sourceDivisionId`, and `price`. If query plans show that the broad indexes are insufficient, replace them with partial PostgreSQL indexes for active organization and event divisions rather than adding many overlapping indexes blindly.

The migration must backfill existing rows with `scope = EVENT` when `eventId` is present. It must parse composite ids matching `skill_<skill>_age_<age>` into explicit columns. Legacy non-composite ids must be repaired by an idempotent TypeScript backfill script using the same `inferDivisionDetails` logic as event loading rather than speculative SQL. The script must report unresolved rows and must not publish until unresolved active event divisions are reviewed.

The database migration should add check constraints after the backfill is clean:

- Event-scoped rows require a non-null `eventId`.
- Organization-scoped rows require a non-null `organizationId` and a null `eventId`.
- Organization-scoped rows require a non-null `sportId`, `skillDivisionTypeId`, and `ageDivisionTypeId` before they can be ACTIVE.

Use a partial unique index on `(organizationId, sportId, key)` for non-archived organization-scoped rows. Re-activating an archived division should update the existing logical row or use a new key; it must not silently create two active copies of the same club division.

## Plan of Work

### Milestone 1: Add backward-compatible schema and normalized division persistence

Update `prisma/schema.prisma`, create additive Prisma migration SQL, regenerate `src/generated/prisma`, and add a repeatable backfill/audit script under `scripts/`. Export a safe composite parser from `src/lib/divisionTypes.ts` or add a public helper that returns normalized skill and age ids. Update `src/types/index.ts` so `Division` includes scope, status, source id, normalized ids, description, registration URL, source URL, and verification timestamp.

Update `normalizeDivisionDetailsPayload`, `syncEventDivisions`, event serializers, event route enrichment, and `eventService.mapRowToEvent` so every new or edited event division persists and returns explicit normalized ids. The composite `divisionTypeId` must still be generated and returned. If explicit ids and the composite disagree, reject the write with a clear validation error rather than storing contradictory data.

At the end of this milestone, saving an ordinary event writes all three identifiers, loading it returns all three, and existing events remain readable. A focused repository test must prove that a legacy composite-only row is hydrated with explicit ids and is normalized on the next save.

### Milestone 2: Add organization feature selection and server-side capability gates

Extend organization create/update validation and `Organization` client types with `enabledFeatures`. Add an "Organization tools" section to `src/components/ui/CreateOrganizationModal.tsx` with three independent checkboxes or switches: Club and team tools, Facility and rental tools, and Event management tools. Keep tax classification and `operatesAthleticFacility` separate because tax treatment is not a navigation capability.

Update `buildOrganizationTabs` so feature flags control empty management surfaces. Club and team tools expose Club Divisions, Teams, and Tryout creation. Facility and rental tools expose Facilities and Rentals. Event management tools expose general Event, Weekly Event, League, Tournament, and template creation. Tabs that already contain data remain visible even when their feature is disabled, but creation buttons are hidden or disabled with an explanation.

Enforce the same rules in backend mutation routes. `TRYOUT` creation requires `CLUB_TEAMS`; general event types require `EVENT_MANAGEMENT`; creating teams requires `CLUB_TEAMS`; creating facilities/resources/rentals requires `FACILITIES_RENTALS`. Existing role permissions remain mandatory in addition to feature checks. Admin affiliate publishing may bypass the user-facing check only when the source-linked organization has the appropriate feature written during source setup.

Backfill all existing organizations with `EVENT_MANAGEMENT` to preserve current behavior. Add `CLUB_TEAMS` when the organization has the curated Club tag, club teams, or organization-scoped divisions. Add `FACILITIES_RENTALS` when it has facility/resource records or `operatesAthleticFacility = true`. For known affiliate organizations, update the existing repeatable setup/sync scripts so rerunning them converges to the same exact feature set. Do not remove `EVENT_MANAGEMENT` automatically from existing organizations during migration; owners or a reviewed admin sync can disable it later.

### Milestone 3: Add reusable club division management and public display

Create `GET` and authorized mutation routes under `src/app/api/organizations/[id]/divisions/`. Public GET returns active organization-scoped divisions only. Manager GET may include inactive rows. POST creates organization-scoped rows; PATCH updates allowed catalog fields; DELETE archives rather than physically deleting a division referenced by an event snapshot.

Validate every write against `/api/division-types` semantics: gender must be known, age id must be a known global age option, and skill id must be valid for the selected sport. Build the composite `divisionTypeId` server-side. Treat `price` as a non-negative integer in cents and display it as the total current per-player club price. Store detailed fee explanations in `description`; do not add a separate free-form price string.

Add a `divisions` organization tab and route mapping in `src/app/organizations/[id]/organizationTabs.ts`. Implement an organization division manager that supports search, sport filtering, add, edit, deactivate, reactivate, and archive. The compact list must show division name, sport, gender, age, skill, and formatted price without displaying internal ids.

Add a public Divisions section to the managed organization page and public `/o/[slug]` page. The Overview surface should show a short preview and link to the complete division list. Organizations without active club divisions should not show an empty public section.

### Milestone 4: Add the Tryout event lifecycle

Add `TRYOUT` to web and backend event type unions, schemas, form options, tags, serializers, API validation, and tests. `src/app/events/[id]/schedule/components/eventForm/eventTypeTags.ts` must map it to the existing system-managed Tryouts tag. The event-type tag remains automatic and unavailable as a conflicting manual type choice.

The Tryout form appears only in an organization context with `CLUB_TEAMS`. It loads active organization divisions and lets the organizer choose one or more. On save, create event-scoped division snapshots with a new event-owned id, copy sport/gender/age/skill/name eligibility fields, set `sourceDivisionId` to the selected organization division id, and initialize the event division price to zero unless the organizer enters a tryout fee. Do not copy the club registration price into the tryout fee.

Extend `supportsScheduleSlotsForEvent` and related event form rules so Tryouts use timeslots. Do not run league generation, tournament bracket generation, standings initialization, match scheduling, or team-officiating behavior. The form must let the organizer select organization resources and create event-local custom resources through the existing resource controls.

Every selected event division must appear in at least one `TimeSlots.divisions` list. Every Tryout timeslot must have a valid start/end and at least one `scheduledFieldId` or `scheduledFieldIds` value. Multiple divisions may share a session and resource only when the normal resource conflict rules permit it. One division may have multiple sessions. Validation errors must identify the unscheduled division by display name.

Internal Tryouts use individual registration, division selection, per-division tryout price, capacity, questions, documents, and participant lists. Team registration, brackets, standings, match rules, and generated matches are hidden. Affiliate Tryouts retain the same schedule and division display but use `affiliateUrl` for the action and do not run internal checkout.

The event detail page and cards must label the event as Tryout, show the automatic Tryouts tag, and display the selected division schedule. A club division page should show upcoming Tryouts by following event division `sourceDivisionId` values.

### Milestone 5: Add same-row division filtering to event and club discovery

Extend `EventFilters` and `/api/events/search` with `ageDivisionTypeIds`, `skillDivisionTypeIds`, `genders`, `priceMin`, and `priceMax`. Resolve matching event ids by querying active event-scoped, non-playoff division rows. Apply all selected division predicates in one Prisma `where` object so one row must satisfy age, skill, gender, and price together. Continue applying event-level date, distance, sport, tag, and visibility predicates normally.

Move effective event price filtering to `Divisions.price`. Existing single-division events already mirror event-level price into their division row; the migration/audit must repair exceptions before enabling the new filter. Temporarily allow a documented event-level fallback only for legacy events with no usable league division row, and record fallback counts so the compatibility path can be removed.

Extend `/api/organizations` and `organizationService.listOrganizationsWithFieldsPage` with the same division filters. Organization matching uses active organization-scoped division rows and returns only organizations for which one division satisfies every selected division predicate. Include a compact `matchingDivisions` projection and matching minimum/maximum prices in the organization result so cards can explain why they matched.

Reuse `GET /api/division-types` for filter options. When one sport is selected, show its skills. With multiple sports, group or deduplicate skill choices by id and retain enough sport context to avoid treating sport-specific ids as equivalent accidentally. Age and gender options remain global.

Update the Events filter panel in `src/app/discover/page.tsx` with searchable/collapsible Gender, Age division, and Skill division sections plus minimum and maximum price inputs. Update the Organizations tab so selecting the curated Club tag reveals the same club filters. Keep Clubs inside Organizations and support a deep link such as `/discover?tab=organizations&tags=club`; do not add a duplicate top-level tab in this milestone.

Active filter chips must identify each selected age, skill, gender, and price constraint. Pagination, total counts, reset behavior, map/list behavior, and mobile/narrow drawers must continue using server-filtered results rather than filtering only the already-loaded page.

### Milestone 6: Update affiliate mappings and organization setup scripts

Update affiliate event publishing so mapped divisions persist `skillDivisionTypeId` and `ageDivisionTypeId` in addition to the composite id. Existing source adapters that infer `U14`, `18+`, `AA`, `Competitive`, `Open`, or similar values must normalize through `src/lib/divisionTypes.ts` rather than adding a second vocabulary.

Extend the club setup/review workflow so a reviewed club source can upsert organization-scoped divisions with price, description, registration URL, source URL, and `lastVerifiedAt`. The setup must remain idempotent and must archive or flag missing previously-known divisions only after a reviewed scrape, not after one transient empty response. Directory-only club sources must not invent divisions from directory descriptions.

Add an audit report under `output/` that lists each club organization, enabled features, active divisions, unresolved age/skill values, prices, and upcoming Tryouts. The report is verification output and must not be committed unless repository conventions explicitly track that artifact.

### Milestone 7: Add mobile parity

After the backend contract and web workflow pass validation, update `/Users/elesesy/StudioProjects/mvp-app`. Add `TRYOUT` to `EventType`, add organization feature values to `Organization` DTO/domain models, and retain the existing normalized fields in `DivisionDetail`. Update HTTP repositories to send and receive the new event and organization search filters.

Extend `EventFilter.kt`, `EventSearchComponent.kt`, `EventSearchScreen.kt`, and the shared SearchBox filter UI with age, skill, gender, and min/max price. Filtering must be server-backed for pagination; local filtering may only reconcile cached rows against the same active filter while a request is pending.

Add mobile organization division display and club-filtered organization search. Add mobile Tryout detail rendering and registration/external-link behavior. Do not add Tryout creation or editing to mobile; the mobile new-event picker must exclude `TRYOUT` while existing Tryouts remain decodable and visible. Do not modify unrelated current mobile work, and do not create a new Room entity unless offline organization division management is explicitly required. Organization divisions can be fetched as detail data initially.

## Concrete Steps

Run all web/backend commands from `/Users/elesesy/StudioProjects/mvp-site`.

1. Before implementation, inspect overlapping dirty files and record them in this plan:

       git status --short
       git diff -- prisma/schema.prisma src/server/repositories/events.ts src/app/discover/page.tsx src/components/ui/CreateOrganizationModal.tsx

2. Add the schema and migration, then validate and regenerate:

       npx prisma validate
       npx prisma generate
       npx prisma migrate status

3. Run the normalized division audit in read-only mode before write mode. The implementation should expose commands similar to:

       npm run divisions:normalize -- --report
       npm run divisions:normalize -- --write

   The report must state total event rows, composite rows parsed, legacy rows inferred, unresolved rows, and rows changed. Re-running `--write` must produce zero additional changes.

4. Run focused web/backend tests as each milestone lands. Exact files may be added during implementation, but the final command must include at least:

       npm test -- --runInBand \
         src/lib/__tests__/divisionTypes.test.ts \
         src/server/repositories/__tests__/events.upsert.test.ts \
         src/app/api/division-types/__tests__/route.test.ts \
         src/app/api/events/__tests__/eventSearchRoute.test.ts \
         src/app/api/organizations/__tests__/organizationsRoute.test.ts \
         src/app/events/[id]/schedule/components/__tests__/EventForm.test.tsx

5. Run repository-wide static validation after focused tests:

       npx tsc --noEmit
       git diff --check

6. Start the local web application against the normal local database and verify the behavior in a browser:

       npm run dev

   Use an organization owner account. Edit an organization, enable Club and team tools, add at least two divisions with different age, skill, gender, and prices, create a Tryout, assign each division to a timeslot/resource, publish it, and verify both event and organization Discover filters.

7. After web/backend stabilization, run mobile validation from `/Users/elesesy/StudioProjects/mvp-app`:

       ./gradlew :composeApp:compileDebugKotlinAndroid
       ./gradlew :composeApp:allTests
       git diff --check

   If broad mobile tests are blocked by unrelated dirty work, run the narrow repository and filter tests, record the exact blocker here, and do not alter unrelated files to force a green result.

## Validation and Acceptance

Schema acceptance is met when existing event divisions have explicit age and skill ids, new event saves persist those ids and a compatible composite id, and a second normalization run changes zero rows.

Organization feature acceptance is met when an owner can independently enable the three feature groups, empty disabled tabs disappear, existing records remain accessible, and backend creation endpoints reject operations whose feature is disabled even when the caller otherwise has permission.

Club division acceptance is met when an owner can create `Girls U14 Competitive` and `Coed 18+ Recreational` divisions with different total per-player prices, reload the organization, and see the same structured values on both manager and public pages.

Tryout acceptance is met when an owner selects those organization divisions, receives event-owned snapshots with `sourceDivisionId`, assigns each to a resource-backed timeslot, publishes the Tryout, and sees no generated matches, brackets, or standings. Saving must fail with a division-specific message if any selected division lacks a scheduled resource timeslot.

Event filter acceptance is met when selecting Girls, U14, Competitive, and a maximum price returns only events with one active event division satisfying all four predicates. An event with Girls U14 at a higher price and Coed U14 at a lower price must not match a Girls-under-the-lower-price query.

Club filter acceptance is met when the same query on Organizations returns only clubs with one active organization division satisfying every predicate and each card identifies the matching division and price. Pagination totals and loading-more behavior must remain correct.

Affiliate acceptance is met when one reviewed affiliate Tryout and one reviewed club division persist normalized ids, official links, source metadata, and price without creating duplicates on a second scrape.

Mobile acceptance is met when iOS and Android decode Tryout events, show division schedules, follow affiliate links when present, and send normalized division filters to paginated event and organization search without crashing older cached data.

## Idempotence and Recovery

All schema changes are additive. Never edit a migration that has already been applied outside the local development database; create a corrective migration instead. The normalization and organization feature backfill scripts must support report-only and write modes and must be safe to rerun.

Do not delete legacy `divisionTypeId` values or remove compatibility response fields in this plan. If normalized ids are missing, loaders may derive them for display, but writes and search readiness audits must make the missing persistence visible.

Archiving an organization division must not delete event snapshots. If a Tryout save fails after snapshot creation, wrap event and division persistence in the existing transaction boundary so retrying does not create duplicate event divisions. Use deterministic event division ids or an event/source unique lookup to converge on the same rows.

Because both repositories may be dirty, never use `git reset --hard`, `git checkout --`, `git clean`, or broad staging. Read overlapping diffs, preserve current edits, and stage only the validated feature files when implementation is eventually committed.

## Artifacts and Notes

The intended organization feature payload is:

    enabledFeatures: ["CLUB_TEAMS", "FACILITIES_RENTALS", "EVENT_MANAGEMENT"]

An organization division response should contain at least:

    {
      "id": "org_division_example",
      "scope": "ORGANIZATION",
      "status": "ACTIVE",
      "organizationId": "org_example",
      "eventId": null,
      "sportId": "Soccer",
      "name": "Girls U14 Competitive",
      "key": "f_skill_competitive_age_u14",
      "gender": "F",
      "skillDivisionTypeId": "competitive",
      "ageDivisionTypeId": "u14",
      "divisionTypeId": "skill_competitive_age_u14",
      "price": 42500
    }

A Tryout snapshot of that division should contain a new id, `scope = EVENT`, the Tryout event id, `sourceDivisionId = org_division_example`, and a separately entered tryout price. Its timeslot references the new event division id, not the organization division id.

## Interfaces and Dependencies

No new third-party library is required. Use Prisma/PostgreSQL, existing Mantine controls, existing event form modules, existing `TimeSlots`, existing resource conflict checks, and the existing division type catalog.

At completion, `src/lib/divisionTypes.ts` must expose a stable normalizer with behavior equivalent to:

    normalizeDivisionTypeIds({
      divisionTypeId?: string | null,
      skillDivisionTypeId?: string | null,
      ageDivisionTypeId?: string | null,
      ratingType?: "AGE" | "SKILL" | null,
    }): {
      divisionTypeId: string;
      skillDivisionTypeId: string;
      ageDivisionTypeId: string;
    }

At completion, the organization division server layer must expose operations equivalent to:

    listOrganizationDivisions(organizationId, options)
    createOrganizationDivision(organizationId, input, viewer)
    updateOrganizationDivision(organizationId, divisionId, input, viewer)
    archiveOrganizationDivision(organizationId, divisionId, viewer)

At completion, event search filters must support:

    ageDivisionTypeIds?: string[]
    skillDivisionTypeIds?: string[]
    genders?: Array<"M" | "F" | "C">
    priceMin?: number
    priceMax?: number

The organization list endpoint must support the same fields and return `matchingDivisions` when any division filter is active.

Revision note (2026-07-11 / Codex): Created this ExecPlan after the user chose planning over immediate implementation. It records the decisions to reuse `Divisions`, avoid a program table, omit redundant age/skill labels and irrelevant price/team fields, add Tryout scheduling through existing timeslots/resources, and make normalized division filters available to both events and clubs.
