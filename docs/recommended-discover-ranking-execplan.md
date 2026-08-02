# Make Recommended the shared Discover event order

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Maintain this document in accordance with `PLANS.md` in the `mvp-site` repository root.

## Purpose / Big Picture

Discover currently lets one organization fill most of an event page. The web also sorts only the events that it has already loaded, so its sort selector does not define a stable order across pages. After this change, the shared event-search API will provide a deterministic `RECOMMENDED` order before pagination. It will favor nearby events, BracketIQ-powered events, and claimed organizations. It will also reduce repeated exposure from the same organization and event title when alternatives exist. The web and mobile Discover lists will use this order by default.

## Progress

- [x] (2026-08-02 18:01Z) Inspected both repository states, the shared search route, web sorting, mobile search requests, and organization ownership fields.
- [x] (2026-08-02 18:08Z) Added the tested server ranking module and the `sort` request contract.
- [x] (2026-08-02 18:14Z) Made the web Discover selector default to Recommended and reload server-backed Recommended, Nearest, and Soonest orders.
- [x] (2026-08-02 18:20Z) Made mobile Discover default to Recommended, preserve server order, and expose Recommended, Nearest, and Soonest in the event filter.
- [x] (2026-08-02 18:23Z) Passed focused server and web tests, TypeScript, focused mobile repository and state tests, the mobile sort UI test, and Android compilation.
- [x] (2026-08-02 18:24Z) Reviewed both repository diffs and passed `git diff --check` in both repositories.
- [x] (2026-08-02 19:02Z) Verified the web Discover flow in Playwright, including the default Recommended request, Nearest switching, Tennis query state, and Tennis map request.
- [x] (2026-08-02 19:07Z) Installed and tested the Android build on `emulator-5554`; Recommended was selected by default, Nearest applied, the feed refreshed, and the crash buffer remained empty.
- [x] (2026-08-02 19:22Z) Found and fixed missing native Swift sort controls, passed the focused bridge test, and built and launched the corrected iOS app on the booted iPhone 15 Pro simulator.

## Surprises & Discoveries

- Observation: The web sort selector sorts only the current in-memory page in `src/app/discover/components/EventsTabContent.tsx`.
  Evidence: `sortedEvents` copies the loaded `events` prop and applies each comparator in the browser.

- Observation: Mobile currently re-sorts distance-filtered event pages after the API response.
  Evidence: `EventCatalogCoordinator.getEventsInBoundsPage` calls `events.sortedBy` when `includeDistanceFilter` is true.

- Observation: The search route already loads the fields needed to classify claimed organizations for response enrichment.
  Evidence: `loadEventOrganizationsById` selects `originType`, `ownershipStatus`, `claimVerificationLevel`, `claimedAt`, and `ownershipVerifiedAt`.

- Observation: The old non-location candidate query stopped at 500 rows, which could make a server-ranked page incomplete after offset 500.
  Evidence: `candidateTake` used `Math.min(..., 500)`. Recommended now loads the full filtered candidate set before ranking and pagination.

- Observation: The mobile filter had no sort state or selector.
  Evidence: `EventFilter` contained price, date, sport, tag, and division fields only. It now defaults `sort` to `RECOMMENDED`, and the event filter sheet shows three sort chips.

- Observation: A focused lint run that included the two existing organization page files reported one pre-existing effect-state error and two hook warnings outside the changed call arguments.
  Evidence: ESLint reported `OrganizationPublicSettingsPanel.tsx:357` and `page.tsx:929,948`. The core API, service, Discover, map, and ranking files passed a separate focused ESLint run.

- Observation: The first iOS simulator run exposed a native-presentation parity gap that Android compilation and common UI tests did not detect.
  Evidence: `NativeDiscoverFilterSnapshot`, `applyNativeEventFilters`, and `NativeDiscoverFilterSheet` did not carry or render the sort value. The bridge now exposes the sort string, validates it in Kotlin, and renders the three choices in SwiftUI.

- Observation: The project wrapper development server still fails when `.next/dev/required-server-files.json` is absent, but the standard Next.js development server works without deleting the cache.
  Evidence: `npm run dev` returned HTTP 500 for `/discover`. `npx next dev --webpack -p 3000` rendered the page and served all tested event-search requests with HTTP 200.

## Decision Log

- Decision: Expose one public sort value named `RECOMMENDED` and keep the implementation version private.
  Rationale: Clients need a stable product contract while ranking weights can evolve without a mobile or web release.
  Date/Author: 2026-08-02 / Codex

- Decision: Rank first, diversify second, and paginate last.
  Rationale: Applying diversity after pagination would still let one organization consume the candidate page and would make later pages inconsistent.
  Date/Author: 2026-08-02 / Codex

- Decision: Use deterministic signals already stored in the database.
  Rationale: `Events.sourceType` identifies affiliate imports. Organization ownership fields identify claimed and verified profiles. No migration is required.
  Date/Author: 2026-08-02 / Codex

- Decision: Preserve explicit search relevance ahead of recommendation preferences.
  Rationale: A user who enters a query expects matching events first. Organization and source boosts must not replace textual relevance.
  Date/Author: 2026-08-02 / Codex

- Decision: Keep map event requests on `NEAREST` and organization catalogs on `SOONEST`.
  Rationale: Map marker selection and an organization's own inventory must not receive the Discover feed diversity penalty.
  Date/Author: 2026-08-02 / Codex

- Decision: Expose Recommended, Nearest, and Soonest as server-backed choices in mobile, and preserve the existing additional web-only local choices.
  Rationale: These three orders have complete server inputs before pagination. The existing Price, Most popular, and A to Z web choices still operate on loaded rows and remain outside this change.
  Date/Author: 2026-08-02 / Codex

## Outcomes & Retrospective

Implementation is complete in both working trees. `POST /api/events/search` defaults to `RECOMMENDED`. Its ranking combines proximity, event start, native BracketIQ source, claimed ownership, and verified ownership. It then applies deterministic organization and repeated-title penalties before pagination. Tests prove that events remain present, pages do not overlap, and explicit Nearest bypasses recommendation boosts.

The web defaults its selector to Recommended and sends the selected Recommended, Nearest, or Soonest value on every page. Its map requests Nearest, and organization catalogs request Soonest. Mobile adds the same three choices to both the Compose Android and native Swift iOS event filters, defaults to Recommended, refreshes when the sort changes, and no longer re-sorts an API page after receipt. Map-only mobile bounds requests remain Nearest.

Rendered QA passed on the web and Android. Playwright proved the initial `RECOMMENDED` request, an explicit `NEAREST` request, and a Tennis map request with `sort: "NEAREST"`, `sports: ["Tennis"]`, and a 50-mile map radius. The local fixture database did not contain the production New York tennis event, so rendered QA verified the request contract rather than that live row. Android showed Recommended selected, applied Nearest, refreshed through the local route, and produced no crash log. The iOS app built, installed, launched, and rendered on the iPhone 15 Pro simulator after the native parity fix. The focused native bridge test also passed.

No database migration or runtime state change was required. Existing unrelated `AGENTS.md` changes and affiliate setup files remain untouched. The user did not request a commit, so all feature changes remain uncommitted.

## Context and Orientation

`mvp-site/src/app/api/events/search/route.ts` is the shared `POST /api/events/search` route. Both products call this route. It filters event records, calculates text or distance order, slices the requested page, and then adds participant, division, tag, and organization data.

`mvp-site/src/lib/eventService.ts` is the web API wrapper. `mvp-site/src/app/discover/page.tsx` loads 18 events per page. `mvp-site/src/app/discover/components/EventsTabContent.tsx` owns the visible web sort selector.

`mvp-app/core/network/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/EventDtos.kt` defines the mobile request data. `mvp-app/core/repository-impl/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/EventCatalogCoordinator.kt` sends the request and currently performs an additional distance sort. `mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/eventSearch/EventSearchComponent.kt` owns mobile Discover paging and filters.

A BracketIQ-powered event is an event whose `sourceType` is not `AFFILIATE_IMPORT`. A claimed organization has `ownershipStatus` equal to `CLAIMED`. A verified claimed organization also has a non-`NONE` claim verification level or an ownership verification timestamp. Diversification means reducing repeated exposure without deleting a matching event.

## Plan of Work

Create a small pure ranking module under `mvp-site/src/server/events`. It will accept candidate events, organization ranking metadata, the requested sort, and optional user coordinates. It will produce one deterministic ordered list. Explicit `NEAREST` and `SOONEST` orders will remain direct comparators. `RECOMMENDED` will combine distance, start time, native BracketIQ source, and claimed organization status. It will then use a greedy diversity pass that applies a diminishing penalty to organizations and normalized titles already selected. Stable event IDs will resolve all ties.

Extend the API body with `sort`. Default it to `RECOMMENDED`. Load the organization metadata for all candidate organization IDs before ranking. Keep explicit query relevance as the primary query order. Disable diversity for an explicit `organizationId`, because an organization catalog must show that organization without a penalty. Apply the final order before `offset` and `limit`.

Extend the web service request type with the sort value. Lift the web sort state to `src/app/discover/page.tsx` so a sort change reloads the first server page. Add `Recommended` as the first selector option and default. Preserve API order for `RECOMMENDED`; do not apply a second client comparator. Send the selected sort on first-page and load-more requests.

Extend the mobile request data with `sort`, send `RECOMMENDED` for Discover event pages, and stop sorting those pages again after receipt. Add a mobile sort state and selector only if the existing filter sheet has a small and tested extension point. The required product behavior is that the default list requests and preserves `RECOMMENDED`.

## Concrete Steps

Work in `/Users/elesesy/StudioProjects/mvp-site` for the shared API and web client. Add focused Jest tests around ranking and the route request. Run:

    npm test -- --runInBand src/app/api/events/__tests__/eventSearchRoute.test.ts
    npx tsc --noEmit

Work in `/Users/elesesy/StudioProjects/mvp-app` for the mobile request and coordinator. Run the focused coordinator and Discover component tests discovered from the Gradle source sets, followed by:

    ./gradlew :composeApp:compileDebugKotlinAndroid

The completed validation commands were:

    cd /Users/elesesy/StudioProjects/mvp-site
    npm test -- --runInBand src/lib/__tests__/eventService.test.ts src/app/discover/components/__tests__/EventsTabContent.test.tsx src/app/api/events/__tests__/eventSearchRoute.test.ts src/server/events/__tests__/recommendedEventRanking.test.ts
    npx tsc --noEmit
    npx eslint src/app/api/events/search/route.ts src/app/api/events/__tests__/eventSearchRoute.test.ts src/server/events/recommendedEventRanking.ts src/server/events/__tests__/recommendedEventRanking.test.ts src/lib/eventService.ts src/lib/__tests__/eventService.test.ts src/app/discover/page.tsx src/app/discover/components/EventsTabContent.tsx src/app/discover/components/DiscoverMapModal.tsx
    git diff --check

    cd /Users/elesesy/StudioProjects/mvp-app
    ./gradlew :composeApp:testDebugUnitTest --tests 'com.razumly.mvp.core.data.repositories.EventRepositoryHttpTest' --tests 'com.razumly.mvp.eventSearch.util.EventFilterTest' --tests 'com.razumly.mvp.core.presentation.composables.SearchBoxFilterStateTest'
    ./gradlew :composeApp:testDebugUnitTest --tests 'com.razumly.mvp.eventSearch.DiscoverEventSortSectionUiTest'
    ./gradlew :composeApp:testDebugUnitTest --tests 'com.razumly.mvp.eventSearch.NativeDiscoverBridgeTest'
    git diff --check

The web run passed 49 tests across four suites, followed by clean TypeScript and focused ESLint checks. The route suite passed 15 tests after the final pagination assertion. Each mobile Gradle run ended with `BUILD SUCCESSFUL`; Android compilation was part of those runs. A wider lint attempt found the recorded pre-existing organization page diagnostics, so they were not attributed to this feature or modified.

Rendered QA used Playwright against `http://localhost:3000`, the installed Android debug APK on `emulator-5554`, and the `iosApp` scheme on the booted iPhone 15 Pro simulator. The final Xcode build-and-run succeeded in 219.5 seconds.

## Validation and Acceptance

The server ranking tests must show that a native nearby event and an event from a claimed organization receive appropriate preference over otherwise similar unclaimed affiliate events. A mixed candidate set dominated by one organization must place events from alternative organizations into the first page. Every input event must remain in the final ordered sequence. Repeated calls with the same input must return the same IDs.

The route tests must show that omitted `sort` uses `RECOMMENDED`, explicit `NEAREST` remains distance ordered, explicit `SOONEST` remains date ordered, and an `organizationId` request does not diversify its own catalog. Pagination must have no duplicate event IDs between consecutive pages for a fixed candidate set.

The web selector must display `Recommended` initially. Changing to another sort must reload from offset zero and send that sort to the API. Infinite scrolling must keep the same sort value.

The mobile Discover request must serialize `sort` as `RECOMMENDED`. The repository must preserve the returned order. Existing map or organization catalog behavior must not gain an organization diversity penalty.

## Idempotence and Recovery

The edits are source-only and safe to repeat. No database migration or runtime change is required. If a broad type or Gradle check reports unrelated failures from the dirty checkout, retain the focused test evidence and record the exact unrelated file in `Surprises & Discoveries`. Do not discard user changes. Use explicit file patches to correct only this feature.

## Artifacts and Notes

The repositories started with unrelated changes. In `mvp-site`, those changes are in `AGENTS.md`, affiliate documentation, package scripts, affiliate import services, tests, and new affiliate automation files. In `mvp-app`, `AGENTS.md` is modified. Preserve all of them.

## Interfaces and Dependencies

The API request body will accept:

    type EventSearchSort = 'RECOMMENDED' | 'NEAREST' | 'SOONEST' | 'POPULAR' | 'PRICE_LOW' | 'ALPHABETICAL';

The ranking module will export the sort type and a pure function with an interface equivalent to:

    rankEventSearchCandidates(events, options): EventCandidate[]

The options include the selected sort, optional user coordinates, whether organization diversity is enabled, and a map of organization ranking metadata. The module must not query Prisma. The route owns data access and supplies this metadata.

The mobile DTO will add a nullable serialized `sort` field to `EventSearchRequestDto`. Discover list requests will pass `RECOMMENDED`. Other request call sites can omit the field and use route-specific safe behavior until they adopt an explicit order.

Revision note: Created the initial cross-repository implementation plan after inspecting the active API and client contracts. The plan records dirty-tree boundaries before source edits.

Revision note: Updated the plan after implementation. It now records the final ranking contract, client behavior, test evidence, and preserved dirty-tree boundaries.

Revision note: Updated the plan after browser and emulator QA. It records the native iOS parity defect found during testing, its correction, and the final rendered validation evidence.
