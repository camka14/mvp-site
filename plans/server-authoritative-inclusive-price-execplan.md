# Make inclusive price quotes server authoritative

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Maintain this document in accordance with `PLANS.md` at the root of `/Users/elesesy/StudioProjects/mvp-site`.

## Purpose / Big Picture

After this change, mobile price editors will no longer carry a private copy of BracketIQ's platform percentage, card-processing fee, or rounding algorithm. A host can enter either the amount they want to receive or the total online price, and the app will display and save a breakdown returned by the web service's canonical `billingFees.ts` policy. If a quote cannot be refreshed, the editor will show a retryable error and will not silently calculate a new total with stale local constants.

This closes DATA-017. It is observable in route tests that prove both quote directions and rounding boundaries, and in mobile tests that prove an older response cannot replace the latest input and that saved cents come from an accepted server quote.

## Progress

- [x] (2026-07-14 01:15Z) Confirmed DATA-017 remains open on site `de23d0d3` and audited mobile `fb9702ac`.
- [x] (2026-07-14 01:20Z) Located the duplicated 1%, 2.9%, 30-cent constants and inverse binary search in `InclusivePriceInput.kt` and the canonical implementations in `src/lib/billingFees.ts`.
- [x] (2026-07-14 01:25Z) Chose an authenticated, side-effect-free, versioned quote endpoint with explicit quote direction and integer cents.
- [x] (2026-07-14 01:40Z) Added the authenticated site quote route and focused regressions for both directions, zero, rounding, malformed input, and authentication.
- [x] (2026-07-14 01:45Z) Ran the quote route plus canonical fee suites: 2 suites and 19 tests passed.
- [x] (2026-07-14 01:30Z) Added mobile quote DTOs, strict repository validation, and a debounced generation-based latest-request-wins coordinator with retry and disposal handling.
- [x] (2026-07-14 01:30Z) Converted all three mobile `InclusivePriceInput` call sites to accepted server quotes, removed the local fee constants and inverse rounding code, and guarded team, event/division, and participant-bill saves while a quote is pending or failed.
- [x] (2026-07-14 02:55Z) Ran the 19-test site quote/fee batch and TypeScript, then the consolidated 148-test mobile batch, the iOS simulator compile, and Android KSP/install checks serially; all passed.
- [x] (2026-07-14 03:15Z) Installed versionName 1.6.14/versionCode 67 on the Pixel 9 Pro API 35 emulator, denied permission prompts using UI-tree-derived coordinates, reached Login, opened the email-signup form, and completed a force-stop/relaunch with no fatal exception, ANR, or OOM. No authenticated session was retained, so price-editor interaction was not reachable.
- [x] (2026-07-14 03:30Z) Committed site `9bd0a7d2` and mobile `69db9bf2`, then reconciled DATA-017 in `docs/code-audit/README.md` with the exact automated and emulator evidence.

## Surprises & Discoveries

- Observation: The site already exposes all required fee logic as pure helpers; no Stripe call or database lookup is necessary for an edit-time quote.
  Evidence: `src/lib/billingFees.ts` exports `calculateInclusivePriceFromHostAmount` and `calculateIncludedFeesFromTotalPrice`, both returning the same `InclusivePriceBreakdown` shape.

- Observation: Mobile uses the duplicated calculation in three different administrative editors, so changing only one screen would leave the policy fork alive.
  Evidence: `InclusivePriceInput` is called from `CreateOrEditTeamScreen.kt`, the event division editor, and `ParticipantsVeiw.kt`.

- Observation: The host-amount field cannot immediately mutate the persisted total without a confirmed quote, while the total-price field can retain the user's raw cents but still needs a confirmed breakdown before save.
  Evidence: Today `InclusivePriceInput` calls `onTotalPriceChange` directly for both fields and computes the other values synchronously.

- Observation: A $100.00 host take-home produces $1.00 of platform fee and $3.33 of processing fee for a $104.33 online price; the processing portion is not $2.33 because Stripe's gross-up applies to the host amount plus the platform fee.
  Evidence: The first route-test run exposed the mistaken hand calculation, after which the corrected explicit contract passed against `billingFees.ts`.

- Observation: The event/division price editor is shared by both the create-event wizard and event-detail editing, so the repository bridge must exist on both components even though there is only one `InclusivePriceInput` call site in source.
  Evidence: `CreateEventScreen.kt` and `EventDetailScreen.kt` both render `EventDetails`, which owns `EventDetailsDivisionEditorForm`.

- Observation: Existing repository and component interfaces already support default unsupported implementations for incrementally introduced capabilities.
  Evidence: The quote method uses the same default-failure pattern as discount preview and rental APIs, keeping unrelated test fakes source-compatible while production components delegate to `BillingRepository`.

- Observation: Treating an unchanged external total as a retry after a failed quote caused the enclosing form's normal state echo to restart requests invisibly.
  Evidence: The consolidated test batch exposed the loop; external synchronization is now a no-op for the same direction/input regardless of pending, confirmed, or error state, while only the explicit Retry action starts a new generation.

- Observation: The standard Android test task can silently match no tests when a fully qualified class filter uses the repository package instead of the event-detail package.
  Evidence: XML result inventory exposed the missing `MatchRepositoryHttpTest`; rerunning `com.razumly.mvp.eventDetail.data.MatchRepositoryHttpTest` executed and passed all 15 tests.

## Decision Log

- Decision: Add `POST /api/billing/inclusive-price-quote` with `{ direction, amountCents, eventType? }` and a versioned response containing integer cents and the platform percentage.
  Rationale: POST avoids putting editable financial input into a query string, the explicit direction makes inverse calculations unambiguous, and versioning allows a future fee-model response to evolve without reintroducing client policy.
  Date/Author: 2026-07-14 / Codex

- Decision: Require an authenticated session but no mutation-specific permission for the quote route.
  Rationale: The operation is side-effect free, but fee policy is an authenticated product contract rather than a public calculator. Each actual save route continues to enforce its own resource permission.
  Date/Author: 2026-07-14 / Codex

- Decision: Use the site's existing default card semantics for this first edit-time contract.
  Rationale: The duplicated mobile component currently models card processing only. Selecting a payment method happens later, and changing every editor into a payment-method-specific quote surface would expand DATA-017 beyond removing the duplicated policy.
  Date/Author: 2026-07-14 / Codex

- Decision: Retain only the last confirmed quote and use a monotonically increasing request generation in mobile state.
  Rationale: Debounce or cancellation alone cannot prove that an older network response will not overwrite newer input. A generation check gives deterministic latest-request-wins behavior on every platform.
  Date/Author: 2026-07-14 / Codex

- Decision: Disable save or submission while the visible amount lacks a matching confirmed quote, and present a retry action on quote failure.
  Rationale: Saving raw or locally derived cents after an unavailable quote would preserve the exact policy-drift bug this change is intended to remove.
  Date/Author: 2026-07-14 / Codex

- Decision: Keep raw edits inside the shared coordinator and update feature-owned cents only from an accepted quote.
  Rationale: This makes existing `Team.registrationPriceCents`, event/division `priceCents`, bill preview, and `EventTeamBillCreateRequest.eventAmountCents` remain the last confirmed server value throughout debounce, request, and retry states.
  Date/Author: 2026-07-14 / Codex

## Outcomes & Retrospective

DATA-017 is complete in the audited branches. Site `9bd0a7d2` owns the version-1 quote endpoint and mobile `69db9bf2` removes the duplicated 1%, 2.9%, 30-cent policy and inverse rounding code. The repository rejects unsupported versions, mismatched directions or request anchors, negative/non-integer/inconsistent cents, and invalid percentages. The coordinator covers initial zero, debounce, out-of-order completion, explicit failure/retry, mismatched success, same-value external synchronization, and disposal. The four real product surfaces accept only confirmed server cents and block save/create while the visible amount is unconfirmed.

Verification is current-source and commit-backed: the site route/canonical fee batch passed 19 tests plus `npx tsc --noEmit`; the unique mobile set across 12 relevant classes passed 148 tests with zero failures, errors, or skips; iOS simulator compilation, Android KSP, and `:composeApp:installDebug` passed. The freshly installed Android build reached Login, responded to the email-signup action, and survived a clean force-stop/relaunch without a fatal exception, ANR, or OOM. Authenticated price editors were not manually reachable because the fresh install had no retained session, so their rendered/error/save states remain covered by repository, coordinator, Compose, and component regressions rather than an emulator interaction.

## Context and Orientation

The web/server repository is `/Users/elesesy/StudioProjects/mvp-site`. The audited mobile worktree is `/private/tmp/mvp-app-critical-audit`. Both use branch `codex/critical-audit-remediation`.

An inclusive price breakdown separates the amount the host receives, the card processing fee, the BracketIQ platform fee, and the total online price. The site source of truth is `src/lib/billingFees.ts`. The mobile duplicate is `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/presentation/composables/InclusivePriceInput.kt`. Mobile network DTOs live under `core/network/src/commonMain`, while authenticated HTTP methods are implemented in `core/repository-impl/src/commonMain/.../BillingRepository.kt`.

The site checkout contains unrelated broadcast and scoring changes. Stage and commit only files named by this plan. The mobile rental checkout work also edits billing DTO and repository files; finish and review that work before editing overlapping mobile hunks for this plan.

## Plan of Work

First, add an authenticated route at `src/app/api/billing/inclusive-price-quote/route.ts`. Parse JSON with Zod. Accept only `HOST_AMOUNT` or `TOTAL_PRICE`, a finite integer `amountCents` from zero through a documented safe maximum, and an optional bounded event-type string. Reject malformed input with 400 and unauthenticated input with 401. Delegate directly to `calculateInclusivePriceFromHostAmount` or `calculateIncludedFeesFromTotalPrice`. Return `{ version: 1, direction, breakdown }`, where all money fields are integer cents. Do not call Stripe or Prisma.

Add route tests for both directions, zero, values on rounding boundaries, malformed direction, negative/fractional/oversized amounts, malformed JSON, and missing authentication. Keep or extend the pure `billingFees.test.ts` suite if a boundary is not already explicit there.

After the APP-092 billing-file changes settle, add serializable quote request and response DTOs to the mobile network module and a `quoteInclusivePrice` method to `IBillingRepository` and `BillingRepository`. The repository must authenticate through the existing client, post integer cents to the new endpoint, reject unsupported response versions or inconsistent/non-integer/negative money fields, and return a domain breakdown that contains both direction and requested amount for correlation.

Extract a small common, coroutine-backed quote coordinator or state holder that owns raw host/total input, an incrementing generation, pending/error state, and the last accepted quote. A new input starts a request after the existing UI's practical debounce interval. Only a response whose generation and requested direction/amount still match current input may be accepted. Closing or disposing the editor invalidates the generation. Zero still goes through the same authoritative contract unless an explicit zero response is seeded from a previously validated version-1 invariant; do not retain fee constants or rounding code.

Refactor `InclusivePriceInput` to render supplied quote state and emit typed quote intents rather than calculate fees. For host input, update the saved total only after a matching server response. For total input, preserve the raw text while pending but expose a confirmed total to the enclosing screen only when the matching quote succeeds. Show progress, a concise failure message, and retry. Wire all call sites through their existing component/repository lifecycle so composition does not create an unmanaged network client. Prevent save/create actions when the displayed amount is not confirmed.

Finally, run the focused tests serially, then compile shared iOS code and build/install the Android app. Exercise one reachable editor using coordinates derived from the UI tree. If the supplied account remains invalid, record the backend rejection and rely on the focused component and HTTP tests for the authenticated UI state; do not claim a screen was manually reached.

## Concrete Steps

In `/Users/elesesy/StudioProjects/mvp-site`, run site verification serially:

    npm test -- --runInBand src/app/api/billing/inclusive-price-quote/__tests__/route.test.ts src/lib/__tests__/billingFees.test.ts
    npx tsc --noEmit

In `/private/tmp/mvp-app-critical-audit`, first confirm no other Gradle wrapper is active, then run the focused mobile suites selected by implementation. At minimum:

    JAVA_HOME=/Users/elesesy/Library/Java/JavaVirtualMachines/jbr-21.0.6/Contents/Home ANDROID_HOME=/Users/elesesy/Library/Android/sdk ANDROID_SDK_ROOT=/Users/elesesy/Library/Android/sdk ./gradlew :composeApp:testDebugUnitTest --tests 'com.razumly.mvp.core.data.repositories.BillingRepositoryHttpTest' --tests '*InclusivePrice*' --no-daemon
    JAVA_HOME=/Users/elesesy/Library/Java/JavaVirtualMachines/jbr-21.0.6/Contents/Home ANDROID_HOME=/Users/elesesy/Library/Android/sdk ANDROID_SDK_ROOT=/Users/elesesy/Library/Android/sdk ./gradlew :composeApp:compileKotlinIosSimulatorArm64 --no-daemon

Build and install the exact mobile commit with `:composeApp:installDebug`, cold-launch `com.razumly.mvp/.MainActivity`, inspect the UI tree before taps, capture a screenshot, and inspect fresh process/crash logs.

## Validation and Acceptance

The route regression must prove the service returns exactly the current `billingFees.ts` breakdown for both directions, including zero and rounding-boundary inputs. Invalid inputs must never be normalized into a plausible quote, and the route must have no external side effects.

The mobile HTTP regression must prove the request contract and strict response validation. State tests must deliver two requests out of order and prove only the newest becomes visible, then prove a failure preserves the last confirmed quote without marking the new amount confirmed, retry can recover, and close/dispose rejects a late response. UI or component tests must prove the displayed breakdown and emitted saved cents come from the accepted response rather than any local computation. A repository-wide search must find no mobile copies of the 1%, 2.9%, 30-cent fee policy or the inverse fee binary search.

TypeScript, Android unit compilation, and iOS shared compilation must succeed. A newly installed Android APK must cold-launch without a fatal exception, ANR, or OOM. Authenticated editor interaction is accepted only if a valid retained account is available.

## Idempotence and Recovery

The route is side-effect free and all tests/builds are safe to rerun. Mobile quote requests are idempotent. A failed or stale request may not mutate the saved cents or confirmation state. If site and mobile cannot deploy together, deploy the endpoint first; the old mobile remains compatible. Do not ship the new mobile until the endpoint is available in its target environment.

Do not reset either worktree. Stage explicit paths and run `git diff --cached --check` before each commit. If concurrent APP-092 work changed the same billing DTO or repository hunk, review and integrate both contracts rather than overwriting either one.

## Artifacts and Notes

Baseline mobile policy fork:

    PlatformFeePercentage = 0.01
    StripeProcessingPercentage = 0.029
    StripeFixedFeeCents = 30

Baseline site authority:

    calculateInclusivePriceFromHostAmount(...)
    calculateIncludedFeesFromTotalPrice(...)

## Interfaces and Dependencies

The site request is:

    { direction: "HOST_AMOUNT" | "TOTAL_PRICE", amountCents: number, eventType?: string }

The successful response is:

    {
      version: 1,
      direction: "HOST_AMOUNT" | "TOTAL_PRICE",
      breakdown: {
        hostReceivesCents: number,
        processingFeeCents: number,
        platformFeeCents: number,
        totalPriceCents: number,
        platformFeePercentage: number
      }
    }

Use existing authentication, JSON, coroutine, and HTTP-client dependencies. No database migration or external library is required.

Revision note (2026-07-14): Initial plan created after current-source review confirmed DATA-017 and all three active mobile call sites.

Revision note (2026-07-14 01:30Z): Recorded the completed mobile repository/coordinator implementation, all create/edit component bridges, accepted-quote-only persistence guards, local-policy removal, and authored focused regressions. Gradle and commits remain intentionally pending per the active handoff constraint.

Revision note (2026-07-14 03:30Z): Recorded final site/mobile commits, the corrected 148-test mobile inventory, TypeScript and iOS checks, Android KSP/install evidence, clean Login/signup/relaunch emulator evidence, the same-value retry-loop regression, and the authenticated-editor reachability limitation.
