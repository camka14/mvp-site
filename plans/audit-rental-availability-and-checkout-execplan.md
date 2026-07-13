# Make rental availability and checkout use exact, authoritative field windows

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds. Maintain this file under `PLANS.md` in the repository root, which requires a self-contained, observable implementation plan.

## Purpose / Big Picture

After this work, a person viewing rentals in the mobile app will see the same occupied periods that the server will enforce at checkout, even when an organization has hundreds of events. They will also be able to check out multiple rental selections without the app reserving the empty time between them or other selected fields by mistake. The server will own the authoritative availability snapshot and the exact set of temporary checkout locks; the mobile client will display that snapshot and carry an unchanged selection list through payment and final booking.

The behavior is demonstrable with a test organization containing a one-time event, a weekly event, a scheduled match, and a pending or confirmed rental booking. A one-week availability request must return only opaque occupied field/time intervals. A checkout for two non-contiguous selections must lock and bill exactly those two intervals, then final confirmation must create exactly those two rental booking items.

## Progress

- [x] (2026-07-12 20:00Z) Mapped the current mobile reconstruction and the web server's canonical scheduling and rental-checkout paths.
- [x] (2026-07-12 20:00Z) Chose one organization-scoped, date-bounded availability snapshot endpoint instead of stitching existing per-field calendar and match endpoints.
- [ ] Extract the shared server scheduling-conflict read helper without changing final event scheduling enforcement.
- [ ] Add and test the private/public-safe rental availability HTTP contract in `mvp-site`.
- [ ] Extend the purchase-intent, lock, and order-confirmation contracts to preserve exact normalized rental selections.
- [ ] Move mobile rental availability loading to the server snapshot and retain exact selections through checkout.
- [ ] Run focused server/mobile tests, manually exercise a multi-selection rental checkout, update `docs/code-audit/README.md` for APP-088 and APP-092, and commit the finished batches.

## Surprises & Discoveries

- Observation: The mobile client loads at most 300 organization events and calculates occupancy itself, so it can silently omit conflicts as an organization grows.
  Evidence: `mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/eventSearch/RentalAvailabilityLoader.kt` calls `getEventsByOrganization(..., limit = 300)` once before locally expanding events, matches, and slots.

- Observation: The mobile checkout has retained exact final rental selections, but it collapses them into one earliest-start/latest-end interval and all selected fields while creating its payment intent and temporary lock.
  Evidence: `mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/organizationDetail/OrganizationDetailScreen.kt` and `OrganizationDetailComponent.kt` construct one aggregate time slot for the purchase-intent path, while the final rental-order route accepts individual selections.

- Observation: The existing server calendar route is intentionally per-field and hides match blockers from rental overlap handling; it is not a safe source for a rental availability snapshot.
  Evidence: `mvp-site/src/app/api/events/field/[fieldId]/route.ts` serves a calendar-oriented view, while `src/server/repositories/events.ts` contains the full match, scheduled-event, recurring-slot, and booking-item conflict queries.

- Observation: A client availability snapshot is a preview, not a reservation. A concurrent customer may obtain an interval after the snapshot and before payment.
  Evidence: Final rental checkout already uses `resolveCanonicalRentalCheckout` and `reserveRentalCheckoutLocks`, which must remain the server-side race protection.

## Decision Log

- Decision: Add one organization-scoped `GET /api/organizations/[organizationId]/rental-availability` endpoint rather than add pagination to the mobile event list.
  Rationale: Availability requires data from events, scheduled matches, recurring slots, and rental booking items. The server already owns all of that data and can limit disclosure to opaque field/time blocks. Pagination of client-reconstructed events would remain incomplete, brittle, and capable of leaking schedule details.
  Date/Author: 2026-07-12 / Codex

- Decision: The endpoint accepts only a bounded date range and resolves rentable fields server-side; it does not accept arbitrary client field IDs.
  Rationale: A one-week calendar refresh has a predictable cost, prevents unbounded conflict expansion, and ensures a caller cannot enumerate another organization's private field inventory. The endpoint must apply the same public-page and rental-inventory policy as final checkout.
  Date/Author: 2026-07-12 / Codex

- Decision: Evolve payment intent, temporary locks, and final confirmation together to use a normalized `rentalSelections` array.
  Rationale: A one-window payment-intent contract cannot truthfully represent bookings on different fields, dates, or disjoint hours. An interim client-only restriction would avoid some bad locks but would leave the server contract incapable of correct multi-selection support.
  Date/Author: 2026-07-12 / Codex

- Decision: Keep final server-side availability and lock checks authoritative after the read snapshot is introduced.
  Rationale: Read snapshots cannot prevent races. Checkout must re-resolve fields, slot coverage, price, and permissions, then atomically reserve each requested window before a payment can proceed.
  Date/Author: 2026-07-12 / Codex

## Outcomes & Retrospective

Implementation has not started. The expected outcome is that APP-088 and APP-092 become completed only after both the mobile behavior and the server contract have focused tests and an end-to-end manual checkout observation. No production migration is expected because the selection list can be stored in existing checkout metadata or an additive serialized field; verify the actual current lock and intent schema before deciding whether a Prisma migration is necessary.

## Context and Orientation

`mvp-site` is the Next.js and Prisma server repository. Its route handlers live under `src/app/api`, its authoritative scheduling repository lives under `src/server/repositories/events.ts`, and its final rental checkout policy lives in `src/server/rentalCheckoutAccess.ts`. A **conflict block** in this plan is an opaque record with only `fieldId`, `start`, and `end`; it intentionally does not reveal whether the conflict comes from an event, match, booking, or another renter.

`mvp-app` is the Kotlin Multiplatform client repository. For this work, use the safe audit worktree at `/private/tmp/mvp-app-critical-audit`, not `/Users/elesesy/StudioProjects/mvp-app`. Its current `RentalAvailabilityLoader` derives rental availability from locally fetched events and fields. `OrganizationDetailComponent` loads rental data and creates a payment intent. `OrganizationDetailScreen` supplies the selected periods. A **rental selection** is one normalized tuple of `fieldId`, `start`, and `end`; no selection may have a blank field ID, an invalid ISO instant, or `end <= start`.

The existing server scheduling conflict code is in `src/server/repositories/events.ts` near `attachFieldSchedulingConflicts`. It identifies blockers from scheduled match rows, direct events, weekly/recurring event time slots, and rental booking items whose status is `PENDING_PAYMENT` or `CONFIRMED`. The final rental order code is `src/app/api/public/organizations/[slug]/rental-orders/route.ts`; it uses `src/server/rentalCheckoutAccess.ts` to resolve the real fields, rental slots, coverage, pricing, and access policy. The billing purchase-intent and lock routes live under `src/app/api/billing`.

The main `mvp-site` worktree can contain unrelated user-owned broadcast-overlay changes. During this plan, always stage exact rental-related paths and this plan only. Do not use broad staging commands or reset/check out user-owned files.

## Plan of Work

First, refactor the scheduling repository without changing its observable final assertion. Introduce an exported, read-only helper such as `listFieldSchedulingConflicts(input)` in `src/server/repositories/events.ts`. Its input must contain organization ID, candidate field IDs, an inclusive/exclusive UTC window, and an optional event ID to exclude. It must use the exact existing database queries and occurrence expansion currently inside `attachFieldSchedulingConflicts`, and return a normalized list of `{ fieldId, start, end }` instead of source rows. Change the existing conflict assertion to call that helper, preserving error messages and event-update exclusions. Add regression tests showing direct events, recurring slots, scheduled matches, pending/confirmed rental booking items, and end-at-start boundary behavior all produce the correct blockers.

Next, add `src/app/api/organizations/[organizationId]/rental-availability/route.ts`. Parse `start` and `end` query parameters as ISO instants, require `end > start`, reject an unreasonably large range (choose and document a maximum of 31 days), and return a typed 400 response for invalid input. Resolve the organization and all non-archived rentable fields server-side. Apply the public checkout policy: an unauthenticated caller may see only a publicly enabled organization with public rental inventory; an authenticated organization manager may see its own inventory; everyone else receives a non-enumerating not-found/forbidden response consistent with surrounding public organization routes. Derive rental slots from the persisted field `rentalSlotIds` data exactly as final checkout does. Return only fields with their rentable slots plus conflict blocks clipped to the requested range. Never return event, match, booking, customer, or payment metadata.

Add `src/app/api/organizations/[organizationId]/rental-availability/__tests__/route.test.ts`. The suite must prove invalid range rejection, public/private access behavior, only rentable slots returned, opaque blocker payloads, and correct clipping. Reuse the existing test conventions in `src/app/api/events/field/[fieldId]/__tests__/route.test.ts`, `src/server/repositories/__tests__/events.loadWithRelationsFieldConflicts.test.ts`, and `src/server/__tests__/rentalCheckoutAccess.test.ts` rather than adding a second business-rule implementation in tests.

Then evolve the checkout contract. Define a shared server input type `RentalSelectionInput` and a normalization function used by all three phases: purchase-intent creation, temporary rental locks, and final rental-order confirmation. It must sort selections deterministically, trim field IDs, parse ISO instants, reject invalid windows, remove exact duplicates, and reject overlaps on the same field. It must calculate a stable selection fingerprint from the normalized list. Purchase intent must receive `rentalSelections[]` rather than one synthetic all-fields time slot; it must resolve each selection with `resolveCanonicalRentalCheckout`, calculate price from those exact resolved selections, and associate the fingerprint with the intent. The lock endpoint must reserve each exact selection under the same checkout owner, detect overlapping locks rather than only identical IDs, and retain the normalized fingerprint. Final confirmation must require the matching fingerprint and make the same per-selection conflict checks before it writes booking items. A successful confirmation must create a booking item per requested selection and no interval covering a gap between selections.

Update the existing tests under `src/app/api/billing/__tests__`, `src/server/repositories/__tests__/rentalCheckoutLocks.test.ts`, and `src/app/api/public/organizations/[slug]/rental-orders/__tests__/route.test.ts`. Add cases for two same-day non-contiguous intervals, two fields on different days, an overlap rejection, lock conflict for partially overlapping windows, selection/fingerprint mismatch rejection, and final-booking items exactly matching the requested selections. Preserve the existing one-selection behavior so older supported callers remain functional only if the API contract explicitly accepts and normalizes a one-element array; otherwise version the error visibly and update all first-party callers in the same commit.

In `/private/tmp/mvp-app-critical-audit`, add network DTOs in `core/network/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/RentalAvailabilityDtos.kt` and a snapshot model in `core/model/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/`. Add `getRentalAvailability(organizationId, start, end)` to `IFieldRepository` and implement it in `FieldRepository` using the new endpoint. The method should return the fields, persisted rental slots, and opaque busy blocks as one atomic snapshot. Do not use the 300-event route, fallback arbitrary field time slots, or combine separate event/match fetches in the rental availability path.

Rewrite `RentalAvailabilityLoader` to turn the server snapshot into its existing UI availability types. Keep local scheduling helpers only for selection/timeline presentation and price display; server blocks determine whether a rental time is occupied. Update `OrganizationDetailComponent` to load and assign one snapshot for the currently visible week. Update `OrganizationDetailScreen` so moving the week selector requests the next bounded week range. Preserve a loading/error state rather than treating a failed snapshot as empty availability.

Finally, replace aggregate payment-intent construction in `OrganizationDetailComponent` with a frozen normalized `rentalSelections` list. Carry exactly that list into the durable pending-order/retry state and final rental-order request. Add mobile unit tests in `RentalAvailabilityLoaderTest.kt`, the relevant field-repository HTTP test, and `OrganizationDetailComponentTest.kt` for server snapshots, week refresh, two non-contiguous selections, two fields on different days, and retry preserving the original list.

## Concrete Steps

Work in the server repository first:

    cd /Users/elesesy/StudioProjects/mvp-site
    git status --short
    rg -n "attachFieldSchedulingConflicts|assertNoEventFieldSchedulingConflicts" src/server/repositories/events.ts
    rg -n "purchase-intent|rental.*lock|RentalSelection|rentalSlotCoversSelection" src/app/api src/server

Implement the shared helper and availability route with focused Jest tests. Before each server commit, stage exact paths only and run:

    git diff --cached --check
    npx jest --runInBand src/server/repositories/__tests__/events.loadWithRelationsFieldConflicts.test.ts
    npx jest --runInBand src/app/api/organizations/[organizationId]/rental-availability/__tests__/route.test.ts
    npx jest --runInBand src/app/api/billing/__tests__/rentalLockRoute.test.ts src/app/api/public/organizations/[slug]/rental-orders/__tests__/route.test.ts
    npx tsc --noEmit

Work in the safe mobile audit worktree only:

    cd /private/tmp/mvp-app-critical-audit
    git status --short
    ANDROID_HOME=/Users/elesesy/Library/Android/sdk ANDROID_SDK_ROOT=/Users/elesesy/Library/Android/sdk JAVA_HOME=/Users/elesesy/Library/Java/JavaVirtualMachines/jbr-21.0.6/Contents/Home ./gradlew --no-daemon :composeApp:testDebugUnitTest --tests com.razumly.mvp.eventSearch.RentalAvailabilityLoaderTest --tests com.razumly.mvp.organizationDetail.OrganizationDetailComponentTest

Do not run Gradle tests simultaneously from multiple agents because shared build artifacts can race. If the worktree lacks `local.properties`, use the explicit Android SDK environment variables shown above; do not copy credentials or secrets into the worktree. Before each mobile commit, run:

    git diff --cached --check
    git status --short

After automated tests pass, start the local server with its normal configured database and install/run the debug mobile build. Create or use a test organization with two rentable fields. Verify week one returns a one-time blocker, an expanded weekly blocker, a scheduled-match blocker, and a pending booking blocker without disclosing their source. Move to another week and verify the request/range changes. Select 09:00-10:00 and 13:00-14:00 on one field, then a separate interval on another field/day; inspect the server test/log payload to confirm the checkout request contains three separate selections, not one 09:00-14:00 range. Confirm payment test mode and verify final rental items match the three selections only.

Expected successful focused output includes lines equivalent to:

    PASS src/app/api/organizations/[organizationId]/rental-availability/__tests__/route.test.ts
    BUILD SUCCESSFUL

## Validation and Acceptance

The new server endpoint is accepted when a valid seven-day request returns HTTP 200 with `range`, rentable `fields`, and only `{fieldId,start,end}` busy blocks. An invalid date or a range over the documented maximum returns HTTP 400. An unauthorized request does not expose the organization or its rental schedule. A public request never includes event title, match data, customer data, booking status, or price in a busy block.

The conflict helper is accepted when its focused test suite proves it returns blockers for direct events, recurring event slots, matches, and active rental booking items, and ignores non-overlapping boundary cases. Existing event scheduling validation must still fail for the same conflicts.

The checkout contract is accepted when tests prove a two-selection checkout reserves exactly two windows, allows the gap to remain available, rejects partially overlapping locks, and rejects confirmation whose selection fingerprint differs from the intent. The final order test must observe one booking item per selection with exactly matching field ID/start/end values.

The mobile change is accepted when `RentalAvailabilityLoaderTest` proves the loader does not call `getEventsByOrganization` for rental availability and maps a server opaque block into an unavailable UI interval. `OrganizationDetailComponentTest` must prove changing weeks requests a new bounded snapshot and that checkout keeps exact non-contiguous selection objects through intent, retry, and final confirmation. A manual emulator run must show the same situation visibly and no false continuous field blockage.

## Idempotence and Recovery

All availability reads are side-effect free and may be retried. Lock creation must remain idempotent for the same checkout owner plus selection fingerprint, while an overlapping different owner returns a conflict without creating partial locks. If lock creation fails partway through a multi-selection set, perform the operation in one database transaction or delete any locks created in that attempt before returning an error. Do not rely on mobile compensation for server partial state.

If a test range cannot be reconstructed after a server restart, recreate it from the same local fixture or test data; never change a production booking to test the feature. If a mobile build fails because its Android SDK path is absent, export `ANDROID_HOME` and `ANDROID_SDK_ROOT` for the Gradle command rather than changing tracked configuration. To back out an incomplete implementation, revert only the explicit server/mobile commits for this plan; do not reset the dirty main server worktree.

## Artifacts and Notes

The compatibility boundary at the beginning of this work is:

    Mobile availability: client-side event list limited to 300 records -> local conflict expansion
    New availability: one server snapshot for organization plus date range -> opaque conflict blocks

    Old payment intent: one synthetic start/end and all selected fields
    New payment intent: rentalSelections[] -> normalized fingerprint -> exact locks -> exact booking items

The endpoint intentionally does not promise that a shown time remains free until final lock creation. Its purpose is correct discovery; checkout remains authoritative and must show an actionable conflict message when a concurrent reservation wins.

## Interfaces and Dependencies

In `src/server/repositories/events.ts`, export a typed helper with a shape equivalent to:

    type FieldSchedulingConflict = {
      fieldId: string;
      start: Date;
      end: Date;
    };

    async function listFieldSchedulingConflicts(input: {
      organizationId: string;
      fieldIds: string[];
      windowStart: Date;
      windowEnd: Date;
      excludeEventId?: string;
    }): Promise<FieldSchedulingConflict[]>;

In `src/app/api/organizations/[organizationId]/rental-availability/route.ts`, return a payload equivalent to:

    {
      range: { start: string, end: string },
      fields: [{
        id: string,
        fieldNumber: number | null,
        name: string,
        facilityId: string | null,
        facilityName: string | null,
        rentalSlots: [{
          id: string,
          daysOfWeek: number[],
          startTimeMinutes: number,
          endTimeMinutes: number,
          startDate: string | null,
          endDate: string | null,
          timeZone: string | null,
          repeating: boolean,
          price: number
        }]
      }],
      busyBlocks: [{ fieldId: string, start: string, end: string }]
    }

In the server billing and public-rental-order modules, define and reuse a normalized selection interface equivalent to:

    type RentalSelectionInput = {
      fieldId: string;
      start: string;
      end: string;
    };

    type NormalizedRentalSelection = {
      fieldId: string;
      start: Date;
      end: Date;
    };

The mobile `IFieldRepository` must expose:

    suspend fun getRentalAvailability(
        organizationId: String,
        start: String,
        end: String,
    ): Result<RentalAvailabilitySnapshot>

The mobile billing request DTO must expose `rentalSelections: List<RentalSelectionDto>` and remove the aggregate synthetic rental time-slot representation from first-party callers. Its durable pending-order state must store the same list and selection fingerprint until success, cancellation, expiry, or explicit replacement.

Revision note (2026-07-12): Created after source-level research of APP-088 and APP-092 established that both defects require one server-owned availability/selection contract rather than isolated mobile patches.
