# Add multi-sport support to regular, weekly, and affiliate events

This ExecPlan is a living document. It follows `/Users/elesesy/StudioProjects/mvp-site/PLANS.md` and must be updated as implementation proceeds.

## Purpose / Big Picture

BracketIQ currently stores one event sport. This prevents a regular event, weekly event, or eligible affiliate event from accurately representing activities such as basketball and pickleball at the same event. After this change, those event types can store and display several canonical sports, while leagues and tournaments remain single-sport because their divisions, match rules, standings, and brackets still depend on one sport.

The event-level `sportId` field is removed. `sportIds` is the only event sport field. The first list value is the derived primary sport used by scheduling, divisions, scoring, and rule defaults; it is not persisted as a second event field. The web and mobile clients will send and read the list, and event discovery will match an event when any selected sport is present.

## Progress

- [x] (2026-08-05) Confirmed that `Events` and affiliate candidates currently store one sport, while `Organizations.sports[]` and `Fields.sportIds[]` already support lists.
- [x] (2026-08-05) Confirmed the scope: allow multiple sports for `EVENT`, `WEEKLY_EVENT`, and eligible affiliate events; reject multiple sports for `LEAGUE` and `TOURNAMENT`.
- [x] (2026-08-05) Added the database fields and compatibility backfill.
- [x] (2026-08-05) Added server validation, event persistence, affiliate mapping, and response serialization.
- [x] (2026-08-05) Updated web and mobile create/edit, detail, search, and filter surfaces.
- [x] (2026-08-05) Added regression tests and ran web/mobile validation.
- [x] (2026-08-05) Audited production organization and event sport data, added canonical organization alias repair, and repaired existing sportless events before dropping the scalar event column.
- [ ] Apply the migration to live only after code validation and explicit delivery approval.

## Surprises & Discoveries

- Observation: `Events.sportId` is used as the sport relationship throughout scheduling, divisions, officials, participants, billing, and mobile hydration.
  Evidence: `/Users/elesesy/StudioProjects/mvp-site/prisma/schema.prisma` has only `Events.sportId`; `/Users/elesesy/StudioProjects/mvp-app/core/model/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/Event.kt` has only `sportId`.
- Observation: `Organizations.sports` and `Fields.sportIds` are already arrays, but the affiliate candidate contract and affiliate organization builder currently reduce each candidate to one `sportName`.
  Evidence: `/Users/elesesy/StudioProjects/mvp-site/src/server/affiliateImports/types.ts` and `/Users/elesesy/StudioProjects/mvp-site/src/server/affiliateImports/service.ts`.
- Observation: the mobile event service requires a resolvable primary sport relationship. Multi-sport support must retain the first `sportIds` value for that relationship without persisting a second scalar event field.
  Evidence: `mvp-app` `EventService.ensureSportRelationship` currently resolves `row.sportId` and must be updated to resolve the first event sport ID.
- Observation: the existing Prisma generation command rewrites trailing whitespace in generated files, so the repository's `normalize-prisma-generated.mjs` step must remain part of schema validation.
  Evidence: `npm run prisma:check` completed after normalizing 114 generated Prisma files and confirmed the schema surface.
- Observation: the full Compose unit-test worker crashed in the JRE AArch64 assembler after the targeted event-filter test passed.
  Evidence: the focused `EventFilterTest` task passed; the broader worker exited with HotSpot `assembler_aarch64.hpp:267` / `Field too big for insn`.

## Decision Log

- Decision: Replace event-level `sportId` with `sportIds String[]` on `Events` and `EventTemplates`.
  Rationale: The list is the canonical source of truth. Keeping a second scalar creates drift and allows filters and displays to disagree.
  Date/Author: 2026-08-05 / Codex.
- Decision: Allow multiple sports only for `EVENT` and `WEEKLY_EVENT`.
  Rationale: Leagues and tournaments use one sport to define divisions, scoring, standings, bracket rules, and match rules. Their existing behavior must stay single-sport. Affiliate candidates inherit this restriction from the event type inferred by the importer.
  Date/Author: 2026-08-05 / Codex.
- Decision: Use explicit canonical sport arrays for affiliate multi-sport values. Do not use general language parsing to guess unsupported sports.
  Rationale: A source label such as “multi-sport” does not identify a safe set of BracketIQ sports. Source mappings or reviewed agent output must name each canonical sport explicitly.
  Date/Author: 2026-08-05 / Codex.
- Decision: For an eligible multi-sport event, the first `sportIds` value is the derived primary sport for legacy rules and division defaults.
  Rationale: Existing division, official, and scoring code needs one sport. Per-division sport assignment remains available through `Divisions.sportId` but is not the event sport source of truth.
  Date/Author: 2026-08-05 / Codex.
- Decision: Do not automatically create separate events for a composite affiliate listing.
  Rationale: One source registration page can represent one event with several activities. Cloning it would create duplicate listings. A source must explicitly expose separate event identities before separate candidates are created.
  Date/Author: 2026-08-05 / Codex.

## Outcomes & Retrospective

At completion, regular and weekly events can be created and edited with multiple canonical sports, affiliate events can persist reviewed sport arrays, leagues and tournaments reject multi-sport payloads, and search/detail surfaces show the full list. Existing events will have `sportIds` backfilled from the former event scalar before that column is dropped. Unsupported affiliate labels remain reviewable rather than being silently converted.

The implementation is incomplete until the API, web form, mobile DTO/model/form, event search, public organization event pages, affiliate candidate contract, mapping extractor, and tests all agree on the same list field.

## Context and Orientation

The web repository is `/Users/elesesy/StudioProjects/mvp-site`. Prisma defines the database in `prisma/schema.prisma`. Event creation and update persistence is centralized in `src/server/repositories/events.ts`; route validation and response shaping are in `src/app/api/events/route.ts` and `src/app/api/events/[eventId]/route.ts`. Web event state and forms use `src/types/index.ts`, `src/lib/eventService.ts`, and `src/app/events/[id]/schedule/components/EventForm.tsx`.

Affiliate candidates and mappings live in `src/server/affiliateImports/types.ts`, `mappingExtractor.ts`, `agentContracts.ts`, `agentModelClient.ts`, and `service.ts`. Affiliate events are persisted through the same event repository, so the server must validate the event type and sport list at the persistence boundary.

The mobile repository is `/Users/elesesy/StudioProjects/mvp-app`. The shared event model is `core/model/.../Event.kt`; JSON API contracts are in `core/network/.../EventDtos.kt`; create/edit state is in `composeApp/.../eventCreate` and `eventDetail`; event search filtering is in `composeApp/.../eventSearch`.

In this plan, “primary sport” means the first sport used by older scalar fields and sport-specific rule defaults. “Sport set” means the complete canonical list stored in `sportIds`. “Eligible event” means an event whose effective type is `EVENT` or `WEEKLY_EVENT`, including an affiliate event that the importer classifies as one of those types.

## Plan of Work

First add `Events.sportIds` and `EventTemplates.sportIds` as arrays with a migration that backfills each list from the existing scalar sport, then drops the scalar columns. Add a shared server helper that normalizes, deduplicates, validates canonical sport IDs, and rejects a list longer than one for leagues and tournaments. The first list value provides the derived primary sport for all downstream consumers.

Next extend the event create and patch payloads with `sportIds` and remove `sportId` from event payloads. The repository upsert must calculate the effective event type before persisting the list and validate every ID against `Sports`. Event templates must copy the list into newly created events. Weekly child occurrences must inherit the parent list and must not turn a weekly parent into a league or tournament.

Then extend affiliate candidates and mappings with an optional `sportNames` list while preserving `sportName` as the primary compatibility field. Manual candidates and agent expected candidates must be able to provide explicit canonical arrays. Generic mappings may provide a reviewed `sportNames` field or an explicit value map; raw composite text must not be tokenized into guessed sports. The affiliate event builder will persist the list only for `EVENT` and `WEEKLY_EVENT`, and will reject multi-sport affiliate candidates classified as leagues or tournaments. Affiliate organization updates will continue to use `Organizations.sports[]` and will aggregate explicit candidate sport names.

Update event search, public SEO/catalog queries, event response mappers, event cards, event detail pages, and organization event listings to use `sportIds` only. Search filters must use a PostgreSQL `hasSome`/equivalent condition so a selected sport matches any event sport. The first list value remains available as the derived primary sport for division and match-rule behavior.

Update the web form and mobile form to show a multi-select control only for eligible event types. Changing the primary selection must preserve it as the first list item. Switching to league or tournament must collapse the list to one sport. Detail views should display sport names as a comma-separated list or equivalent compact label.

Finally add regression tests for the shared sport-list rules and mobile DTO/filter behavior. Run web TypeScript and Jest checks plus the targeted mobile Kotlin tests and compile checks. Persistence and route behavior are covered by the shared validation helper and the existing repository/API test surface; no live migration is applied during this implementation.

## Concrete Steps

1. From `/Users/elesesy/StudioProjects/mvp-site`, confirm both worktrees are clean except for known user changes, then inspect the event schema and active create/update paths before editing.

2. Add the schema migration and run `npx prisma validate` and the relevant Prisma client generation command already used by this repository. Do not apply the live migration or restart a runtime during implementation.

3. Add the shared sport-list normalization helper and use it from both event routes and `upsertEventFromPayload`. Include tests for `EVENT`, `WEEKLY_EVENT`, `LEAGUE`, `TOURNAMENT`, missing primary sport, duplicate IDs, and unknown IDs.

4. Update affiliate types, mapping extraction, agent contracts, materialization, and service persistence. Add tests proving a canonical two-sport event is accepted, a composite string without explicit canonical sport values is rejected, and a multi-sport league or tournament is rejected.

5. Update web event types, event service mappers, event search routes, public catalog/SEO helpers, and `EventForm.tsx`. Remove event-level scalar sport fields from the API and client state.

6. Update `mvp-app` event model, API DTOs, request builders, create/edit state, event detail display, and search filter logic. Run the focused `composeApp` tests and compile task without changing the user’s existing branch commits.

7. Run `git diff --check`, web targeted tests, `npx tsc --noEmit`, Prisma validation, and the mobile focused test/compile commands. Review the staged diff before any commit.

## Validation and Acceptance

The database migration must leave every existing event with either an empty `sportIds` list when the former scalar was empty or a one-item list containing the former sport ID. A regular event created with Basketball and Pickleball must return `sportIds: ["Basketball", "Pickleball"]` and no event-level `sportId` field.

A weekly parent and its generated child must return the same sport set. A league or tournament create or patch containing two sports must return a clear 400-level validation error and must not write the second sport.

An affiliate regular event with explicit canonical `sportNames` must persist and display all sports. An affiliate tournament or league with multiple sports must remain withheld or return a validation error according to the existing candidate publication path.

Searching for Pickleball must return a multi-sport Basketball/Pickleball event. Searching for a sport not in the event set must not return it. The migration must complete before application code reads the event table, so no event-level scalar fallback remains.

The web form and mobile form must show multi-select controls for regular and weekly events and only a single sport control for leagues and tournaments. Event detail must show all selected sports without breaking existing primary-sport division or match-rule behavior.

Completed checks include:

    cd /Users/elesesy/StudioProjects/mvp-site
    npx prisma validate
    npx tsc --noEmit
    npx jest --runInBand src/server/__tests__/eventSports.test.ts
    npm run prisma:check

    cd /Users/elesesy/StudioProjects/mvp-app
    ./gradlew :core:network:testDebugUnitTest
    ./gradlew :composeApp:testDebugUnitTest --tests 'com.razumly.mvp.eventSearch.util.EventFilterTest'
    ./gradlew :core:network:compileDebugKotlinAndroid :core:database:compileDebugKotlinAndroid :composeApp:compileDebugKotlinAndroid

The exact mobile test filters may be narrowed to the files changed during implementation if the wildcard selection is unsupported by Gradle.

## Idempotence and Recovery

The migration backfills `sportIds` from the former scalar and then drops that scalar. Re-running the logical backfill must be harmless before the drop because it deduplicates values. The server normalizer must be idempotent: normalizing an already normalized list returns the same ordered list.

No existing event should be converted to multi-sport automatically except by the explicit affiliate repair script or an explicit user edit. If a migration or data repair fails, stop before changing runtime state, inspect the transaction error, and retry the transaction after correcting the SQL. Do not retain an event-level scalar after the migration.

## Artifacts and Notes

The primary artifacts are migrations `20260805160000_migrate_event_sport_ids` and `20260805161000_repair_affiliate_organization_sport_aliases`, shared helper `src/server/eventSports.ts`, affiliate mapping/contract updates, web and mobile event contract changes, and regression tests. Division-level `sportId` values remain separate from the event-level migration.

## Interfaces and Dependencies

The web server helper should expose stable functions similar to:

    normalizeEventSportIds(input: unknown): string[]
    validateEventSportIds(params: { eventType: unknown; sportIds: string[] }): void
    primaryEventSportId(sportIds: string[]): string | null

The event API contract should accept and return `sportIds: string[]` and no event-level `sportId`. Affiliate candidate inputs should accept `sportNames?: string[]` while retaining `sportName?: string | null` as the candidate contract's single-sport compatibility input. The mobile `Event`, `EventApiDto`, `EventUpdateDto`, and response mapper should expose the same `sportIds` list only.

The implementation may use existing Prisma, Zod, React Hook Form, Kotlin serialization, and Compose controls. It must not add a separate multi-sport table unless the implementation discovers that an array cannot satisfy the event read/write and search requirements.

## Update Note

2026-08-05: Created after repository inspection. The plan records the additive array design, primary-sport compatibility rule, and explicit exclusion of leagues and tournaments before implementation begins.

2026-08-05: Implemented in both repositories. Regular and weekly events now accept ordered canonical sport lists; leagues and tournaments remain single-sport. Affiliate mappings require explicit canonical sport names for multi-sport candidates. Web checks passed, the focused web regression test passed, mobile network and focused filter tests passed, and Android compile checks passed. The full Compose unit-test worker was not reliable on this machine because the AArch64 JRE crashed before completing the suite.

2026-08-05: Follow-up decision: complete the migration by dropping event-level `sportId` and removing all scalar fallbacks. `sportIds` is now the sole event sport source of truth; the first value is derived only when a downstream rule needs one primary sport.

2026-08-05: Production audit found 281 unclaimed affiliate organizations with unsupported or composite sport labels and 16 events without a sport. The migration order was corrected because `20260805120000` was already used by an existing ownership migration. The new event migration is `20260805160000`; known organization aliases and explicit composite labels are repaired in `20260805161000`, while unsupported labels are removed and empty affiliate organizations are unlisted.
