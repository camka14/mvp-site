# Manual Registration Payments With Proof Review

This ExecPlan is a living document. The sections Progress, Surprises & Discoveries, Decision Log, and Outcomes & Retrospective must be kept up to date as work proceeds.

This plan follows PLANS.md in the repository root. A future implementer should be able to start from this single file and deliver the feature end to end without reading prior discussion.

## Purpose / Big Picture

After this change, an event organizer can keep BracketIQ registration, pricing, rosters, compliance, and bills while collecting money outside Stripe through links such as Cash App, Venmo, PayPal, or another payment URL. A participant registering for a manual-payment event sees the price and organizer-provided payment links, then uploads an image as proof of payment instead of opening Stripe checkout. The host sees which participants have submitted proof, opens the proof image, enters the amount accepted, and BracketIQ updates the bill and bill payment status. Refund requests and automatic Stripe refunds are disabled for these events because the organizer is responsible for refunds outside BracketIQ.

The feature is observable when a paid event is configured for manual payments, a participant registers, BracketIQ creates a bill with pending bill payments, the participant uploads proof, and the host accepts a partial or full amount. If the accepted amount is greater than zero but less than the bill payment amount, the status shown to hosts and participants is partial. If the accepted amount is at least the bill payment amount, the status is paid.

## Progress

- [x] (2026-06-26) Read PLANS.md and current payment-related code paths for events, bills, bill payments, proof-capable file uploads, compliance cards, and refund routes.
- [x] (2026-06-26) Chose a bill-backed manual payment design that extends existing Bills and BillPayments instead of creating a separate manual ledger.
- [x] (2026-06-26) Confirmed official logo sources to use for Stripe, PayPal, Venmo, and Cash App payment-link images.
- [ ] Add database migration and Prisma model changes for manual registration payment settings and proof review.
- [ ] Add server-side manual payment helpers for bill creation, proof upload, host review, and bill reconciliation.
- [ ] Update event create/edit APIs and event form UI to configure manual payment mode and payment links.
- [x] (2026-06-27) Updated participant registration flow so manual-payment user and team registrations create normal event registration bills and return manual instructions instead of creating Stripe payment intents.
- [x] (2026-06-27) Replaced profile pay buttons with proof-upload actions for manual event registration bills, including team-owned bills visible to team billing managers.
- [x] (2026-06-27) Updated host compliance and billing surfaces to show proof-provided status, preview proof images, and accept partial or full amounts.
- [x] (2026-06-27) Disabled refund requests, automatic refunds, and direct Stripe refund routes for manual-payment event bills, including the event-team billing refund endpoint.
- [x] (2026-06-27) Added team-specific safeguards so event-team Stripe checkout and generic bill Stripe intents reject manual-payment event bills.
- [ ] Add focused tests, run type-checking, and perform browser smoke tests.

## Surprises & Discoveries

- Observation: The existing File model and /api/files/upload route already support authenticated image uploads up to 10 MB and return a file id that can be previewed through /api/files/:id/preview.
  Evidence: src/app/api/files/upload/route.ts validates image content type, writes to the configured storage provider, and creates a File row.

- Observation: The existing bill model is already close to the desired behavior. Bills has paidAmountCents and BillPayments has amountCents, status, paidAt, and payerUserId. Existing compliance UI already displays "X of Y paid" when paid amount is less than total.
  Evidence: prisma/schema.prisma contains Bills and BillPayments; src/app/events/[id]/schedule/components/DivisionTeamComplianceCard.tsx displays paidAmountCents versus totalAmountCents.

- Observation: Current partial payment support is only effectively bill-level. BillPayments does not store an accepted partial amount, and the enum does not contain PARTIAL. Manual proof review needs either a new status or a new accepted amount field to avoid pretending a partially accepted installment is fully paid.
  Evidence: BillPaymentsStatusEnum currently contains PENDING, PROCESSING, FAILED, DISPUTED, PAID, and VOID.

- Observation: Manual payment cannot reuse affiliateUrl. affiliateUrl currently means external registration and blocks participant addition in src/app/api/events/[eventId]/participants/route.ts.
  Evidence: participant addition returns "This event uses external registration." when event.affiliateUrl is present.

- Observation: Team registration bills use the same Bills and BillPayments records as user registration bills, with ownerType set to TEAM for whole-team payment and USER for split player bills. That means self-managed team payments do not need a separate ledger, but every old Stripe entry point must explicitly reject manual-payment event bills.
  Evidence: src/app/api/events/[eventId]/participants/route.ts creates manual registration bills with ownerType TEAM when a team registers, while src/app/api/events/[eventId]/teams/[teamId]/billing/checkout/route.ts and src/app/api/billing/create_billing_intent/route.ts remained independent Stripe entry points until this plan update.

## Decision Log

- Decision: Add an event-level registrationPaymentMode with values ONLINE and MANUAL instead of overloading affiliateUrl.
  Rationale: Manual payments keep registration inside BracketIQ. affiliateUrl means the event is externally registered and currently blocks participant addition.
  Date/Author: 2026-06-26 / Codex

- Decision: Start with event-level manual payment settings, not per-division settings.
  Rationale: Division prices can still vary through existing division price fields, but mixing online and manual collection methods inside one event would complicate participant messaging, refund rules, and reconciliation. Event-level mode is the safer first version.
  Date/Author: 2026-06-26 / Codex

- Decision: Use existing Bills and BillPayments as the source of truth for manual payments.
  Rationale: The product already uses Bills and BillPayments for event payment plans, installment due dates, participant compliance, organization customer billing, and event finance. Reusing them keeps manual payments visible in the same finance and compliance surfaces.
  Date/Author: 2026-06-26 / Codex

- Decision: Add proof review records and accepted paid amount to BillPayments rather than only attaching a file id to a bill.
  Rationale: Proof is submitted by a participant and reviewed by a host. A participant may upload a wrong image, a host may reject it, and a host may accept a partial amount. A separate proof row preserves review history, while BillPayments.paidAmountCents gives fast status calculation.
  Date/Author: 2026-06-26 / Codex

- Decision: Derive partial versus fully paid from accepted amount. If paidAmountCents is 0, the bill payment is unpaid. If paidAmountCents is greater than 0 and less than amountCents, it is partial. If paidAmountCents is at least amountCents, it is paid.
  Rationale: This matches the user request and avoids asking hosts to choose a redundant "partial" state manually.
  Date/Author: 2026-06-26 / Codex

- Decision: Treat team self-managed payments as the same event-level manual registration mode, not a second team-specific payment mode.
  Rationale: Hosts should configure collection method once per event. Team registrations, team-owned bills, split team bills, and user registrations should then all follow the same no-Stripe, proof-review, host-managed-refund behavior.
  Date/Author: 2026-06-27 / Codex

- Decision: Block Stripe at both the event-team checkout route and the generic bill intent route.
  Rationale: Team payments can be started from event management or from profile/team bills. Guarding only one route would leave another path that could still create Stripe sessions for self-managed team payments.
  Date/Author: 2026-06-27 / Codex

- Decision: Use official brand assets only. Stripe assets should come from Stripe's newsroom/marks resources. PayPal and Venmo assets should come from PayPal's newsroom media resources. Cash App assets should come from Cash App Pay Assets.
  Rationale: The UI should show correct payment provider images without relying on third-party logo websites or manually recreated marks.
  Date/Author: 2026-06-26 / Codex

## Outcomes & Retrospective

Implementation is in progress. Manual event registration payment behavior now covers user and team registration bills on the web backend and profile bill surface. Team-specific follow-up added explicit safeguards for the event-team checkout endpoint, the generic bill Stripe-intent endpoint used by profile/team bills, the event-team refund endpoint, and host event-team billing snapshots so partial accepted proof amounts count toward paid totals. Remaining work is broader regression testing and any mobile parity work in mvp-app.

## Context and Orientation

This repository is a Next.js App Router application with TypeScript, Prisma, Postgres, Mantine UI, and self-hosted auth. Event registration and billing are spread across several existing files.

Events live in the Prisma model Events in prisma/schema.prisma. Events currently store price, allowPaymentPlans, installmentCount, installmentDueDates, installmentDueRelativeDays, installmentAmounts, taxHandling, and affiliateUrl. affiliateUrl should not be reused for manual payment links because it represents external registration.

Bills and BillPayments live in prisma/schema.prisma. A Bill is the amount owed by a user, team, or organization. A BillPayment is one scheduled installment for that bill. The route src/app/api/billing/bills/route.ts creates bills and bill payments. The helper src/server/billing/billPaymentActions.ts loads bills, checks permissions, marks Stripe payments as processing, cancels Stripe payments, and reconciles bill totals.

Event participant registration is handled by src/app/api/events/[eventId]/participants/route.ts for organizer and participant changes, src/app/api/events/[eventId]/registrations/self/route.ts for authenticated self registration, src/app/api/events/[eventId]/registrations/child/route.ts for authenticated child registration, and src/app/api/public/organizations/[slug]/events/[eventId]/guest-registrations/route.ts for embedded guest registration. Stripe payment intents are created by src/app/api/billing/purchase-intent/route.ts and src/app/api/public/organizations/[slug]/events/[eventId]/guest-payment-intent/route.ts.

Refund behavior is spread across src/components/ui/RefundSection.tsx, src/app/api/billing/refund/route.ts, src/app/api/events/[eventId]/participants/route.ts, and src/app/api/events/[eventId]/teams/[teamId]/billing/refunds/route.ts. Manual payment events must block refund request creation and Stripe refund execution because BracketIQ has no Stripe charge to refund.

Image uploads already exist at src/app/api/files/upload/route.ts. It accepts authenticated image uploads, stores the file through the configured storage provider, and creates a File row. The proof upload feature should reuse this route for the image itself, then attach the resulting File id to a new proof row through a billing-specific API.

Host-facing payment status is already displayed in src/app/events/[id]/schedule/components/DivisionTeamComplianceCard.tsx and detail billing views under src/app/events/[id]/schedule/schedulePage/EventBillingModals.tsx. These surfaces should show proof-provided, partial, and paid-in-full states.

The existing mobile app may consume backend event fields and billing status. If the implementation is intended to be mobile-complete, inspect /Users/elesesy/StudioProjects/mvp-app after the backend/web work is drafted and add mobile parity for manual payment fields, proof upload, and manual bill status.

## Plan of Work

First add database support. Create a Prisma migration that adds Events.registrationPaymentMode with default ONLINE, Events.manualPaymentLinks as Json with a default empty array, and Events.manualPaymentInstructions as nullable String. Add BillPayments.paidAmountCents with default 0. Add a new BillPaymentProofs model and a ManualPaymentProofStatus enum with SUBMITTED, ACCEPTED, and REJECTED. A proof row should include id, createdAt, updatedAt, billId, billPaymentId, fileId, uploadedByUserId, status, amountAcceptedCents, reviewedByUserId, reviewedAt, reviewNote, and optionally organizationId and eventId for querying. Add indexes on billPaymentId, billId, eventId, uploadedByUserId, and status.

Backfill BillPayments.paidAmountCents for existing paid Stripe payments. In the migration SQL, set paidAmountCents = amountCents where status = 'PAID'. Future Stripe webhook and billing action code should set paidAmountCents to amountCents when a payment is paid.

Then centralize status math in src/server/billing/billPaymentActions.ts. Add helpers that compute an effective paid amount for a bill payment and reconcile a bill using paidAmountCents rather than only status. A BillPayment is fully paid when paidAmountCents >= amountCents and status is PAID. It is partial when paidAmountCents > 0 and paidAmountCents < amountCents. For Stripe-paid rows, the webhook and action helpers should set paidAmountCents to amountCents at the same time they set status to PAID. Existing callers that select BillPayments must include paidAmountCents.

Add manual proof APIs under src/app/api/billing/bills/[id]/payments/[paymentId]/proof/route.ts and src/app/api/billing/bills/[id]/payments/[paymentId]/proofs/[proofId]/review/route.ts. The proof submission route should require the current user to be the bill owner, a team manager for the bill owner team, or otherwise allowed by canManageBillPayment. It receives a fileId returned by /api/files/upload and creates a SUBMITTED proof for that bill payment. It should reject proof submission when the bill is not tied to a manual-payment event or when the payment is already fully paid or void. The review route should require canAdministerBillPayment, load the event, verify it is a manual-payment event, clamp the accepted amount between 0 and the payment amount, mark the proof ACCEPTED or REJECTED, update BillPayments.paidAmountCents, set status to PAID when paidAmountCents >= amountCents, set status to PENDING or PARTIAL otherwise, and call the bill reconciliation helper.

Add PARTIAL to BillPaymentsStatusEnum unless the implementation chooses to keep status PENDING and derive partial entirely from paidAmountCents. Prefer adding PARTIAL because it makes API payloads and UI labels easier to understand. Update all status formatting code to treat PARTIAL as an outstanding bill with some accepted payment.

Update event types and event APIs. In src/types/index.ts, add a RegistrationPaymentMode type and fields on Event. In src/app/api/events/route.ts and src/app/api/events/[eventId]/route.ts, parse, sanitize, persist, and serialize registrationPaymentMode, manualPaymentLinks, and manualPaymentInstructions. Add a small normalizer that accepts known provider values such as CASH_APP, VENMO, PAYPAL, STRIPE, ZELLE, OTHER and trims labels and URLs. In manual mode, URL values should be valid https URLs unless a supported app deep link is explicitly approved. For a first pass, prefer https URLs only.

Add provider logo assets. Store static assets under public/payment-providers/ with names such as stripe.svg, paypal.svg, venmo.svg, and cash-app.svg. Download them only from official sources: Stripe newsroom information/assets at https://stripe.com/newsroom/information and Stripe marks terms at https://stripe.com/legal/marks; PayPal newsroom media resources at https://newsroom.paypal-corp.com/media-resources, which includes PayPal and Venmo logos; Cash App Pay assets at https://developers.cash.app/cash-app-pay-partner-api/guides/resources/cash-app-pay-assets. Do not use Brandfetch, Pinterest, random PNG sites, or recreated SVGs. Add a small src/lib/paymentProviderAssets.ts module mapping provider type to asset path, display label, and default URL placeholder. If Cash App, PayPal, or Venmo guidelines require a specific badge variant for links, use that variant and keep sizing/color unmodified.

Update event form UI. In src/app/events/[id]/schedule/components/eventForm/formTypes.ts and eventStateMapping/defaultValues/buildEventDraft files, include the manual payment fields. In SingleDivisionPricingControls and DivisionEditorCoreControls, show a manual/online payment mode control near pricing. Online mode keeps HostPriceInput and Stripe/tax/payment-plan behavior. Manual mode uses a plain cents input because the listed price is the amount owed, not an inclusive Stripe calculation. Manual mode also shows fields to add payment links, reorder/remove links, and enter manual payment instructions. The explanatory text should say that participants register in BracketIQ, payment is collected outside BracketIQ, and the organizer is responsible for confirming payments and handling refunds.

Update bill creation during registration. When a paid manual-payment event registration is created, create a bill and bill payments in the same shape as normal payment plans. If the event has allowPaymentPlans and installment amounts, create one BillPayment per installment. If not, create a single BillPayment for the selected event or division price. Set sourceType to a stable value such as MANUAL_EVENT_REGISTRATION and sourceId to the registration id. Keep status OPEN on the bill and PENDING on the bill payments. For non-manual online payment events, keep the existing Stripe behavior.

Update authenticated registration clients. In src/lib/paymentService.ts and src/app/discover/components/EventDetailSheet.tsx, when registration returns a manual payment payload, do not call createPaymentIntent or open PaymentModal. Show a manual payment panel with the amount due, provider links with official images, instructions, and an Upload proof button. The Upload proof button should first upload the selected image to /api/files/upload, then call the proof submission route with the returned file id. If registration has required signing, keep the current signing step first, then show manual payment instructions after signatures are complete.

Update embedded guest registration. In GuestEventRegistrationWidget and the public guest registration route, return manual payment metadata for paid manual events. The widget should not call guest-payment-intent for manual events. It should show the same payment links and upload proof flow after signing. Because guest registration creates or reuses a BracketIQ user identity behind the scenes, the proof route must allow the guest parent user from the registration token or a new public proof endpoint must verify the guest registration token and attach the proof to the right bill payment. Prefer a public proof endpoint under the existing guest registration path so embedded users do not need to sign in.

Update pay-button surfaces. Anywhere a bill payment currently opens Stripe checkout for a manual-payment event should instead show Upload proof. The most likely surfaces are organization customer bills in src/app/organizations/[id]/page.tsx, event billing modals, and any profile/team billing components that call /api/billing/create_billing_intent. The server-side create_billing_intent route should reject manual-payment event bills with a clear error such as "This bill is paid outside BracketIQ. Upload proof of payment instead."

Update host review surfaces. In event team/user compliance routes, include proof summary fields on TeamCompliancePaymentSummary: latestProofId, latestProofFileId, latestProofStatus, latestProofUploadedAt, partialPaidAmountCents, and hasSubmittedProof. Update DivisionTeamComplianceCard to show "Proof submitted" when there is a submitted proof and the payment is not fully paid. Update EventBillingModals or the participant/team detail modal so hosts can open the proof image, enter amount accepted, optionally write a note, and accept or reject the proof. If accepted amount is zero, keep the payment unpaid. If accepted amount is positive and less than amountCents, show partial. If accepted amount is equal to or greater than amountCents, show paid in full.

Disable refunds for manual payments. Add a helper such as isManualRegistrationPaymentEvent(event) in src/lib/manualRegistrationPayments.ts. Use it in RefundSection to hide automatic refund and refund request actions for manual events, replacing them with copy that the organizer handles refunds outside BracketIQ. Add server guards in src/app/api/billing/refund/route.ts, src/app/api/events/[eventId]/participants/route.ts, src/app/api/events/[eventId]/teams/[teamId]/billing/refunds/route.ts, and src/server/billing/billPaymentActions.ts refund helpers so a direct API call cannot create a refund request or Stripe refund for a manual-payment event bill.

Update finance and status calculations. Event finance should treat accepted manual paid amounts as actual revenue. Stripe fee and BracketIQ fee should be zero for manual payments unless a future business decision adds a fee. Use paidAmountCents from BillPayments and Bills after reconciliation rather than assuming status PAID means full amount only.

## Concrete Steps

Work from /Users/elesesy/StudioProjects/mvp-site.

Before editing, inspect the current checkout and migration state:

    git status --short --branch
    rg -n "registrationPaymentMode|manualPayment|BillPaymentProof|paidAmountCents" prisma src
    npx prisma migrate status

Create the Prisma migration after editing prisma/schema.prisma:

    npx prisma migrate dev --name manual_registration_payments

Regenerate Prisma artifacts if this repo requires an explicit generate step:

    npx prisma generate

Run focused tests after each milestone. Suggested first pass:

    npm test -- src/app/api/events/__tests__/participantsRoute.test.ts
    npm test -- src/app/api/public/organizations/[slug]/events/[eventId]/__tests__/guestRegistrationsRoute.test.ts
    npm test -- src/app/api/public/organizations/[slug]/events/[eventId]/__tests__/guestPaymentIntentRoute.test.ts
    npm test -- src/app/api/billing/__tests__/billsRoute.test.ts
    npm test -- src/app/api/billing/__tests__/refundRoute.test.ts

Before considering the implementation complete:

    npx tsc --noEmit
    npm run test:ci

For browser validation, start the app:

    npm run dev

Then create or edit a paid event, set registration payment mode to manual, add at least one payment link and instructions, register as a participant, upload an image proof, then sign in as the host and accept a partial amount. The participant card should show a partial payment status. Accept the remaining amount or enter the full amount and verify the card changes to paid in full.

## Validation and Acceptance

The feature is accepted when these behaviors are true.

A host can configure a paid event for manual registration payments without connecting Stripe. The event still has a nonzero price, and the event form explains that the organizer is responsible for collecting payment and refunds.

A participant can register for the manual-payment event. BracketIQ creates an event registration and a Bill with BillPayments matching the event payment plan. The participant does not see Stripe checkout. The participant sees provider links with official images, manual instructions, and an upload-proof action.

When the participant uploads proof, the image is visible to the host in the event participant/team billing detail. The participant-facing status changes to proof submitted or awaiting review.

When the host accepts an amount less than the bill payment amount, BracketIQ updates the bill payment paid amount and shows a partial payment status. When the host accepts an amount equal to the bill payment amount, BracketIQ marks the bill payment paid and the bill paid amount updates. When all bill payments are paid, the bill status is PAID.

Refund request buttons and automatic refund buttons are hidden for manual-payment events. Direct calls to refund APIs return a clear 400-level error and do not create RefundRequests or Stripe refunds.

Online Stripe events continue to behave as they do now. Their payment intent, fee breakdown, bill status, and refund behavior should not regress.

## Idempotence and Recovery

The schema changes are additive except for adding enum values and columns. If migration generation fails, revert only the generated migration file and retry after fixing schema syntax. Do not reset the database unless the user explicitly approves it.

Proof upload is two-phase: first upload the image to File storage, then attach the File id to a bill payment proof row. If proof attachment fails after upload, the File row may remain unused. That is acceptable for the first implementation; add cleanup later only if orphan files become a real issue.

Host review should be idempotent. Reviewing the same proof with the same accepted amount should leave the same BillPayment paidAmountCents and bill totals. If a host changes the accepted amount later, the review route should either reject edits to accepted proofs or provide a separate adjustment path. For the first implementation, reject editing accepted proofs and require a new proof or admin-only adjustment route if correction is needed.

## Artifacts and Notes

Official asset sources identified during planning:

    Stripe assets and logo guidance: https://stripe.com/newsroom/information
    Stripe marks terms: https://stripe.com/legal/marks
    PayPal and Venmo logos: https://newsroom.paypal-corp.com/media-resources
    Cash App Pay assets: https://developers.cash.app/cash-app-pay-partner-api/guides/resources/cash-app-pay-assets

Current relevant schema excerpt:

    Bills has totalAmountCents, paidAmountCents, status, paymentPlanEnabled, and lineItems.
    BillPayments has amountCents, status, paidAt, paymentIntentId, payerUserId, refundedAmountCents, and fee/tax fields.
    File stores uploaded file metadata and can already represent proof image uploads.

Expected new status behavior:

    amountCents = 10000, paidAmountCents = 0 -> unpaid / pending
    amountCents = 10000, paidAmountCents = 2500 -> partial, "$25.00 of $100.00 paid"
    amountCents = 10000, paidAmountCents = 10000 -> paid in full

## Interfaces and Dependencies

In prisma/schema.prisma, add:

    enum RegistrationPaymentModeEnum {
      ONLINE
      MANUAL
    }

    enum ManualPaymentProofStatusEnum {
      SUBMITTED
      ACCEPTED
      REJECTED
    }

    model BillPaymentProofs {
      id                  String @id
      createdAt           DateTime?
      updatedAt           DateTime?
      billId              String
      billPaymentId       String
      eventId             String?
      organizationId      String?
      fileId              String
      uploadedByUserId    String
      status              ManualPaymentProofStatusEnum @default(SUBMITTED)
      amountAcceptedCents Int?
      reviewedByUserId    String?
      reviewedAt          DateTime?
      reviewNote          String?

      @@index([billId])
      @@index([billPaymentId])
      @@index([eventId])
      @@index([uploadedByUserId])
      @@index([status])
    }

In Events, add:

    registrationPaymentMode RegistrationPaymentModeEnum @default(ONLINE)
    manualPaymentLinks Json @default("[]")
    manualPaymentInstructions String?

In BillPayments, add:

    paidAmountCents Int @default(0)

In src/lib/manualRegistrationPayments.ts, define helpers:

    export type ManualPaymentProvider = 'CASH_APP' | 'VENMO' | 'PAYPAL' | 'STRIPE' | 'ZELLE' | 'OTHER';

    export type ManualPaymentLink = {
      id: string;
      provider: ManualPaymentProvider;
      label: string;
      url: string;
    };

    export const isManualRegistrationPaymentMode = (value: unknown): boolean;
    export const normalizeManualPaymentLinks = (value: unknown): ManualPaymentLink[];
    export const buildManualPaymentSummary = (...): { totalDueCents: number; platformFeeCents: 0; stripeFeeCents: 0; hostReceivesCents: number };

In src/server/billing/billPaymentActions.ts, add helpers:

    getBillPaymentPaidAmount(payment)
    getBillPaymentDisplayStatus(payment)
    reconcileBillForPaymentChange(billId, now)
    submitManualBillPaymentProof(...)
    reviewManualBillPaymentProof(...)

In src/lib/eventTeamCompliance.ts, extend TeamCompliancePaymentSummary with proof fields:

    latestProofId?: string | null;
    latestProofFileId?: string | null;
    latestProofStatus?: 'SUBMITTED' | 'ACCEPTED' | 'REJECTED' | null;
    latestProofUploadedAt?: string | null;
    hasSubmittedProof?: boolean;

In client UI, add a reusable component such as src/components/ui/ManualPaymentPanel.tsx that renders amount due, provider links using official assets, instructions, and upload proof controls. Use this from authenticated registration and guest widget paths so copy and behavior remain consistent.

## Revision Notes

2026-06-26: Initial ExecPlan created from repo inspection and user requirements. The plan chooses bill-backed manual payment proof review, official provider assets, and amount-derived partial/full status.
