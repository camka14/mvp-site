# Enable parent-child registration with dual-signer consent and age gating

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds. This plan must be maintained in accordance with `mvp-site/PLANS.md`.

## Purpose / Big Picture

This ExecPlan covers the `mvp-site` frontend changes only. The backend schema, Appwrite Function endpoints, and BoldSign dual-signer flow are implemented in the parallel ExecPlan at `mvp-build-bracket/plans/parent-child-consent-and-age-gates.md`. After this plan, web users can manage children from their profile, see event age limits, register themselves or a child through the new backend endpoints, and see consent status and sign links once the backend is available.

## Progress

- [x] (2026-01-05 20:57Z) Drafted ExecPlan.
- [x] (2026-01-05 21:20Z) Re-scoped plan to `mvp-site` frontend only; backend work is tracked in the `mvp-build-bracket` ExecPlan.
- [x] (2026-01-05 22:10Z) Update event creation form/types to capture age limits and route event creation through the Appwrite Function.
- [x] (2026-01-05 22:10Z) Add family and registration client services for `/family/*` and `/events/*/registrations/*`.
- [x] (2026-01-05 22:10Z) Add child management UI to the profile page and wire it to the family endpoints.
- [x] (2026-01-05 22:10Z) Update event detail UI to call new registration endpoints, enforce age gating in the UI, and show consent status/sign links.
- [ ] (2026-01-05 22:10Z) Update mvp-site tests (completed: eventService test coverage; remaining: run npm test + npm run lint).

## Surprises & Discoveries

- Observation: None yet.
  Evidence: Not applicable.

## Decision Log

- Decision: Add dedicated collections for parent-child links, event registrations, and consent documents instead of overloading existing event arrays.
  Rationale: Keeps registration state, consent status, and auditing explicit, while avoiding fragile parsing of embedded relations.
  Date/Author: 2026-01-05 / Codex
- Decision: Treat missing or unverified date of birth as "minor" for privileged actions such as event creation and self-registration.
  Rationale: Fails safe when age verification data is incomplete and avoids letting underage users bypass restrictions.
  Date/Author: 2026-01-05 / Codex
- Decision: Use sequential BoldSign signing order with the parent signing first, then the child.
  Rationale: Ensures guardian consent happens before the minor signs and reduces the chance of a child signing without parental approval.
  Date/Author: 2026-01-05 / Codex
- Decision: Scope this ExecPlan to `mvp-site` frontend work only, deferring backend, schema, and BoldSign changes to the parallel `mvp-build-bracket` ExecPlan.
  Rationale: Prevents duplicate work and keeps responsibilities aligned with repository boundaries.
  Date/Author: 2026-01-05 / Codex

## Outcomes & Retrospective

Frontend updates are in place for age limits, child management, and registration/consent UI wiring against the new backend endpoints. Remaining work is to run the frontend test/lint commands and verify behavior once the backend endpoints are deployed.

## Context and Orientation

Backend work (schema changes, family/registration endpoints, BoldSign dual signer integration) is owned by `mvp-build-bracket/plans/parent-child-consent-and-age-gates.md`. This plan only modifies the web client in `mvp-site` to call those new endpoints and present the UI. The web app currently writes events directly via `mvp-site/src/lib/eventService.ts` and handles event registration/signing in `mvp-site/src/app/discover/components/EventDetailSheet.tsx` with a single-signer BoldSign flow. Those flows need to be updated to call the backend endpoints once they exist, while still keeping UI gating in the browser.

An "Appwrite Function" in this context is the server function invoked via `functions.createExecution` from the web client. All critical age and parent/child checks are enforced server-side; the frontend only surfaces UX hints and error messages from the backend.

## Assumptions and Non-goals

Assumptions: the Appwrite Function from `mvp-build-bracket` is deployed and callable with JWT; the backend exposes `/family/*`, `/events/*/registrations/*`, and `/documents/consent` endpoints as described below; `userData.dateOfBirth` exists and `dobVerified` is exposed on the user record; the single-signer BoldSign flow continues to support existing waiver templates.

Non-goals: any backend schema or function work; mobile client updates; redesigning the overall event discovery UI; migrating historical registrations; replacing payment flows or pricing logic outside of the minimal changes needed to call the new registration endpoints.

## Data Model Changes (Appwrite)

The data model changes are implemented in the `mvp-build-bracket` ExecPlan. They are listed here only as frontend dependencies so the UI knows what fields and responses to expect.

ParentChildLink (collection: `parentChildLinks`):
- `parentId` (string, required)
- `childId` (string, required)
- `status` (string enum: `pending`, `active`, `revoked`, `inactive`, required)
- `relationship` (string enum: `parent`, `guardian`, optional)
- `linkMethod` (string enum: `created`, `linked`, optional)
- `createdBy` (string, required)
- `createdAt` (datetime, optional if Appwrite handles timestamps)
- `endedAt` (datetime, optional)

Event (collection: `events`):
- `minAge` (integer, optional, represents minimum age in years)
- `maxAge` (integer, optional, represents maximum age in years)

EventRegistration (collection: `eventRegistrations`):
- `eventId` (string, required)
- `registrantId` (string, required; child or adult user id)
- `parentId` (string, optional; required when `registrantType=CHILD`)
- `registrantType` (string enum: `SELF`, `CHILD`, required)
- `status` (string enum: `pendingConsent`, `active`, `blocked`, `cancelled`, `consentFailed`, required)
- `ageAtEvent` (integer, optional)
- `consentDocumentId` (string, optional)
- `consentStatus` (string, optional)
- `createdBy` (string, required)
- `createdAt` (datetime, optional)
- `updatedAt` (datetime, optional)

Consent/Signature tracking (collection: `consentDocuments`):
- `eventRegistrationId` (string, required)
- `eventId` (string, required)
- `parentId` (string, required)
- `childId` (string, required)
- `boldsignDocumentId` (string, required)
- `status` (string enum: `draft`, `sent`, `parentSigned`, `childSigned`, `completed`, `declined`, `expired`, `error`, required)
- `parentSignLink` (string, optional)
- `childSignLink` (string, optional)
- `sentAt` (datetime, optional)
- `completedAt` (datetime, optional)
- `lastWebhookAt` (datetime, optional)
- `retryCount` (integer, optional)

UserData (collection: `userData`) additions:
- `dobVerified` (boolean, optional, default false)
- `dobVerifiedAt` (datetime, optional)
- `ageVerificationProvider` (string, optional)

Indexing recommendations:
- `parentChildLinks`: unique compound index on (`parentId`, `childId`), plus single-column indexes on `parentId`, `childId`, `status`.
- `eventRegistrations`: indexes on `eventId`, `registrantId`, `parentId`, `status`.
- `consentDocuments`: indexes on `boldsignDocumentId`, `eventRegistrationId`, `status`.
- `events`: indexes on `minAge` and `maxAge` if age filtering is used in search.

## API Surface (Python Appwrite Function Endpoints)

All endpoints require Appwrite JWT authentication and must use the user id from the verified JWT as the source of truth.

linkChildToParent (POST `/family/links`):
- Request body:
    {
      "childUserId": "child_123",
      "relationship": "parent"
    }
  or
    {
      "childEmail": "child@example.com",
      "relationship": "parent"
    }
- Validations: parent must be the caller; child must exist; prevent linking duplicates; reject if child is already linked to a different parent unless the system allows multiple guardians.
- Response:
    {
      "linkId": "link_123",
      "status": "active",
      "child": { "userId": "child_123", "firstName": "...", "lastName": "..." }
    }

createChildAccount (POST `/family/children`):
- Request body:
    {
      "firstName": "Alex",
      "lastName": "Doe",
      "email": "alex@example.com",
      "dateOfBirth": "2012-05-20",
      "relationship": "parent"
    }
- Validations: require parent caller; validate date format; ensure email uniqueness if provided; store `dobVerified=false` unless verification status exists.
- Response:
    {
      "childUserId": "child_123",
      "linkId": "link_123",
      "status": "active"
    }

listChildrenForParent (GET `/family/children`):
- Response:
    {
      "children": [
        { "userId": "child_123", "firstName": "...", "lastName": "...", "age": 12, "linkStatus": "active" }
      ]
    }

createEvent (POST `/events`):
- Request body: event payload plus `minAge`/`maxAge` when needed.
- Auth: caller must be an adult based on verified date of birth.
- Validations: if caller is minor or dob is unverified, reject; `minAge <= maxAge` when both present.
- Response: `{ "event": { ... } }` using the same shape returned by `eventService.getEvent`.

registerSelfForEvent (POST `/events/{eventId}/registrations/self`):
- Request body:
    {
      "eventId": "event_123"
    }
- Validations: caller must be adult; event age limits must allow caller; ensure not already registered; honor required document signing state if applicable.
- Response:
    { "registration": { "id": "reg_123", "status": "active" } }

registerChildForEvent (POST `/events/{eventId}/registrations/child`):
- Request body:
    {
      "eventId": "event_123",
      "childId": "child_123"
    }
- Validations: caller must be the linked parent; child must be under 18 or otherwise flagged as dependent; event age limits must allow child's age; child must have an email for BoldSign; prevent duplicate registrations.
- Response:
    {
      "registration": { "id": "reg_456", "status": "pendingConsent" },
      "consent": { "documentId": "bs_789", "status": "sent", "parentSignLink": "...", "childSignLink": "..." }
    }

boldsignCreateConsentDocument (POST `/documents/consent`):
- Request body:
    {
      "eventRegistrationId": "reg_456",
      "parent": { "userId": "parent_1", "email": "parent@example.com", "name": "Parent Name" },
      "child": { "userId": "child_123", "email": "child@example.com", "name": "Child Name" },
      "templateId": "template_abc",
      "eventId": "event_123"
    }
- Validations: only callable by backend or parent; ensure registration exists and is pending consent.
- Response:
    { "documentId": "bs_789", "parentSignLink": "...", "childSignLink": "...", "status": "sent" }

boldsignWebhookHandler (POST `/documents/webhook`):
- Payload: BoldSign webhook payload with document id and signer status.
- Validations: verify webhook signature if available; ensure document id maps to a consent record.
- Response: `{ "ok": true }` after updating consent and registration status.

## Business Rules and Validation Logic

Minor vs adult: compute age in years from `userData.dateOfBirth` using the current date in UTC. If `dobVerified` is false or `dateOfBirth` is missing, treat the user as a minor for actions that require adulthood (create event, self-register). When checking event eligibility, use age as of the event start date if available; fall back to the current date if the event start is missing.

Event age limits: if `minAge` is set, require `age >= minAge`. If `maxAge` is set, require `age <= maxAge`. If both are set, require both. If neither is set, skip age checks. If age is unknown or unverified and limits exist, block registration and return a clear error.

Show "Register a child" option: the client should show this only when the current user is an adult with at least one active `parentChildLinks` record, but still call the backend for final validation. Optionally filter the child list client-side by age range for a better UX, but do not rely on it for enforcement.

Prevent minors from creating events: in the `createEvent` endpoint, reject if age is under 18 or dob is unverified.

Prevent minors from self-registering: in `registerSelfForEvent`, reject if the caller is under 18 or dob is unverified.

Ensure only linked parents can register a child: in `registerChildForEvent`, confirm an active link with `parentId` = caller and `childId` = requested child. Reject if the link is missing or not active.

Edge cases:
- Missing DOB or unverified DOB: treat as minor for event creation and self-registration; block age-limited registrations.
- Child has no email: require a parent update to supply an email before creating the consent document, since BoldSign needs signer emails.
- Child already registered: return the existing registration instead of creating duplicates.
- Child turns 18 between registration and event: allow the existing registration to proceed, but future registrations can be self-initiated.

## BoldSign Dual Signer Plan

Use a BoldSign template that defines two roles, one for the parent and one for the child. Extend `mvp-build-bracket/src/integrations/boldsign.py` to send a document from the template with two signer roles in sequence. Example payload shape:

    {
      "templateId": "template_abc",
      "title": "Event Consent",
      "signers": [
        {
          "roleIndex": 1,
          "signerName": "Parent Name",
          "signerEmail": "parent@example.com",
          "signerOrder": 1
        },
        {
          "roleIndex": 2,
          "signerName": "Child Name",
          "signerEmail": "child@example.com",
          "signerOrder": 2
        }
      ],
      "redirectUrl": "https://.../consent-complete"
    }

Store the resulting `boldsignDocumentId` in `consentDocuments` and link it to `eventRegistrations`. When BoldSign reports signer completion, update `consentDocuments.status` and set `eventRegistrations.status` to `active` only when both signatures are completed. Registration state transitions should follow: `pendingConsent` -> `active` on completion, `pendingConsent` -> `consentFailed` on decline/expire.

Preferred completion flow is the webhook handler in `documents.py`. If webhook delivery is unreliable, implement a polling function that queries BoldSign for documents in `sent` or `parentSigned` status older than a short threshold (for example, 15 minutes) and updates the same records.

Retry and resend: allow the parent to request new sign links if a document expires or is declined. This should create a new `consentDocuments` row linked to the same registration, mark the previous row as `expired` or `declined`, and increment `retryCount`.

## UI Flow Requirements (Web + Mobile)

Parent dashboard: show a "Children" section that loads `GET /family/children`, allows adding a new child (`POST /family/children`), linking an existing child (`POST /family/links`), and viewing link status. Show a clear note if a child lacks an email and cannot sign consent yet.

Event page registration: adults see a "Register myself" option and, when eligible, a "Register a child" option that opens a child picker and then calls `registerChildForEvent`. Minors see a disabled registration state with a clear message explaining that a parent must register them. The UI should show age-limit messages using the event's min/max age fields but rely on backend errors for final gating.

Consent signing states: display "Pending parent signature," "Pending child signature," "Completed," or "Failed/Expired" based on `consentDocuments.status`, and show sign links returned by the backend. When the backend marks the registration `active`, show the same confirmation UI used for adult registrations.

## Turning 18: Permission Transition

Use either a scheduled Appwrite Function (daily cron) or lazy evaluation on login and registration calls to recompute age status. When a user turns 18, set a flag or derived field on `userData` (for example `adultSince`) and treat them as an adult for future API calls. Parent-child links should remain for audit history but be marked `inactive` (or `endedAt` populated) so enforcement no longer treats the user as a dependent. Existing registrations remain valid.

If needed, run a backfill that sets `dobVerified` defaults and computes `adultSince` for users with verified DOBs to avoid surprises on first login.

## Security and Audit

Store only necessary PII: name, date of birth, and email; do not store verification documents in Appwrite. Ensure family and registration endpoints always filter by the authenticated user's id so parents cannot access unrelated children. Add audit fields (`createdBy`, `linkedBy`, `registeredBy`, `consentDocumentId`) to track who performed each action. Validate Appwrite JWTs on every function call and reject unauthenticated requests for protected endpoints.

## Implementation Steps

1. Update the `mvp-site` event types and form to carry `minAge`/`maxAge`, including validation that `minAge <= maxAge` when both are provided. Ensure event creation uses the Appwrite Function create-event endpoint instead of direct Appwrite writes. Acceptance: saving an event includes the age limits in the payload and routes through the Appwrite Function.
2. Add `mvp-site` client helpers to call the new family and registration endpoints, returning typed responses with errors surfaced to the UI. Acceptance: calling the helpers in isolation hits the expected `/family/*` and `/events/*/registrations/*` endpoints.
3. Add a "Children" section to `mvp-site/src/app/profile/page.tsx` with list, create, and link flows, and show an alert when a child lacks an email required for consent. Acceptance: a parent can create or link a child and see the new row in the list.
4. Update `mvp-site/src/app/discover/components/EventDetailSheet.tsx` to call the new registration endpoints for self and child registrations, show age gating messages, and show consent status/sign links when a child registration is pending. Acceptance: minors see disabled self-registration, adults can register themselves, and parents can register a child and see consent links.
5. Update `mvp-site` tests and run the frontend test/lint commands. Acceptance: test suite passes and the updated mocks assert function execution instead of direct Appwrite writes.

## Test Plan

Unit tests: validate age calculations, minor/adult detection, and event age limit checks with boundary dates. Integration tests: call each new Appwrite function endpoint with valid and invalid payloads to ensure correct error responses and database writes. End-to-end scenarios: parent creates child, links child, registers child for an age-limited event, completes BoldSign dual signing, and observes registration status transition; a minor attempts to create an event and is blocked; a user turns 18 and gains the ability to self-register.

## Plan of Work

Backend work happens in `mvp-build-bracket`: add new service modules under `src/database/services/`, update `src/database/database.py` to expose them, add new entrypoints in `src/entrypoints/` for family and registration flows, and extend `src/event_manager.py` to route `/family/*` and `/events/*/registrations/*` paths. BoldSign updates will extend `src/integrations/boldsign.py` and `src/entrypoints/documents.py` to support dual signer consent and webhook updates tied to the new `consentDocuments` collection.

Frontend work happens in `mvp-site`: update `src/lib/eventService.ts` to call the Appwrite Function `createEvent` endpoint instead of direct Appwrite table writes, add a new client service (for example `src/lib/familyService.ts`) to call the family endpoints, and update `src/app/discover/components/EventDetailSheet.tsx` to call the new registration endpoints and show consent status. Event creation UI in `src/app/events/[id]/schedule/components/EventForm.tsx` must capture min/max age values. Mobile updates should follow the same endpoint shapes and UI gating patterns.

## Concrete Steps

From `/home/camka/Projects/MVP/mvp-site`, update the event creation and registration flows, then run:

    cd /home/camka/Projects/MVP/mvp-site && npm test
    cd /home/camka/Projects/MVP/mvp-site && npm run lint

## Validation and Acceptance

Acceptance criteria (frontend):
- The event creation form captures min/max age and passes them through the Appwrite Function create-event call.
- A minor sees disabled self-registration with a clear message; adults see self-register and child-register options when eligible.
- A parent can create or link a child in the profile page and see the child list update.
- When registering a child, the UI surfaces consent status and the sign links returned by the backend.
- Errors returned by the backend endpoints are visible in the UI.

## Idempotence and Recovery

Schema changes are additive and can be re-applied safely. Registration and consent creation should detect existing active registrations and return them instead of creating duplicates. If a BoldSign document expires or is declined, the parent can trigger a new consent document without deleting prior rows; the backend should keep historical records and allow retries.

## Artifacts and Notes

Capture payload samples for the new endpoints and the BoldSign dual signer response in a short note for future debugging. If webhook payloads differ from expectations, log the raw payload in `Surprises & Discoveries` with a redacted example.

## Interfaces and Dependencies

`mvp-site/src/lib/familyService.ts` should expose `listChildren`, `createChildAccount`, and `linkChildToParent` helpers that call `/family/children` and `/family/links` via the Appwrite Function. `mvp-site/src/lib/registrationService.ts` should expose `registerSelfForEvent` and `registerChildForEvent`, returning `{ registration, consent }` when available. The `Event` and `UserData` types in `mvp-site/src/types/index.ts` should include optional `minAge`, `maxAge`, and `dobVerified` fields to align with the backend.

Note (2026-01-05): Initial ExecPlan drafted to cover parent/child linking, age gating, and dual-signer BoldSign consent across web and mobile.

Plan update note (2026-01-05): Scoped this ExecPlan to `mvp-site` frontend work only because the backend and schema changes are tracked in the parallel `mvp-build-bracket` ExecPlan.
