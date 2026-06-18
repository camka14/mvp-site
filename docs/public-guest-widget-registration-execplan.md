# Public Guest Widget Registration

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document follows `PLANS.md` in the repository root. It is self-contained and describes how to implement a public, embedded registration flow for approved organization widgets.

## Purpose / Big Picture

Organizations that publish BracketIQ widgets on their own websites should be able to collect event registrations without forcing parents or players to create a BracketIQ account first. After this change, an embedded widget can collect parent contact details, create child `UserData` records without child emails, create/register a team for a team-signup event or add someone as a free agent, ask configured registration questions, collect required document signatures, and start a one-time Stripe checkout without displaying saved payment methods. The normal authenticated registration endpoints remain stricter: verified email is still required for paid authenticated registrations and organization creation.

The user-visible outcome is an iframe flow on an organization website where a parent can complete registration from start to finish. The server outcome is a narrow public API that only works for public, widget-enabled organizations and event ids that belong to that organization.

## Progress

- [x] (2026-06-16 00:00Z) Read `PLANS.md` and confirmed this feature requires an ExecPlan because it crosses auth, payments, documents, and widget UI.
- [x] (2026-06-16 00:05Z) Inspected current widget route `src/app/embed/[slug]/[kind]/route.ts`, public organization event/team pages under `src/app/o/[slug]`, authenticated event/team registration routes, payment intent/webhook behavior, registration question helpers, and BoldSign sign routes.
- [x] (2026-06-16 00:35Z) Added public guest identity helpers for parent email identities, child-only `UserData`, parent-child links, public widget event validation, and short-lived guest registration tokens.
- [x] (2026-06-16 01:05Z) Added public event guest registration API for team creation + event registration and free-agent registration.
- [x] (2026-06-16 01:20Z) Added guest-safe public PaymentIntent creation for event purchases without CustomerSession, Stripe customer attachment, or saved-payment redisplay.
- [x] (2026-06-16 01:35Z) Added scoped public sign-link API for required event documents tied to the guest-created registration token.
- [x] (2026-06-16 02:00Z) Added embedded widget client UI with parent info, child/team info, registration questions, document signing, and Stripe Payment Element checkout.
- [x] (2026-06-16 02:15Z) Added focused Jest tests and ran TypeScript.
- [x] (2026-06-16 02:45Z) Added guest text-document acknowledgement recording, per-child parent/guardian signing targets in the widget, iframe resize messages, and a narrow `/embed` frame-header exception in the proxy.
- [x] (2026-06-16 03:10Z) Extend team roster registration so player and parent/guardian document-signing emails are dispatched after registration for no-account widget users.

## Surprises & Discoveries

- Observation: Existing public widgets are server-rendered cards and currently link out with `target="_top"` rather than hosting a full interactive registration flow.
  Evidence: `src/app/embed/[slug]/[kind]/route.ts` renders event cards as anchors with `href="${event.detailsUrl}"`.
- Observation: `SensitiveUserData.email` is required, but `UserData` can exist without email, so children can be represented as plain `UserData` rows and linked to a parent through `ParentChildLinks`.
  Evidence: `prisma/schema.prisma` has `SensitiveUserData.email String`, while `UserData` contains public profile fields and no email column.
- Observation: The Stripe webhook already knows how to activate `event` and `team_registration` purchases based on PaymentIntent metadata, including `user_id`, `event_id`, `team_id`, and `registration_id`.
  Evidence: `src/app/api/billing/webhook/route.ts` reads these metadata fields and calls event/team registration sync helpers on `payment_intent.processing` and `payment_intent.succeeded`.
- Observation: Existing event and team sign routes require a session and should not be relaxed globally.
  Evidence: `src/app/api/events/[eventId]/sign/route.ts` and `src/app/api/teams/[id]/sign/route.ts` both call `requireSession`.
- Observation: The existing `PaymentForm` updates fees through `/api/billing/payment-intent-fee`, which is not guest-token scoped.
  Evidence: `src/components/ui/PaymentForm.tsx` calls `paymentService.updatePaymentIntentFeeForMethod`.
- Observation: The global proxy security headers set `X-Frame-Options: DENY` for all routes, which prevents `/embed` widget routes from rendering inside client-site iframes.
  Evidence: `src/proxy.ts` applied the full `SECURITY_HEADERS` object to every response before the `/embed` exception was added.
- Observation: Text templates need an explicit acknowledgement write; returning the text content alone leaves the `SignedDocuments` row `UNSIGNED`.
  Evidence: `src/app/api/documents/record-signature/route.ts` marks authenticated text waivers `SIGNED`, while the guest sign-link route only created unsigned rows.

## Decision Log

- Decision: Implement this as a separate public guest flow rather than weakening the existing authenticated endpoints.
  Rationale: Authenticated endpoints now intentionally require verified email for paid registration. The guest widget flow needs different security properties: limited scope, origin/domain friction, no account privileges, and no saved-payment redisplay.
  Date/Author: 2026-06-16 / Codex
- Decision: Parent email creates or reuses a placeholder `AuthUser`, `UserData`, and `SensitiveUserData` row, while child participants get `UserData` only and are connected through `ParentChildLinks`.
  Rationale: Parents must receive receipts and own the guest flow. Children do not always have emails and will later be claimable via `UserData.id`.
  Date/Author: 2026-06-16 / Codex
- Decision: Do not put an organization API key in the widget browser code.
  Rationale: Anything shipped in an iframe or script is public. Public endpoints must validate the organization, event, widget enablement, allowed embed domain, rate limits, and request scope server-side.
  Date/Author: 2026-06-16 / Codex
- Decision: Guest checkout must not create a Stripe CustomerSession or save/reuse a payment method.
  Rationale: A typed email alone must not reveal or permit use of an existing user's saved payment methods. A guest PaymentIntent may use `receipt_email` and metadata, but not saved-payment redisplay.
  Date/Author: 2026-06-16 / Codex
- Decision: Use a short-lived guest registration JWT for signing and payment follow-up calls.
  Rationale: Registration ids and event ids should not be sufficient to create signing links or payment intents. The token binds organization id, event id, registration id, parent user id, and registrant/team ids.
  Date/Author: 2026-06-16 / Codex
- Decision: The first guest checkout implementation uses a widget-local Stripe Payment Element instead of the existing `PaymentModal`.
  Rationale: The existing payment form updates fees through an authenticated route. The guest widget needs a guest-token-scoped payment surface and must not call authenticated billing profile/customer routes.
  Date/Author: 2026-06-16 / Codex
- Decision: Omit `X-Frame-Options` only for `/embed` paths, while keeping the other proxy security headers.
  Rationale: Widgets must be frameable by definition. Normal app and API routes should keep `DENY`.
  Date/Author: 2026-06-16 / Codex
- Decision: Guest text waiver acknowledgement gets a dedicated token-scoped public endpoint.
  Rationale: The authenticated `/api/documents/record-signature` route should remain session-protected, but the widget needs a way to mark text documents signed after verifying the guest registration token.
  Date/Author: 2026-06-16 / Codex
- Decision: Team roster document emails are dispatched after the registration transaction commits.
  Rationale: The document dispatcher resolves signer emails from `AuthUser`/`SensitiveUserData`; newly-created guest identities may not be visible to a separate Prisma query until the transaction commits.
  Date/Author: 2026-06-16 / Codex
- Decision: Team roster players may provide either a player email, a parent/guardian email, both, or neither.
  Rationale: Adult/self player registrations use participant documents. Minor/guardian-backed registrations use parent/guardian and child documents. Rows without a signer email can still be rostered, but PDF signing emails cannot be sent until contact data exists.
  Date/Author: 2026-06-16 / Codex

## Outcomes & Retrospective

Implemented the first end-to-end slice:

- `src/server/publicGuestRegistration.ts` creates/reuses parent email-backed identities, creates child `UserData` without child email/auth rows, links parent and child, validates widget-enabled public organization events, and signs/verifies guest registration tokens.
- `src/app/api/public/organizations/[slug]/events/[eventId]/guest-registrations/route.ts` creates child free-agent registrations and guest-created teams, saves event registration question answers, and returns guest registration tokens.
- `src/app/api/public/organizations/[slug]/events/[eventId]/guest-payment-intent/route.ts` creates one-time Stripe PaymentIntents without `customer` or `setup_future_usage`.
- `src/app/api/public/organizations/[slug]/events/[eventId]/guest-sign/route.ts` creates scoped event document signing links from the guest token.
- `src/app/api/public/organizations/[slug]/events/[eventId]/guest-record-signature/route.ts` marks text acknowledgements signed after validating the guest token, event, template, signer context, and parent-child link.
- `src/app/embed/[slug]/registration/[eventId]` hosts the contained widget flow, and event cards in `src/app/embed/[slug]/[kind]/route.ts` now link into that embedded flow.
- `src/proxy.ts` now permits `/embed` pages to be framed while keeping `X-Frame-Options: DENY` on normal app routes.
- Team roster rows collect optional player and parent/guardian emails. The guest registration route dispatches BoldSign emails after commit to the matching signer path and patches consent status on roster and team registration rows.

Validation completed:

- `npm test -- --runTestsByPath src/app/api/public/organizations/[slug]/events/[eventId]/__tests__/guestRegistrationsRoute.test.ts src/app/api/public/organizations/[slug]/events/[eventId]/__tests__/guestPaymentIntentRoute.test.ts src/app/api/public/organizations/[slug]/events/[eventId]/__tests__/guestRecordSignatureRoute.test.ts src/server/__tests__/publicGuestRegistration.test.ts src/proxy.test.ts`
- `npx tsc --noEmit`
- `git diff --check`
- Browser smoke screenshot: `output/playwright/guest-widget-doc-emails/team-roster-contact-fields.png`

## Context and Orientation

The project is a Next.js App Router application. API routes live under `src/app/api`, public widget pages live under `src/app/embed`, public organization pages live under `src/app/o`, and shared server helpers live under `src/server`.

The existing widget route `src/app/embed/[slug]/[kind]/route.ts` renders plain HTML for cards, lists, standings, and brackets. The public organization event page `src/app/o/[slug]/events/[eventId]/page.tsx` renders `EventRegistrationClient`, which wraps the normal authenticated `EventDetailSheet`. That sheet uses authenticated routes such as `src/app/api/events/[eventId]/registrations/self/route.ts`, `src/app/api/events/[eventId]/free-agents/route.ts`, and `src/app/api/billing/purchase-intent/route.ts`.

The existing user helper `src/server/inviteUsers.ts` can ensure an email-backed placeholder `AuthUser`, `UserData`, and `SensitiveUserData`. It is suitable for parent identities. It is not suitable for child-only profiles because children may not have emails. Child profiles should be created as `UserData` rows and linked to the parent through `ParentChildLinks` with `status: ACTIVE`, `linkMethod: PUBLIC_WIDGET_GUEST`, and `createdBy` set to the parent user id.

Payment finalization already happens through the Stripe webhook in `src/app/api/billing/webhook/route.ts`. For event payments, metadata `purchase_type=event`, `user_id` or `team_id`, `event_id`, `registration_id`, and optional occurrence fields are enough for the webhook to mark the reserved event registration active or pending. For team registration purchases, metadata `purchase_type=team_registration`, `team_id`, `user_id`, and `registration_id` are enough for the webhook helpers.

Document signing uses BoldSign. Existing sign endpoints are session-scoped. Public guest signing must be scoped to the registration created by the public endpoint, so a random request cannot sign documents for arbitrary users or teams.

For team-created event registrations, player document signing is not the same signer as the team creator. The team roster row determines signer shape:

- A player email with no guardian email creates/reuses an email-backed placeholder identity and receives participant documents.
- A guardian email creates/reuses the guardian identity, links it to the player, stores the event/team registration as `CHILD`, and sends parent/guardian documents. If the player also has an email, child-signer documents can be sent to the player.
- No signer email creates the roster row but leaves document sending deferred; required documents remain incomplete until a later linker/contact update supplies the signer.

## Plan of Work

First add server-side identity and validation helpers. Create `src/server/publicGuestRegistration.ts` with functions to normalize email and names, create or reuse a parent identity through `ensureAuthUserAndUserDataByEmail`, create child `UserData` rows without child emails, create parent-child links, validate public widget organization/event ownership, and build deterministic registration response data.

Next add a public event guest registration endpoint at `src/app/api/public/organizations/[slug]/events/[eventId]/guest-registrations/route.ts`. The POST body should support `mode: "team" | "free_agent"`, parent contact fields, optional child fields for free-agent child registration, optional roster child rows for team creation, division selection, registration question answers, and optional occurrence fields. For `mode: "team"`, the route creates a guest-owned canonical team, adds parent/child roster rows as team registrations, creates or claims an event team snapshot, and creates an `EventRegistrations` row with `status: STARTED` if payment or required signing is pending, otherwise `ACTIVE`. For `mode: "free_agent"`, the route creates the parent or child user and upserts a `FREE_AGENT` event registration.

Then add a public guest payment-intent endpoint. This endpoint may live inside the same route as an action or in `src/app/api/public/organizations/[slug]/events/[eventId]/guest-payment-intent/route.ts`. It must compute the amount from the event/division server-side, create a one-time PaymentIntent with `receipt_email`, metadata needed by the webhook, and no CustomerSession or `setup_future_usage`. It must not use the existing saved billing profile by email.

Then add scoped sign-link endpoints. The route should accept the guest registration id and signer context, verify that the registration belongs to this organization and event and that the signer user id is the parent/child tied to that registration, and then reuse the same BoldSign dispatch/link logic as the session routes. If the child has no email, parent/guardian links should still be returned and child links should be deferred.

Finally add the iframe UI. The simplest contained widget is a new React page under `src/app/embed/[slug]/registration/[eventId]/page.tsx` with a client component. Update event cards in `src/app/embed/[slug]/[kind]/route.ts` to link to this embedded route when the widget is rendering events. The client should be a compact multi-step form: select mode, parent info, team/child info, questions, signing, and checkout/confirmation. It should call the public endpoints only. It should not rely on `useApp()` auth state.

## Concrete Steps

Run commands from `/Users/elesesy/StudioProjects/mvp-site`.

Create and update files with `apply_patch`. The existing proxy edits for local Android hosts were preserved; the only additional proxy change should be the `/embed` frame-header exception and its test.

After each backend milestone, run focused tests:

    npm test -- --runTestsByPath src/app/api/public/organizations/[slug]/events/[eventId]/__tests__/guestRegistrationsRoute.test.ts

After the widget client is added, run:

    npx tsc --noEmit
    git diff --check

If a local dev server is needed for visual verification, run:

    npm run dev

Then open an embed URL such as:

    http://localhost:3000/embed/<slug>/registration/<eventId>

Replace `<slug>` and `<eventId>` with seeded local data.

## Validation and Acceptance

Acceptance for the first backend slice: a Jest test posts a guest team registration for a public widget-enabled organization event and receives HTTP 201 with a parent user id, team id, event registration id, and any required sign steps. The test proves that parent email creates email-backed user data, child roster rows create `UserData` without `SensitiveUserData`, registration question answers are saved against the event registration, and no session is required.

Acceptance for free-agent registration: a Jest test posts parent info plus child info to the same endpoint with `mode: "free_agent"` and receives HTTP 201 with a `FREE_AGENT` event registration whose `parentId` is the parent user id and whose child user id has an active `ParentChildLinks` row.

Acceptance for payment: a Jest test for the guest payment endpoint verifies the Stripe mock receives `paymentIntents.create` with no CustomerSession, no `setup_future_usage`, `receipt_email` equal to the parent email, and metadata containing the correct `purchase_type`, `event_id`, `team_id` or `user_id`, `registration_id`, and `organization_id`.

Acceptance for the widget: loading `/embed/<slug>/registration/<eventId>` shows a contained form, not a redirect-only card. Submitting valid free-agent or team data advances through questions and signing/checkout steps without requiring a BracketIQ login.

## Idempotence and Recovery

The helper functions must be idempotent by email for parent identities. Re-posting the same parent email should reuse the same `AuthUser`/`SensitiveUserData` user id. Child profiles cannot be safely deduplicated by name alone, so repeated guest submissions may create separate child `UserData` rows unless the caller passes a previously returned child user id in a later linker flow. Event registration ids should be deterministic enough to prevent duplicate active registrations for the same event, registrant type, registrant id, and occurrence.

If a PaymentIntent fails after a registration hold is created, the existing webhook failure logic should move the registration to `PAYMENT_FAILED` when metadata is present. If document signing fails, the registration should remain `STARTED` or `CONSENTFAILED` and the widget should show the error rather than activating the participant.

## Artifacts and Notes

Important existing evidence from repo inspection:

    src/app/embed/[slug]/[kind]/route.ts renders widget event cards as links.
    src/server/inviteUsers.ts ensures placeholder email-backed users.
    prisma/schema.prisma allows UserData without email but requires SensitiveUserData.email.
    src/app/api/billing/webhook/route.ts finalizes event/team registrations from PaymentIntent metadata.
    src/app/api/events/[eventId]/sign/route.ts and src/app/api/teams/[id]/sign/route.ts require session and should remain protected.

## Interfaces and Dependencies

At the end of the backend slice, `src/server/publicGuestRegistration.ts` should export:

    ensureGuestParentIdentity(tx, input, now): Promise<{ userId: string; email: string; authUserExisted: boolean }>
    ensureGuestChildUserData(tx, input, now): Promise<{ userId: string }>
    ensureGuestParentChildLink(tx, input, now): Promise<void>
    assertPublicWidgetEvent(slug, eventId): Promise<{ organization; event }>

At the end of the API slice, `src/app/api/public/organizations/[slug]/events/[eventId]/guest-registrations/route.ts` should export `POST`. The endpoint should not call `requireSession`.

At the end of the widget slice, the embed registration page should exist at:

    src/app/embed/[slug]/registration/[eventId]/page.tsx
    src/app/embed/[slug]/registration/[eventId]/GuestEventRegistrationWidget.tsx

The widget client should use `fetch` or `apiRequest` against the public endpoints and should not use `useApp()` for user auth.

Revision note: Initial ExecPlan created after the requirement expanded from a guest endpoint to a full widget-contained registration flow including team creation, parent/child info, registration questions, document signing, and checkout.
