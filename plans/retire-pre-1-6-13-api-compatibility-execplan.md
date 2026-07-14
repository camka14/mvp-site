# Retire Pre-1.6.13 API Compatibility

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with `PLANS.md` at the repository root.

## Purpose / Big Picture

BracketIQ should expose one canonical API shape and use one generated Prisma delegate for teams. After this work, API resources will identify records with `id`, use the persisted `createdAt` and `updatedAt` fields, and preserve a genuinely open-ended event as `end: null`. The server will no longer add Appwrite-style `$id`, `$createdAt`, or `$updatedAt` aliases, accept those aliases in write payloads, or fall back from the generated `teams` delegate to the obsolete `volleyBallTeams` name.

The supported v1.6.13 mobile client must continue to load, edit, and score the same resources. This is possible only after proving from the v1.6.13 tag that each endpoint it calls decodes canonical fields and that nullable event endings are supported. A human can verify the result by running v1.6.13 contract fixtures against a release server, opening the same event/team/profile flows in the current app, and inspecting JSON responses to confirm that no dollar-prefixed compatibility fields remain.

This plan resolves audit finding `LEG-001` in `docs/code-audit/README.md`.

## Progress

- [x] (2026-07-14 09:31Z) Read `PLANS.md`, the `LEG-001` finding, the current server compatibility helpers, generated Prisma delegate, current mobile DTOs, and the mobile v1.6.13 tag.
- [x] (2026-07-14 09:31Z) Counted the current removal surface: 124 web files call `withLegacyFields` or `withLegacyList`, six call `stripLegacyFieldsDeep`, 17 use generic parsing helpers from `legacyFormat.ts`, 11 production files mention `volleyBallTeams`, and 15 mobile DTO files declare `$id` aliases with 129 legacy-field references.
- [ ] Build an executable v1.6.13 endpoint/field inventory and contract fixture before removing response aliases. (Completed 2026-07-14 14:04Z: added the source and endpoint inventory in `docs/code-audit/leg-001-v1.6.13-contract.md`, tied it to exact tag `50045cc3` and executable fixture commit `245f6a0a`, and documented canonical decoding for app, Wear OS, and watchOS resource families. Remaining: expand executable fixtures beyond event/team/match/user where the sibling mobile worktree can be changed without colliding with active mobile audit work.)
- [x] (2026-07-14 12:05Z) Added the first canonical-only compatibility-floor fixture for event, team, match, and user payloads. The same two tests passed from the exact `v1.6.13` tag (`50045cc3`) and were checked in at current mobile commit `245f6a0a`; organization, field, chat, billing, Wear OS, and watchOS coverage is still required before response aliases can be removed.
- [x] (2026-07-14 09:39Z) Removed every non-generated `volleyBallTeams` reference from web production and tests. Ten focused suites passed 89 tests on the first run; the profile schedule suite then passed 11 tests after its stale partial Prisma mock gained the normalized membership delegates required by DATA-007. TypeScript and whitespace checks passed.
- [x] (2026-07-14 14:04Z) Moved generic request/date parsing out of `legacyFormat.ts`, made event, chat-group, match, and time-slot writes reject nested dollar-prefixed input fields before database work, removed ten proven-unused client aliases, and retained the externally configured BoldSign callback. The obsolete helper and its test-only mocks were deleted with the response slice.
- [x] (2026-07-14 14:42Z) Removed all 124 `withLegacyFields`/`withLegacyList` response call sites and deleted `src/server/legacyFormat.ts`. Canonical list, detail, search, nested participant/detail, scheduler, match, team, organization, field, billing, chat, user, and admin responses now keep `id` and preserve `end: null`; browser adapters derive the existing internal `$id` view-model field from canonical `id` at the HTTP boundary. The focused response and open-ended-event batches cover 160 test executions across 20 suite executions, and TypeScript passed.
- [ ] Remove legacy DTO fallbacks from the current Android/iOS/Wear/watchOS clients after server and v1.6.13 fixture coverage proves canonical decoding.
- [x] (2026-07-14 14:54Z) Completed the web automated gate from `310a9833`: focused response tests passed 160 assertions, the full Jest run passed 459 suites and 2,944 tests, `test:ci` passed all coverage floors including 273 API route files, TypeScript passed, and the exact optimized `npm run build` validated/generated Prisma, compiled with Turbopack, and generated all 122 static pages.
- [ ] Run browser and emulator/watch contract smoke tests from exact commits.
- [ ] Update `docs/code-audit/README.md` with commit and runtime evidence and mark `LEG-001` complete only when the production searches are empty or every remaining match is a historical test fixture.

## Surprises & Discoveries

- Observation: the v1.6.13 mobile tag already declares canonical nullable `id` fields alongside optional `$id` fallbacks.
  Evidence: `git show v1.6.13:core/network/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/EventDtos.kt` shows `val id: String? = null` before `@SerialName("$id") val legacyId: String? = null`, and `end` is nullable.

- Observation: the current mobile version is 1.6.14 and is 114 commits beyond the v1.6.13 tag, but the current DTO layer still carries legacy aliases.
  Evidence: `composeApp/build.gradle.kts` defines `mvpVersion = "1.6.14"`; `git describe` reported `v1.6.13-114-g4edbcf1a-dirty`; 15 mobile DTO files still declare `$id` aliases.

- Observation: the team delegate fallback is not confined to the Prisma proxy.
  Evidence: production references also exist in team chat sync, archive policy, profile schedule scope, team membership, invites, profile registrations, team routes, and free-agent routes.

- Observation: `legacyFormat.ts` combines three unrelated responsibilities.
  Evidence: it adds response aliases, mutates `end: null` to `end: start`, strips dollar-prefixed input recursively, and also contains generic ID/date parsers. The generic parsers must move rather than disappear with response compatibility.

- Observation: the profile schedule route test still depended on a partial Prisma mock that predated normalized team membership.
  Evidence: the first focused run failed eight cases with `Canonical team membership requires TeamRegistrations and TeamStaffAssignments delegates.` Adding `teamRegistrations` and `teamStaffAssignments` mocks and canonical rows made all 11 cases pass; no production fallback was restored.

- Observation: canonical-only core resource payloads are executable at the exact v1.6.13 compatibility floor even when every Appwrite dollar-prefixed alias is omitted.
  Evidence: `CanonicalOnlyContractFloorTest` passed two tests from detached tag commit `50045cc3`, decoding canonical event, team, match, and user IDs plus canonical timestamps. Its event fixture uses `end: null` with `noFixedEndDateTime: true`; the v1.6.13 wire DTO accepts the null before its non-null domain model applies the established open-ended fallback.

- Observation: the oldest-supported mobile client already calls the canonical billing paths, while none of the ten client-facing alias spellings appear in that tag or the current mobile source.
  Evidence: exact-tag source and HTTP assertions use `/api/billing/create_billing_intent` and `/api/billing/purchase-intent`; `git grep` found no use of `billing_intent`, `billing-intent`, `purchase_intent`, `create_purchase_intent`, or the six user invite/lookup aliases. `src/app/api/boldsign/webhook/route.ts` is different: it is an external provider callback and therefore is not classified as a client-version alias.

- Observation: request objects decoded by Next.js during Jest route tests can originate in a different JavaScript realm.
  Evidence: a prototype-identity plain-object check missed those objects and allowed obsolete keys through. `Object.prototype.toString.call(value) === '[object Object]'` recognizes JSON objects across realms; after the correction all four request-contract suites passed 51 tests.

- Observation: deleting server response aliases exposed several browser services and direct admin screens whose TypeScript models still use `$id` internally.
  Evidence: canonical-only chat, refund, sport, bill, organization, user, product, event, field, and admin fixtures initially produced blank internal identities until their HTTP-boundary adapters copied canonical `id`, `createdAt`, and `updatedAt` into the existing view models. The adapters now prefer canonical values when both forms are present.

- Observation: the event-template seed route returned an internal `Event` view model directly even though it never imported `legacyFormat.ts`.
  Evidence: `buildSeedEventFromTemplate` creates internal `$id` fields for the draft event, fields, and time slots. The route now uses the domain-specific `serializeSeedEvent` response serializer, and its regression asserts that nested canonical IDs are present and no dollar-prefixed key is serialized.

## Decision Log

- Decision: Treat the checked-in mobile tag `v1.6.13` as the compatibility floor and prove its actual route and field behavior from source and executable JSON fixtures.
  Rationale: the audit explicitly requires proof before removal. Current-client success alone cannot prove that the oldest supported client remains compatible.
  Date/Author: 2026-07-14 / Codex

- Decision: Remove server compatibility in additive, testable slices: generated delegate first, request aliases second, response aliases third, then current-client fallback fields.
  Rationale: a single 100-file mechanical patch would make failures difficult to localize. Each slice can have exact searches, focused tests, and a checkpoint commit while moving toward the same final state.
  Date/Author: 2026-07-14 / Codex

- Decision: Preserve canonical `id`, `createdAt`, `updatedAt`, and nullable `end` exactly; do not introduce a renamed compatibility wrapper.
  Rationale: replacing `withLegacyFields` with another serializer that reproduces legacy semantics would not resolve the competing contract.
  Date/Author: 2026-07-14 / Codex

- Decision: Keep internal web view-model adaptation separate from the HTTP contract during the migration.
  Rationale: some web types still use `$id` internally. API mappers may temporarily derive an internal UI alias from canonical `id`, but HTTP routes must stop emitting dollar-prefixed fields. That boundary permits a staged UI cleanup without retaining an externally competing response shape.
  Date/Author: 2026-07-14 / Codex

- Decision: Reject obsolete dollar-prefixed request keys with HTTP 400 and report their nested paths before authorization queries or transactions begin.
  Rationale: silently stripping obsolete fields made invalid clients appear successful and let administrators bypass immutable-field diagnostics. Early rejection gives a deterministic contract and proves no write occurred.
  Date/Author: 2026-07-14 / Codex

- Decision: Remove the ten unused client alias routes but retain `/api/boldsign/webhook` as a documented external-provider alias.
  Rationale: exact v1.6.13 and current-client searches prove the canonical billing paths and no user-alias calls. BoldSign configuration is external to the client release floor, so deleting that callback without deployment evidence could drop document events.
  Date/Author: 2026-07-14 / Codex

## Outcomes & Retrospective

The web compatibility removal is complete in checkpoint slices. Production and tests have zero non-generated `volleyBallTeams` references, zero `legacyFormat`, `withLegacyFields`, `withLegacyList`, or `stripLegacyFieldsDeep` references, and no direct dollar-prefixed response properties in App Router API handlers. Obsolete request keys fail before writes, ten unused aliases are absent, open-ended events remain `end: null` in list/detail/search/nested responses, and browser services consume canonical-only payloads without changing the internal UI model in this slice. Exact v1.6.13 executable proof covers event, team, match, and user; source-level inventory covers organization, field, chat, billing, Wear OS, and watchOS. Focused tests, full Jest, coverage, TypeScript, Prisma validation/generation verification, and the optimized release build pass from the isolated web commit. Browser/emulator/watch runtime smoke evidence and current-mobile DTO cleanup in its isolated worktree remain before the overall plan can close.

## Context and Orientation

The web repository is `/Users/elesesy/StudioProjects/mvp-site`. `src/lib/prisma.ts` creates the generated Prisma client and currently wraps it in a proxy that aliases `teams` and `volleyBallTeams`. The generated schema exposes only the `teams` delegate. Eleven production files repeat the fallback independently, so removing only the proxy is insufficient.

`src/server/legacyFormat.ts` is the central response compatibility helper. `withLegacyFields` adds `$id`, `$createdAt`, and `$updatedAt`; it also changes an event whose `noFixedEndDateTime` is true and whose `end` is null into an event whose end equals its start. `withLegacyList` maps that behavior across lists. `stripLegacyFieldsDeep` removes every dollar-prefixed key from request payloads. `normalizeLegacyId` and `parseDateInput` are general request parsers whose behavior is still useful and must move to a neutrally named module.

The sibling mobile audit worktree is `/Users/elesesy/StudioProjects/mvp-app-critical-audit`. Its canonical network DTOs live under `core/network/src/commonMain/kotlin/com/razumly/mvp/core/network/dto`. Repository-private DTOs also exist in `core/repository-impl`, Wear OS DTOs live in `wearApp`, and watchOS Codable models live in `iosApp/watchApp`. A DTO is a data transfer object: a serializable structure used only to decode or encode an HTTP payload. Current mapping code generally chooses `id ?: legacyId`; after this plan it must require the canonical `id` where the server contract requires identity.

An alias route is an HTTP path that only re-exports another route handler under an older name. Do not delete a route merely because it imports another file: several current routes share implementation intentionally. The v1.6.13 route inventory must distinguish a true obsolete path from a maintained public path.

## Plan of Work

### Milestone 1: Prove the supported-client contract and remove the delegate alias

Create a checked-in contract inventory under `docs/code-audit/leg-001-v1.6.13-contract.md` or an equivalently focused test fixture. Read every v1.6.13 network call path and the DTO used to decode it. Record whether the endpoint requires `id`, accepts nullable `end`, and uses canonical timestamps. Build fixture tests that decode representative canonical-only payloads for event, team, match, user, organization, field, chat, billing, Wear OS, and watchOS models. A fixture must omit all dollar-prefixed keys; otherwise it does not prove compatibility.

Then simplify `src/lib/prisma.ts` so `prisma` is the generated client instance without cross-delegate name translation. Replace every `client.teams ?? client.volleyBallTeams` form with a required `client.teams` contract. Update injected client interfaces so incomplete mocks fail clearly. Remove tests that assert fallback and replace them with tests that assert the generated delegate is required. Run team, invite, chat, deletion/archive, and profile schedule suites plus TypeScript.

### Milestone 2: Remove legacy request acceptance and alias routes

Move `normalizeLegacyId` and `parseDateInput` into `src/server/requestParsing.ts` with their focused tests. At the six current `stripLegacyFieldsDeep` callers, replace silent stripping with explicit request-schema validation. A dollar-prefixed key must return HTTP 400 and must not reach Prisma. This prevents a typo or obsolete client payload from appearing successful while being ignored.

Inventory route-handler re-exports and compare every candidate with v1.6.13 request paths. Delete only true obsolete aliases. Add route tests that the canonical path still succeeds and the removed path returns 404 in a release build. If a re-export is a maintained implementation-sharing path, keep it and record why it is not legacy compatibility.

### Milestone 3: Emit canonical responses only

Replace `withLegacyFields` and `withLegacyList` at every API boundary. Direct Prisma rows may be returned only after their existing privacy, authorization, and domain formatting steps are preserved. Do not expose additional fields merely because a wrapper is removed. When a route currently spreads a formatted result, replace only the compatibility layer and keep its envelope unchanged.

For events, remove the `end: null` to `end: start` rewrite. Add a regression showing an open-ended event remains null in list, detail, search, and nested event responses, while ordinary fixed events preserve their actual end. Update web API mappers so the browser continues rendering canonical resources even if an internal view model temporarily uses `$id`.

Once production imports are gone, delete `withLegacyFields`, `withLegacyList`, and `stripLegacyFieldsDeep`, then delete `src/server/legacyFormat.ts`. The exact production searches in Concrete Steps must return zero matches.

### Milestone 4: Remove current-client fallbacks and prove runtime behavior

In the mobile audit worktree, remove `$id`, `$createdAt`, and `$updatedAt` properties from current DTOs and Codable models. Replace `id ?: legacyId` with validation that produces endpoint and row context when a required canonical ID is absent. Do not silently turn a malformed row into an empty ID. Retain local database/domain fields only when they represent canonical application data rather than an HTTP alias.

Run canonical-only v1.6.13 fixture tests before and after the server removal. Compile Android and iOS, run Wear JVM tests, and type-check watchOS Swift sources. Start an optimized web release, use a browser to inspect representative JSON and an open-ended event, and run the current app in an emulator against that release. The runtime log must contain no decode failure, blank-ID fallback, 404 from a removed route that the client calls, or Prisma delegate error.

## Concrete Steps

Work from `/Users/elesesy/StudioProjects/mvp-site` unless a command explicitly changes directories. Preserve unrelated broadcast work and stage only files from this plan.

Capture the web surface before each slice:

    rg -n '\bwithLegacy(Fields|List)\b|\bstripLegacyFieldsDeep\b' src --glob '*.{ts,tsx}'
    rg -n '\b(normalizeLegacyId|parseDateInput)\b' src --glob '*.{ts,tsx}'
    rg -n '\bvolleyBallTeams\b' src --glob '*.{ts,tsx}' --glob '!src/generated/**'
    find src/app/api -type f -name 'route.ts' -print0 | xargs -0 rg -l "from '@/app/api/"

Capture the mobile v1.6.13 and current surfaces from `/Users/elesesy/StudioProjects/mvp-app-critical-audit`:

    git grep -n -E '@SerialName\("\\\$id"\)|legacy(Id|CreatedAt|UpdatedAt)' v1.6.13 -- \
      core composeApp wearApp iosApp/watchApp
    rg -n '@SerialName\("\\\$id"\)|case legacyId = "\$id"|legacy(Id|CreatedAt|UpdatedAt)' \
      core composeApp wearApp iosApp/watchApp --glob '*.{kt,swift}' --glob '!**/build/**'
    rg -n 'api/[A-Za-z0-9_?&=/${}.-]+' core composeApp wearApp iosApp/watchApp \
      --glob '*.{kt,swift}' --glob '!**/build/**'

Run focused web tests after the delegate slice. Update the list if source inspection finds another direct delegate owner:

    npx jest --runInBand --runTestsByPath \
      src/app/api/profile/schedule/__tests__/route.test.ts \
      src/server/deletion/__tests__/archivePolicy.test.ts \
      src/server/teams/__tests__/teamMembership.test.ts \
      src/server/__tests__/teamChatSync.test.ts \
      src/app/api/invites/__tests__/route.test.ts \
      src/app/api/teams/__tests__/teamsRoute.test.ts
    npx tsc --noEmit --pretty false
    git diff --check

Before deleting the response helper, run every test file importing or mocking `legacyFormat.ts`, then run the full checks:

    rg -l "legacyFormat" src --glob '*.{test,spec}.{ts,tsx}' | sort
    npm run test:ci
    npm run build

Run mobile validation serially in the shared worktree:

    ./gradlew :core:network:testDebugUnitTest \
      :core:repository-impl:testDebugUnitTest \
      :composeApp:testDebugUnitTest
    ./gradlew :composeApp:compileKotlinIosSimulatorArm64
    ./gradlew :wearApp:testDebugUnitTest
    git diff --check

Use the existing complete-source Swift type-check command documented by the watch audit work. Record the exact command and source count in this plan when run.

## Validation and Acceptance

The finding is accepted only when a canonical-only fixture decodes with the checked-in v1.6.13 client source for every resource family it calls. Each fixture omits `$id`, `$createdAt`, and `$updatedAt`; the open-ended event fixture uses `end: null`. Current Android, iOS, Wear OS, and watchOS models decode the same fixtures without fallback fields.

Every production server path uses `teams`; no proxy or injected-client helper references `volleyBallTeams`. A mock missing `teams` fails at the boundary instead of silently choosing an obsolete delegate.

Representative API list, detail, create, update, social, billing, event, match, team, organization, field, chat, and watch responses contain canonical `id` and no dollar-prefixed aliases. An open-ended event response keeps `end: null`. A request containing a dollar-prefixed compatibility key returns HTTP 400 and performs no write.

The final production searches for `withLegacyFields`, `withLegacyList`, `stripLegacyFieldsDeep`, `volleyBallTeams`, and dollar-prefixed DTO aliases return zero matches outside explicit historical fixtures. The optimized release build, focused suites, full web tests, Android tests, iOS compilation, Wear tests, watchOS type-check, browser smoke test, and emulator smoke test pass.

## Idempotence and Recovery

Source searches and fixture tests are read-only and safe to repeat. Each removal slice must be committed separately so a failing slice can be reverted without resurrecting unrelated compatibility. Do not deploy a canonical-only server until the v1.6.13 fixture passes. Deploy the server before releasing current clients with their fallback fields removed; v1.6.13 already accepts canonical fields, while an older server may still emit both shapes.

If runtime verification finds a v1.6.13 endpoint that genuinely requires a legacy-only field, stop that removal slice, add the exact fixture and route to this plan, and make the server emit a canonical equivalent that the v1.6.13 decoder already understands. Do not restore universal response aliases for one endpoint.

## Artifacts and Notes

Initial evidence:

    web withLegacy callers: 124 files
    web stripLegacyFieldsDeep callers: 6 files
    web generic parser users: 17 files
    web production volleyBallTeams references: 11 files
    mobile DTO files with $id aliases: 15 files
    mobile legacy-field references: 129
    current mobile version: 1.6.14
    compatibility floor tag: v1.6.13

Record checkpoint commit hashes, focused suite totals, final zero-search results, release route observations, emulator device/API, and watch validation here as the plan proceeds.

Delegate-slice evidence:

    rg -n 'volleyBallTeams' src --glob '*.{ts,tsx}' --glob '!src/generated/**'
    # no output

    focused suites: 10 passed / 89 tests, then profile schedule 11 passed / 11 tests
    npx tsc --noEmit --pretty false: exit 0
    git diff --check: no output

Compatibility-floor fixture evidence:

    exact supported tag: v1.6.13 at 50045cc3
    current fixture commit: 245f6a0a
    command: ./gradlew :core:network:testDebugUnitTest --tests \
      'com.razumly.mvp.core.network.dto.CanonicalOnlyContractFloorTest'
    exact-tag result: 2 tests passed, BUILD SUCCESSFUL
    covered so far: event, team, match, user
    still required: organization, field, chat, billing, Wear OS, watchOS

Endpoint-inventory and alias-retirement evidence:

    inventory: docs/code-audit/leg-001-v1.6.13-contract.md
    exact canonical mobile paths: /api/billing/create_billing_intent and /api/billing/purchase-intent
    removed client route aliases: 10
    retained external callback alias: /api/boldsign/webhook
    focused suites: 4 passed / 44 tests

Canonical-response evidence:

    rg -n 'legacyFormat|withLegacyFields|withLegacyList|stripLegacyFieldsDeep' src --glob '*.{ts,tsx}'
    # no output

    rg -n --glob 'route.ts' '\$createdAt\s*:|\$updatedAt\s*:|\$id\s*:' src/app/api
    # no output

    open-ended list/detail/search/nested suites: 8 passed / 98 tests
    canonical browser-adapter suites: 12 suites / 62 tests after one invite-pagination boundary fix
    npx tsc --noEmit --pretty false: exit 0

Broad web validation from 310a9833:

    npx jest --runInBand: 459 suites / 2,944 tests passed
    npm run test:ci: exit 0
    API route coverage: 273 files; statements 66.15% (64% floor), branches 54.14% (52% floor), functions 65.44% (63% floor), lines 67.16% (65% floor)
    npm run build: Prisma validation/generation/check passed; Turbopack compiled in 11.1s; TypeScript passed; 122/122 static pages generated

The first build attempt stopped before compilation because the isolated worktree had no `DATABASE_URL`. Loading the canonical checkout's ignored local environment resolved Prisma configuration. The next attempt reached Next.js but Turbopack correctly rejected the worktree's out-of-root `node_modules` symlink; replacing only that ignored symlink with a local APFS copy-on-write dependency tree allowed the exact project build to pass. Neither setup correction changed tracked source.

## Interfaces and Dependencies

`src/server/requestParsing.ts` must own the generic parsing functions after `legacyFormat.ts` is removed:

    export const normalizeIdInput = (value: unknown): string | null
    export const parseDateInput = (value: unknown): Date | null

Names may be adjusted once all callers are inspected, but they must not include `Legacy` and must not accept dollar-prefixed object aliases implicitly.

The v1.6.13 fixture runner must use the repository's existing Kotlin serialization and Swift Codable dependencies. Do not add a second JSON library. The server response migration must use plain objects and existing domain-specific formatters; do not add a new universal serializer that can recreate the legacy semantics.

Revision note (2026-07-14 09:31Z): created this self-contained plan after tracing the central server helper, distributed team-delegate fallbacks, current mobile DTO aliases, and the v1.6.13 canonical event DTO. The staged order keeps every checkpoint executable while requiring oldest-supported-client proof before any external contract removal.

Revision note (2026-07-14 09:39Z): recorded completion of the generated-team-delegate slice and the profile schedule mock repair discovered during focused validation. The next milestone remains oldest-supported-client contract proof before changing HTTP response fields.

Revision note (2026-07-14 12:05Z): recorded the first exact-v1.6.13 canonical-only fixture checkpoint. It proves four core resource families but deliberately leaves the milestone open until every required mobile, Wear OS, and watchOS family has executable coverage.

Revision note (2026-07-14 13:55Z): recorded the first request-contract checkpoint. Generic date parsing now lives outside the legacy response module, the three handlers that formerly stripped obsolete fields reject them before database work, exact-tag route evidence classifies ten removable client aliases, and cross-realm JSON handling is covered by focused tests.

Revision note (2026-07-14 14:04Z): added the self-contained v1.6.13 resource and endpoint inventory, recorded removal of the ten unused client route aliases, and retained the externally configured BoldSign webhook alias. Canonical billing and retired lookup tests plus the route-absence contract pass 44 tests.

Revision note (2026-07-14 14:42Z): recorded the canonical-response slice, deletion of the universal legacy formatter, explicit nullable-end coverage at list/detail/search/nested boundaries, client-side canonical adapters, and the indirect event-template seed response discovered during source tracing. Broad and runtime validation remain intentionally open.

Revision note (2026-07-14 14:54Z): recorded the clean full Jest and coverage gates and the exact optimized build. The two preceding build stops were isolated-worktree setup failures (`DATABASE_URL` absent, then an out-of-root dependency symlink), and the successful retry used the canonical ignored environment plus a local dependency clone without tracked-source changes. Runtime browser and mobile/watch smoke tests remain open.
