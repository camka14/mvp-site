# Dedicated Event Template Records Across Web And Mobile

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Reference: maintain this plan in accordance with `PLANS.md` in the `mvp-site` repository root. This plan supersedes the older `plans/event-templates-execplan.md`, which modeled templates as live `Events` rows with `state = TEMPLATE`. That older approach is now a compatibility and migration concern, not the target architecture.

## Purpose / Big Picture

Hosts and organization managers need reusable event templates that behave like templates, not real scheduled events. After this work, creating a template from an event will produce a dedicated `EventTemplates` record with typed reusable event settings, typed template resources, typed template time slot offsets, typed rental resource hints, and a typed `EventTemplateLeagueScoringConfigs` row for league scoring rules. Templates will not reserve resources, will not contain fake dates, will not contain teams, participants, free agents, waitlists, matches, standings, or rental booking ids, and will not need the old `Events.state = TEMPLATE` workaround.

The visible outcome is that a user can create a complex event on web, save it as a template, see it in the web and mobile template lists, create a new event from it on a new date, and get a real event with the same reusable settings, staff, payment settings, payment plans, resources, shifted time slots, scoring rules, and rental prompts. The new event must not copy participants, teams, placeholders, matches, or old rental bookings.

## Progress

- [x] (2026-06-29T17:11Z) Created this implementation plan after deciding to replace event-as-template rows with dedicated template records.
- [x] (2026-06-29T17:25Z) Added Prisma models and a create-only migration for `EventTemplates`, `EventTemplateResources`, `EventTemplateTimeSlots`, `EventTemplateRentalResourceHints`, and `EventTemplateLeagueScoringConfigs` in `mvp-site`; generated the Prisma client and validated the schema.
- [x] (2026-06-29T17:58Z) Added `src/server/eventTemplates.ts` to build dedicated template rows from source events, store rental resource hints, clear live participant/match/rental booking state, and seed draft event payloads from offsets.
- [x] (2026-06-29T17:58Z) Added `/api/event-templates`, `/api/event-templates/[templateId]`, and `/api/event-templates/[templateId]/seed` routes for listing, creating, fetching, seeding, and archiving dedicated event templates.
- [x] (2026-06-29T17:58Z) Updated the web create-event flow, event schedule Create Template action, profile template list, and organization event-template tab to use the new event-template APIs instead of creating or opening `Events.state = TEMPLATE` rows.
- [x] (2026-06-29T18:08Z) Validated the web slice with `npx prisma validate --schema prisma/schema.prisma`, `npx prisma generate`, `npm test -- --runTestsByPath src/server/__tests__/eventTemplates.test.ts src/lib/__tests__/eventCreateNavigation.test.ts`, `npx tsc --noEmit`, and `git diff --check` for touched files.
- [x] (2026-06-29T20:08Z) Added idempotent legacy `Events.state = TEMPLATE` backfill tooling with dry-run/apply modes and unit coverage.
- [x] (2026-06-29T19:35Z) Added mobile DTOs, `EventTemplateSummary`, repository list/create methods, and HTTP tests in `mvp-app` for `/api/event-templates`.
- [x] (2026-06-29T19:35Z) Updated `mvp-app` profile template list to read dedicated template summaries and removed the event-detail navigation assumption for templates.
- [x] (2026-06-29T19:35Z) Updated `mvp-app` personal event Create Template action to post only `sourceEventId` to `/api/event-templates`; removed the mobile client-side event-template clone builder and its 52-week slot-offset behavior.
- [x] (2026-06-29T19:35Z) Kept organization event template creation disabled on mobile until the dedicated org-template mobile flow is explicitly implemented.
- [x] (2026-06-29T19:39Z) Revalidated focused web and Android slices after mobile parity changes.
- [ ] Run browser and Android emulator flow verification with real UI sessions after local services are ready.

## Surprises & Discoveries

- Observation: The current `TimeSlots.startDate` column in `prisma/schema.prisma` is non-null, and mobile `TimeSlot.startDate` is also a non-null `Instant`.
  Evidence: `prisma/schema.prisma` model `TimeSlots` has `startDate DateTime`; `mvp-app/core/model/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/TimeSlot.kt` has `@Contextual val startDate: Instant`.

- Observation: The existing event-template plan intentionally used `Events.state = TEMPLATE`; this is now considered the legacy approach to migrate away from.
  Evidence: `plans/event-templates-execplan.md` starts with `# Event Templates (TEMPLATE state) + Create-From-Template Flow` and its decision log chooses regular `Events` rows.

- Observation: The existing live event schema has many reusable event columns that should be represented directly on `EventTemplates` rather than hidden inside a large JSON blob.
  Evidence: `prisma/schema.prisma` model `Events` includes reusable settings such as payment mode, manual payment instructions, payment plans, divisions, official scheduling mode, official positions, match rules, required document templates, and league/tournament configuration.

- Observation: Local `prisma migrate dev --create-only` could not be used without resetting the development database because the local database has migration drift unrelated to this feature.
  Evidence: Prisma reported modified applied migrations and drift, then requested a reset of the `public` schema at `localhost:5433`. The feature migration was generated with `prisma migrate diff --from-schema /tmp/mvp-site-base-schema.prisma --to-schema prisma/schema.prisma --script --output prisma/migrations/20260629171100_add_event_template_records/migration.sql` instead.

- Observation: Template slots were not enough to rebuild a new event window because `EventTemplates` had no event-level end offset.
  Evidence: While implementing `/api/event-templates/[templateId]/seed`, the template could shift time slots but could not reconstruct the live event `end` value without either a fake stored date or a relative end offset.

- Observation: The first focused server test caught stale rental transaction price copying on rental-backed template slots.
  Evidence: `src/server/__tests__/eventTemplates.test.ts` initially failed because a rental slot retained `price: 5000`; the mapper now stores `price: null` for rental-backed template slots.

- Observation: Mobile still had a client-side event template builder that generated a copied `Event` payload and shifted template slots by 364 days.
  Evidence: `mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventTemplateCreateBuilder.kt` contained `TEMPLATE_SLOT_OFFSET_DAYS = 364L` and produced `PreparedTemplateForCreate`; it was deleted after replacing mobile creation with `POST /api/event-templates`.

- Observation: Mobile profile templates could not keep navigating to event detail because dedicated templates are not rows in `/api/events/{id}`.
  Evidence: `ProfileEventTemplatesState` now stores `EventTemplateSummary`, and `ProfileEventTemplatesScreen` renders summary cards without calling the removed `openEventTemplate(event: Event)` callback.

- Observation: Backfill does not need to mutate or delete legacy template event rows in this first pass.
  Evidence: `scripts/backfill-event-template-records.ts` finds `Events.state = TEMPLATE`, skips any existing `EventTemplates.sourceEventId`, and creates missing dedicated template rows through `createEventTemplateFromSourceEvent`; legacy event rows are left in place for later archive/delete cleanup.

## Decision Log

- Decision: Use dedicated template tables rather than `Events.state = TEMPLATE` as the target model.
  Rationale: Templates are not real events. They should not reserve resources, participate in event discovery, carry fake dates, or share live event ids. Dedicated tables make the invariant explicit.
  Date/Author: 2026-06-29 / Codex

- Decision: Store reusable event-shaped fields as typed columns on `EventTemplates`, not as one broad `eventConfig Json`.
  Rationale: Typed columns make migrations explicit and keep template compatibility visible when the event model changes. This creates some duplication with `Events`, but that pressure is useful because every new event field must be intentionally classified as reusable template config or live event state.
  Date/Author: 2026-06-29 / Codex

- Decision: Use `EventTemplateLeagueScoringConfigs` instead of embedding scoring config JSON or reusing `LeagueScoringConfigs` directly.
  Rationale: Template scoring config needs ownership by an event template, and sharing the live event scoring table would risk confusing live event config with reusable template config. A parallel typed table preserves the same scoring fields while making ownership clear.
  Date/Author: 2026-06-29 / Codex

- Decision: Rename template fields to template resources.
  Rationale: The product concept is no longer only physical fields or courts. Resources can include owned playing spaces, rentable courts, rooms, equipment, or other schedulable items.
  Date/Author: 2026-06-29 / Codex

- Decision: Store template time slots as offsets from the template event start, not as real dates.
  Rationale: Offsets preserve schedule structure without creating fake reservations or tying the template to a specific calendar date.
  Date/Author: 2026-06-29 / Codex

- Decision: Store rental resource hints as a list per template slot, never as rental booking ids.
  Rationale: A template slot may require multiple rental resources matching the same time window, and a rental booking is a live transaction that cannot be reused.
  Date/Author: 2026-06-29 / Codex

## Outcomes & Retrospective

Implemented the core dedicated-template path in `mvp-site` and the mobile endpoint parity in `mvp-app`.

Validation performed so far:

- `mvp-site`: `npx prisma validate --schema prisma/schema.prisma`
- `mvp-site`: `npx prisma generate`
- `mvp-site`: `npm test -- --runTestsByPath src/server/__tests__/eventTemplates.test.ts src/lib/__tests__/eventCreateNavigation.test.ts`
- `mvp-site`: `npm test -- --runTestsByPath src/server/__tests__/eventTemplates.test.ts src/lib/__tests__/eventCreateNavigation.test.ts 'src/app/events/[id]/schedule/__tests__/page.test.tsx'` passed 72 tests.
- `mvp-site`: `npm test -- --runTestsByPath scripts/__tests__/backfill-event-template-records.test.ts src/server/__tests__/eventTemplates.test.ts src/lib/__tests__/eventCreateNavigation.test.ts 'src/app/events/[id]/schedule/__tests__/page.test.tsx'` passed 74 tests.
- `mvp-site`: `npx tsc --noEmit`
- `mvp-site`: `git diff --check -- ':!src/generated/prisma/**'`; full `git diff --check` still reports trailing whitespace in Prisma-generated `src/generated/prisma/**` files.
- `mvp-app`: `./gradlew :composeApp:testDebugUnitTest --tests com.razumly.mvp.eventDetail.EventEditActionCoordinatorTest --tests com.razumly.mvp.core.data.repositories.EventRepositoryHttpTest`
- `mvp-app`: `git diff --check`

Remaining compatibility limitations:

- Existing legacy `Events.state = TEMPLATE` rows can now be backfilled into dedicated templates; archive/delete cleanup remains a later manual-verification step.
- Web browser flow and Android emulator flow still need real UI verification after local services are ready.

## Context and Orientation

There are two repositories involved.

`mvp-site` is the Next.js, Prisma, and Postgres web/backend repository. The Prisma schema is in `prisma/schema.prisma`. Event persistence is centered around `src/server/repositories/events.ts` and API routes under `src/app/api/events`. Current template helper code lives in `src/lib/eventTemplates.ts`. The older template implementation stored templates as real rows in the `Events` table with `state = TEMPLATE`.

`mvp-app` is the Kotlin Multiplatform mobile repository. Its shared data models live under `core/model/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes`. Its network DTOs live under `core/network/src/commonMain/kotlin/com/razumly/mvp/core/network/dto`. Its repository implementation lives under `core/repository-impl/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories`. Its event detail and profile template screens live under `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail` and `composeApp/src/commonMain/kotlin/com/razumly/mvp/profile`.

Definitions used in this plan:

A live event is a real scheduled event that can appear in discovery, accept registrations, reserve resources, generate matches, and collect payments.

An event template is reusable configuration for creating future live events. It is not itself scheduled, discoverable, joinable, payable, or reserving resources.

A resource is a reusable schedulable item such as a court, field, room, or other asset. This plan uses `resource` for template records even though the current live event schema still has a `Fields` table and `fieldIds`.

A rental resource hint is a record saying, in plain language, that a template slot previously used or expects a rented resource. It is not a booking and does not prove availability.

A template time slot offset is a number relative to the event start, such as "start 60 minutes after event start and end 120 minutes after event start" or "start 7 days after event start." It replaces fake future dates in template records.

## Target Data Model

Add these models to `mvp-site/prisma/schema.prisma`. Use the exact field names unless implementation discovers a Prisma limitation. Keep the naming plural to match existing models such as `Events`, `Fields`, and `TimeSlots`.

The `EventTemplates` table stores reusable event-level settings. It intentionally mirrors the reusable subset of `Events`.

    model EventTemplates {
      id                            String                           @id
      createdAt                     DateTime?                        @default(now())
      updatedAt                     DateTime?                        @updatedAt
      archivedAt                    DateTime?
      schemaVersion                 Int                              @default(1)
      name                          String
      description                   String?
      sourceEventId                 String?
      ownerUserId                   String?
      organizationId                String?
      createdByUserId               String
      sportId                       String?
      eventType                     EventsEventTypeEnum?
      timeZone                      String                           @default("UTC")
      endOffsetMinutesFromEventStart Int?
      location                      String
      address                       String?
      affiliateUrl                  String?
      winnerSetCount                Int?
      loserSetCount                 Int?
      doubleElimination             Boolean?
      rating                        Float?
      teamSizeLimit                 Int
      maxParticipants               Int?
      minAge                        Int?
      maxAge                        Int?
      assistantHostIds              String[]                         @default([])
      noFixedEndDateTime            Boolean                          @default(true)
      price                         Int
      registrationPaymentMode       RegistrationPaymentModeEnum       @default(ONLINE)
      manualPaymentLinks            Json                             @default("[]")
      manualPaymentInstructions     String?
      taxHandling                   String                           @default("INHERIT_ORG")
      organizerManualTaxRateBps     Int                              @default(0)
      singleDivision                Boolean?
      registrationByDivisionType    Boolean?
      cancellationRefundHours       Int?
      teamSignup                    Boolean?
      prize                         String?
      registrationCutoffHours       Int?
      seedColor                     Int?
      imageId                       String?
      winnerBracketPointsToVictory  Int[]                            @default([])
      loserBracketPointsToVictory   Int[]                            @default([])
      coordinates                   Json?
      gamesPerOpponent              Int?
      includePlayoffs               Boolean?
      playoffTeamCount              Int?
      usesSets                      Boolean?
      matchDurationMinutes          Int?
      setDurationMinutes            Int?
      setsPerMatch                  Int?
      restTimeMinutes               Int?
      pointsToVictory               Int[]                            @default([])
      officialSchedulingMode        EventsOfficialSchedulingModeEnum @default(SCHEDULE)
      doTeamsOfficiate              Boolean?
      teamOfficialsMaySwap          Boolean?
      officialPositions             Json?
      matchRulesOverride            Json?
      autoCreatePointMatchIncidents Boolean?                         @default(false)
      allowPaymentPlans             Boolean?
      installmentCount              Int?
      installmentDueDates           DateTime[]                       @default([])
      installmentDueRelativeDays    Int[]                            @default([])
      installmentAmounts            Int[]                            @default([])
      allowTeamSplitDefault         Boolean?
      splitLeaguePlayoffDivisions   Boolean?                         @default(false)
      requiredTemplateIds           String[]                         @default([])
      divisions                     String[]                         @default([])
      divisionDetails               Json?
      playoffDivisionDetails        Json?
      divisionResourceIds           Json?
      leagueScoringConfigId         String?

      @@index([ownerUserId])
      @@index([organizationId])
      @@index([sourceEventId])
      @@index([sportId])
      @@index([archivedAt])
    }

Do not include live state on `EventTemplates`: no event lifecycle `state`, no `userIds`, no `teamIds`, no `waitListIds`, no `freeAgentIds`, no `timeSlotIds`, no `fieldIds`, no `matches`, no standings, no rental booking ids, and no live event timestamps copied from the source event.

The `EventTemplateResources` table stores template-local resources. These records are not live `Fields` records and do not reserve anything.

    model EventTemplateResources {
      id                   String    @id
      createdAt            DateTime? @default(now())
      updatedAt            DateTime? @updatedAt
      templateId           String
      sourceResourceId     String?
      name                 String?
      resourceType         String?
      location             String?
      organizationId       String?
      facilityId           String?
      facilityName         String?
      lat                  Float?
      long                 Float?
      heading              Float?
      sortOrder            Int       @default(0)

      @@index([templateId])
      @@index([sourceResourceId])
      @@index([organizationId])
      @@index([facilityId])
    }

The `EventTemplateTimeSlots` table stores schedule patterns. It does not store real `startDate` or `endDate`. It stores offsets and lists of template resource ids and rental resource hint ids.

    model EventTemplateTimeSlots {
      id                              String    @id
      createdAt                       DateTime? @default(now())
      updatedAt                       DateTime? @updatedAt
      templateId                      String
      sourceTimeSlotId                String?
      dayOffsetFromEventStart         Int       @default(0)
      startOffsetMinutesFromEventStart Int      @default(0)
      endOffsetMinutesFromEventStart   Int      @default(0)
      startTimeMinutes                Int?
      endTimeMinutes                  Int?
      daysOfWeek                      Int[]     @default([])
      divisions                       String[]  @default([])
      templateResourceIds             String[]  @default([])
      rentalResourceHintIds           String[]  @default([])
      requiredTemplateIds             String[]  @default([])
      hostRequiredTemplateIds         String[]  @default([])
      price                           Int?
      sortOrder                       Int       @default(0)

      @@index([templateId])
      @@index([sourceTimeSlotId])
    }

The `EventTemplateRentalResourceHints` table stores one or more rental resource prompts for a template slot. It should never store `rentalBookingId` or `rentalBookingItemId`.

    model EventTemplateRentalResourceHints {
      id                   String    @id
      createdAt            DateTime? @default(now())
      updatedAt            DateTime? @updatedAt
      templateId           String
      sourceResourceId     String?
      sourceOrganizationId String?
      name                 String?
      facilityName         String?
      location             String?
      resourceType         String?
      notes                String?

      @@index([templateId])
      @@index([sourceResourceId])
      @@index([sourceOrganizationId])
    }

The `EventTemplateLeagueScoringConfigs` table mirrors `LeagueScoringConfigs` but is owned by a template.

    model EventTemplateLeagueScoringConfigs {
      id                    String    @id
      createdAt             DateTime? @default(now())
      updatedAt             DateTime? @updatedAt
      eventTemplateId       String
      pointsForWin          Int?
      pointsForDraw         Int?
      pointsForLoss         Int?
      pointsPerSetWin       Float?
      pointsPerSetLoss      Float?
      pointsPerGameWin      Float?
      pointsPerGameLoss     Float?
      pointsPerGoalScored   Float?
      pointsPerGoalConceded Float?

      @@unique([eventTemplateId])
      @@index([eventTemplateId])
    }

After adding these models, regenerate Prisma client and keep `prisma/schema.generated.prisma` in sync if this repository still tracks it.

## Plan of Work

Milestone 1 adds the data model in `mvp-site`. Edit `prisma/schema.prisma` to add the five template models. Create a Prisma migration with a descriptive name such as `add_event_template_records`. Regenerate Prisma. Add a small schema-level test or repository test fixture proving the generated client exposes the new delegates. No UI should change in this milestone.

Milestone 2 adds backend normalization and conversion services in `mvp-site`. Create a server module such as `src/server/eventTemplates.ts`. It must export functions with stable names:

    createEventTemplateFromEvent(params)
    listEventTemplates(params)
    getEventTemplateDetail(params)
    instantiateEventTemplate(params)
    archiveEventTemplate(params)

`createEventTemplateFromEvent` loads the source event with its resources, time slots, league scoring config, divisions, staff config, and rental-backed slots. It writes one `EventTemplates` row, zero or more `EventTemplateResources`, zero or more `EventTemplateTimeSlots`, zero or more `EventTemplateRentalResourceHints`, and optionally one `EventTemplateLeagueScoringConfigs` row. It must clear live participant state, team state, placeholder teams, matches, waitlists, free agents, field ids, time slot ids, rental booking ids, and live lifecycle state.

`instantiateEventTemplate` takes a template id, a target event id, a target start date/time, and a host id. It creates a real `Events` row, creates real `Fields` rows for template resources when appropriate, creates real `TimeSlots` rows by applying offsets to the target event start, creates or reuses a real `LeagueScoringConfigs` row from `EventTemplateLeagueScoringConfigs`, and returns rental prompts for `EventTemplateRentalResourceHints`. It must not schedule/build matches until the existing event scheduling flow explicitly does so.

Milestone 3 adds HTTP APIs in `mvp-site`. Add routes under `src/app/api/event-templates`. Implement:

    GET /api/event-templates
    POST /api/event-templates
    GET /api/event-templates/[templateId]
    POST /api/event-templates/[templateId]/instantiate
    DELETE /api/event-templates/[templateId]

`GET /api/event-templates` accepts either personal scope or `organizationId`. Personal templates require an authenticated user and return rows where `ownerUserId` is the session user and `organizationId` is null. Organization templates require the existing organization template/manage permission and return rows where `organizationId` matches. `POST /api/event-templates` creates from `sourceEventId`; for organization events it creates an organization-scoped template and requires organization template/manage permission. `DELETE` should archive by setting `archivedAt`, not hard-delete.

Milestone 4 updates `mvp-site` web UI. Replace calls to legacy `cloneEventAsTemplate` and `seedEventFromTemplate` where they are used for user-facing create/save flows. The event detail or schedule page Create Template action should call `POST /api/event-templates`. The create-from-template UI should list templates from `GET /api/event-templates`, then call `POST /api/event-templates/[templateId]/instantiate`. After instantiation, show a dismissible top-of-page message for any returned rental resource hints, with links or actions that take the user to the rental creation flow for those resources. Keep any old `Events.state = TEMPLATE` UI hidden except for migration fallback.

Milestone 5 adds legacy migration/backfill in `mvp-site`. Add a script under `scripts/` such as `scripts/backfill-event-template-records.ts`. It should find `Events` rows with `state = TEMPLATE`, convert each into an `EventTemplates` record using the same server conversion function, and mark or record the legacy source id. The script must be idempotent: running it twice must not create duplicate templates. The first implementation may leave legacy template event rows in place but hidden; a later cleanup can archive or delete them after manual verification.

Milestone 6 updates `mvp-app` shared model and network layers. Add Kotlin data classes for:

    EventTemplate
    EventTemplateResource
    EventTemplateTimeSlot
    EventTemplateRentalResourceHint
    EventTemplateLeagueScoringConfig

Add DTOs matching the new API response shapes. Add repository methods on the event repository interface and implementation:

    getEventTemplatesFlow(scope)
    createEventTemplateFromEvent(sourceEventId)
    getEventTemplateDetail(templateId)
    instantiateEventTemplate(templateId, targetStart)
    archiveEventTemplate(templateId)

Personal template creation on mobile should call `POST /api/event-templates`. Organization template creation on mobile remains hidden/blocked until explicitly designed, but mobile should be able to list or use organization templates later if a screen calls for it.

Milestone 7 updates `mvp-app` UI. The Profile Event Templates screen should list `EventTemplate` records, not `Event` records with `state = TEMPLATE`. The event detail Create Template action should use the new repository method for personal events. Create-from-template should call the instantiate endpoint and then open the returned real event. If the response includes rental hints, show a dismissible message/prompt that links to the rental creation surface. Remove or retire the mobile `EventTemplateCreateBuilder` event-as-template path after the new API path is verified.

Milestone 8 removes primary dependence on legacy `Events.state = TEMPLATE`. The backend should stop creating new template events. Web and mobile should stop listing template events from `/api/events?state=TEMPLATE` as the primary source. Keep read-only fallback only if needed for old data during the migration window. Document when the fallback can be removed.

## Concrete Steps

Work in `/Users/elesesy/StudioProjects/mvp-site` for backend and web changes.

Start with a clean understanding of local status:

    git status --short

Add Prisma models and generate a migration:

    npx prisma migrate dev --name add_event_template_records
    npx prisma generate

If the project updates `schema.generated.prisma`, run the existing generation script or command used in the repo and include that generated file.

Run backend validation after the schema milestone:

    npm test -- --runInBand
    npx tsc --noEmit

After API routes are added, add focused tests for the new route handlers and services. Run focused tests first, then full project checks:

    npm test -- --runInBand src/server/__tests__/eventTemplates.test.ts
    npm test -- --runInBand src/app/api/event-templates/__tests__/route.test.ts
    npx tsc --noEmit

Work in `/Users/elesesy/StudioProjects/mvp-app` for mobile changes.

After adding models and DTOs, run focused Android unit tests:

    ./gradlew :composeApp:testDebugUnitTest --tests 'com.razumly.mvp.core.data.repositories.EventRepositoryHttpTest' --console=plain

After UI changes, run focused profile and event detail tests if present, then compile:

    ./gradlew :composeApp:testDebugUnitTest --console=plain
    ./gradlew :composeApp:compileDebugKotlinAndroid --console=plain

For emulator verification, use the Android SDK adb path if `adb` is not on PATH:

    /Users/elesesy/Library/Android/sdk/platform-tools/adb devices
    ANDROID_HOME=/Users/elesesy/Library/Android/sdk ANDROID_SDK_ROOT=/Users/elesesy/Library/Android/sdk ./gradlew :composeApp:installDebug --console=plain

## Validation and Acceptance

Backend acceptance:

Creating a template from a source event with staff, manual payments, online payments, payment plans, match rules, league scoring config, resources, and rental-backed slots creates:

- one `EventTemplates` row with typed reusable event fields populated;
- one `EventTemplateLeagueScoringConfigs` row for a league template;
- `EventTemplateResources` rows for owned/internal resources;
- `EventTemplateTimeSlots` rows with offsets and no real date columns;
- one or more `EventTemplateRentalResourceHints` rows for each rental-backed slot;
- no participant ids, team ids, waitlist ids, free agent ids, matches, live field ids, live time slot ids, rental booking ids, or rental booking item ids.

Instantiation acceptance:

Instantiating the template for a new start date creates a real event whose event-level settings match the template, whose resources/time slots are new live records, whose time slot dates are computed from offsets, and whose rental hints are returned as prompts rather than bookings. The new event must not have participants, teams, placeholders, matches, waitlist entries, or free agents copied from the source.

Web acceptance:

On local web, create or find a complex event, use Create Template, then create a new event from that template. The new event should show the expected reusable config, resources, shifted slots, scoring config, staff config, and rental prompt. It should not show copied teams, placeholders, participants, free agents, waitlists, or matches.

Mobile acceptance:

On Android, personal event Create Template calls the new endpoint and the Profile Event Templates screen lists `EventTemplate` records. Organization-owned event template creation remains unavailable on mobile. Creating an event from a template opens the new live event and shows a rental prompt if rental hints exist.

Regression acceptance:

Legacy `Events.state = TEMPLATE` rows do not appear in public discovery or normal event listings. New code does not create additional `Events.state = TEMPLATE` rows. Backfill is idempotent.

## Idempotence and Recovery

The migration should be additive. Adding new tables does not mutate existing live events. If API or UI work needs to be rolled back, the tables can remain unused.

The backfill script must be idempotent by checking whether an `EventTemplates` row already exists for `sourceEventId` before creating one. If a backfill run fails partway, rerun it after fixing the error; it should continue from remaining legacy rows.

Archiving templates must set `archivedAt` and leave child records intact. Hard deletes should not be part of the first implementation.

If mobile is released before all web migration work is done, keep compatibility by allowing the mobile repository to read new templates while keeping the old event-template list path hidden or fallback-only. Do not re-enable mobile organization template creation until the new org template UX is explicitly implemented.

## Artifacts and Notes

Current legacy template plan:

    plans/event-templates-execplan.md

Current legacy helper:

    src/lib/eventTemplates.ts

Current live event schema areas that the new typed template model mirrors:

    prisma/schema.prisma model Events
    prisma/schema.prisma model Fields
    prisma/schema.prisma model TimeSlots
    prisma/schema.prisma model LeagueScoringConfigs

Current mobile legacy event-template areas:

    mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventTemplateCreateBuilder.kt
    mvp-app/core/repository-impl/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/EventRepository.kt
    mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/profile/ProfileComponent.kt
    mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/profile/ProfileFeatureScreens.kt

## Interfaces and Dependencies

In `mvp-site`, define server-facing TypeScript interfaces that make conversion explicit. Names may change if the local style suggests better names, but the concepts must remain.

    type EventTemplateScope =
      | { ownerUserId: string; organizationId?: null }
      | { organizationId: string };

    type CreateEventTemplateFromEventInput = {
      sourceEventId: string;
      createdByUserId: string;
      scope: EventTemplateScope;
    };

    type InstantiateEventTemplateInput = {
      templateId: string;
      newEventId: string;
      hostId: string;
      start: Date;
      timeZone?: string;
    };

    type InstantiateEventTemplateResult = {
      event: Event;
      rentalResourceHints: Array<{
        id: string;
        templateTimeSlotId: string;
        name?: string;
        facilityName?: string;
        location?: string;
        resourceType?: string;
      }>;
    };

In `mvp-app`, define Kotlin models that do not pretend templates are events:

    data class EventTemplate(...)
    data class EventTemplateResource(...)
    data class EventTemplateTimeSlot(...)
    data class EventTemplateRentalResourceHint(...)
    data class EventTemplateLeagueScoringConfig(...)

The mobile repository should return these types from template APIs. It should only return `Event` from the instantiate call after the backend has created a real live event.

## Change Log

- 2026-06-29T17:11Z: Initial ExecPlan created to replace legacy `Events.state = TEMPLATE` templates with typed dedicated template records across `mvp-site` and `mvp-app`.
- 2026-06-29T19:04Z: Manual validation found and fixed hydrated-template gaps for manual payments, division payment settings, rental-backed time slots, local template resources, and Next async route params. Headed Chromium e2e now passes `e2e/event-template-parameters.spec.ts`, including no `$id` create payloads, no copied teams/matches, rental resource hints, shifted slot offsets, and event creation from the dedicated template.
- 2026-06-29T19:04Z: Android debug app installed and launched on `emulator-5554`; focused mobile regression tests passed for template endpoint usage and disabled mobile org-event template creation.
