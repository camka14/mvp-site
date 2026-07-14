# Reserve exactly the rental windows selected at checkout

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Maintain this document in accordance with `PLANS.md` at the root of `/Users/elesesy/StudioProjects/mvp-site`.

## Purpose / Big Picture

After this change, a customer can place several rental selections into one checkout without temporarily reserving every field for the entire span between the earliest and latest selection. For example, selecting Court A on Monday from 9:00 to 10:00 and Court B on Wednesday from 15:00 to 16:00 will create exactly two temporary holds. Tuesday, the gap between 10:00 and 15:00, and the unselected court/time combinations remain available to other customers.

The same exact selection list must drive three operations: the server-authoritative price quote, the temporary checkout holds, and the final rental order. This is visible in focused tests that submit disjoint selections, assert two narrow holds, and prove a checkout in the gap remains available while an overlapping checkout is rejected.

## Progress

- [x] (2026-07-14 00:45Z) Confirmed APP-092 remains open on current site commit `de23d0d3` and mobile commit `fb9702ac`.
- [x] (2026-07-14 00:50Z) Traced the aggregate mobile request through `OrganizationDetailScreen`, `OrganizationDetailComponent`, `BillingRepository`, the purchase-intent route, canonical rental checkout, and the lock repository.
- [x] (2026-07-14 00:55Z) Chose an additive request field with a legacy single-window fallback and an atomic multi-window server reservation.
- [x] (2026-07-14 01:02Z) Added a shared server selection contract and migrated final-order plus purchase-intent canonical validation to it.
- [x] (2026-07-14 01:02Z) Added atomic exact-window reserve, release, overlap rejection, sorted field locks, retry reconciliation, and legacy wrappers.
- [x] (2026-07-14 01:02Z) Sent the same exact mobile rental-order selection rows to purchase intent and final-order preparation while retaining aggregate fallback fields.
- [x] (2026-07-14 01:02Z) Added the focused server and mobile regressions named by this plan. Execution is intentionally deferred to central validation so Jest and Gradle are not run concurrently with other agents.
- [x] (2026-07-14 01:07Z) Ran the four focused server suites: 56 tests passed with zero failures. `npx tsc --noEmit` also passed after tightening the shared field-row type at the final-order boundary.
- [x] (2026-07-14 01:13Z) Ran the focused Android tests: `BillingRepositoryHttpTest` passed 45/45 and `OrganizationDetailComponentTest` passed 14/14. The iOS simulator shared compile also completed successfully.
- [x] (2026-07-14 01:16Z) Installed the current audited branch on the Pixel 9 Pro API 35 emulator. A force-stop cold launch reached the Login screen in 4.6 seconds; the UI tree and screenshot were captured, and fresh logs contained no fatal exception, ANR, or OOM. No authenticated session was retained, so direct rental-timetable interaction remained unreachable without changing account state.
- [x] (2026-07-14 01:14Z) Committed the server implementation as `0720f586` and the mobile implementation as `c40797cd`.
- [x] (2026-07-14 01:19Z) Reconciled APP-092 in `docs/code-audit/README.md` after recording Android install/cold-launch evidence.

## Surprises & Discoveries

- Observation: Mobile already preserves exact selections in `RentalCreateContext.lockedSelections` and sends exact `RentalOrderSelectionRequest` rows to final order creation, but `buildRentalPaymentTimeSlotContext` still reduces them to the minimum start, maximum end, and union of fields.
  Evidence: `composeApp/src/commonMain/kotlin/com/razumly/mvp/organizationDetail/OrganizationDetailScreen.kt` builds `lockedSelectionsForCreate` and passes `buildRentalOrderSelectionRequests(validResolvedSelections)`, while `OrganizationDetailComponent.kt` builds one synthetic payment time slot from aggregate context fields.

- Observation: The current lock identifier includes an exact field/start/end tuple, so two overlapping but non-identical temporary holds do not contend. Fixing only the aggregate request would leave a smaller overlapping checkout able to bypass an existing hold.
  Evidence: `src/server/repositories/rentalCheckoutLocks.ts` creates IDs as `rental-checkout:<field>:<start ISO>:<end ISO>` and queries only those exact IDs. The concurrency test covers identical ranges only.

- Observation: The final rental-order route and the purchase-intent canonical resolver currently implement separate availability-slot matching rules. The order route now has deterministic duration, price, and ID ordering that the older purchase-intent resolver does not fully share.
  Evidence: `src/app/api/public/organizations/[slug]/rental-orders/route.ts` sorts every covering slot; `src/server/rentalCheckoutAccess.ts` uses the first covering persisted slot.

- Observation: Final-order creation also performed one aggregate scheduler check from the earliest start to latest end across the union of fields, even though it persisted each selection independently. That would reject a valid disjoint cart when an unrelated event occupied only the gap.
  Evidence: The route previously passed `earliestStart`, `latestEnd`, and union `fieldIds` to one `assertNoEventFieldSchedulingConflicts` call; it now calls the scheduler once per canonical selection.

- Observation: Silently dropping one malformed mobile exact-selection row would let payment proceed for a subset while final-order preparation retained the malformed original list.
  Evidence: The first serializer draft used `mapNotNull`; the final repository mapping fails closed before `api.post` if any exact row lacks fields or start/end values.

## Decision Log

- Decision: Add `rentalSelections` to the purchase-intent request and keep the existing aggregate `timeSlot` fields as a temporary compatibility fallback.
  Rationale: The current mobile release can send exact windows without breaking an older deployed server, and the updated server can continue to accept older clients until the compatibility floor advances. The new array is authoritative whenever it is non-empty.
  Date/Author: 2026-07-14 / Codex

- Decision: Validate and price purchase-intent selections with the same shared server helper used by final rental-order creation.
  Rationale: A payment amount, temporary hold, and final order must not select different overlapping availability rows or apply different overnight/nullable-bound rules.
  Date/Author: 2026-07-14 / Codex

- Decision: Serialize temporary holds with sorted per-field PostgreSQL advisory locks and check interval overlap, not exact lock IDs.
  Rationale: Per-field serialization prevents two transactions with different but overlapping ranges from both passing their reads. Sorting prevents deadlocks when a checkout spans several fields.
  Date/Author: 2026-07-14 / Codex

- Decision: Reconcile all holds owned by the same user and draft event to the submitted exact set only after every requested window passes canonical availability and conflict checks.
  Rationale: Retrying after changing a cart must release obsolete gap-spanning or removed holds without dropping the prior hold before the replacement request is known to be valid.
  Date/Author: 2026-07-14 / Codex

- Decision: Run final-order persisted scheduling checks per canonical selection rather than against an aggregate bounding range, and force every rental hold window to fixed-end semantics.
  Rationale: Exact checkout windows must remain exact through final conflict validation, and client event flags must not widen rental conflict semantics.
  Date/Author: 2026-07-14 / Codex

- Decision: Fail the mobile purchase-intent operation before HTTP when any non-empty exact selection row is malformed.
  Rationale: Partial serialization could charge for a different cart than the exact list later submitted to final-order creation.
  Date/Author: 2026-07-14 / Codex

## Outcomes & Retrospective

Implementation, validation, commits, reachable device evidence, and audit-ledger reconciliation are complete. The request now carries `rentalSelections` as the authoritative non-empty exact array while retaining the aggregate `timeSlot` fallback for older clients. Canonical pricing, exact temporary holds, and final-order item creation share the same deterministic selection validator. Temporary holds serialize on sorted fields, reject any non-identical interval overlap, and reconcile retries to the submitted set. The four focused Jest suites passed 56 tests with zero failures, and `npx tsc --noEmit` passed. Mobile passed 59 focused tests across the repository and component contracts, and the iOS simulator shared compile succeeded. Server commit `0720f586` and mobile commit `c40797cd` contain the implementation. The installed current branch cold-launched to Login without a fatal exception, ANR, or OOM; authenticated rental UI was unavailable because no valid session was retained. APP-092 is recorded as completed in the live remediation ledger.

## Context and Orientation

The web/server repository is `/Users/elesesy/StudioProjects/mvp-site`. The audited mobile worktree is `/private/tmp/mvp-app-critical-audit`. Both are on `codex/critical-audit-remediation`.

A rental selection is one or more field IDs plus a concrete start and end instant. Mobile constructs these rows as `RentalOrderSelectionRequest`. A temporary checkout hold is a ten-minute `LockFiles` row that prevents another customer from checking out the same inventory before payment finishes. A PostgreSQL advisory lock is a transaction-scoped numeric lock used only to serialize competing database transactions; it creates no durable row.

On mobile, `OrganizationDetailScreen.kt` resolves the timetable cart and calls `DefaultOrganizationDetailComponent.startRentalReservation`. `OrganizationDetailComponent.kt` invokes `IBillingRepository.createPurchaseIntent`, then prepares and completes the rental order with the original selection rows. `core/repository-impl/.../BillingRepository.kt` serializes `PurchaseIntentRequestDto` from `core/network/.../BillingDtos.kt`.

On the server, `src/app/api/billing/purchase-intent/route.ts` resolves a canonical checkout with `src/server/rentalCheckoutAccess.ts` and reserves temporary rows through `src/server/repositories/rentalCheckoutLocks.ts`. Final order creation is handled by `src/app/api/public/organizations/[slug]/rental-orders/route.ts`. That final route already validates every selection independently and is the behavior the payment path must share.

The site checkout is a dirty worktree containing unrelated broadcast and scoring changes. Stage and commit only files named by this plan. Do not modify or include the existing broadcast, scoring, agent-tool, or unrelated plan files.

## Plan of Work

First, extract the canonical per-selection matching logic from the final rental-order route into a server module under `src/server/rentals/`. Define a normalized selection input, field and availability-slot shapes, and a result containing the parsed start/end, normalized time zone, selected field, chosen availability slot, prorated price, and required document IDs. Preserve the rules already covered by the rental-order tests: explicit multi-day slots use elapsed instants; repeating overnight slots use one anchor day; nullable recurring bounds derive in the slot's own time zone; equal bounds fail closed; and overlapping covering slots sort by normalized duration, then price with null last, then lexical ID. Make both the final order route and purchase-intent canonical resolver call this helper.

Next, extend `resolveCanonicalRentalCheckout` so it accepts a raw `rentalSelections` value in addition to the legacy event/time-slot pair. When the array is non-empty, normalize every row and reject malformed rows rather than falling back. Load the union of requested fields and availability slots once, prove all fields belong to one organization, authorize the existing or draft event once, then validate each selection independently. Return `windows: RentalCheckoutWindow[]`, the sum of item prices, deterministic availability-slot IDs, and the union of document templates. Limit the distinct field-window rows to `MAX_ACTIVE_RENTAL_CHECKOUT_LOCKS_PER_USER`; duplicated identical rows should normalize to one hold but should not be double charged.

Then add a multi-window reservation function in `src/server/repositories/rentalCheckoutLocks.ts`. Keep the old single-window export as a wrapper for the dedicated legacy rental-lock route. The multi-window function must reject mixed event IDs, empty sets, invalid ranges, and more than the allowed number of distinct field-window rows. Inside one transaction, acquire advisory locks for every distinct field in sorted order. Run persisted scheduling-conflict checks for every exact window. Load active rental checkout rows for those fields, parse their stored field/start/end values, and reject any interval overlap owned by another checkout. After all checks pass, delete obsolete rows belonging to the same owner token, remove expired relevant rows, and upsert exactly the desired rows. Release must accept the exact set and delete only matching rows for that owner. Support reading the existing ISO-based row ID format during the ten-minute rolling-deploy window.

Update the purchase-intent route to pass the request array into canonical resolution, reserve the returned window set, and release that same set on every existing failure path. Keep pricing and metadata based on the canonical result. Extend purchase-intent route and lock repository tests with disjoint selections, same-field separated selections, partial overlap, enclosing overlap, retry reconciliation, atomic failure, field-order deadlock avoidance, and legacy single-window fallback.

On mobile, add a serializable rental-selection reference DTO to `BillingDtos.kt` and a `rentalSelections` list to `PurchaseIntentRequestDto`. Extend `PurchaseIntentTimeSlotContext` with exact selection rows, normalize them without merging dates or fields in `BillingRepository`, and make `buildRentalPaymentTimeSlotContext` receive the same `RentalOrderSelectionRequest` list later used by `prepareRentalOrder`. Preserve the aggregate time-slot fields during the compatibility window, but tests must assert that the exact array contains each original field/start/end row unchanged.

Finally, run focused tests without concurrent Gradle processes, compile shared code for iOS, install the Android APK, and record whether authentication permits direct timetable navigation. Update this plan after each milestone and update the audit ledger only after both implementation commits exist.

## Concrete Steps

Work in `/Users/elesesy/StudioProjects/mvp-site` for server edits. Run the focused server suites serially:

    npm test -- --runInBand src/server/repositories/__tests__/rentalCheckoutLocks.test.ts src/server/__tests__/rentalCheckoutAccess.test.ts src/app/api/billing/__tests__/purchaseIntentRoute.test.ts 'src/app/api/public/organizations/[slug]/rental-orders/__tests__/route.test.ts'
    npx tsc --noEmit

The expected result is that every selected suite passes and TypeScript exits with status zero. Record the actual test count in `Progress` and `Outcomes & Retrospective`.

Work in `/private/tmp/mvp-app-critical-audit` for mobile edits. Confirm no other Gradle wrapper is active, then run:

    JAVA_HOME=/Users/elesesy/Library/Java/JavaVirtualMachines/jbr-21.0.6/Contents/Home ANDROID_HOME=/Users/elesesy/Library/Android/sdk ANDROID_SDK_ROOT=/Users/elesesy/Library/Android/sdk ./gradlew :composeApp:testDebugUnitTest --tests 'com.razumly.mvp.core.data.repositories.BillingRepositoryHttpTest' --tests 'com.razumly.mvp.organizationDetail.OrganizationDetailComponentTest' --no-daemon
    JAVA_HOME=/Users/elesesy/Library/Java/JavaVirtualMachines/jbr-21.0.6/Contents/Home ANDROID_HOME=/Users/elesesy/Library/Android/sdk ANDROID_SDK_ROOT=/Users/elesesy/Library/Android/sdk ./gradlew :composeApp:compileKotlinIosSimulatorArm64 --no-daemon

Build and install the exact mobile commit with `:composeApp:installDebug`, launch `com.razumly.mvp/.MainActivity`, derive interactions from the UI tree, capture a screenshot, and inspect fresh process and crash logs. Do not claim an authenticated rental interaction if the available account is rejected.

## Validation and Acceptance

The server regression must demonstrate all of the following observable behavior. A cart with Monday Court A 09:00–10:00 and Wednesday Court B 15:00–16:00 produces two holds, not a Monday-to-Wednesday hold on both courts. A second checkout for Tuesday or for Court A Monday 10:00–11:00 succeeds. A second checkout for Court A Monday 09:30–10:30 fails with HTTP 409 even though its exact lock ID differs. If any one requested selection is unavailable, no new hold from the request remains. Retrying the same draft with one selection removed deletes that owner's obsolete hold. The canonical amount equals the sum of the exact final-order items.

The mobile regression must capture the JSON request and show one `rentalSelections` element per original cart row with unchanged field IDs, start, end, and time zone. It must also show that the final order uses the same list after payment. Existing single-selection rental checkout tests must remain green.

TypeScript and both Android and iOS shared compilation must succeed. A newly installed Android APK must cold-launch without a fatal exception, ANR, or OOM. Authenticated timetable navigation is accepted only if a valid retained account is available; otherwise record the backend rejection and rely on the focused component/contract regressions for the unreachable state.

## Idempotence and Recovery

All tests and builds are safe to rerun. The hold reservation is idempotent for the same owner token and exact selection set: it refreshes expiry without creating duplicates. If a transaction fails before commit, no partial hold reconciliation may persist.

Do not reset either dirty worktree. If an edit overlaps unrelated local work, stop and inspect the hunk before continuing. Stage explicit paths only and run `git diff --cached --check` before every commit. The legacy single-window request and lock wrapper remain until the supported mobile-version floor proves they can be removed in a later finding.

## Artifacts and Notes

Baseline evidence before implementation:

    Mobile: buildRentalPaymentTimeSlotContext uses context.startEpochMillis,
    context.endEpochMillis, and context.selectedFieldIds.

    Server: buildRentalCheckoutLockIds maps every field in one aggregate window.

    Lock test: only identical field/start/end races are covered.

## Interfaces and Dependencies

In `core/network/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/BillingDtos.kt`, define a serializable DTO equivalent to:

    data class BillingRentalSelectionDto(
        val key: String? = null,
        val scheduledFieldIds: List<String>,
        val startDate: String,
        val endDate: String,
        val timeZone: String? = null,
    )

Add `rentalSelections: List<BillingRentalSelectionDto> = emptyList()` to `PurchaseIntentRequestDto`. Preserve any recurrence metadata already present on `RentalOrderSelectionRequest` if the implementation uses the complete type rather than the minimal shape above.

In `src/server/rentalCheckoutAccess.ts`, the canonical result must expose `windows: RentalCheckoutWindow[]`. In `src/server/repositories/rentalCheckoutLocks.ts`, provide multi-window reserve/release functions whose successful result includes every durable lock ID and one shared owner token/expiry. Keep the single-window functions as compatibility wrappers.

No new external library or database migration is required. Use the existing Zod, Prisma, time-zone helpers, fee/pricing conventions, and PostgreSQL advisory-lock helper already present in the repository.

Revision note (2026-07-14): Initial plan created after current-source audit confirmed APP-092 and uncovered the non-identical overlap gap in temporary lock contention.

Revision note (2026-07-14): Implemented the exact-array contract across site and mobile, added overlap/reconciliation/gap/fail-closed regressions, and left execution plus commits to coordinated central validation.
