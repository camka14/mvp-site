# Event registration questions and held-registration timer on web

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document follows `PLANS.md` at the repository root. It covers the backend contract, Prisma-backed APIs, and `mvp-site` web UI. The matching mobile plan lives in `/Users/elesesy/StudioProjects/mvp-app/plans/event-registration-questions-and-hold-timer-mobile-execplan.md`. The two plans are intentionally separate so one agent can implement this repo while another implements the mobile client against the same contract.

## Purpose / Big Picture

Event organizers need event-specific registration questions in the same setup area as registration requirements, not separated from required documents and age limits. Players and team captains need to answer those questions before signing documents or paying, and a paid registration slot must be visibly held while checkout is in progress. After this change, an organizer can add event registration questions below the min/max age controls in the event details form, participants can resume a local registration draft if they close the registration UI, and paid registration checkout shows `Your registration is held for MM:SS` in a fixed bottom-left timer for the 10-minute hold window.

## Progress

- [x] (2026-06-08T17:16:50Z) Researched existing event/team question, payment, and registration hold paths in `mvp-site`.
- [x] (2026-06-08T17:16:50Z) Created this backend/web ExecPlan and linked it to the mobile ExecPlan.
- [x] (2026-06-08T18:05:00Z) Updated the backend hold contract and 10-minute TTL.
- [x] (2026-06-08T18:05:00Z) Moved event-question organizer UI into the registration requirements container and made team question editing collapsible.
- [x] (2026-06-08T18:05:00Z) Added local draft progress and bottom-left countdown UI for event and team registration flows.
- [x] (2026-06-08T18:32:00Z) Added focused regression coverage and ran web validation.

## Surprises & Discoveries

- Observation: The server already has a generic `RegistrationQuestions` and `RegistrationQuestionResponses` model that supports both `TEAM` and `EVENT` scopes.
  Evidence: `src/server/registrationQuestions.ts` defines `RegistrationQuestionScopeType = 'TEAM' | 'EVENT'` and `RegistrationQuestionResponseSubjectType` includes `EVENT_REGISTRATION`.
- Observation: Event questions already exist in the event form, but as a separate `Registration Questions` paper rather than inside the event details/required-documents area requested here.
  Evidence: `src/app/events/[id]/schedule/components/EventForm.tsx` renders `section-registration-questions` as its own `Paper`.
- Observation: The public web event registration flow already asks event questions before required document signing and payment, but it does not persist answers locally across a closed registration UI.
  Evidence: `src/app/discover/components/EventDetailSheet.tsx` calls `teamService.getRegistrationQuestions('EVENT', currentEvent.$id)` and passes `intent.answers` into free join or `paymentService.createPaymentIntent`.
- Observation: Paid event and paid team registration holds are currently 5 minutes, not 10.
  Evidence: `src/app/api/billing/purchase-intent/route.ts` defines `STARTED_REGISTRATION_TTL_MS = 5 * 60 * 1000`; `src/server/teams/teamOpenRegistration.ts` defines `TEAM_REGISTRATION_STARTED_TTL_MS = 5 * 60 * 1000`.
- Observation: `purchase-intent` has the reserved registration id internally but does not return it or a hold expiration timestamp to the client.
  Evidence: `src/app/api/billing/purchase-intent/route.ts` sets `reservedRegistrationId` and puts it in Stripe metadata, but JSON responses only return payment/tax fields.
- Observation: The current event paid reservation helper rejects an existing `STARTED` event registration for the same user/team as already registered, which prevents a closed registration UI from resuming the same held reservation cleanly.
  Evidence: `reserveEventRegistrationSlot` returns a 409 when `existing.status === 'STARTED'`.
- Observation: Both worktrees already have unrelated local modifications.
  Evidence: `mvp-site` has modified landing page files; `mvp-app` has Gradle/iOS metadata changes. Implementation must preserve these changes and avoid cleanup outside the feature files.
- Observation: The existing public event flow already had most question-before-payment sequencing; the missing pieces were local resume state and hold metadata from the purchase-intent response.
  Evidence: `EventDetailSheet` now persists answers/selection locally and stores `registrationHoldExpiresAt` after `paymentService.createPaymentIntent`.
- Observation: The event `STARTED` reuse path can preserve the original capacity-hold deadline without mutating the row.
  Evidence: `reserveEventRegistrationSlot` returns the existing registration id and expiration derived from `createdAt` for unexpired matching `STARTED` rows.

## Decision Log

- Decision: Reuse the existing `RegistrationQuestions` and `RegistrationQuestionResponses` tables for event questions instead of adding a new event-question schema.
  Rationale: The current server model already supports `EVENT` scope, validates required answers, and stores answer snapshots against `EVENT_REGISTRATION`.
  Date/Author: 2026-06-08 / Codex
- Decision: Use two execution plans, one for `mvp-site` and one for `mvp-app`, with this plan owning the API contract.
  Rationale: The backend/web work and mobile work can proceed concurrently once the response/payload fields are specified, but `mvp-site` remains the source of truth for endpoint behavior.
  Date/Author: 2026-06-08 / Codex
- Decision: Keep registration hold expiration derived from `createdAt + 10 minutes` on `STARTED` registrations rather than adding an `expiresAt` column.
  Rationale: Existing cleanup already treats old `STARTED` rows as expired based on `createdAt`; deriving the timestamp avoids a migration and keeps the data model simple.
  Date/Author: 2026-06-08 / Codex
- Decision: Reuse a held `STARTED` reservation for the same event, registrant, division, and occurrence without extending the original hold.
  Rationale: Users can close and resume checkout without creating duplicate reservations, while the capacity hold still expires after the original 10-minute window.
  Date/Author: 2026-06-08 / Codex
- Decision: Store only local client progress, not a separate server draft.
  Rationale: The server already stores the authoritative reservation and answer snapshot once checkout starts. Local storage should help the UI reopen at the right step with answers and selection, then the server should validate everything again.
  Date/Author: 2026-06-08 / Codex

## Outcomes & Retrospective

Implemented the web/backend portion. Event and team registration holds are now 10 minutes, purchase-intent responses expose nullable registration hold metadata, matching unexpired event `STARTED` reservations are reused, and paid team registration returns the same timer contract. Organizer event questions now live inside the event details registration requirements area under min/max age, and both event/team question editors are collapsible.

Public web event registration and team registration now persist local draft progress, restore unexpired answers/selection, and render a bottom-left `Your registration is held for MM:SS` timer outside checkout dialogs. Focused validation passed:

    npx tsc --noEmit
    npm test -- --runInBand src/app/api/billing/__tests__/purchaseIntentRoute.test.ts src/app/api/billing/__tests__/purchaseIntentTeamRegistrationRoute.test.ts src/server/teams/__tests__/teamOpenRegistration.test.ts src/lib/__tests__/paymentService.test.ts
    npm test -- --runInBand src/app/discover/components/__tests__/EventDetailSheetJoinPaymentPlanTeamJoin.test.tsx

## Context and Orientation

`mvp-site` is a Next.js App Router application with Prisma and Postgres. The event edit form lives at `src/app/events/[id]/schedule/components/EventForm.tsx`. The public event detail and registration flow lives at `src/app/discover/components/EventDetailSheet.tsx`. Team registration on the web lives in `src/components/ui/TeamRegistrationFlow.tsx` and team editing lives in `src/components/ui/TeamDetailModal.tsx`.

Registration questions are managed through `src/app/api/registration-questions/route.ts`, `src/server/registrationQuestions.ts`, and the client wrapper methods in `src/lib/teamService.ts`. The Prisma models are `RegistrationQuestions` and `RegistrationQuestionResponses` in `prisma/schema.prisma`. A question has a scope, such as `EVENT` or `TEAM`, a prompt, an answer type, a required flag, and a sort order. A response stores a snapshot of the questions and answers for one registration subject, so later organizer review sees exactly what the participant answered when they registered.

Paid event registration checkout starts in `src/app/api/billing/purchase-intent/route.ts`. That route creates or should reuse a `STARTED` row in `EventRegistrations` before creating a Stripe PaymentIntent, so the participant's slot counts against capacity while payment is in progress. Paid team registration uses `src/server/teams/teamOpenRegistration.ts` to create a `STARTED` row in `TeamRegistrations`, then the same purchase-intent route creates the PaymentIntent. Stripe webhooks later activate pending registrations.

The response contract to add is nullable and backwards compatible:

- `registrationId?: string | null`
- `registrationHoldExpiresAt?: string | null`, an ISO timestamp.
- `registrationHoldTtlSeconds?: number | null`, expected to be `600` for event and team registration holds.

Only purchase intents for `purchaseType: event` and `purchaseType: team_registration` should return these fields. Product, bill, subscription, and rental checkout should not show the registration hold timer unless they already opt into a separate lock flow.

## Plan of Work

First, update the backend hold behavior. Change `STARTED_REGISTRATION_TTL_MS` and `TEAM_REGISTRATION_STARTED_TTL_MS` to 10 minutes. Add a small helper in `purchase-intent` to derive hold response fields from a registration id and `createdAt`. Extend `reserveEventRegistrationSlot` so a matching unexpired `STARTED` row for the same event, registrant, occurrence, and division is reused rather than rejected. Keep the original `createdAt` so a resume does not extend the hold. Extend `reserveTeamRegistrationSlot` to return the hold expiration for `STARTED` paid registrations, using the existing row `createdAt` when one is reused. Include the new response fields in mock, reusable-intent, and newly-created Stripe PaymentIntent responses.

Second, keep answer validation server-side. `purchase-intent` already calls `loadAndBuildRegistrationAnswerSnapshot` for event checkout. Preserve that behavior and ensure the reuse path updates the `RegistrationQuestionResponses` snapshot if the user changed answers before retrying checkout. Team registration answers are already stored when the team registration request starts; this plan only needs to ensure paid team checkout can resume the same `STARTED` registration and returns the timer metadata.

Third, move organizer event question editing. In `src/app/events/[id]/schedule/components/EventForm.tsx`, remove the separate `Registration Questions` paper from the bottom navigation/section list and render the existing question editor inside the registration requirements/details container that already includes min/max age and required documents. Place it directly under min/max age as requested. Keep the existing load/save state and validation logic, but wrap the question list in a collapsible area with the same accessible `aria-expanded` and `Collapse` pattern used by other form sections. In `src/components/ui/TeamDetailModal.tsx`, make the existing team registration question editor collapsible. If implementation discovers a current team creation surface that already edits team questions, apply the same collapsible editor there; otherwise do not invent a new team-question create flow in this iteration.

Fourth, add web local progress storage. Create a focused utility, for example `src/lib/registrationProgressStorage.ts`, with guarded `window.localStorage` access, JSON parsing, versioning, and expiry cleanup. Store event progress by current user id, event id, registrant target, selected division, and weekly occurrence. Store team progress by current user id, team id, and registrant target. Persist the current step, selected team/child/occurrence/division, question answers, registration id, and hold expiration. Do not rely on local storage for authorization or required answer validation; always resubmit answers to the server before payment or free registration. Clear a draft after successful registration confirmation, explicit discard, logout/user switch, or hold expiration.

Fifth, show the bottom-left timer. Add a shared component, for example `RegistrationHoldTimer`, that takes an ISO expiration timestamp, recomputes remaining time once per second, formats `MM:SS`, and renders fixed at the bottom left with the text `Your registration is held for MM:SS`. Render it from `EventDetailSheet` and `TeamRegistrationFlow` outside the payment/dialog content so it remains visible while modals are open. When time reaches zero, clear the local held-state, close or invalidate payment UI if needed, and show a clear message that the registration hold expired.

Sixth, connect resume behavior. When `EventDetailSheet` opens, load any unexpired local draft for the current event/user/occurrence target and prefill question answers and selection. If the draft says the user had reached checkout, call `purchase-intent` again with the same answers/selection after the user continues, allowing the server to reuse the still-held reservation and return a fresh or reusable PaymentIntent. Apply the same pattern in `TeamRegistrationFlow`. Do not create a new reservation while an unexpired server-side `STARTED` row for the same registration exists.

## Concrete Steps

Run commands from `/Users/elesesy/StudioProjects/mvp-site`.

1. Update TTL constants and response fields in `src/app/api/billing/purchase-intent/route.ts` and `src/server/teams/teamOpenRegistration.ts`.
2. Add or update tests for event paid registration reservation reuse, team paid registration expiration metadata, and 10-minute stale cleanup.
3. Move the event question editor in `src/app/events/[id]/schedule/components/EventForm.tsx` and make both event/team question editors collapsible.
4. Add the local progress utility and timer component, then wire them into `src/app/discover/components/EventDetailSheet.tsx` and `src/components/ui/TeamRegistrationFlow.tsx`.
5. Update `src/types/index.ts`, `src/lib/paymentService.ts`, and any affected tests to include the new optional payment-intent response fields.
6. Run focused Jest and typecheck commands listed below.

## Validation and Acceptance

Focused automated validation should include:

    npm test -- --runInBand src/server/__tests__/registrationQuestions.test.ts src/app/api/billing/__tests__/purchaseIntentRoute.test.ts src/app/api/billing/__tests__/purchaseIntentTeamRegistrationRoute.test.ts src/lib/__tests__/paymentService.test.ts
    npm test -- --runInBand src/app/discover/components/__tests__/EventDetailSheetJoinPaymentPlanTeamJoin.test.tsx
    npx tsc --noEmit

Add new tests if these suites do not already cover the changed behavior. At minimum, test that a paid event purchase-intent response returns a `registrationId`, `registrationHoldExpiresAt`, and `registrationHoldTtlSeconds: 600`; that a second purchase-intent call for the same unexpired `STARTED` registration reuses it instead of returning 409; and that required event questions still block checkout until answered.

Manual/browser acceptance is:

- In an event edit form, event questions appear below min/max age in the same requirements area as required documents, and the list can collapse and expand.
- In a team edit form, team registration questions can collapse and expand.
- In public event registration, required event questions appear before required document signing and payment.
- After paid checkout starts, the bottom-left text reads `Your registration is held for 10:00` or less and counts down in `MM:SS`.
- Closing and reopening the registration UI for the same event/user target restores local answers and selection. Continuing checkout reuses the held registration until the timer expires.
- When the timer reaches zero, the local draft and held checkout state are cleared and a new checkout attempt creates a new server reservation only after the user continues again.

## Idempotence and Recovery

The backend change is additive and does not require a Prisma migration if expiration stays derived from `createdAt`. Local storage keys must be versioned so future shape changes can ignore old drafts safely. If browser storage is unavailable, registration should still work without resume support. If Stripe PaymentIntent creation fails, keep the existing cleanup behavior that releases the `STARTED` reservation created during that request.

Because the worktree already contains unrelated modified files, implementation must inspect diffs before editing and must not revert unrelated landing-page or generated changes. Do not run Jest concurrently with other agents in this checkout.

## Artifacts and Notes

The mobile plan depends on the optional response fields listed in `Context and Orientation`. Mobile can safely implement nullable parsing before this backend is deployed, but visible timer behavior requires the backend fields to be returned.

## Interfaces and Dependencies

The final web-facing payment intent type in `src/types/index.ts` should include:

    export interface PaymentIntent {
      paymentIntent?: string;
      publishableKey: string;
      checkoutMode?: 'PAYMENT_INTENT' | 'CHECKOUT_SESSION';
      registrationId?: string | null;
      registrationHoldExpiresAt?: string | null;
      registrationHoldTtlSeconds?: number | null;
      ...
    }

The final purchase-intent route should return the new fields for event and team registration checkout. Clients should treat these fields as optional and render the countdown only when `registrationHoldExpiresAt` parses to a future timestamp.

Revision note, 2026-06-08: Initial plan created after source inspection. It records that event questions already exist server-side and in the public web flow, and narrows the web work to UI placement, collapsible editors, local progress resume, response metadata, and the 10-minute hold timer.
