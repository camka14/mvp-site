# Reliable affiliate coordinates for map discovery

This ExecPlan is a living document. Maintain `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` while implementing the work.

After this change, an affiliate event, club, or rental with an evidenced address or place can be published only after BracketIQ resolves it to valid longitude and latitude through a server-side Google Places request. Existing affiliate events and organizations with missing or zero coordinates can be audited and repaired with a dry-run-first command. The observable result is that New York listings returned by text search also appear after a user centers the Discover map over New York and clicks “Search this area.”

## Progress

- [x] (2026-08-01 10:35 PDT) Confirmed the user-visible mismatch: New York results exist in text search but most do not appear in map-radius search.
- [x] (2026-08-01 10:50 PDT) Audited the live OVH database. All 15 New York-related published affiliate events in the bounded audit had invalid coordinates, 81 of 82 matching organizations had invalid coordinates, and the app container had neither `GOOGLE_MAPS_API_KEY` nor `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` at runtime.
- [x] (2026-08-01 11:00 PDT) Traced the write path to `src/server/affiliateImports/service.ts`, where geocoding failures become event coordinates `[0, 0]` or nullable organization/facility coordinates without blocking publication.
- [x] (2026-08-01 09:55 PDT) Implemented a diagnostic server-side Google Places resolver with a compatibility Geocoding fallback, coordinate validation, and retry-safe caching.
- [x] (2026-08-01 10:00 PDT) Added hard publication gates for affiliate events, clubs, and rentals, while leaving unresolved drafts reviewable.
- [x] (2026-08-01 10:05 PDT) Added a dry-run-first repair command for existing affiliate event and organization coordinates.
- [x] (2026-08-01 10:10 PDT) Updated ingestion and independent-review instructions so coordinate evidence is required and cross-entity coordinate substitution is forbidden.
- [x] (2026-08-01 10:18 PDT) Passed focused Jest suites (53 tests), TypeScript, the full `npm run test:ci` suite including API-route coverage, the optimized production build, and diff checks.
- [x] (2026-08-01 10:20 PDT) Committed the scoped implementation as `1b8f6e82` and pushed it to `main` without staging the unrelated legacy Portland files.
- [x] (2026-08-01 10:52 PDT) Passed exact-commit CI, published and deployed the immutable OVH image, configured the server-only key for the app and agent dotenv files, repaired 46 events and 105 organizations, and verified the live New York radius API returns the screenshot listings with their resolved coordinates.
- [x] (2026-08-01 11:00 PDT) Closed the final source-organization edge case: a located child event or rental may publish, but its source organization is promoted to `LISTED` only when that organization has its own valid coordinates.

## Surprises & Discoveries

- Observation: This is not primarily a map-rendering defect. `DiscoverMapModal` asks the event service for rows within the current radius, so `[0, 0]` records are correctly absent from a New York radius query even though text search can still return their names and descriptions.
  Evidence: the live audit found 434 valid and 518 invalid coordinate pairs among 952 published affiliate events; every New York event in the bounded sample stored `[0, 0]`.

- Observation: The existing server resolver falls back to the public browser-key environment variable and converts missing credentials, HTTP errors, denied requests, and zero results into the same silent `null` value.
  Evidence: `src/server/geocoding.ts` caches `null` and `src/server/affiliateImports/service.ts` writes `coordinates: coordinates ?? [0, 0]`.

- Observation: The production image receives the public Maps JavaScript key only as a build argument. The running OVH container has no server-capable key, which matches earlier source notes that browser-referrer restrictions reject server geocoding.
  Evidence: the OVH environment-name audit returned Google OAuth/mobile keys only; `deploy/vm/app.env.example` has no `GOOGLE_MAPS_API_KEY` entry.

- Observation: Published records without coordinates are not isolated to New York.
  Evidence: the live aggregate audit found 518 of 952 published affiliate events without valid coordinates. The repair command therefore supports bounded New York repair first and a later all-region pass using the same dry-run/apply contract.

- Observation: Eight New York organization rows still have no stored address, city, location, or place evidence.
  Evidence: the post-apply dry run selects only those eight rows, reports `NO_QUERIES` for each, and performs no provider call. They remain unchanged for agent evidence intake rather than receiving name-only guesses.

- Observation: The first OVH Compose deploy command exited on a stale recreate-name conflict even though the new app container became healthy on the requested immutable image.
  Evidence: the final container audit showed `bracketiq-production-app-1` healthy on `1b8f6e828e2adb6b556f528f03b7495e33c8d7c2`, and the public readiness endpoint returned HTTP 200 before repair work began.

## Decision Log

- Decision: Use a distinct `GOOGLE_MAPS_API_KEY` for server-side Places and geocoding requests; never use `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` as a server fallback.
  Rationale: Google recommends separate keys and IP restrictions for server web-service calls. The browser key is public and commonly referrer-restricted, so reusing it caused the existing silent failure and weakens credential boundaries.
  Date/Author: 2026-08-01 / Codex

- Decision: Prefer Places API Text Search (New) and request only place id, display name, formatted address, and location. Fall back to the Geocoding API for compatibility, while returning a structured failure when neither resolves.
  Rationale: Places handles venue-plus-city queries as well as street addresses, while the fallback preserves support for projects that currently enable only Geocoding. A narrow field mask controls response size and billing surface.
  Date/Author: 2026-08-01 / Codex

- Decision: Keep unpublished candidates reviewable even when resolution fails, but fail publication of events, clubs, and rentals unless they have valid non-zero coordinates.
  Rationale: intake evidence can legitimately be incomplete, but a published map-backed record must not silently claim `[0, 0]`. This preserves review workflows while protecting live discovery.
  Date/Author: 2026-08-01 / Codex

- Decision: Repair only rows whose stored event, candidate, source, or organization data supplies a query. Never invent an address or coordinate.
  Rationale: city centroids and place-search results are acceptable when the source explicitly supplies that city/place; guesses unsupported by stored evidence are not.
  Date/Author: 2026-08-01 / Codex

## Context and Orientation

The server resolver is `src/server/geocoding.ts`. It currently calls the legacy Google Geocoding endpoint and returns only a coordinate pair or `null`. The affiliate importer in `src/server/affiliateImports/service.ts` builds several address, venue, and city queries, calls that resolver, and creates `Events`, `Organizations`, or `Facilities` rows. `Events.coordinates` is a required JSON column, so unresolved events currently receive `[0, 0]`; organization and facility coordinates are nullable.

The Discover map is `src/app/discover/components/DiscoverMapModal.tsx`. It calls `eventService.getEventsPaginated` with a center and radius. Text search and radius search are therefore different: text search can find a New York phrase in a row whose coordinates are `[0, 0]`, but the radius query cannot place that row in New York.

The existing recovery script is `scripts/repair-affiliate-event-coordinates.ts`. It audits affiliate events, derives queries from stored candidate fields, and writes only after `--apply`. This plan broadens that safe pattern to organizations and adds provider/failure reporting. The ingestion agent contract is under `.agents/skills/ingest-affiliate-intakes/`; the independent reviewer contract is under `.agents/skills/review-affiliate-approvals/`.

Production runs on OVH from `deploy/vm/compose.production.yml`. The application reads secrets from the VM's untracked `app.env`. `deploy/vm/app.env.example` documents the required names but contains no values. The public browser key remains a GitHub Actions build secret; the server key must be a separate secret available at runtime.

## Plan of Work

First, replace the ambiguous geocoding result with a structured place-resolution result. `resolveAddressToPlace` will normalize the query, require `GOOGLE_MAPS_API_KEY`, call `https://places.googleapis.com/v1/places:searchText` using POST and a narrow `X-Goog-FieldMask`, validate longitude and latitude, and record the provider, formatted address, place id, and failure status. When Places produces no usable result or is unavailable for the configured key, it will attempt the existing Geocoding endpoint. Only successful results and deterministic zero-result responses may be cached; missing credentials, denied requests, network failures, and server errors must be retryable. `geocodeAddressToCoordinates` remains as a compatibility wrapper.

Second, centralize validity checks and query construction in the affiliate service. Unpublished target rows may retain empty coordinates for inspection. A requested public event must have valid non-zero coordinates before any event or candidate status is changed to published. A public club must have valid coordinates before `LISTED` plus `publicPageEnabled=true`; an active affiliate facility must meet the same requirement. Existing valid target coordinates remain a safe fallback during re-scrapes.

Third, broaden the repair utility so it audits both affiliate events and affiliate-related organizations, prints provider and failure summaries, and writes only with `--apply`. Event queries come from stored event/candidate venue, address, and city fields. Organization queries come from stored name, address, and location fields, limited to affiliate-imported organizations or organizations linked to affiliate sources/candidates. The command updates only coordinates and timestamps, plus previously null candidate location fields when a stored source-derived value already exists. It must be idempotent: the second dry run should find no rows repaired by the first application.

Fourth, update both agent contracts. The ingestion agent must report a valid coordinate for every produced kind with an evidenced address/place before `REVIEW_REQUIRED`. The reviewer must independently inspect the persisted candidate and target location fields and reject or defer any package that would publish null, malformed, out-of-range, or `[0, 0]` coordinates. Neither agent may invent an address or use a different organization’s coordinates as a substitute.

Finally, validate and deploy. Add `GOOGLE_MAPS_API_KEY=` to the runtime environment example. The actual production value must be a server-only key with Places API (New) and Geocoding API enabled and restricted to OVH egress IP `15.204.81.193`. Deploy the passing image, add the key to `/opt/bracketiq/deploy/vm/app.env` without printing it, recreate only the app container if needed, run the repair first without `--apply`, inspect counts/samples, then apply and rerun the dry run. Do not restart the separate Luna ingestion or approval agents; their updated contract applies when their next goal process starts.

## Concrete Steps

Work from `/Users/elesesy/StudioProjects/mvp-site`.

1. Add and test the resolver:

       npm test -- --runInBand src/server/__tests__/geocoding.test.ts

   Expected: Places success, Geocoding fallback, missing-key diagnostic, invalid coordinate rejection, and retry-after-transient-failure cases pass.

2. Add the publish gates and focused service tests:

       npm test -- --runInBand src/server/affiliateImports/__tests__/service.test.ts

   Expected: unpublished rows remain reviewable; public event, club, and rental attempts fail before status mutation when coordinates cannot resolve; existing valid coordinates allow idempotent publication.

3. Exercise the repair command against a disposable or local database:

       npm run affiliate:repair:coordinates
       npm run affiliate:repair:coordinates -- --apply
       npm run affiliate:repair:coordinates

   Expected: the first command is a dry run, the second reports exactly which event and organization rows were updated, and the third no longer reports those rows as missing.

4. Run repository checks:

       npx tsc --noEmit
       git diff --check
       git diff --cached --check

5. After CI publishes the immutable image, deploy it with the repository's OVH deployment workflow. In the running app container, verify only the existence of `GOOGLE_MAPS_API_KEY`, never its value. Run the repair command without `--live` because the container's normal `DATABASE_URL` is already the live database.

6. Verify live behavior with a compact database audit and the public UI. The New York events shown in the user's screenshot must have valid New York-area coordinates. Center the Discover map on New York, click “Search this area,” and confirm multiple matching event markers appear. Switch to organizations and confirm address-backed New York organizations appear inside the same radius.

## Validation and Acceptance

The implementation is accepted only when all of the following observable behavior holds. A Places test request resolves a known address to a finite `[longitude, latitude]` pair. A missing or denied server key produces a specific diagnostic and is not cached as a permanent miss. Publishing an address-backed affiliate event with no resolvable coordinate fails without changing the candidate to `PUBLISHED`. The equivalent club and rental flows fail before becoming public/active. A live dry run identifies the existing New York defects, an approved apply run updates them, and a second dry run proves idempotence. The public map returns the repaired New York rows within the New York viewport. Existing browser Maps rendering and non-affiliate event behavior remain unchanged.

## Idempotence and Recovery

The repair command is dry-run by default and updates only rows still missing valid coordinates. It may be rerun after a partial interruption; successful rows fall out of the next selection. Provider failures remain unchanged and are reported with their query and failure category. Never replace valid coordinates during a bulk repair. Before applying live updates, rely on the normal OVH database backup and retain the command's JSON output as the change manifest. A code rollback restores prior publication behavior but does not need to revert correct coordinate values.

## Artifacts and Notes

Do not commit keys, provider payloads, or full live row dumps. Commit only code, tests, documentation, and sanitized aggregate evidence. The browser key and server key are intentionally distinct. The server resolver returns Google coordinates in application order `[longitude, latitude]`, matching the existing `Events.coordinates` and `Organizations.coordinates` convention.

## Outcomes & Retrospective

The implementation is live. Publication can no longer silently turn a failed place lookup into a public `[0, 0]` event, listed club, or active rental facility. The server key is present in the OVH app container and in the dotenv files used by the existing Luna ingestion and approval containers without restarting them.

A source organization is now also protected from indirect publication: publishing a child event or rental no longer lists an address-less source organization. This preserves the correctly located child while holding the organization outside map discovery until its own intake evidence supplies a resolvable place.

The New York dry run selected 159 missing rows. Google resolved 151: all 46 events and 105 of 113 organizations. Places Text Search resolved 143 and the Geocoding compatibility fallback resolved eight. The apply transaction wrote those 151 coordinate pairs. The second dry run found no remaining event repair and only eight organization rows with no source-backed location evidence, so those records were intentionally not guessed.

The public radius endpoint centered on New York now returns 43 events within 100 miles. It includes Eastern New York ODP at Capelli Sports Complex (`[-74.3027817, 41.3512888]`), Eastern New York ODP at Saxon Wood Fields (`[-73.7451978, 40.9866807]`), and the Five-Star Brooklyn showcase (`[-73.954902, 40.6687669]`). The public organization page returns 17 New York-area coordinate-backed organizations in its first discovery page. Anonymous Playwright navigation redirects `/discover` to login, so the authenticated modal itself remains a short operator visual check; its exact data request has been verified live.
