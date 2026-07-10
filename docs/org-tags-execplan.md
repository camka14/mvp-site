# Add Organization Tags and Discovery Filters

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan follows `PLANS.md` in the repository root. It is self-contained so a new contributor can continue from this file alone.

## Purpose / Big Picture

Organization tags let BracketIQ classify organizations by the roles they play, such as club, facility, and event manager. After this change, a user creating or editing an organization can assign multiple tags, and Discover can filter organizations by curated tags without turning every community-created tag into a global filter option. The matching mobile app will request the same curated tag filters and pass tag slugs to organization search.

In this plan, a "curated" or "system" tag means a tag seeded and approved by BracketIQ for filtering. A "community" tag means a tag created by users while editing an organization; it is saved and displayed on the organization but is not automatically listed as a Discover filter facet.

## Progress

- [x] (2026-07-09T04:38:12Z) Read `PLANS.md`, the current event-tag server helper, the organization create/update API routes, web organization creation modal, and mobile organization search repository paths.
- [x] (2026-07-09T13:00:00Z) Add organization tag database tables, seed curated tags, and server helpers.
- [x] (2026-07-09T13:20:00Z) Wire organization create/edit/detail/list API responses to sync and return tags.
- [x] (2026-07-09T13:45:00Z) Add web organization tag selection to create/edit and curated tag filters to Discover organizations.
- [x] (2026-07-09T14:20:00Z) Add mobile curated organization tag loading and organization search filter propagation.
- [x] (2026-07-09T14:50:00Z) Add focused tests and run validation commands in both repositories.

## Surprises & Discoveries

- Observation: The web organization API already has fallback code for stale generated Prisma clients, so tag writes should use focused helper functions and `(prisma as any)` where needed until the generated client is refreshed.
  Evidence: `src/app/api/organizations/route.ts` and `src/app/api/organizations/[id]/route.ts` catch unknown Prisma arguments for organization fields.

- Observation: Mobile focused Android unit tests compile all common tests before filtering to `BillingRepositoryHttpTest`, so unrelated dirty event-detail and match test surfaces can block the targeted repository test.
  Evidence: `MAPS_API_KEY=test ./gradlew :composeApp:testDebugUnitTest --tests 'com.razumly.mvp.core.data.repositories.BillingRepositoryHttpTest'` failed in `processDebugUnitTestManifest` for `<MAPS_API_KEY>` and in common tests referencing `CreateEvent_FakeMatchRepository`, fee-breakdown APIs, and `NoopMatchRepository`.

## Decision Log

- Decision: Model organization tags separately from event tags, with `OrganizationTags` and `OrganizationTagAssignments`, rather than reusing `EventTags`.
  Rationale: Event and organization facets have different curated vocabularies and different assignment targets. Separate tables avoid mixing event-only concepts like `pickup-game` with organization classifications like `facility`.
  Date/Author: 2026-07-09 / Codex.

- Decision: Use an `isSystem` boolean on organization tags and expose `filterOnly=true` on `/api/organization-tags`.
  Rationale: This mirrors the corrected event-tag behavior: create/edit can use community tags, while Discover filter pickers show only curated tags.
  Date/Author: 2026-07-09 / Codex.

## Outcomes & Retrospective

Implemented organization tags end to end for web/backend and mobile Discover filtering. The web backend now has dedicated organization tag tables, duplicate-safe slug normalization/upsert behavior, curated/system filtering via `/api/organization-tags?filterOnly=true`, organization create/update tag sync, organization list/detail tag hydration, and system-tag-only organization search filters. The web UI now lets org creators/editors choose existing tags or add custom tags, and Discover organizations can filter by curated green tag chips.

Mobile Discover now loads curated organization tags through `BillingRepository.getOrganizationTags(filterOnly = true)`, keeps organization-tag filter state separately from event filters, and passes selected tag slugs to organization list/search calls. Android Kotlin compilation passes. Focused mobile unit tests for the new repository URL/DTO behavior were added but could not run to completion in this checkout because unrelated common test sources fail to compile and the Android unit-test manifest still reports a missing `MAPS_API_KEY` placeholder.

## Context and Orientation

The web app lives in `/Users/elesesy/StudioProjects/mvp-site`. Its Prisma schema is `prisma/schema.prisma`, route handlers live under `src/app/api`, and shared server helpers live under `src/server`. Organization creation and editing use `src/components/ui/CreateOrganizationModal.tsx`, which calls `src/lib/organizationService.ts`. Discover organization listing is in `src/app/discover/page.tsx` and calls `organizationService.listOrganizationsWithFieldsPage(...)`.

The mobile app lives in `/Users/elesesy/StudioProjects/mvp-app`. Organization data is modeled in `core/model/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/Organization.kt`. Organization listing/search HTTP calls are in `core/repository-impl/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/BillingRepository.kt`. The Discover screen state is in `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventSearch/EventSearchComponent.kt` and rendered by `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventSearch/EventSearchScreen.kt`.

The existing event tag implementation is the closest pattern. On web, `src/server/eventTags.ts` normalizes tag input, creates missing tags safely, assigns tags to events, and returns tag view objects. `/api/event-tags` supports `filterOnly=true` so Discover only sees curated event tags. On mobile, `EventRepository.getEventTags(filterOnly = true)` loads curated event filter options while create/edit calls the same endpoint without `filterOnly`.

## Plan of Work

First, add `OrganizationTags` and `OrganizationTagAssignments` to the Prisma schema plus a migration that seeds curated organization tags. The initial curated set will include `club`, `facility`, `event-manager`, `league-operator`, `tournament-host`, `training-provider`, and `rental-provider`. These are intentionally broad and can be renamed later without changing the assignment model.

Second, add `src/server/organizationTags.ts` mirroring the event tag helper. It will normalize names, slugify names, upsert by slug with a unique-constraint fallback, sync assignments for an organization, load tags for organization ids, and count listed organizations per curated tag.

Third, add `/api/organization-tags` with `filterOnly=true` support. The endpoint will return `{ tags: [...] }`, where each tag has `id`, `name`, `slug`, `isSystem`, and `organizationCount`.

Fourth, update `POST /api/organizations`, `PATCH /api/organizations/[id]`, `GET /api/organizations`, and `GET /api/organizations/[id]`. Create and update will accept a `tags` payload and call `syncOrganizationTags`. List/detail responses will include tags. List search will accept repeated or comma-separated `tags` query params and filter organizations by tag slugs. If tag slugs are supplied, the API will resolve only matching system tags for Discover-style filtering.

Fifth, update the web client. `Organization` and `organizationService` will understand `tags`. `CreateOrganizationModal` will load organization tags and allow custom tag creation. Discover organizations will load `/api/organization-tags?filterOnly=true`, provide a searchable tag filter, and send selected slugs to `listOrganizationsWithFieldsPage`.

Sixth, update mobile. Add `OrganizationTag` to the model, parse tag arrays from the API DTO, add `BillingRepository.getOrganizationTags(filterOnly: Boolean)`, extend organization listing/search calls to accept tag slugs, and add organization-tag filter state to Discover. The mobile Discover organization tab should use curated organization tags only, while organization create/edit support can be added later if there is no existing mobile organization creation form.

## Concrete Steps

Work in `/Users/elesesy/StudioProjects/mvp-site` for the web/backend changes and `/Users/elesesy/StudioProjects/mvp-app` for mobile changes. Use additive migrations and focused tests. Do not revert unrelated dirty files in either checkout.

Expected validation commands:

    cd /Users/elesesy/StudioProjects/mvp-site
    npm test -- --runTestsByPath src/server/__tests__/organizationTags.test.ts src/app/api/organizations/__tests__/organizationsRoute.test.ts src/app/api/organization-tags/__tests__/route.test.ts
    npx tsc --noEmit

    cd /Users/elesesy/StudioProjects/mvp-app
    ./gradlew :composeApp:compileDebugKotlinAndroid

## Validation and Acceptance

Acceptance on web is observable when `/api/organization-tags?filterOnly=true` returns only curated organization tags, organization create/edit accepts custom tags, `/api/organizations?tags=facility` returns only organizations tagged with the curated facility tag, and Discover organizations can filter by selected curated tag chips. A focused Jest test must prove that the organization list route resolves tag slugs through system tags.

Acceptance on mobile is observable when the Discover organization tab requests curated organization tags, selecting a tag updates the organization list request with `tags=<slug>`, and Kotlin compilation succeeds.

## Idempotence and Recovery

The migration is additive. Re-running the seed `INSERT ... ON CONFLICT` statements is safe. Tag sync deletes and recreates assignments for a single organization, so retrying a create or update after a failed tag sync should converge to the same assignment set. If generated Prisma types lag the schema, use `(prisma as any)` in route/helper code until regeneration catches up.

## Artifacts and Notes

Validation completed:

    cd /Users/elesesy/StudioProjects/mvp-site
    npm test -- --runTestsByPath src/server/__tests__/eventTags.test.ts src/app/api/event-tags/__tests__/route.test.ts src/server/__tests__/organizationTags.test.ts src/app/api/organization-tags/__tests__/route.test.ts src/app/api/organizations/__tests__/organizationsRoute.test.ts
    npx tsc --noEmit
    git diff --check

    cd /Users/elesesy/StudioProjects/mvp-app
    ./gradlew :composeApp:compileDebugKotlinAndroid
    git diff --check

Attempted but blocked:

    cd /Users/elesesy/StudioProjects/mvp-app
    MAPS_API_KEY=test ./gradlew :composeApp:testDebugUnitTest --tests 'com.razumly.mvp.core.data.repositories.BillingRepositoryHttpTest'

The attempted test command failed before executing the focused billing tests because common test compilation is already broken by unrelated event-detail/match test sources and the unit-test manifest did not receive a value for `<MAPS_API_KEY>`.

## Interfaces and Dependencies

On web, define `OrganizationTagView` in `src/server/organizationTags.ts` with `id`, `name`, `slug`, optional `isSystem`, and optional `organizationCount`. Define `syncOrganizationTags(organizationId, tags, client)` and `getOrganizationTagsForOrganizationIds(organizationIds, client)`.

On mobile, define a serializable organization tag data class compatible with API rows. Extend billing repository organization list/search methods to accept `tagSlugs: Set<String> = emptySet()` or a similar immutable collection.

Revision note 2026-07-09: Created the plan after reading the event-tag and organization create/search paths so implementation can proceed from concrete repository context.
