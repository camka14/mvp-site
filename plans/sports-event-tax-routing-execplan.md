# Sports event tax routing

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document follows `PLANS.md` in the repository root. It is self-contained so a contributor can continue the work without relying on prior conversation.

## Purpose / Big Picture

BracketIQ currently calls Stripe Tax during every paid event checkout that reaches `/api/billing/purchase-intent`. For low-price recreational sports registrations, that creates avoidable cost and friction when the event location is in a jurisdiction where no sales tax should be collected for the transaction. After this work, the backend will decide whether an event registration can use a zero-tax path before calling Stripe Tax. Users in clearly zero-tax sports event jurisdictions can pay through the existing web modal or mobile PaymentSheet without a Stripe Tax calculation.

The first milestone keeps the current PaymentIntent-based checkout UI intact. Later milestones can add Stripe Checkout Sessions and a backend threshold so both `mvp-site` and `mvp-app` switch behavior from the same server response instead of duplicating the threshold in each client.

The next milestone expands the policy from "does this need Stripe Tax" to "who is responsible for collecting and reporting tax." BracketIQ must support state-by-state marketplace facilitator determinations. A marketplace facilitator is a platform that a state treats as the seller responsible for collecting and remitting sales tax on third-party sales. A state can decide that BracketIQ is the responsible marketplace facilitator for one charge type, while another state or charge type can leave responsibility with the organizer. After this milestone, the event creation price area will explain organizer responsibility when policy says BracketIQ is not the marketplace facilitator for the event state and charge type. When BracketIQ is responsible, the UI will not show an organizer warning.

## Progress

- [x] (2026-05-07 20:35Z) Read the existing billing route, Stripe tax helper, web PaymentModal, mobile PaymentSheet call sites, and `PLANS.md`.
- [x] (2026-05-07 20:35Z) Confirmed both web and mobile already depend on `/api/billing/purchase-intent`, which is the right backend control point for future PaymentIntent versus Checkout routing.
- [x] (2026-05-07 21:00Z) Added `src/lib/taxPolicy.ts` and `src/lib/__tests__/taxPolicy.test.ts`.
- [x] (2026-05-07 21:10Z) Wired `/api/billing/purchase-intent` and `/api/billing/tax-preview` through the tax policy helper.
- [x] (2026-05-07 21:15Z) Added route coverage proving a New Jersey sports event checkout skips `calculateTaxQuote` and still charges customer fees.
- [x] (2026-05-07 21:25Z) Added additive checkout/tax policy fields to the web and mobile purchase-intent contracts, plus clearer fee preview labels.
- [x] (2026-05-07 21:30Z) Ran focused route/helper tests and TypeScript validation.
- [x] (2026-05-07 21:45Z) Collapsed the customer-facing Stripe tax check cost into the Stripe fee line in web and mobile previews while keeping backend fields separate.
- [x] (2026-05-08 00:20Z) Added organization tax profile fields, event tax handling, rental tax handling, Prisma migration, and generated Prisma client updates.
- [x] (2026-05-08 00:35Z) Wired persisted event, rental slot, and organization tax context into `/api/billing/purchase-intent` and `/api/billing/tax-preview` so clients do not decide tax policy locally.
- [x] (2026-05-08 00:45Z) Added the organization create/edit tax agreement UI and organization-hosted event tax handling selector. Rentals remain on Stripe Tax.
- [x] (2026-05-08 01:05Z) Confirmed `mvp-app` reads organizations but does not create or update them, so no mobile organization agreement screen is required for this milestone.
- [x] (2026-05-08 01:25Z) Ran web focused tests, web TypeScript validation, and Android Kotlin compile successfully after the organization tax responsibility milestone.
- [x] (2026-05-08 01:40Z) Added Washington to the individual/no-organization sports event zero-tax gate while leaving organization-hosted Washington events controlled by org tax settings.
- [x] (2026-05-08 19:21Z) Revised this ExecPlan for the marketplace-facilitator tax responsibility milestone and the price-section organizer responsibility message.
- [x] (2026-05-08 19:40Z) Added a tax responsibility policy result that separates taxability, legal liability party, and collection strategy while preserving the legacy `taxMode` field.
- [x] (2026-05-08 19:45Z) Added an initially empty state/charge-type organizer-liability rule list for jurisdictions where BracketIQ has confirmed it is not the marketplace facilitator.
- [x] (2026-05-08 20:05Z) Updated the event creation/edit price section to show organizer responsibility only when the resolved policy says the organizer is liable.
- [x] (2026-05-08 20:20Z) Updated checkout, preview, payment metadata, transfer behavior, and focused tests so organizer-liable manual tax is not treated as platform-retained tax.

## Surprises & Discoveries

- Observation: The current route calculates tax before reserving the `STARTED` event registration row.
  Evidence: `src/app/api/billing/purchase-intent/route.ts` calls `calculateTaxQuote` around line 819 and reserves the event slot around line 898.
- Observation: Event rows store `location`, optional `address`, and `coordinates`, but do not store structured state/postal-code fields.
  Evidence: `prisma/schema.prisma` `model Events` has `location String`, `address String?`, and `coordinates Json`.
- Observation: The web app has a `PaymentIntent` response type only. Mobile also expects a purchase intent response from the same endpoint.
  Evidence: `src/types/index.ts` defines `PaymentIntent`, and `mvp-app` `BillingRepository.kt` calls `api/billing/purchase-intent`.
- Observation: `mvp-app` already had a `checkoutSessionId` field in one billing DTO area, but the main `PurchaseIntent` model did not expose checkout URL or tax policy fields.
  Evidence: `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/BillingRepository.kt` now has additive `checkoutMode`, `checkoutUrl`, `checkoutSessionId`, `taxMode`, `taxReasonCode`, and `taxJurisdictionState` fields.
- Observation: Android Kotlin compilation did not finish within the three-minute tool timeout on this Windows host.
  Evidence: `.\gradlew.bat :composeApp:compileDebugKotlinAndroid` timed out after 184 seconds with no useful output. `.\gradlew.bat :composeApp:compileKotlinMetadata` completed successfully, but the task was skipped after configuration because of disabled native targets on Windows.
- Observation: Washington sports league participation fees are usually not subject to retail sales tax, but fees charged by an athletic or fitness facility operator for league play are taxable.
  Evidence: Washington DOR's sports leagues guide says retail sales tax generally does not apply to soccer, baseball, basketball, football, volleyball, hockey, softball, or other league play participation fees, while charges by an AFF operator for league play require sales tax.
- Observation: The mobile app currently lists and searches organizations but does not create or edit organizations.
  Evidence: Source search under `C:\Users\samue\StudioProjects\mvp-app\composeApp\src` found GET calls for `api/organizations` and `api/organizations/{id}/templates`, but no POST or PATCH path for `api/organizations`.
- Observation: The Android compile task starts a local backend helper during prebuild.
  Evidence: `.\gradlew.bat :composeApp:compileDebugKotlinAndroid` logged `startLocalBackend: starting (npm) in C:\Users\samue\Documents\Code\mvp-site on port 3000`; the tracked pid was gone after the compile finished.
- Observation: Stripe Tax for Connect requires BracketIQ to determine whether the platform or connected account is legally responsible before choosing the Stripe Tax integration path.
  Evidence: Stripe's Connect tax guide states that the first step is determining which entity must collect and report taxes, and that liability can depend on marketplace laws, business model, order amount, and product type.
- Observation: Connected-account Stripe Tax is not just a UI switch.
  Evidence: Stripe's tax-for-platforms guide says connected accounts need tax settings and registrations before enabling calculations; otherwise Stripe can return zero tax with a `not_collecting` reason when an account lacks a registration.
- Observation: Current destination-charge PaymentIntent behavior transfers only the organizer subtotal, while tax remains on the platform side.
  Evidence: `src/app/api/billing/purchase-intent/route.ts` calls `buildDestinationTransferData` with `transferAmountCents: taxQuote.subtotalCents`, so any organizer-liable manual tax would need an explicit transfer behavior change before launch.

## Decision Log

- Decision: Implement zero-tax routing in a standalone helper rather than inline in the route.
  Rationale: The user wants threshold and checkout behavior to be modular. A single policy helper can later decide between zero-tax PaymentIntent, Stripe-tax PaymentIntent, and Stripe Checkout.
  Date/Author: 2026-05-07 / Codex.
- Decision: Apply the first zero-tax gate only to `purchaseType === "event"`.
  Rationale: Facility rentals can be taxable as recreational facility use or real-property rental depending on state and facts. Keeping rentals on the existing Stripe Tax path avoids silently under-collecting while event-specific rules are introduced.
  Date/Author: 2026-05-07 / Codex.
- Decision: Treat BracketIQ event registrations as recreational sports participant charges, not spectator tickets.
  Rationale: The product positioning and user clarification say events are tournaments, leagues, pickup games, and similar sports participation.
  Date/Author: 2026-05-07 / Codex.
- Decision: Initial explicit individual participant-exemption states are New York, New Jersey, and Washington, plus safe no-general-sales-tax states where there is no state or local general sales tax in normal use.
  Rationale: New York and New Jersey publish participant sporting activity exemptions. Washington publishes a sports league participation rule that generally treats participation fees as not retail sales unless an athletic or fitness facility operator is charging for league play. Delaware and Oregon publish no state/local or general sales tax guidance. New Hampshire is commonly no-sales-tax but will remain easy to add; Alaska and Montana are intentionally excluded from the automatic zero gate because local sales or resort taxes can apply.
  Date/Author: 2026-05-07 / Codex.
- Decision: Customer-facing payment previews show one Stripe fee line instead of separate card processing and Stripe Tax service rows.
  Rationale: The backend should retain the detailed breakdown for audit and policy decisions, but the checkout UI does not need to expose the tax-check cost as a separate customer label.
  Date/Author: 2026-05-07 / Codex.
- Decision: Add Washington to the individual/no-organization sports registration zero-tax gate, but keep organization-hosted Washington events controlled by the organization tax profile.
  Rationale: Washington's rule turns on whether an athletic or fitness facility operator is charging for league play. An individual pickup or league host is not modeled as that facility operator, while organizations now have a tax profile and agreement that lets them choose Stripe Tax or attest to sports registration exemption.
  Date/Author: 2026-05-08 / Codex.
- Decision: Add organization-level tax responsibility fields instead of custom manual tax rates for the MVP.
  Rationale: Manual tax rates would make organizations enter rates without solving the harder legal question of whether a transaction is taxable. The MVP stores who the seller is, whether the seller operates an athletic facility, the default event tax handling, and an agreement timestamp. Stripe Tax remains available when the organization chooses the conservative path.
  Date/Author: 2026-05-08 / Codex.
- Decision: Require an accepted organization tax responsibility agreement before an organization-hosted event can use the sports-registration-exempt path.
  Rationale: Existing organizations may not have seen the new responsibility language. Falling back to Stripe Tax until acceptance prevents an old organization from silently skipping tax through a new default or event override.
  Date/Author: 2026-05-08 / Codex.
- Decision: Keep rentals on Stripe Tax and store rental tax handling as `STRIPE_TAX`.
  Rationale: Facility and field rentals are more often taxable and fact-specific than participant event registration. A one-value field keeps the model extensible without adding an unsafe exemption path.
  Date/Author: 2026-05-08 / Codex.
- Decision: Model marketplace-facilitator responsibility as a first-class policy dimension, not as another zero-tax state list.
  Rationale: A state can say a transaction is taxable without making BracketIQ the collector, or it can make BracketIQ the collector for taxable marketplace transactions. The code needs to keep taxability and liability separate so organizer warnings, Stripe Tax setup, transfers, and reports are correct.
  Date/Author: 2026-05-08 / Codex.
- Decision: Start the confirmed organizer-liable marketplace-facilitator list empty.
  Rationale: The user wants states added one at a time after rulings or clear authority. Unknown states should stay conservative and should not expose organizer manual tax controls by default.
  Date/Author: 2026-05-08 / Codex.
- Decision: Show the organizer responsibility message only when the policy result says the organizer is liable for tax collection.
  Rationale: If BracketIQ is responsible, the user requested no message. If no sales tax applies, there is no organizer collection obligation to warn about. If the organizer is responsible, the price section should say exactly: "You are responsible for reporting and collecting sales tax in your state."
  Date/Author: 2026-05-08 / Codex.

## Outcomes & Retrospective

The first milestone is implemented. Event registrations in the configured zero-tax jurisdictions return `taxMode: "ZERO_TAX"`, omit a Stripe Tax calculation ID, skip the PaymentIntent tax hook, and still charge event price plus BracketIQ and Stripe fees. Rentals and unknown/unconfigured event states preserve the existing Stripe Tax path.

The organization tax responsibility milestone is also implemented. Organizations now store a tax profile and agreement timestamp, organization-hosted events can inherit the organization default or explicitly choose Stripe Tax or sports-registration-exempt handling, and checkout/tax preview routes load persisted event and organization tax context before deciding whether Stripe Tax is required. Rentals continue to use Stripe Tax.

The marketplace-facilitator responsibility milestone is implemented for the first safe slice. The policy helper now returns taxability, liability party, and collection strategy in addition to the legacy `ZERO_TAX` or `STRIPE_TAX_REQUIRED` mode. The confirmed organizer-liable rule list starts empty, so unknown taxable states such as Idaho remain platform-liable until a reviewed rule is added. Tests inject a temporary organizer-liable rule to prove the UI, preview, checkout metadata, and destination-transfer behavior without enabling any production state by default.

A later milestone should implement a Checkout Session creator and a backend payment presentation decision such as `PAYMENT_INTENT` versus `CHECKOUT_SESSION`, using the fields added in this milestone. That work should include mobile Custom Tab/Safari View behavior and web hosted or embedded Checkout behavior. It should happen after the marketplace-facilitator policy result exists, because connected-account tax liability may require Checkout or direct connected-account charges rather than the current platform PaymentIntent path.

## Context and Orientation

The current one-time payment flow is centered on `src/app/api/billing/purchase-intent/route.ts`. That route resolves the purchase amount with `src/lib/purchaseContext.ts`, loads a billing address, calls `src/lib/stripeTax.ts` `calculateTaxQuote`, reserves event or rental state, and creates a Stripe PaymentIntent.

The web checkout UI is `src/components/ui/PaymentModal.tsx`. It receives the backend `PaymentIntent` response and displays `feeBreakdown` before mounting Stripe Elements. The mobile app in `C:\Users\samue\StudioProjects\mvp-app` uses the same backend route and presents native Stripe PaymentSheet.

A "zero-tax gate" means a deterministic backend function decides that a Stripe Tax calculation is not needed for a specific purchase. The first gate is limited to sports event participant registrations because BracketIQ events are recreational sports participation, not spectator tickets. The helper must return a reason and state so the decision is auditable in metadata and tests.

The current event editor price area lives in `src/app/events/[id]/schedule/components/EventForm.tsx`. It imports `resolvePurchaseTaxPolicy`, derives `eventTaxPolicyForPreview` near the organization state variables, passes `eventTaxableForPreview` into `PriceWithFeesPreview`, and renders the main event price control around the "Division Defaults" section. The organizer-facing tax responsibility message belongs in this same price area, immediately near the price control and tax handling selector so the organizer sees it before saving the event.

An "organizer-liable" transaction means the state and charge type have been reviewed and BracketIQ has concluded that the organizer, not the platform, is responsible for collecting and reporting sales tax. This plan starts with no organizer-liable states. Adding a state later must be an explicit code/config change that names the state, charge type, ruling or source, and effective date.

## Plan of Work

Create `src/lib/taxPolicy.ts` with functions for normalizing US state names/codes from free-form event `address` and `location` strings. The module should export a `resolvePurchaseTaxPolicy` function that accepts purchase type, tax category, event location fields, and returns either `ZERO_TAX` or `STRIPE_TAX_REQUIRED`.

Update `src/app/api/billing/purchase-intent/route.ts` so it resolves tax policy after the purchase context is known. For `ZERO_TAX`, it should not require a saved billing address, should not call `calculateTaxQuote`, should build the same fee breakdown with zero tax and no Stripe Tax service fee, and should create the PaymentIntent without `hooks.inputs.tax.calculation`. It should still charge the customer the event price plus BracketIQ and card-processing fees, and still reserve event registration before creating the PaymentIntent.

Update `src/app/api/billing/tax-preview/route.ts` through the same helper so previews return a zero-tax breakdown without requiring billing address when policy says tax is zero.

Extend `src/types/index.ts` so the existing payment response can include optional tax policy fields. This is an additive contract that future web/mobile Checkout routing can reuse.

Add focused tests in `src/lib/__tests__/taxPolicy.test.ts` and the existing purchase-intent route test file. Tests should verify state extraction, New York/New Jersey participant exemptions, safe no-tax states, rental fallback to Stripe Tax, and that a New Jersey sports event checkout skips `calculateTaxQuote` but still creates a PaymentIntent for the fee-inclusive total.

For the marketplace-facilitator milestone, `src/lib/taxPolicy.ts` now returns a richer decision. The old `mode` field remains temporarily for compatibility, and the result also includes `taxability`, `liabilityParty`, `collectionStrategy`, and `organizerResponsibilityMessage`. Taxability answers whether the charge itself is taxable. Liability answers who must collect and report. Collection strategy answers what the checkout code should do. The initial strategies are platform Stripe Tax, organizer Stripe Tax, organizer manual tax, no tax, and blocked review.

`src/lib/taxPolicy.ts` exposes `CONFIRMED_ORGANIZER_LIABLE_EVENT_TAX_RULES`, and the list is intentionally empty. This list is state and charge-type aware rather than a broad state-only escape hatch. Its purpose is to hold future rulings or state-specific determinations where BracketIQ is not the marketplace facilitator for sports participant event registrations. The resolver prioritizes this responsibility decision before offering organizer controls. Unknown states stay conservative and do not show organizer manual tax controls.

Preserve the existing no-tax logic as taxability rules, not as marketplace facilitator rules. For example, Oregon and Delaware can resolve to no tax because no general sales tax applies, but that is different from saying the organizer must collect tax. Washington ordinary sports participation can remain a no-tax rule for the facts already modeled, while facility/operator or other charge types remain conservative until reviewed.

Organizer tax handling values are available only where policy allows organizer liability. The relevant type aliases in `src/lib/taxPolicy.ts`, `src/types/index.ts`, and persisted string normalization now distinguish platform Stripe Tax, organizer Stripe Tax, organizer manual tax, and no-tax decisions. The event form does not expose `ORGANIZER_*` choices unless the policy decision says the event state and charge type are organizer-liable.

`src/app/events/[id]/schedule/components/EventForm.tsx` now renders the responsibility message in the price section. Next to the price input and existing tax handling control, it shows no responsibility message when `liabilityParty` is `PLATFORM` or `NONE`. When `liabilityParty` is `ORGANIZER`, it shows exactly: "You are responsible for reporting and collecting sales tax in your state." In that organizer-liable branch, the organizer can choose a manual tax rate or organizer Stripe Tax. The first implementation stores the manual rate in basis points because divisions can have different prices; checkout and preview compute the actual cents from the selected price.

Checkout and transfer behavior now handles organizer manual tax before enabling it through policy. For platform-liable tax, the current behavior remains: the platform collects/remits tax and transfers only the organizer subtotal. For organizer-liable manual tax, the tax dollars are transferred to the connected account along with the organizer subtotal, while BracketIQ keeps only platform and Stripe fees. Organizer-liable Stripe Tax is explicitly blocked for now instead of reusing the existing platform PaymentIntent tax calculation; it needs a connected-account-safe Stripe path such as Checkout with `automatic_tax.liability` set to the connected account, or a direct connected-account charge, after verifying the connected account has tax settings and registrations.

PaymentIntent metadata now records the tax policy result used at checkout: state, charge type, liability party, collection strategy, policy reason code, rule version, tax calculation id if any, and organizer manual tax rate/amount if applicable. This metadata is required for later reconciliation and for explaining why a payment did or did not collect tax.

## Concrete Steps

From `/Users/elesesy/StudioProjects/mvp-site`, run:

    npm test -- src/lib/__tests__/taxPolicy.test.ts src/app/api/billing/__tests__/purchaseIntentRoute.test.ts --runInBand

If TypeScript issues appear after route edits, run:

    npx tsc --noEmit

Validation actually run during this milestone:

    npm test -- src/lib/__tests__/taxPolicy.test.ts src/app/api/billing/__tests__/purchaseIntentRoute.test.ts --runInBand
    Result: PASS, 2 suites, 17 tests.

    npm test -- src/app/api/billing/__tests__/purchaseIntentRoute.test.ts src/app/api/billing/__tests__/purchaseIntentDestinationChargeRoute.test.ts src/app/api/billing/__tests__/purchaseIntentDuplicateEventRoute.test.ts src/app/api/billing/__tests__/purchaseIntentTeamRegistrationRoute.test.ts --runInBand
    Result: PASS, 4 suites, 22 tests. One expected mocked Stripe failure logs in the destination-charge 502 test.

    npx tsc --noEmit
    Result: PASS.

    npx tsc --noEmit
    Result after customer-facing fee label update: PASS.

    npm test -- src/components/ui/__tests__/PriceWithFeesPreview.test.tsx --runInBand
    Result after customer-facing fee label update: PASS, 1 suite, 3 tests.

    C:\Users\samue\StudioProjects\mvp-app> .\gradlew.bat :composeApp:compileKotlinMetadata
    Result: BUILD SUCCESSFUL; the metadata compile task itself was skipped after configuration warnings about disabled iOS targets on Windows.

    C:\Users\samue\StudioProjects\mvp-app> .\gradlew.bat :composeApp:compileDebugKotlinAndroid
    Result: timed out after 184 seconds before producing useful compiler output.

    C:\Users\samue\StudioProjects\mvp-app> .\gradlew.bat :composeApp:compileDebugKotlinAndroid
    Result after customer-facing fee label update: BUILD SUCCESSFUL. Existing warnings remain, including disabled iOS native targets on Windows and unrelated Kotlin deprecation/safe-call warnings.

    npx prisma generate
    Result after organization tax responsibility update: PASS. Prisma Client 7.7.0 generated to src/generated/prisma.

    npm test -- src/lib/__tests__/taxPolicy.test.ts src/app/api/organizations/__tests__/organizationsRoute.test.ts src/app/api/organizations/__tests__/organizationByIdRoute.test.ts src/app/api/billing/__tests__/purchaseIntentRoute.test.ts --runInBand
    Result after organization tax responsibility update: PASS, 4 suites, 31 tests.

    npm test -- src/server/repositories/__tests__/events.upsert.test.ts src/components/ui/__tests__/PriceWithFeesPreview.test.tsx src/app/api/billing/__tests__/purchaseIntentTeamRegistrationRoute.test.ts src/app/events/[id]/schedule/components/__tests__/EventForm.test.tsx src/app/events/[id]/schedule/__tests__/page.test.tsx --runInBand
    Result after organization tax responsibility update: PASS, 3 suites, 44 tests. The bracketed event-form paths did not match under this command and were rerun with --runTestsByPath.

    npm test -- --runTestsByPath "src/app/events/[id]/schedule/components/__tests__/EventForm.test.tsx" "src/app/events/[id]/schedule/__tests__/page.test.tsx" --runInBand
    Result after organization tax responsibility update: PASS, 2 suites, 95 tests. Existing warning/error logs are exercised by those tests.

    npx tsc --noEmit
    Result after organization tax responsibility update: PASS.

    npm test -- src/lib/__tests__/taxPolicy.test.ts src/app/api/billing/__tests__/purchaseIntentRoute.test.ts --runInBand
    Result after adding Washington individual-event zero-tax handling: PASS, 2 suites, 21 tests.

    npx tsc --noEmit
    Result after adding Washington individual-event zero-tax handling: PASS.

    C:\Users\samue\StudioProjects\mvp-app> .\gradlew.bat :composeApp:compileDebugKotlinAndroid
    Result after organization tax responsibility update: BUILD SUCCESSFUL. Existing Windows host warnings about disabled iOS targets remain.

    npx prisma generate
    Result after marketplace-facilitator responsibility update: PASS. Prisma Client 7.7.0 generated to src/generated/prisma.

    npm test -- src/lib/__tests__/taxPolicy.test.ts --runInBand
    Result after marketplace-facilitator responsibility update: PASS, 1 suite, 10 tests.

    npm test -- src/app/api/billing/__tests__/purchaseIntentRoute.test.ts --runInBand
    Result after marketplace-facilitator responsibility update: PASS, 1 suite, 15 tests.

    npm test -- --runTestsByPath "src/app/events/[id]/schedule/components/__tests__/EventForm.test.tsx" --runInBand
    Result after marketplace-facilitator responsibility update: PASS, 1 suite, 40 tests. Existing warning logs from validation paths remain.

    npx tsc --noEmit
    Result after marketplace-facilitator responsibility update: PASS.

## Validation and Acceptance

Acceptance for the first milestone is:

1. A paid individual/no-organization event registration with event address or location in New Jersey, New York, Washington, Delaware, or Oregon returns `feeBreakdown.taxAmount: 0` and a `taxMode` showing `ZERO_TAX`.
2. The route does not call `calculateTaxQuote` for those zero-tax event registrations.
3. The PaymentIntent amount still includes the event price, BracketIQ processing fee, and Stripe card processing fee so the customer pays fees.
4. Rentals still call the existing Stripe Tax path unless and until a separate rental policy is added.
5. Existing tests for taxed event checkout still pass.

Acceptance for the marketplace-facilitator milestone is:

1. With the confirmed organizer-liable list empty, event creation in an unknown taxable state such as Idaho does not expose organizer manual tax controls and does not show the organizer responsibility message.
2. A unit test can add a temporary organizer-liable policy fixture for a state and prove that `resolvePurchaseTaxPolicy` returns `liabilityParty: "ORGANIZER"` and a collection strategy that permits organizer manual or organizer Stripe Tax.
3. In the event form price area, the organizer-liable fixture shows exactly "You are responsible for reporting and collecting sales tax in your state." next to the price/tax controls.
4. In platform-liable or no-tax policy states, the price area shows no responsibility message.
5. Platform-liable checkout metadata records platform liability and preserves the existing transfer amount behavior.
6. Organizer-liable manual-tax checkout metadata records organizer liability and transfers organizer subtotal plus organizer tax to the connected account. This behavior must be covered by route tests before it is enabled in production UI.
7. Focused tests pass with `npm test -- src/lib/__tests__/taxPolicy.test.ts --runInBand`, the relevant purchase-intent route tests pass with `--runInBand`, and the EventForm test that covers the price section passes with `--runTestsByPath`.

## Idempotence and Recovery

The changes are additive and safe to rerun. The policy helper has no external side effects. If a zero-tax route change fails after creating a `STARTED` event registration, the existing purchase-intent error handling still releases the reservation on Stripe PaymentIntent creation failure.

If the state cannot be resolved from event location strings, the helper must return `STRIPE_TAX_REQUIRED`, which preserves current behavior rather than guessing.

For the marketplace-facilitator milestone, adding a state to the organizer-liable list must be an additive change with tests. Removing a state must default affected events back to platform-liable or blocked-review behavior rather than silently keeping organizer controls. If a checkout request carries stale organizer manual tax fields but the current resolver no longer allows organizer liability for that state and charge type, the server must reject the request or ignore the stale fields and return a clear error.

## Artifacts and Notes

Sources used for the initial safe policy:

- New York Tax Bulletin ST-8 says participant sporting facilities or activities such as golf, bowling, swimming, or skiing are nontaxable, while spectator/professional/college sporting event admissions are taxable.
- New Jersey Tax Topic Bulletin S&U-11 says charges for admission to sporting activities in which the patron participates are exempt, while spectator sporting events and equipment rentals are taxable.
- Delaware Division of Revenue says there are no state or local sales taxes in Delaware, though gross receipts taxes apply to sellers and are not consumer sales tax.
- Oregon Department of Revenue says Oregon does not have a general sales or use/transaction tax.
- Washington Department of Revenue says sports league participation fees generally are not retail sales, but an athletic or fitness facility operator must collect sales tax on league play charges.

Sources used for the marketplace-facilitator responsibility milestone:

- Stripe's Connect tax guide says the first step is determining whether the platform or connected account has the obligation to collect and report taxes. It also says that liability can depend on marketplace laws, business model, order amount, and type of goods sold.
- Stripe's tax-for-platforms guide says connected accounts must have tax settings and registrations before connected-account tax calculation is enabled, and that missing registrations can produce a zero amount with a `not_collecting` reason.
- Stripe's Checkout tax guidance for connected-account liability supports `automatic_tax.liability` with `type=account` and the connected account id for destination-charge Checkout Sessions.
- Washington's sports leagues guide distinguishes ordinary sports participation fees from fees charged by athletic or fitness facility operators.
- Idaho's recreation and admissions guidance treats participation fees for recreational activities and admissions as generally taxable. Idaho's online seller terms define marketplace facilitator broadly enough that BracketIQ should not expose organizer-liable controls for Idaho until a ruling or reviewed authority says BracketIQ is not responsible for the relevant event charge type.

## Interfaces and Dependencies

In `src/lib/taxPolicy.ts`, define:

    export type TaxMode = 'ZERO_TAX' | 'STRIPE_TAX_REQUIRED';
    export type Taxability = 'TAXABLE' | 'NOT_TAXABLE' | 'UNKNOWN';
    export type TaxLiabilityParty = 'PLATFORM' | 'ORGANIZER' | 'NONE' | 'UNKNOWN';
    export type TaxCollectionStrategy =
      | 'PLATFORM_STRIPE_TAX'
      | 'ORGANIZER_STRIPE_TAX'
      | 'ORGANIZER_MANUAL_TAX'
      | 'NO_TAX'
      | 'BLOCKED_NEEDS_REVIEW';
    export type TaxPolicyDecision = {
      mode: TaxMode;
      reasonCode: string;
      jurisdictionState: string | null;
      purchaseType: string;
      taxability: Taxability;
      liabilityParty: TaxLiabilityParty;
      collectionStrategy: TaxCollectionStrategy;
      organizerResponsibilityMessage?: string;
      policyRuleId?: string;
      policyRuleVersion?: string;
    };
    export const resolvePurchaseTaxPolicy: (params: ResolvePurchaseTaxPolicyParams) => TaxPolicyDecision;

The route responses should include optional fields:

    taxMode?: TaxMode;
    taxReasonCode?: string;
    taxJurisdictionState?: string | null;
    taxability?: Taxability;
    taxLiabilityParty?: TaxLiabilityParty;
    taxCollectionStrategy?: TaxCollectionStrategy;
    taxPolicyRuleId?: string;
    taxPolicyRuleVersion?: string;
    organizerResponsibilityMessage?: string;

Future Checkout work should extend this policy module to choose a checkout presentation. The backend should return a single response shape that tells clients whether to present a PaymentIntent client secret or a Checkout URL, so `mvp-site` and `mvp-app` do not contain duplicated threshold logic.

For organizer-liable manual tax, persist either an event-level or division-level manual tax rate in basis points. A basis point is one hundredth of one percent, so 650 basis points means 6.5 percent. Store the computed tax cents in payment metadata and bill payment rows at checkout time so historical payments keep the amount actually charged even if the event rate later changes.

Revision note: 2026-05-08. Updated the plan for state-by-state marketplace-facilitator responsibility, an initially empty organizer-liable state list, organizer manual/Stripe Tax options, transfer behavior for organizer-retained tax, and the exact price-section message requested by the user.

Revision note: 2026-05-07. Created the initial plan to capture the tax-routing decision and start with a zero-tax event gate before Checkout Session migration.

Revision note: 2026-05-07. Updated the plan after implementing the first milestone, recording validation results and the remaining Checkout Session migration work.

Revision note: 2026-05-08. Updated the plan after implementing organization tax responsibility fields, event tax handling overrides, rental Stripe Tax persistence, and validation for the new milestone.
