# Page organization events and teams without losing visibility or manager access

This ExecPlan is a living document. Maintain it according to `PLANS.md` in the root of the `mvp-site` repository.

## Purpose / Big Picture

Organizations with more than the first 300 events or 200 teams currently show only the first response page in the mobile organization detail screen. After this work, a visitor or organization manager can use the Events and Teams tabs until every accessible record is visible, loading the next page without losing the records already on screen. The first page remains fast, and a failed later-page request leaves the existing catalog usable with a clear retry path.

The web application owns the event-list visibility rules. The mobile application must therefore paginate the existing `GET /api/events?organizationId=...` contract rather than substitute the Discover search endpoint, whose future-date and visibility rules differ. The Teams endpoint already returns pagination metadata; mobile currently discards it.

## Progress

- [x] (2026-07-12) Audited the current organization-detail loaders and confirmed the event cap of 300 and the team cap of 200.
- [x] (2026-07-12) Audited the existing `GET /api/events` and `GET /api/teams` contracts and the mobile DTO/repositories.
- [ ] Add additive offset pagination and stable ordering to the event-list route, with web regression tests.
- [ ] Preserve event and team pagination metadata through mobile network DTOs and repository page APIs.
- [ ] Add organization-detail first-page, load-more, stale-result, and retry state for Events and Teams.
- [ ] Render accessible Load more controls and verify the full flow on Android and in the web API tests.
- [ ] Update this plan's outcomes, audit ledger, and commits after the behavior is verified.

## Surprises & Discoveries

- Observation: `mvp-site/src/app/api/events/route.ts` accepts `limit` but not `offset`, uses one `findMany({ take: limit })`, orders only by `start`, and responds with `{ events }`.
  Evidence: the GET handler parses `limit` near the beginning of the handler and performs the query near the existing `take` call. A stable secondary sort is needed before offset pagination can avoid duplicates or skips when two events share a start time.

- Observation: `mvp-site/src/app/api/teams/route.ts` already accepts `offset`, requests `limit + 1`, and returns `pagination.limit`, `pagination.offset`, `pagination.nextOffset`, and `pagination.hasMore`.
  Evidence: the GET handler calls `listCanonicalTeamsForUser` with `offset` and slices the extra record before returning the response.

- Observation: `mvp-app` already models team pagination in `core/network/.../TeamDtos.kt`, but `TeamRepository.fetchRemoteTeamsByOrganization` maps only `res.teams` and drops `res.pagination`. Event DTOs have no equivalent pagination field.
  Evidence: `TeamsResponseDto` contains `TeamsPaginationDto`; `EventsResponseDto` contains only `events`.

- Observation: the current organization UI has no bottom paging affordance. `EventsTabContent` and `TeamsTabContent` in `composeApp/src/commonMain/kotlin/com/razumly/mvp/organizationDetail/OrganizationDetailScreen.kt` render a fixed `LazyColumn` list.
  Evidence: each function emits its items but no request for a later page.

## Decision Log

- Decision: extend the existing list endpoints with additive offset metadata instead of using `/api/events/search` for organization tabs.
  Rationale: the existing list route already enforces the correct public, owner, assistant-host, organization-manager, template, hidden-event, and private-event visibility rules. The search route has different filtering and does not preserve this contract.
  Date/Author: 2026-07-12 / Codex.

- Decision: use a page size of 50 for both organization tabs and an explicit `Load more` button rather than background infinite scroll.
  Rationale: 50 keeps the first response small, makes the behavior available to keyboard and screen-reader users, and gives a visible retry target if a later request fails. A future design may add scroll prefetch without changing the page contract.
  Date/Author: 2026-07-12 / Codex.

- Decision: make event pagination stable with `start ASC, id ASC`, request one extra row, and return `hasMore` based on that extra row.
  Rationale: offset pagination needs a deterministic order. A second `id` sort prevents ties in `start` from changing page membership; the extra row avoids a separate count query.
  Date/Author: 2026-07-12 / Codex.

- Decision: leave the existing list-returning repository methods intact and introduce additive page-returning methods for the organization-detail screen.
  Rationale: other call sites, including rental conflict loading, currently rely on a simple `List<Event>` or `List<TeamWithPlayers>`. A narrow new API avoids silently changing their cap or semantics while the rental availability plan replaces its separate source of truth.
  Date/Author: 2026-07-12 / Codex.

## Outcomes & Retrospective

No implementation has been completed yet. The current outcome is a verified cross-repository design that avoids a client-side workaround. Update this section after the API, mobile state, and manual validation are complete.

## Context and Orientation

`mvp-site` is the Next.js and Prisma web repository. `src/app/api/events/route.ts` is the server route used by mobile for organization events. Its `where` clause is security-sensitive: it applies event state visibility, organization-manager draft visibility, and a signed-in user's hidden-event exclusions before querying Prisma. Do not move that filtering into the app.

`src/app/api/teams/route.ts` is the server route for teams. It already returns an offset page. A page is a bounded slice of a larger ordered list. `offset` is the number of records already consumed; `nextOffset` is where the following request starts; `hasMore` tells the client whether another request is useful.

`mvp-app` is the Kotlin Multiplatform mobile repository. Its relevant files are:

- `core/network/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/EventDtos.kt` and `TeamDtos.kt`, which decode the JSON response.
- `core/repository-impl/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/EventRepository.kt` and `TeamRepository.kt`, which call the API and hydrate local Room data.
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/organizationDetail/OrganizationDetailComponent.kt`, which owns organization-tab state and asynchronous requests.
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/organizationDetail/OrganizationDetailScreen.kt`, which renders the Events and Teams tabs.

The work must be implemented on one coordinated branch in both repositories. Keep the response backward compatible: old clients that decode only `events` or `teams` must continue working when the optional `pagination` object appears.

## Plan of Work

### Milestone 1: Add a stable, additive event page contract

In `mvp-site/src/app/api/events/route.ts`, parse a nonnegative `offset` query parameter alongside `limit`. Normalize malformed values to the existing defaults. Preserve existing callers by keeping the default response size and allow the established maximum request size of 500; the new organization screen will request 50.

Change the Prisma query to request `normalizedLimit + 1` records, skip `normalizedOffset`, and order by `start` ascending followed by `id` ascending. Build all existing attendee, division, participant, official, tag, and organization enrichments only for the page rows, not the sentinel extra record. Return the existing `events` field unchanged and add:

    pagination: {
      limit: normalizedLimit,
      offset: normalizedOffset,
      nextOffset: normalizedOffset + pageRows.length,
      hasMore: fetchedRows.length > normalizedLimit,
    }

Do not alter the `where` clause, session resolution, template handling, hidden event exclusions, or manager-draft permissions. Add focused Jest cases in the existing `src/app/api/events/__tests__/templatePrivacyRoutes.test.ts` or a dedicated list-route test. Assert `skip`, `take: limit + 1`, both order fields, a trimmed response page, `hasMore`, and that the existing manager/private visibility behavior still applies when `offset` is supplied.

### Milestone 2: Preserve page metadata in mobile repositories

In `mvp-app/core/network/.../EventDtos.kt`, add a nullable serializable event pagination DTO matching `limit`, `offset`, `nextOffset`, and `hasMore`, then add it as an optional property of `EventsResponseDto`. Reuse the existing `TeamsPaginationDto` shape rather than creating an incompatible team format.

In `EventRepository.kt`, define an additive `OrganizationEventPage` model containing the mapped `List<Event>`, `nextOffset`, and `hasMore`. Add `IEventRepository.getOrganizationEventsPage(organizationId, limit, offset)`. Its implementation must call `api/events?organizationId=<encoded>&limit=<safe>&offset=<safe>`, map and upsert the returned events, and treat missing pagination from an older server as a single terminal page (`nextOffset = returned size`, `hasMore = false`). Keep `getEventsByOrganization` unchanged for legacy callers.

In `TeamRepository.kt`, define the symmetric `OrganizationTeamPage` model and `ITeamRepository.getOrganizationTeamsPage`. Update the organization-specific remote helper to retain `TeamsResponseDto.pagination`, hydrate the page's team IDs into `TeamWithPlayers` in the remote response order, and use the same safe fallback for a missing pagination object. Keep `getTeamsByOrganization` unchanged for existing callers.

Add repository HTTP/unit tests that verify each URL contains the requested offset, malformed or absent server pagination finishes safely, and a second page preserves the correct `nextOffset` and `hasMore` values.

### Milestone 3: Make the organization detail component page-aware

In `OrganizationDetailComponent.kt`, add state flows for `canLoadMoreEvents`, `canLoadMoreTeams`, `isLoadingMoreEvents`, and `isLoadingMoreTeams`, plus interface methods `loadMoreEvents()` and `loadMoreTeams()`.

`refreshEvents(force = true)` and `refreshTeams(force = true)` must request offset zero with a page size of 50, replace the relevant list, set the next offset and `hasMore`, and only then mark the first page loaded. A normal refresh must not issue another initial request while one is active.

`loadMoreEvents()` and `loadMoreTeams()` must return immediately when no next page exists or a same-kind request is already in flight. On success, append by stable ID: replace an existing row if the page contains a duplicate ID, otherwise append it. Update the next offset and has-more flag from the page. On failure, keep the existing rows and next-page state intact, clear the in-flight flag, and expose a message such as `Failed to load more events. Try again.` or `Failed to load more teams. Try again.` so the button remains a retry affordance.

Avoid letting a delayed page-zero refresh overwrite a later page. Capture an incrementing generation token when beginning each refresh; only apply a result if it matches the latest generation. The organization ID is fixed for this component instance, but the generation rule protects force-refresh and retry races.

Update `updateVisibleTabs()` only from the merged event/team lists. An organization tab that has first-page records must remain visible while a later page fails.

Extend `OrganizationDetailComponentTest.kt` with fakes that provide two event pages and two team pages. Prove first page, load more, duplicate ID replacement, terminal state, and later-page failure preserving the first page. Include a delayed first-page fake to prove an old result cannot discard a newer merged page.

### Milestone 4: Render accessible paging controls

Extend `EventsTabContent` and `TeamsTabContent` in `OrganizationDetailScreen.kt` to accept load-more state and callbacks. At the end of a nonempty `LazyColumn`, render a full-width Material `OutlinedButton` with text `Load more events` or `Load more teams`. While loading, replace the label with `Loading more…` and disable the button. If the first page is loading, retain the current loading state; if later pages are loading, keep existing cards visible above the disabled button.

Do not use a blank spinner or pointer-only scroll trigger. The button label is the accessibility description and supports retry after a failed page. The empty-state messages remain only for a completed empty first page.

Add a focused Compose or pure UI-state test for the control visibility and enabled state if the project test setup supports it. Otherwise include the behavior in the component tests and record a manual Android verification in the audit ledger.

### Milestone 5: Validate the complete cross-repository behavior

Run from `/Users/elesesy/StudioProjects/mvp-site`:

    npm test -- --runInBand src/app/api/events/__tests__/templatePrivacyRoutes.test.ts
    npx tsc --noEmit

Run from the intended `mvp-app` worktree, supplying local Android paths if `local.properties` is absent:

    ANDROID_HOME=/Users/elesesy/Library/Android/sdk \
    ANDROID_SDK_ROOT=/Users/elesesy/Library/Android/sdk \
    JAVA_HOME=/Users/elesesy/Library/Java/JavaVirtualMachines/jbr-21.0.6/Contents/Home \
    ./gradlew --no-daemon :composeApp:testDebugUnitTest --tests com.razumly.mvp.organizationDetail.OrganizationDetailComponentTest

Expect Jest and TypeScript to exit zero. Expect the Gradle XML for `OrganizationDetailComponentTest` to show zero failures and errors.

For manual verification, create or select an organization with at least 51 accessible events and 51 accessible teams. Open its mobile detail page. Confirm the first 50 cards render, activate `Load more events`, and confirm the next records append without duplicates. Repeat for teams. As an organization manager, confirm unpublished events remain visible where they were before; as an anonymous visitor, confirm private organization inventory and private events remain hidden. Simulate a later-page network failure and confirm the first 50 cards remain with an enabled retry button.

## Concrete Steps

1. Make the server event page contract and run its focused tests before changing mobile.
2. Add DTO/repository page models with unit tests; preserve the legacy list methods and all existing call sites.
3. Wire the organization component state and tests, then render the controls.
4. Run the exact commands in the preceding milestone and inspect the Android XML results rather than relying only on Gradle console truncation.
5. Update `docs/code-audit/README.md` only after the web and mobile tests, source review, and manual verification succeed. Add `APP-101` to completed, update the exact counts, and state both commit IDs and test evidence.
6. Stage explicit files in each repository, run `git diff --cached --check`, commit each coherent batch, and preserve unrelated broadcast-overlay work in `mvp-site`.

## Validation and Acceptance

The web API accepts both of these requests with the same visibility policy and deterministic nonoverlapping pages:

    GET /api/events?organizationId=org_1&limit=50&offset=0
    GET /api/events?organizationId=org_1&limit=50&offset=50

The first response has at most 50 events and a truthful pagination object. When at least 51 matching events exist, the first response reports `hasMore: true` and the second begins after the first page. A caller without access must not infer private events merely by changing `offset`.

On mobile, no event or team catalog silently stops at 300 or 200. A later-page failure leaves existing cards visible and permits retry. The automated tests and manual scenario above demonstrate this user-visible result.

## Idempotence and Recovery

All work is additive and safe to rerun. Offset zero always replaces the catalog with a fresh first page; a later page only merges after success. If an API deployment precedes the mobile deployment, old clients ignore the added JSON fields. If a mobile deployment precedes the API change, the nullable DTO fallback treats missing pagination as a completed single page rather than crashing.

If a load-more request fails, do not clear the list or advance the offset; retry the same offset. If a test or merge fails, reset only the files in this plan's scoped branch rather than using a destructive reset in a dirty main worktree.

## Artifacts and Notes

The current source evidence is:

    mvp-site/src/app/api/events/route.ts: list query has take but no skip or pagination response.
    mvp-site/src/app/api/teams/route.ts: offset and pagination response already exist.
    mvp-app/core/network/.../TeamDtos.kt: TeamsPaginationDto exists.
    mvp-app/core/network/.../EventDtos.kt: EventsResponseDto lacks pagination.
    mvp-app/composeApp/.../OrganizationDetailComponent.kt: event limit 300, team default 200.

Plan revision note (2026-07-12): created after APP-101 source review to prevent a partial mobile-only fix from hiding events or changing manager visibility.

## Interfaces and Dependencies

At completion, the server event-list response must include this additive shape:

    {
      "events": [ /* existing Event JSON */ ],
      "pagination": {
        "limit": 50,
        "offset": 0,
        "nextOffset": 50,
        "hasMore": true
      }
    }

At completion, `IEventRepository` exposes:

    suspend fun getOrganizationEventsPage(
        organizationId: String,
        limit: Int = 50,
        offset: Int = 0,
    ): Result<OrganizationEventPage>

and `ITeamRepository` exposes:

    suspend fun getOrganizationTeamsPage(
        organizationId: String,
        limit: Int = 50,
        offset: Int = 0,
    ): Result<OrganizationTeamPage>

Each page model contains ordered hydrated records, `nextOffset: Int`, and `hasMore: Boolean`. These APIs are used only by the organization detail component initially; the existing nonpaged methods remain compatible.
