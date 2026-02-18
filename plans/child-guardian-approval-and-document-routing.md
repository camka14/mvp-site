# Implement child join requests, guardian approvals, and missing-email consent states

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

`mvp-site/PLANS.md` exists and this plan must be maintained in accordance with it.

## Purpose / Big Picture

After this change, child accounts can request to join events, guardians can approve or decline those requests from family management, and consent/document flows remain trackable when a child email is missing. Instead of hard failures, the API will persist pending consent states and expose actionable status to web/mobile clients.

## Progress

- [x] (2026-02-17 19:24Z) Audited registration/family/document routes and identified current blockers.
- [x] (2026-02-17 19:58Z) Added guardian approval request API endpoints (`GET/PATCH /api/family/join-requests`).
- [x] (2026-02-17 20:04Z) Updated self/child registration routes for pending guardian approval and missing child email (`child_email_required`) status.
- [x] (2026-02-17 20:10Z) Updated participants/free-agent routes to remove pre-signature hard block and emit under-13 missing-email warnings.
- [x] (2026-02-17 20:14Z) Extended profile documents payload to include child signer contexts and missing-email status notes.
- [x] (2026-02-17 20:18Z) Updated route tests and ran focused Jest suite (all passing).

## Surprises & Discoveries

- Observation: Minor self-registration currently returns 403 with no guardian approval request creation.
  Evidence: `src/app/api/events/[eventId]/registrations/self/route.ts`.
- Observation: Child registration currently returns 400 when child email is missing.
  Evidence: `src/app/api/events/[eventId]/registrations/child/route.ts`.
- Observation: Team participant registration currently hard-blocks on required signatures rather than tracking pending consent.
  Evidence: `src/app/api/events/[eventId]/participants/route.ts`.
- Observation: Profile document unsigned-card generation does not include child signer contexts.
  Evidence: `src/app/api/profile/documents/route.ts`.
- Observation: Mobile self-join uses `/participants` rather than `/registrations/self`, so minor guardian-approval behavior must be mirrored there too.
  Evidence: `mvp-app` event join flow calls `POST /api/events/{eventId}/participants`.

## Decision Log

- Decision: Reuse `status = PENDINGCONSENT` and encode new transitional details in `consentStatus` (for example `guardian_approval_required`, `child_email_required`) rather than adding new Prisma enum values now.
  Rationale: Avoids migration complexity while preserving behavior compatibility.
  Date/Author: 2026-02-17 / Codex.
- Decision: Keep BoldSign checkbox/clickwrap out of this implementation.
  Rationale: Explicitly excluded by user.
  Date/Author: 2026-02-17 / Codex.
- Decision: Add minor self guardian-approval behavior to `/participants` in addition to `/registrations/self`.
  Rationale: Keeps child request behavior consistent for existing clients without immediate client join-flow migration.
  Date/Author: 2026-02-17 / Codex.

## Outcomes & Retrospective

Implemented:

- Minor self registrations now create guardian approval requests.
- Child registration no longer fails when child email is missing.
- Parent approval list/actions are available under family join-request routes.
- Participant add flow no longer blocks on pre-signed templates and returns warning context for under-13 missing email.
- Profile documents now emit child signer-context cards and missing-email notes.

Validation results:

- `npm test -- childRegistrationRoute.test.ts selfRegistrationRoute.test.ts participantsRoute.test.ts eventSignRoute.test.ts joinRequestsRoute.test.ts`
- Result: 5 suites passed, 20 tests passed.

## Context and Orientation

Key routes:

- Registration: `src/app/api/events/[eventId]/registrations/self/route.ts`, `src/app/api/events/[eventId]/registrations/child/route.ts`
- Event enrollment: `src/app/api/events/[eventId]/participants/route.ts`, `src/app/api/events/[eventId]/free-agents/route.ts`
- Family: `src/app/api/family/children/route.ts`, `src/app/api/family/children/[childId]/route.ts`
- Documents: `src/app/api/profile/documents/route.ts`, `src/app/api/documents/record-signature/route.ts`

A guardian approval request is represented by an `EventRegistrations` row tied to a child registration and linked guardian, with status transitions controlled by guardian actions.

## Plan of Work

First, add family join-request list/action endpoints for guardians. Then update self/child registration routes so minor self actions become pending guardian approvals and missing child email no longer hard-fails child registration. Next, update participants/free-agent routes so required templates create pending consent records instead of hard blocking enrollment. Finally, extend profile document payload generation to include child signer contexts and status notes for missing child email so guardians can see unresolved tasks.

## Concrete Steps

From `/home/camka/Projects/MVP/mvp-site` edit:

- `src/app/api/events/[eventId]/registrations/self/route.ts`
- `src/app/api/events/[eventId]/registrations/child/route.ts`
- `src/app/api/events/[eventId]/participants/route.ts`
- `src/app/api/events/[eventId]/free-agents/route.ts`
- `src/app/api/documents/record-signature/route.ts`
- `src/app/api/profile/documents/route.ts`
- add `src/app/api/family/join-requests/route.ts`
- add `src/app/api/family/join-requests/[registrationId]/route.ts`
- update tests in `src/app/api/events/__tests__/*` and add family join-request tests.

Run focused tests:

- `npm test -- childRegistrationRoute.test.ts`
- `npm test -- selfRegistrationRoute.test.ts`
- `npm test -- participantsRoute.test.ts`
- `npm test -- familyJoinRequestsRoute.test.ts`

## Validation and Acceptance

Acceptance is met when:

- Minor self registration returns a pending guardian-approval response and persists registration state.
- Guardian can list and approve/decline child join requests through family endpoints.
- Child registration with missing email returns pending consent status instead of 400.
- Profile documents response includes child signer context entries and missing-email status guidance.
- Updated route tests pass.

## Idempotence and Recovery

Endpoints will be idempotent where possible (existing registrations are reused/updated). Re-running tests is safe. Recovery is revert touched files and re-run focused route tests.

## Artifacts and Notes

Capture response payload examples for pending guardian approval, child-email-required consent status, and guardian approve/decline outcomes.

## Interfaces and Dependencies

New interface surface:

- `GET /api/family/join-requests`
- `PATCH /api/family/join-requests/[registrationId]` with `{ action: "approve" | "decline" }`

Existing dependencies remain Prisma + Next route handlers + `requireSession` authorization.

Revision note (2026-02-17 19:24Z): Created to implement child request/guardian approval/document routing updates requested by user.
Revision note (2026-02-17 20:18Z): Marked implementation complete and recorded passing focused Jest validation.
