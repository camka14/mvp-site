# Retire Persisted Organization Product And User Team ID Arrays

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with `PLANS.md` at the repository root. The earlier `plans/remove-user-teamids-execplan.md` records the completed change that made normalized team membership authoritative at runtime; this plan restates the relevant behavior and finishes the database cleanup, so the reader does not need that earlier plan to execute this one.

## Purpose / Big Picture

An organization-product relationship and a user-team relationship must each have one persisted answer. After this work, `Products.organizationId` will be the only stored organization-product ownership link, while active `TeamRegistrations` and `TeamStaffAssignments` rows will be the only stored user-team membership links. The legacy `Organizations.productIds` and `UserData.teamIds` PostgreSQL array columns will no longer exist.

Existing web, Android, iOS, and watch clients will continue to receive `productIds` on authorized organization responses and `teamIds` on user/profile responses. Those fields will be compatibility projections, meaning values computed from the normalized tables at response time rather than columns that can be written independently. A human can prove the result by creating or deactivating a product, changing a team roster, and observing the corresponding API arrays change even though `information_schema.columns` reports that the two legacy database columns are absent. Direct attempts to patch either derived field must be rejected and must not alter normalized rows.

This plan resolves audit finding `DATA-007` in `docs/code-audit/README.md`.

## Progress

- [x] (2026-07-14 07:31Z) Read `PLANS.md`, the `DATA-007` finding, the current Prisma models, prior migrations, and the earlier user-team and organization-team normalization plans.
- [x] (2026-07-14 07:31Z) Audited current web readers, writers, seed paths, affiliate scripts, route tests, generated Prisma output, and the normalized membership helper.
- [x] (2026-07-14 07:31Z) Audited current mobile organization, user, network DTO, repository, Room-cache, and UI consumers in the sibling `mvp-app` checkout.
- [x] (2026-07-14 07:31Z) Chose a two-stage compatibility and column-removal rollout because both legacy fields are required by the Prisma model and have no database defaults.
- [x] (2026-07-14 07:49Z) Incorporated an independent plan review that found omitted payment-failure, official-scheduling, social, participant-snapshot, admin-user, and admin-organization response paths, corrected the physical column nullability, and made stale-link classification executable.
- [x] (2026-07-14 08:05Z) Implemented the isolated compatibility database slice: the preparation migration, Prisma defaults and product index, regenerated client, read-only discrepancy audit, exact-key classification reconciliation, package command, and nine focused pure tests.
- [x] (2026-07-14 08:34Z) Implemented and validated the compatibility application across web and mobile: derived aliases, rejected/ignored writes, creation cleanup, failed-payment and official-scheduling replacements, rolling-deploy mobile cache handling, 25 passing focused web suites (221 tests), clean TypeScript, 39 passing mobile repository/auth tests, and iOS simulator compilation.
- [x] (2026-07-14 08:35Z) Built the compatibility stage as an optimized production release from a clean detached worktree against a fresh database replay of all 157 migrations. An authenticated Playwright runtime check proved canonical user-team projection overrides a deliberately stale array, authorized organization `productIds` exactly match canonical product rows, direct derived-field writes are rejected without drift, and the Store UI renders the canonical product. The in-app browser plugin could not bootstrap (`Cannot redefine property: process`), so the repository Playwright runner supplied the browser evidence.
- [x] (2026-07-14 12:22Z) Re-audited authoritative HEAD `42289945` after the broader code-audit work resumed. Commits `0e77dc28`, `4621725f`, and `07265770` are still present; production organization and user writes no longer persist the duplicate arrays; full-resource response aliases are derived from normalized rows; and no later commit, ignored `output/data007/` artifact, migration record, or plan evidence proves the preparation/compatibility release was deployed or its live audit completed.
- [x] (2026-07-14 12:24Z) Closed the final non-destructive proof gap by extracting the strict-mode exit decision into `getDuplicateRelationshipAuditExitCode(...)`. The focused audit-tool suite now has 13 passing tests and directly proves unclassified links and invalid ledger entries exit `2`, exact reconciled classifications exit `0`, non-strict mode remains observational, and a post-removal audit exits `0`; `git diff --check` also passed.
- [x] (2026-07-14 12:28Z) Retired the obsolete `cleanup:user-teamids` command and `scripts/cleanup-user-teamids-canonical.ts`. This was the last executable path that could still write the duplicate `UserData.teamIds` column independently; the supported pre-removal tool is now the read-only strict audit only.
- [x] (2026-07-14 13:58Z) Applied the additive preparation migration to the live database and verified its exact state: both legacy columns have empty-array defaults, both contain zero null rows, the product-ownership index exists, and the migration is recorded as applied. Strict live audits immediately before and after deployment both exited `0` with no unclassified, invalid, or orphan relationships.
- [ ] Deploy the compatibility application build, exercise its live web/mobile behavior, and observe that deployed build for one full 24-hour period.
- [ ] Implement and validate the final Prisma schema removal and destructive migration only after the compatibility release is proven live.
- [ ] Deploy the new application build before applying the destructive live migration, then verify web and current mobile behavior against the migrated database.
- [ ] Update `docs/code-audit/README.md` with commits, migration evidence, API/browser/mobile evidence, and the final `DATA-007` status.

## Surprises & Discoveries

- Observation: organization product hydration already ignores an empty `Organizations.productIds` array and lists products by `Products.organizationId`.
  Evidence: `src/lib/organizationService.ts` calls `productService.listProducts(organization.$id)`, and `src/lib/__tests__/organizationService.test.ts` explicitly verifies that a product loads when the organization row contains `productIds: []`.

- Observation: user-facing routes already replace stored `UserData.teamIds` with normalized membership in normal production operation, but `getCanonicalTeamIdsByUserIds(...)` falls back to the stored array when an injected client omits the normalized delegates.
  Evidence: `src/server/teams/teamMembership.ts` queries active `TeamRegistrations` and `TeamStaffAssignments` when both delegates exist, but lines near the current fallback query `userData.teamIds` when either delegate is missing. This makes incomplete tests and accidental partial clients capable of reviving the legacy source.

- Observation: stopping explicit array writes before changing the database is not safe with the current schema.
  Evidence: `prisma/schema.prisma` declares `UserData.teamIds String[]` and `Organizations.productIds String[]` without `@default([])`, while the physical PostgreSQL columns have neither defaults nor `NOT NULL`. Current user, child, guest, invite-placeholder, affiliate-organization, and organization creation paths therefore send empty arrays to satisfy the Prisma create contract and avoid physical nulls.

- Observation: organization creation and patch routes still expose a real product-array write path even though product creation never maintains it.
  Evidence: `src/app/api/organizations/route.ts` accepts and persists `productIds`, while `src/app/api/organizations/[id]/route.ts` includes it in `ORGANIZATION_MUTABLE_FIELDS`. In contrast, `src/app/api/products/route.ts` creates a product with `organizationId` and does not patch the organization array.

- Observation: the canonical product ownership column is not currently indexed even though both the storefront and the planned compatibility projection query it.
  Evidence: `Products.organizationId` is required in `prisma/schema.prisma`, but the `Products` model has no `@@index([organizationId])` and migration history contains no product-organization index.

- Observation: the mobile app's local `UserData.teamIds` is a cache projection used by profile, event, match, and team screens, not an independent server relationship source. The mobile organization store already lists products by organization ID.
  Evidence: `mvp-app/core/network/.../AuthDtos.kt` decodes `UserProfileDto.teamIds` as an optional response field, `UserDataDao.upsertUserWithRelations(...)` turns that response into local Room cross-references, and `BillingRepository.listProductsByOrganization(...)` calls `GET /api/products?organizationId=...`. `OrganizationApiDto.productIds` is optional and no current organization-detail production code uses it to list products.

- Observation: operational scripts are a meaningful part of the write surface.
  Evidence: dozens of `scripts/setup-*-affiliate-source.ts` files and `src/server/affiliateImports/service.ts` initialize `productIds: []`, `scripts/sync-affiliate-organizations-to-live.ts` copies the column, `scripts/cleanup-user-teamids-canonical.ts` rewrites the user array, and auth/guest/invite/seed paths initialize `teamIds: []`.

- Observation: the initial SQL migration made both legacy PostgreSQL columns nullable even though the current Prisma schema exposes them as non-null lists.
  Evidence: `prisma/migrations/20260204062343_init_appwrite_schema/migration.sql` declares `"UserData"."teamIds" TEXT[]` and `"Organizations"."productIds" TEXT[]` without `NOT NULL`. The preparation migration therefore must normalize any existing `NULL` to an empty array before relying on a database default.

- Observation: one event-registration visibility path still uses the stored user array as business data.
  Evidence: `loadViewerPaymentFailedRegistrations(...)` in `src/app/api/events/[eventId]/participants/route.ts` selects `UserData.teamIds` and uses those values to decide which failed team registrations belong to the viewer. A multiline select is not found by the earlier same-line search expression.

- Observation: official scheduling consumes `UserData.teamIds` in the event-team ID namespace, not merely as a response field.
  Evidence: `buildOfficials(...)` in `src/server/repositories/events.ts` copies `row.teamIds`, while `src/server/scheduler/officialStaffing.ts` uses those IDs to prevent a participant from officiating their own match or an overlapping match. Canonical membership IDs must be translated to the event-team rows whose `parentTeamId` points at those canonical teams.

- Observation: removing `teamIds` from `publicUserSelect` without deriving it at every caller would erase mobile cache state after social actions.
  Evidence: `src/server/socialGraph.ts`, the block/unblock routes under `src/app/api/users/social`, and `src/app/api/teams/[id]/invite-free-agents/route.ts` serialize selected or updated users directly. In the mobile audit checkout, `UserProfileDto.toUserDataOrNull()` maps an absent `teamIds` field to `emptyList()`, and `UserRepository.refreshCurrentUserFromSocialResponse(...)` immediately caches that value.

- Observation: full profile and organization resources are also returned outside the primary user and organization routes.
  Evidence: `buildEventParticipantSnapshot(...)` in `src/server/events/eventRegistrations.ts` returns full `UserData` rows, `src/app/api/admin/users/route.ts` returns full user rows, and the admin organization list, organization-verification list/update, and manager verification-sync routes return full organization rows. Partial nested organization summaries that explicitly select only `id`, `name`, or logo fields do not expose `productIds` today and must not gain it.

- Observation: the first executable local audit proves that strict classification is necessary rather than theoretical.
  Evidence: the read-only local run reported 4 legacy-only live-team links and 4 orphan IDs; non-strict mode exited `0`, while strict mode exited `2` with 4 unclassified links and 0 invalid classification entries. No detailed report was written during this check.

## Decision Log

- Decision: Treat `Products.organizationId` as the only persisted organization-product ownership source and the union of active `TeamRegistrations` plus active `TeamStaffAssignments` as the only persisted user-team membership source.
  Rationale: these are the tables all current product and membership mutations already maintain, and each relationship has the correct row-oriented indexes and status fields there.
  Date/Author: 2026-07-14 / Codex

- Decision: Preserve `Organization.productIds` and `UserData.teamIds` in web and mobile response/domain types, but compute them at trusted server boundaries.
  Rationale: the fields remain useful to existing clients, especially mobile UI and local cache code. A computed response alias does not create database drift because no caller can persist it independently.
  Date/Author: 2026-07-14 / Codex

- Decision: Do not expose computed `productIds` on public organization summaries that do not expose internal organization fields today.
  Rationale: normalization should preserve the current authorization boundary, not widen public metadata. Authorized owner, staff, and admin detail/list responses receive the compatibility alias; anonymous and signed-in outsider summaries remain curated.
  Date/Author: 2026-07-14 / Codex

- Decision: Remove the `userData.teamIds` fallback from `getCanonicalTeamIdsByUserIds(...)` and fail explicitly when a supplied data client lacks normalized membership delegates.
  Rationale: silently reading the soon-to-be-removed array hides incomplete mocks and schema mismatches. Production Prisma always provides the normalized delegates, so tests should model that contract rather than revive legacy state.
  Date/Author: 2026-07-14 / Codex

- Decision: Do not automatically turn an array-only user-team link into an active player or staff row.
  Rationale: the old array does not say whether the user was a player, manager, head coach, assistant coach, removed member, or simply stale. Automatically choosing a role could grant roster or privacy access. The audit will identify discrepancies; legitimate missing membership must be repaired through the existing team-management workflow with an explicit role, while stale entries are intentionally discarded when the column is dropped.
  Date/Author: 2026-07-14 / Codex

- Decision: Do not backfill `Organizations.productIds` into `Products.organizationId`.
  Rationale: product records already require `organizationId`, product reads and writes already use it, and a conflicting organization array is the less trustworthy side. The audit records missing, foreign, or orphan array values, but the product row wins without mutation.
  Date/Author: 2026-07-14 / Codex

- Decision: Use two deployable stages, separated by a live audit and a 24-hour observation window.
  Rationale: a preparation migration can add empty-array defaults so the compatibility application stops writing the arrays while old database columns still exist. The later application build can stop knowing about the columns before the destructive migration drops them. This avoids a window in which creates fail and gives a clean rollback point before column removal.
  Date/Author: 2026-07-14 / Codex

- Decision: Add an index on `Products.organizationId` in the additive preparation migration.
  Rationale: both the existing product list and the new batched compatibility projection filter on this column. Removing the array should not replace a cheap direct lookup with repeated full-table scans.
  Date/Author: 2026-07-14 / Codex

- Decision: Keep mobile `UserData.teamIds`, `Organization.productIds`, and the Room `UserData.teamIds` column during this work, but remove the unused `teamIds` member from the mobile outbound `UserUpdateDto`.
  Rationale: the domain and Room fields are derived client cache state used throughout the app; removing them is a separate client architecture change. The outbound field is unused by current production calls and removing it prevents a future mobile caller from attempting the already-forbidden server mutation.
  Date/Author: 2026-07-14 / Codex

- Decision: Treat every full user/profile resource boundary as responsible for attaching canonical `teamIds` before privacy formatting or serialization.
  Rationale: removing the field from the shared Prisma select prevents accidental database reads, but it also means main user routes, auth payloads, social mutations, event participant snapshots, free-agent lists, and admin user lists must all use the same computed projection. Partial person summaries that never exposed `teamIds` remain unchanged.
  Date/Author: 2026-07-14 / Codex

- Decision: Derive scheduling membership in event-team IDs from normalized canonical membership plus current event roster rows.
  Rationale: matches reference event-team IDs, while `TeamRegistrations` and `TeamStaffAssignments` reference canonical team IDs. Expanding through `EventTeams.parentTeamId` and merging active event-specific participant/staff rows preserves self-officiating and overlap protection without reading the legacy user array.
  Date/Author: 2026-07-14 / Codex

- Decision: Use an ignored, read-only classification ledger for human-confirmed stale legacy-only links.
  Rationale: a database-only audit cannot infer that a live-team link was reviewed and intentionally classified as stale. An exact-key ledger under `output/data007/` lets strict mode distinguish reviewed stale links from new or unreviewed links without modifying production data or committing operational IDs.
  Date/Author: 2026-07-14 / Codex

- Decision: Normalize existing physical `NULL` arrays to empty arrays in the preparation migration, then install defaults.
  Rationale: the physical columns are nullable even though Prisma treats them as lists. Converting only `NULL` values is relationship-neutral, keeps an older binary safe during the compatibility rollout, and leaves every non-null legacy value intact for the discrepancy audit.
  Date/Author: 2026-07-14 / Codex

- Decision: Preserve the current cached mobile team IDs when a social response omits `teamIds`, while replacing them when the server supplies the computed field.
  Rationale: the server contract still requires the field, but this defensive merge prevents one incomplete response from overwriting valid Room membership state with an empty list during a rolling deployment.
  Date/Author: 2026-07-14 / Codex

- Decision: Keep `DATA-007` operationally open at HEAD `42289945` and do not author the destructive removal migration during this pass.
  Rationale: the compatibility implementation is source-complete, but the plan's safety contract requires an applied preparation migration, a strict live audit with every ambiguous live-team link repaired or exactly classified, and a full 24-hour error-free observation window. None of those deployment facts is present in the repository or ignored local artifacts, so a drop migration would outrun the only evidence that can prove no legitimate relationship is lost.
  Date/Author: 2026-07-14 / Codex

- Decision: Retire the mutating `cleanup:user-teamids` operation during the compatibility stage instead of waiting for physical column removal.
  Rationale: leaving an operator command capable of rewriting `UserData.teamIds` would preserve a second writable answer during the observation window and undermine the audit's snapshot. Legitimate membership repairs must use normalized team-management workflows, while stale links are classified in the ignored read-only audit ledger; neither operation requires mutating the legacy array.
  Date/Author: 2026-07-14 / Codex

## Outcomes & Retrospective

The additive preparation and audit tooling are committed in web commit `0e77dc28` with migration `20260714080000_prepare_duplicate_relationship_array_retirement`. The compatibility application is committed in web commit `4621725f`, and the mobile rolling-deploy protections are committed in mobile commit `2124ce63`. Validation for this stage includes 13 passing audit-tool tests, 25 passing focused web suites with 221 tests, a clean web TypeScript check, 39 passing mobile repository/auth tests, successful iOS simulator compilation, Prisma validation/generation/client verification for the preparation slice, local non-strict and strict audit execution, and clean scoped whitespace checks. The 13-test rerun at HEAD `42289945` specifically covers the strict exit code that guards the later destructive milestone.

The local read-only audit reported 250 exact organization-product projections, no normalized-only or conflicting product links, 122 exact user-team projections, 101 normalized-only user-team links, four legacy-only links requiring classification, four orphan IDs, no contradictions, and no invalid ledger entries. Strict mode correctly exited `2` while those four local links remained unclassified. That was the pre-deployment local state.

At 2026-07-14 13:57Z, live `prisma migrate deploy` applied `20260714080000_prepare_duplicate_relationship_array_retirement` together with the five other already-reviewed pending migrations. A live schema query then proved the two legacy columns still exist, each has `ARRAY[]::text[]` as its default, neither contains a null row, and `Products_organizationId_idx` exists. The ignored strict reports immediately before and after the migration both exited `0` and reported 250 exact organization-product projections, 50 exact user projections, 41 normalized-only user-team links, zero legacy-only live links, zero unclassified or invalid classifications, one contradicted legacy link, and zero orphan IDs. The compatibility application deployment and its 24-hour observation window remain outstanding, so `DATA-007` stays open and no destructive migration may be authored yet. Remaining work is to deploy and smoke the compatibility application, observe it for 24 hours, then implement and deploy the field-free application before the destructive column-removal migration. At full completion, record the removal migration name, live schema query, browser observations, mobile/emulator observations, and any rollback or retry that occurred.

The clean release runtime used a temporary isolated local database rather than the existing development database because that database contained migrations from another active worktree. All 157 migrations applied cleanly from zero. The final Playwright check passed in 7.9 seconds and captured the authenticated organization Store with the canonical runtime product at `/tmp/data007-runtime-store.png`; the release server emitted no errors during the flow.

## Context and Orientation

The repository root is `/Users/elesesy/StudioProjects/mvp-site`. Prisma describes PostgreSQL storage in `prisma/schema.prisma`; generated client code is committed under `src/generated/prisma` and must be regenerated with `npm run prisma:generate` whenever the schema changes.

A normalized relationship is stored as one row per relationship instead of as an array copied onto another record. Products are rows in the `Products` model. Each product has a required `organizationId`, and `src/app/api/products/route.ts` creates and lists products through that field. The duplicate `Organizations.productIds` array is currently accepted by organization create and patch routes even though product mutations do not maintain it.

Canonical teams are stored in the Prisma `Teams` model, which maps to the physical `"Teams"` table. Player membership is stored in `TeamRegistrations`; staff membership is stored in `TeamStaffAssignments`. Only rows whose `status` is `ACTIVE` belong in the user compatibility projection. The prior `plans/remove-user-teamids-execplan.md` changed normal readers and writers so `src/server/teams/teamMembership.ts` derives user team IDs from these tables and `src/app/api/users/[id]/route.ts` rejects a direct `teamIds` patch. The remaining duplicate is the physical `UserData.teamIds` column plus fallback, initialization, cleanup, and test scaffolding around it.

User compatibility projection starts in `src/server/teams/teamMembership.ts`. The complete current full-user response inventory is: `src/server/authSessionPayload.ts` and the auth endpoints under `src/app/api/auth`; `src/app/api/users/route.ts`; `src/app/api/users/[id]/route.ts`; `src/server/socialGraph.ts` and every route under `src/app/api/users/social`; `src/server/events/eventRegistrations.ts`, whose `buildEventParticipantSnapshot(...)` result is reused by event detail, participant, and free-agent responses; `src/app/api/teams/[id]/invite-free-agents/route.ts`; and `src/app/api/admin/users/route.ts`. Every row from those boundaries must receive derived `teamIds` before privacy formatting or serialization. Partial person records such as family-child summaries, compliance rows, message authors, and organization-user finance summaries never exposed the full profile contract and remain unchanged. Web and mobile consumers include `src/lib/viewerTeamHighlights.ts`, profile screens, event schedule/bracket screens, social actions, and the mobile Room profile cache.

Two runtime business paths also need normalized membership independently of response compatibility. `loadViewerPaymentFailedRegistrations(...)` in `src/app/api/events/[eventId]/participants/route.ts` determines which failed team checkouts belong to the viewer. `buildOfficials(...)` in `src/server/repositories/events.ts` supplies event-team IDs to `src/server/scheduler/officialStaffing.ts` for self-officiating and overlap checks. Neither may read the removed column.

Organization compatibility projection starts in the new `src/server/organizationProductIds.ts`. The complete current full-organization response inventory is: owner/staff list and create responses in `src/app/api/organizations/route.ts`; authorized detail and patch responses in `src/app/api/organizations/[id]/route.ts`; the manager verification refresh in `src/app/api/organizations/[id]/verification/sync/route.ts`; `src/app/api/admin/organizations/route.ts`; and both the list and patch routes under `src/app/api/admin/organization-verifications`. `src/lib/organizationService.ts` and the `Organization` interface in `src/types/index.ts` retain the compatibility field. Public summaries created by `toPublicOrganizationListRow(...)` and `toPublicOrganizationSummary(...)`, plus partial nested organization selects in event, field, team, and rental responses, intentionally omit internal fields and must continue to omit `productIds`.

Required-array initialization historically appeared in user creation/reset paths including `src/app/api/auth/register/route.ts`, Google and Apple auth routes, `src/app/api/family/children/route.ts`, `src/server/inviteUsers.ts`, `src/server/publicGuestRegistration.ts`, `src/app/api/auth/account/route.ts`, and `prisma/seed.e2e.ts`. Product-array initialization historically appeared in organization creation, `src/server/affiliateImports/service.ts`, `prisma/seed.e2e.ts`, affiliate setup scripts, and `scripts/sync-affiliate-organizations-to-live.ts`. Those production writes were removed by the compatibility application. The remaining `scripts/cleanup-user-teamids-canonical.ts` writer and its `cleanup:user-teamids` package command were retired during the final compatibility hardening so the duplicate column cannot drift during the live observation window.

The sibling mobile repository is normally `/Users/elesesy/StudioProjects/mvp-app`; audit work may be running in a worktree such as `/Users/elesesy/StudioProjects/mvp-app-critical-audit`, so the implementer must use the active audit branch rather than editing two copies. Mobile response DTOs live in `core/network/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/AuthDtos.kt` and the private `OrganizationApiDto` in `core/repository-impl/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/BillingRepository.kt`. Mobile domain/cache models live in `core/model/.../UserData.kt`, `core/model/.../Organization.kt`, and `core/database/.../UserDataDao.kt`. `UserProfileDto.toUserDataOrNull()` currently turns a missing `teamIds` field into an empty list, while `UserRepository.refreshCurrentUserFromSocialResponse(...)` caches social mutation responses. Preserve the derived cache fields and harden that social merge against an omitted field.

## Plan of Work

### Milestone 1: Ship a compatibility release that no longer trusts or mutates the arrays

At the end of this milestone, all API behavior will come from normalized rows, new records will succeed without callers providing the duplicate arrays, existing clients will still decode the same response fields, and the physical columns will remain available for a safe pre-removal audit.

Create `prisma/migrations/20260714080000_prepare_duplicate_relationship_array_retirement/migration.sql`. In one transaction, update only rows where `"Organizations"."productIds" IS NULL` or `"UserData"."teamIds" IS NULL` to `ARRAY[]::TEXT[]`, then set `DEFAULT ARRAY[]::TEXT[]` on both columns. Preserve every non-null array value for the audit. Create `"Products_organizationId_idx"` on `"Products"("organizationId")` if that index does not exist. Update the two array fields in `prisma/schema.prisma` to include `@default([])` for this first release and add `@@index([organizationId])` to `Products`, then regenerate Prisma. This migration is additive and lets new code omit the arrays while an older application binary can still run during rollout. The migration test must start with one null row for each legacy column and prove it becomes an empty array while a non-empty row remains unchanged.

Add `src/server/organizationProductIds.ts` and `src/server/__tests__/organizationProductIds.test.ts`. Implement one batched query by organization IDs, not one query per organization. Include every product linked by `Products.organizationId`, including inactive products, because this helper represents relationship identity rather than the storefront's active-product filter. Normalize and deduplicate IDs, return a map entry for every requested organization, and sort IDs deterministically so a response does not reorder between requests.

Use that helper at every full-organization resource boundary named in Context and Orientation: `src/app/api/organizations/route.ts`, `src/app/api/organizations/[id]/route.ts`, `src/app/api/organizations/[id]/verification/sync/route.ts`, `src/app/api/admin/organizations/route.ts`, `src/app/api/admin/organization-verifications/route.ts`, and `src/app/api/admin/organization-verifications/[id]/route.ts`. Batch lists once after pagination; never query products once per organization. For a newly created organization return `productIds: []`; for a patch or verification-sync response load the current computed IDs after the write. Keep anonymous, outsider, and deliberately partial nested projections unchanged. In `src/lib/organizationService.ts`, keep mapping the compatibility field and keep loading actual products through `productService.listProducts(organization.$id)`; when a trusted response omitted the alias but full products were hydrated, it may fill `productIds` from those hydrated product rows as a defensive client fallback. It must never send `productIds` back in a create or patch payload.

Remove `productIds` from the organization create schema's persisted data and from `ORGANIZATION_MUTABLE_FIELDS`. A legacy create payload may be accepted and ignored because the route currently uses a permissive envelope, but a detail patch containing `productIds` must return a clear derived-field error and must not call Prisma update. Add route tests for both behaviors and for computed authorized responses.

In `src/server/teams/teamMembership.ts`, remove both fallback branches that query `userData.teamIds`. Require `teamRegistrations.findMany` and `teamStaffAssignments.findMany`, query only `ACTIVE` rows, deduplicate IDs that occur in both tables, and sort each user's final IDs deterministically. Change `withDerivedCanonicalTeamIds` so its generic input only needs an `id`; the selected Prisma user row must no longer contain a `teamIds` property. Remove `teamIds: true` from `publicUserSelect` in `src/server/userPrivacy.ts`, and adjust the TypeScript aliases so privacy formatting accepts a user row after the computed field has been attached.

Apply `withDerivedCanonicalTeamIds(...)` at every full-user boundary named in Context and Orientation. In `src/server/socialGraph.ts`, derive both the actor and related user lists inside the same transaction/client context before returning them; every send, accept, decline, remove, follow, and unfollow result must carry the actor's derived array. In the two block routes, derive the updated actor before serialization. In `src/server/events/eventRegistrations.ts`, derive the batched `users` collection returned by `buildEventParticipantSnapshot(...)`; this covers every API route that reuses that snapshot. In `src/app/api/teams/[id]/invite-free-agents/route.ts`, derive before `applyUserPrivacyList(...)`. In `src/app/api/admin/users/route.ts`, derive the paginated rows once before adding auth metadata. Existing user, user-by-id, and auth payload projection remains, but their selects and mocks must no longer depend on the stored field. No response path may issue one membership query per user.

Replace the business read in `loadViewerPaymentFailedRegistrations(...)` in `src/app/api/events/[eventId]/participants/route.ts`. Load the viewer's active canonical team IDs with `getCanonicalTeamIdsByUserIds(...)`, then load event-team rows for the requested event whose `parentTeamId` is one of those canonical IDs. Build one deduplicated set containing the canonical IDs and matching event-team IDs, and use that set in the existing `registrantId`, `eventTeamId`, and `parentId` predicates. Do not read or accept `UserData.teamIds`. Add regression coverage showing a contradictory stored array grants no failed-payment visibility and an active canonical membership still finds a failed registration recorded under its child event-team ID.

Replace the official-scheduling read in `src/server/repositories/events.ts`. For the event's official user IDs, batch-load active canonical membership through `getCanonicalTeamIdsByUserIds(...)`. Translate those canonical IDs into loaded event-team IDs when an event team's `parentTeamId` or legacy direct `id` matches. Merge current event-specific participation from the loaded event-team roster fields, active participant `EventRegistrations`, and active `EventTeamStaffAssignments`, because these sources already use event-team IDs. Pass only those derived event-team IDs to `buildOfficials(...)`; never pass a raw Prisma user array. Keep `src/server/scheduler/officialStaffing.ts` in the event-team namespace. Add a repository regression proving parent-team expansion and contradictory-array rejection, plus scheduler regressions proving a participant cannot officiate their own or an overlapping match and an unrelated official remains eligible.

Remove explicit `teamIds: []` from all Prisma `UserData` create/reset calls and remove explicit `productIds: []` from all Prisma `Organizations` create/upsert calls, seed data, affiliate import data, and affiliate setup scripts. Remove `productIds` from `ORGANIZATION_COLUMNS` in `scripts/sync-affiliate-organizations-to-live.ts`; product rows already synchronize through their own ownership contract and organization sync must not copy the duplicate column. Leave unrelated fields named `teamIds` on `Events`, `Divisions`, scheduling snapshots, and response DTOs untouched.

Add `scripts/audit-duplicate-relationship-arrays.ts`, `scripts/__tests__/audit-duplicate-relationship-arrays.test.ts`, and an `audit:duplicate-relationships` package command. The script must be read-only with respect to the database. It must use raw SQL so it can run during the compatibility stage, check `information_schema.columns` before querying, and exit successfully with an `alreadyRemoved` result after the final migration. It must write a timestamped JSON report under ignored `output/data007/` when `--output` is supplied and print aggregate counts without names or email addresses. It accepts an optional `--classifications <path>` pointing to an ignored JSON ledger under the same directory; it reads but never creates or mutates that ledger.

For products, the audit must compare normalized and deduplicated organization array IDs with product rows grouped by `organizationId`, reporting exact matches, IDs missing from the legacy array, legacy IDs that do not exist, and legacy IDs owned by a different organization. For user teams, normalize direct canonical team IDs and event-team IDs whose `parentTeamId` points to a canonical team, compare them with the union of active registration and staff rows, and report exact matches, normalized-only links, legacy-only links, orphan IDs, and legacy links contradicted by a `LEFT` or `REMOVED` normalized row. A classification entry is keyed by the exact `userId`, raw `legacyTeamId`, and resolved `canonicalTeamId` from the report and may use only `STALE_CONFIRMED`; it also records `reviewedAt`, `reviewedBy`, and a short reason. A matching current legacy-only live-team link becomes `classifiedStale`; a missing, duplicate, malformed, or mismatched ledger entry is reported as invalid; a newly appearing link remains unclassified. `--strict` exits `2` when unclassified live-team links or invalid entries remain, `1` for configuration/query failures, and `0` otherwise. The script must never create, update, or delete a relationship.

Update or add tests in every suite named by the focused command below. Incomplete Prisma mocks must gain normalized membership delegates instead of user-array fallback data. Add a focused test proving the helper throws when normalized delegates are absent, a test proving duplicate player/staff membership produces one sorted ID, and tests proving every full user and organization response inventory item computes its alias from normalized rows while ignoring contradictory stored arrays. The social route tests must cover GET plus every mutation family, and the block/unblock suites must assert the returned actor carries canonical `teamIds`. The admin, verification-sync, participant-snapshot, free-agent, payment-failure, repository, and official-scheduling regressions are required rather than relying on type-check failures to discover omissions.

In the active `mvp-app` audit branch, remove `teamIds` only from outbound `UserUpdateDto` in `core/network/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/AuthDtos.kt`. Do not remove `teamIds` from `UserProfileDto`, `UserData`, `UserDataDTO`, Room, or UI state. Do not remove `productIds` from organization response/domain models. In `UserRepository.refreshCurrentUserFromSocialResponse(...)`, distinguish an absent DTO field from a server-supplied empty list: preserve the current cached team IDs only when `responseUser.teamIds == null`, and replace them when the response contains a list, including an intentionally empty list. Add `UserRepositoryHttpTest` cases for both branches and an assertion that profile patch JSON contains no `teamIds`. Retain tests showing a server-derived response refreshes the local profile. The organization detail/store tests must continue proving products load through `listProductsByOrganization(organizationId)`.

Commit the site and mobile compatibility changes separately. Deploy `20260714080000_prepare_duplicate_relationship_array_retirement` first and verify it is recorded as applied; only then deploy the compatibility application build. Verify organization/user creation, login, team membership, social mutation refresh, failed-payment visibility, official scheduling, and product listing before moving on. Do not reverse this order because the compatibility build omits fields whose database defaults are installed by the preparation migration.

### Milestone 2: Audit and reconcile the live legacy data

At the end of this milestone, a timestamped ignored report will explain every current array discrepancy, no legitimate membership will exist only in the legacy user array, and live logs will show that the compatibility build is stable for 24 hours without relying on either persisted array.

Run the audit first against the ordinary local database and then against `DATABASE_URL_LIVE`. Do not print the connection string. Save timestamped reports and classification ledgers under ignored `output/data007/` and record only aggregate counts and report timestamps in this plan. Product discrepancies require no database backfill: `Products.organizationId` wins, foreign/orphan array entries are stale, and normalized-only products are already visible through the new projection.

Every legacy-only user-team entry requires classification because the old array contains no role. Begin with a non-strict report. For each live-team entry, inspect the ordinary team-management UI and normalized rows. If the user should still belong, use the normal authorized workflow to add the correct player or staff role and save; do not add that entry to the stale ledger. If the user should not belong, copy the exact three-key tuple from the report into the ignored classification ledger with disposition `STALE_CONFIRMED`, reviewer, review timestamp, and reason. If a normalized `LEFT` or `REMOVED` row exists, do not reactivate it; the audit classifies that link as contradicted automatically. Rerun the audit with `--classifications` and `--strict`. A repaired entry disappears from legacy-only results because an active normalized row now exists, a reviewed stale entry moves to `classifiedStale`, and a new or mistyped entry remains unclassified or invalid. Continue until exit status `0`, then record aggregate repaired, classified-stale, contradicted, orphan, and invalid counts in `Surprises & Discoveries` without committing either operational file.

During the 24-hour observation window, inspect application errors for organization/user create failures, Prisma unknown-column errors, missing team membership, social cache resets, incorrect failed-payment visibility, official-scheduling conflicts, and product-store regressions. Exercise current web and mobile builds against the live-compatible server. Before deployment, record the current public `/api/app-version` response as the compatibility baseline rather than hard-coding a version that may have changed; after deployment, the same current client and one immediately preceding compatible client payload must still decode because the response aliases remain present. Do not begin the destructive milestone if errors, invalid classification entries, or unclassified audit rows remain.

### Milestone 3: Remove the physical columns

At the end of this milestone, neither legacy column will exist in Prisma or PostgreSQL, generated client code will not expose it as writable data, and the compatibility response fields will still be produced from normalized rows.

Only after Milestones 1 and 2 are complete, add `prisma/migrations/20260715080000_remove_duplicate_relationship_arrays/migration.sql`. Wrap the two `ALTER TABLE ... DROP COLUMN IF EXISTS ...` statements in one transaction and set a short local lock timeout so deployment fails and rolls back instead of waiting indefinitely for a busy table. The migration must not insert relationship rows or copy an array into a normalized table.

Remove `productIds` from the Prisma `Organizations` model and `teamIds` from the Prisma `UserData` model. Regenerate committed Prisma output. Confirm the obsolete `cleanup:user-teamids` command remains absent. Keep the new read-only audit command because it safely reports `alreadyRemoved` after the drop. Run the broad field searches and the explicit full-resource inventory searches in Concrete Steps; do not rely on a same-line `userData.*teamIds` expression, which misses multiline Prisma selects. Every remaining web `teamIds` or `productIds` occurrence must be classified as a computed compatibility field, event/division relationship, scheduler-domain field, mobile cache projection, or fixture assertion.

Add `src/lib/__tests__/duplicateRelationshipArrayMigration.test.ts` to assert the preparation migration normalizes only null arrays, installs defaults and the product ownership index, the final schema omits the two model fields while retaining `Products.organizationId` and its index, the final migration uses a transaction and `DROP COLUMN IF EXISTS`, and neither migration inserts or rewrites relationship rows. Add `scripts/test-duplicate-relationship-array-migration.mjs`, modeled on the repository's loopback-only migration fixture scripts. It must refuse non-loopback database URLs, create an isolated temporary schema with minimal organization, product, user, team, registration, staff, and event-team tables, seed null, empty, and contradictory non-empty legacy arrays, apply the preparation and removal SQL, assert null arrays became empty before removal while non-null arrays and all normalized rows remained unchanged, assert the product index exists and the two columns are gone, reapply the removal SQL to prove safe retry, and drop its fixture schema in `finally`.

Build the application with the field-free Prisma client and deploy that build while the live columns still exist; PostgreSQL tolerates unused extra columns. Smoke login, user lookup, organization detail, team membership, and products. Only then run `prisma migrate deploy` against live to drop the columns. Once the migration succeeds, do not roll the application back to a build whose generated Prisma client selects or writes the removed fields.

### Milestone 4: Prove the user-visible behavior and close the finding

At the end of this milestone, automated tests, SQL evidence, a browser flow, and a mobile flow will prove the normalization rather than merely show that TypeScript compiles.

In a browser, sign in as an organization manager. Load an organization store, create or identify a product, and verify the product appears through the product-by-organization list. Fetch the authorized organization detail response and verify its computed `productIds` contains exactly the IDs returned by `GET /api/products?organizationId=...`. Deactivate a product and verify it disappears from the active storefront while remaining in the relationship alias if the alias intentionally includes inactive rows. Attempt a `productIds` organization patch and observe the derived-field rejection with no data change.

Use an existing test team and test user. Add the user as a player or staff member through the ordinary team UI, fetch the user/profile response, and verify the canonical team ID appears once in `teamIds`. Remove or deactivate that membership and verify it disappears. Attempt a direct user `teamIds` patch and observe the existing rejection. Confirm public/minor privacy behavior still hides team IDs where it did before.

Exercise one social action such as follow or accept-friend and inspect its response; the returned current user must still contain the same computed `teamIds`. Load an event participant snapshot and a team free-agent list containing that user and verify those full profile objects also contain the computed alias subject to existing privacy rules. In an admin session, load the admin user list and the organization and verification queues and verify their full resources contain the same computed aliases without per-row request failures.

For an event with a canonical team copied to an event-team row, force or use a failed team checkout and verify a normalized manager/player can see the failed registration while a user named only in a contradictory legacy array cannot. Generate or preview a schedule with an official who is also on an event team; verify that official is not assigned to their own or an overlapping team match, while an unrelated official remains assignable.

On Android emulator or iOS simulator, authenticate with the current app build, open Profile and a team/event surface that uses current-user membership, and verify team membership loads after a refresh. Perform a social action and verify membership remains present after the response is cached; use the unit test for the omitted-field rolling-deploy case because a correct current server always supplies the alias. Open an organization store and verify products load. Capture application logs and confirm there is no JSON decode failure, fatal exception, Room error, membership reset, or repeated failed profile patch. A watch auth/profile contract test is sufficient if a paired watch runtime is unavailable because watch responses use the same computed profile alias.

Finally, query `information_schema.columns` for the two exact table/column pairs and expect zero rows. Update the audit ledger only after this live proof and all tests pass.

## Concrete Steps

Work from `/Users/elesesy/StudioProjects/mvp-site` unless a command explicitly changes directories. Preserve unrelated dirty-worktree changes and stage only files belonging to this plan.

Before editing, capture the current state and repeat the source audit:

    git status --short
    rg -n '\bproductIds\b' prisma src scripts e2e --glob '!src/generated/**'
    rg -n '\bteamIds\b' prisma src scripts e2e --glob '!src/generated/**'
    rg -n '\b(publicUserSelect|currentUserSelect)\b|userData\.(findMany|findUnique|update)' src/app/api src/server --glob '*.ts' --glob '!**/__tests__/**'
    rg -n 'organizations\.(findMany|findUnique|update)|withLegacy(List|Fields)' src/app/api/organizations src/app/api/admin --glob 'route.ts'

Review every result against the two complete response inventories in Context and Orientation. The broad searches are intentionally noisy: a false positive can be classified, while a multiline stored-field read missed by a narrow expression would survive the destructive migration.

After the compatibility implementation, regenerate and validate Prisma, run the focused suites serially, then type-check:

    npm run prisma:check
    npx jest --runInBand --runTestsByPath \
      scripts/__tests__/audit-duplicate-relationship-arrays.test.ts \
      src/server/__tests__/organizationProductIds.test.ts \
      src/server/teams/__tests__/teamMembership.test.ts \
      src/server/events/__tests__/eventRegistrations.test.ts \
      src/server/repositories/__tests__/events.officialMemberships.test.ts \
      src/server/scheduler/__tests__/officialStaffingModes.test.ts \
      src/app/api/organizations/__tests__/organizationsRoute.test.ts \
      src/app/api/organizations/__tests__/organizationByIdRoute.test.ts \
      'src/app/api/organizations/[id]/verification/sync/__tests__/route.test.ts' \
      src/app/api/admin/organizations/__tests__/route.test.ts \
      src/app/api/admin/organization-verifications/__tests__/route.test.ts \
      'src/app/api/admin/organization-verifications/[id]/__tests__/route.test.ts' \
      src/app/api/users/__tests__/usersRoute.test.ts \
      src/app/api/users/__tests__/userByIdRoute.test.ts \
      src/app/api/users/__tests__/socialRoutes.test.ts \
      src/server/__tests__/socialGraph.test.ts \
      src/app/api/users/social/blocked/__tests__/route.test.ts \
      'src/app/api/users/social/blocked/[targetUserId]/__tests__/route.test.ts' \
      src/app/api/admin/users/__tests__/route.test.ts \
      'src/app/api/teams/[id]/invite-free-agents/__tests__/route.test.ts' \
      src/app/api/events/__tests__/participantsRoute.test.ts \
      src/lib/__tests__/organizationService.test.ts \
      src/app/api/auth/__tests__/authRoutes.test.ts \
      src/app/api/auth/google/mobile/__tests__/googleMobileRoute.test.ts \
      src/app/api/auth/apple/mobile/__tests__/appleMobileRoute.test.ts
    npx tsc --noEmit --pretty false
    git diff --check

Expect Jest to report 25 suites passed and 0 failed, TypeScript to exit `0`, and `git diff --check` to print nothing. If a suite is split or renamed during implementation, update this command and the expected suite count in the plan before proceeding.

Run the read-only audit locally, classify any local discrepancies, and require strict mode to pass. Then load the live URL through the repository's normal secret-loading method and repeat the non-strict, review, and strict sequence. Never paste either URL into logs or this plan. The following names are examples; use the same timestamp for each report and its ledger.

    stamp="$(date -u +%Y%m%dT%H%M%SZ)"
    npm run audit:duplicate-relationships -- --output "output/data007/local-${stamp}-before-drop.json"
    npm run audit:duplicate-relationships -- \
      --classifications "output/data007/local-${stamp}-classifications.json" \
      --strict \
      --output "output/data007/local-${stamp}-strict.json"
    DATABASE_URL="$DATABASE_URL_LIVE" npm run audit:duplicate-relationships -- \
      --output "output/data007/live-${stamp}-before-drop.json"
    DATABASE_URL="$DATABASE_URL_LIVE" npm run audit:duplicate-relationships -- \
      --classifications "output/data007/live-${stamp}-classifications.json" \
      --strict \
      --output "output/data007/live-${stamp}-strict.json"

If a non-strict report has no legacy-only live-team links, use a valid ledger with an empty `entries` array. Expect both strict commands to exit `0` and report `unclassifiedLegacyOnlyLiveTeamLinks: 0` and `invalidClassificationEntries: 0`. Exit `2` means review or ledger correction remains; it is not permission to bypass the gate.

For the mobile compatibility edit, work in the active audit worktree and run:

    ./gradlew :composeApp:testDebugUnitTest \
      --tests 'com.razumly.mvp.core.data.repositories.UserRepositoryHttpTest' \
      --tests 'com.razumly.mvp.core.data.repositories.UserRepositoryAuthTest' \
      --tests 'com.razumly.mvp.core.data.repositories.BillingRepositoryHttpTest' \
      --tests 'com.razumly.mvp.organizationDetail.OrganizationDetailComponentTest'
    ./gradlew :composeApp:compileKotlinIosSimulatorArm64
    git diff --check

Expect the four selected mobile test classes to pass, Gradle to print `BUILD SUCCESSFUL`, the iOS simulator compilation to succeed, and `git diff --check` to print nothing. The `UserRepositoryHttpTest` assertions must prove that a present empty list clears cached membership, a present non-empty list replaces it, an absent field preserves it, and outbound profile JSON has no `teamIds` key.

After the final removal implementation, repeat the focused tests and add the migration tests:

    npx jest --runInBand --runTestsByPath \
      src/lib/__tests__/duplicateRelationshipArrayMigration.test.ts \
      scripts/__tests__/audit-duplicate-relationship-arrays.test.ts \
      src/server/__tests__/organizationProductIds.test.ts \
      src/server/teams/__tests__/teamMembership.test.ts \
      src/server/events/__tests__/eventRegistrations.test.ts \
      src/server/repositories/__tests__/events.officialMemberships.test.ts \
      src/server/scheduler/__tests__/officialStaffingModes.test.ts \
      src/app/api/organizations/__tests__/organizationsRoute.test.ts \
      src/app/api/organizations/__tests__/organizationByIdRoute.test.ts \
      'src/app/api/organizations/[id]/verification/sync/__tests__/route.test.ts' \
      src/app/api/admin/organizations/__tests__/route.test.ts \
      src/app/api/admin/organization-verifications/__tests__/route.test.ts \
      'src/app/api/admin/organization-verifications/[id]/__tests__/route.test.ts' \
      src/app/api/users/__tests__/usersRoute.test.ts \
      src/app/api/users/__tests__/userByIdRoute.test.ts \
      src/app/api/users/__tests__/socialRoutes.test.ts \
      src/server/__tests__/socialGraph.test.ts \
      src/app/api/users/social/blocked/__tests__/route.test.ts \
      'src/app/api/users/social/blocked/[targetUserId]/__tests__/route.test.ts' \
      src/app/api/admin/users/__tests__/route.test.ts \
      'src/app/api/teams/[id]/invite-free-agents/__tests__/route.test.ts' \
      src/app/api/events/__tests__/participantsRoute.test.ts \
      src/lib/__tests__/organizationService.test.ts \
      src/app/api/auth/__tests__/authRoutes.test.ts \
      src/app/api/auth/google/mobile/__tests__/googleMobileRoute.test.ts \
      src/app/api/auth/apple/mobile/__tests__/appleMobileRoute.test.ts
    DUPLICATE_RELATIONSHIP_MIGRATION_TEST_DATABASE_URL="$LOCAL_DISPOSABLE_DATABASE_URL" \
      node scripts/test-duplicate-relationship-array-migration.mjs
    npm run prisma:check
    npx tsc --noEmit --pretty false
    git diff --check

Expect Jest to report 24 suites passed and 0 failed, the disposable migration script to exit `0` after applying the removal SQL twice, Prisma and TypeScript to exit `0`, and `git diff --check` to print nothing.

Run the full repository test command before live deployment if the checkout is otherwise stable:

    npm run test:ci
    npm run build

After deploying the field-free build but before dropping the live columns, run browser and mobile smoke tests. Then deploy migrations using the established live secret loading procedure:

    DATABASE_URL="$DATABASE_URL_LIVE" npx prisma migrate deploy

Verify the final live schema without displaying credentials:

    DATABASE_URL="$DATABASE_URL_LIVE" npx tsx -e "import { prisma } from './src/lib/prisma'; void (async () => { const rows = await prisma.\$queryRawUnsafe(\`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' AND ((table_name = 'Organizations' AND column_name = 'productIds') OR (table_name = 'UserData' AND column_name = 'teamIds'))\`); console.log(rows); await prisma.\$disconnect(); })();"

The expected final output is:

    []

## Validation and Acceptance

The change is accepted only when all of the following observable behaviors hold.

An organization can be created without a `productIds` field and a user, child, invite placeholder, or public guest can be created without a `teamIds` field. A direct organization patch containing `productIds` and a direct user patch containing `teamIds` are rejected without touching Prisma update. Every full organization response named in the inventory returns `productIds` exactly matching products grouped by `Products.organizationId`, including inactive products if present. Public, outsider, and partial nested organization summaries do not gain that field.

Every full user and auth/profile response named in the inventory returns a stable, deduplicated `teamIds` array from active `TeamRegistrations` and `TeamStaffAssignments`. Social mutations preserve the alias, event participant snapshots and free-agent lists attach it before privacy formatting, and the admin user list derives it in one batch. An ID present only in the removed array never grants membership, failed-payment visibility, chat, schedule, roster, or privacy access. Missing normalized delegates produce an explicit test/runtime error rather than a legacy fallback. Player and staff membership in the same team appears once.

The failed-payment lookup recognizes a viewer's active canonical team and the event-team children of that canonical team, but ignores a contradictory legacy-only ID. Official scheduling receives event-team IDs derived from normalized membership and current event rosters; a participant cannot officiate their own or an overlapping match, while an unrelated eligible official can be assigned.

The strict live audit exits `0` with no unclassified legacy-only active-team links and no invalid classification entries. Its report and exact-key classification ledger are stored only under ignored `output/data007/`, and the plan records aggregate disposition counts. The compatibility release ran live for 24 hours without relevant errors before the destructive migration.

The migration fixture passes on a disposable loopback PostgreSQL database, proves physical null arrays normalize without changing non-null legacy data or normalized rows, a fresh full migration-chain replay succeeds, and retrying the removal SQL is harmless. The 23-suite compatibility command and 24-suite removal command report zero failures. `npm run prisma:check`, `npx tsc --noEmit`, `npm run test:ci`, `npm run build`, focused mobile unit tests, iOS simulator compilation, and both browser/mobile smoke tests pass or any unrelated pre-existing failure is recorded with evidence and excluded by a focused passing command.

The final live `information_schema.columns` query returns no `Organizations.productIds` or `UserData.teamIds` column. Current web and mobile clients still show products and team membership because the response aliases remain computed. A mobile social response that omits `teamIds` during a rolling deployment preserves cached membership, while an explicit empty computed list clears it.

## Idempotence and Recovery

The audit is database-read-only and safe to repeat. It checks for column existence, so after removal it returns an `alreadyRemoved` result instead of failing. The classification ledger is an ignored operator artifact read by exact key; rerunning against changed data cannot silently classify a new link. Both response helpers are pure projections over normalized rows and are safe to call repeatedly. The preparation migration changes only physical null arrays to empty arrays, installs defaults, and creates the missing index if needed; repeating its intended state causes no relationship drift. The final migration uses `DROP COLUMN IF EXISTS` inside one transaction, so a lock-timeout failure leaves both columns intact and a completed migration can be retried safely.

Before the destructive migration, the ignored live audit JSON and classification ledger are the relationship-specific recovery artifacts and the managed database backup remains the full recovery source. Do not commit either file because user and team IDs are operational data.

If the field-free application fails before the final migration, roll back the application while the columns still exist; the preparation defaults make the older build safe. If the final migration has run, do not roll back to field-aware generated Prisma code. Prefer fixing or rolling forward the new application. If emergency rollback is unavoidable, first re-add `Organizations.productIds TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]` and `UserData.teamIds TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]`, then repopulate them from `Products.organizationId` and the union of active `TeamRegistrations` and `TeamStaffAssignments`. That emergency projection is reversible but deliberately reintroduces duplicate storage, so schedule its removal again immediately.

If the strict audit finds a legitimate array-only team membership, do not edit the array and do not insert an arbitrary role with SQL. Repair the canonical roster through the ordinary authorized team-management workflow, rerun the audit, and proceed only when the resulting normalized row has the intended role and active status.

## Artifacts and Notes

The compatibility audit report should resemble this aggregate shape; exact counts are populated during implementation:

    {
      "columnsPresent": true,
      "products": {
        "exactOrganizations": 0,
        "normalizedOnlyIds": 0,
        "legacyOnlyOrphanIds": 0,
        "legacyForeignOwnerIds": 0
      },
      "userTeams": {
        "exactUsers": 0,
        "normalizedOnlyLinks": 0,
        "legacyOnlyLiveTeamLinks": 0,
        "classifiedStaleLiveTeamLinks": 0,
        "unclassifiedLegacyOnlyLiveTeamLinks": 0,
        "contradictedLinks": 0,
        "orphanIds": 0,
        "invalidClassificationEntries": 0
      }
    }

The ignored classification ledger has this shape. The audit report supplies the three IDs exactly; do not invent or normalize them by hand.

    {
      "version": 1,
      "entries": [
        {
          "userId": "user-id-from-report",
          "legacyTeamId": "raw-array-id-from-report",
          "canonicalTeamId": "resolved-canonical-id-from-report",
          "disposition": "STALE_CONFIRMED",
          "reviewedAt": "2026-07-14T00:00:00.000Z",
          "reviewedBy": "operator-id",
          "reason": "Reviewed in team management; user should not be active."
        }
      ]
    }

After the final migration, the same command should print a summary resembling:

    {
      "columnsPresent": false,
      "alreadyRemoved": true
    }

Keep short evidence here as work proceeds: migration names, audit aggregate counts, focused suite totals, live schema output, browser route and action, mobile screen and runtime, and commit hashes. Do not paste secrets, user IDs, email addresses, the ignored report, or the classification ledger itself.

## Interfaces and Dependencies

In `src/server/organizationProductIds.ts`, provide these stable interfaces, using an injectable Prisma-like client for focused tests:

    export const getProductIdsByOrganizationIds = async (
      organizationIds: string[],
      client: OrganizationProductsClient = prisma,
    ): Promise<Map<string, string[]>>

    export const withDerivedOrganizationProductIds = async <T extends { id: string }>(
      organizations: T[],
      client: OrganizationProductsClient = prisma,
    ): Promise<Array<T & { productIds: string[] }>>

`getProductIdsByOrganizationIds` must issue one `products.findMany` query for the requested IDs, select only `id` and `organizationId`, deduplicate and sort IDs, and return empty arrays for organizations with no products.

In `src/server/teams/teamMembership.ts`, keep the public function name but strengthen the contract:

    export const getCanonicalTeamIdsByUserIds = async (
      userIds: string[],
      client: CanonicalMembershipClient = prisma,
    ): Promise<Map<string, string[]>>

    export const withDerivedCanonicalTeamIds = async <T extends { id: string }>(
      users: T[],
      client: CanonicalMembershipClient = prisma,
    ): Promise<Array<T & { teamIds: string[] }>>

The client interface must require `teamRegistrations.findMany` and `teamStaffAssignments.findMany`; it must not include `userData` for fallback. Both queries use `status: 'ACTIVE'`. Returned IDs are normalized, deduplicated, and sorted.

The audit script depends only on the existing Prisma client or PostgreSQL driver already installed in this repository. It must not add a new runtime package. Its CLI accepts `--strict`, `--output <path>`, and `--classifications <path>`. It resolves both paths, refuses either one outside `output/data007/`, and contains no database write mode. Export pure parsing and classification-reconciliation functions for `scripts/__tests__/audit-duplicate-relationship-arrays.test.ts`; test empty, matching stale, unknown, duplicate, malformed, and newly unclassified cases without a live database.

Within `src/server/repositories/events.ts`, keep `UserData.teamIds` as a scheduler-domain property but populate it with derived event-team IDs. The repository implementation must batch canonical membership for all official IDs, build a `Map<string, Set<string>>` keyed by official user ID, and pass sorted arrays to `buildOfficials(...)`. That map must merge canonical-parent expansion, direct legacy event-team identity, active event participant registrations, active event-team staff assignments, and explicit current event-team roster fields. It must never copy a property from a Prisma `UserData` row.

The mobile compatibility boundary remains: server responses retain `teamIds` and authorized `productIds`; outbound user updates cannot send `teamIds`; mobile Room fields remain derived cache; and social response merging preserves the cache only when the response field is absent. No server migration depends on a mobile release completing first because the current and immediately preceding compatible clients receive the unchanged response shape and server routes ignore or reject legacy write attempts.

Revision note (2026-07-14): created this self-contained plan after auditing the current web and mobile contracts. The two-stage rollout, non-backfill decision for ambiguous user arrays, computed compatibility aliases, and field-free-build-before-drop ordering were chosen to remove duplicate persistence without granting access or breaking existing clients.

Revision note (2026-07-14 07:49Z): expanded the plan after independent review found runtime reads and response boundaries outside the primary routes. This revision inventories every full resource response, replaces payment-failure and official-scheduling array reads, adds mobile social-cache protection, corrects physical nullability, defines an exact-key ignored classification ledger and strict exit semantics, orders the preparation migration before the application deploy, and gives focused commands explicit expected suite counts.

Revision note (2026-07-14 08:05Z): recorded completion and validation of the isolated preparation-migration and read-only audit-tooling slice, plus the aggregate local audit evidence, so the next implementer can resume at the response, business-read, creation-cleanup, and mobile compatibility work without repeating this slice.

Revision note (2026-07-14 12:28Z): reconciled the living plan with authoritative HEAD `42289945`, made the absence of deployment/live-audit evidence explicit, preserved the destructive migration gate, recorded the passing 13-test strict-exit regression proof, and retired the final executable writer of the duplicate user-team array before live observation.
