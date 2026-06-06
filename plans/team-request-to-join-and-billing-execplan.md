# Team Request-to-Join, Manager Questions, and Team Billing Actions

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document follows `PLANS.md` at the repository root. It covers backend and web work in `C:\Users\samue\Documents\Code\mvp-site` and the required mobile parity work in `C:\Users\samue\StudioProjects\mvp-app`.

## Purpose / Big Picture

After this change, managers can add custom registration questions to both teams and events. A team manager can also choose whether a team is closed, immediately open for registration, or open for join requests. Team questions are asked in both immediate open registration and request-to-join mode. Event questions are configured while creating or editing an event and are asked during event registration. In request-to-join mode, a player sees a request form with manager-created questions instead of being added to the roster or sent to payment immediately. The manager reviews the answers, approves or declines the request, and approved players appear in the normal team member list. Billing happens after approval through the same player action pattern used in event participant management: click or tap a player, open their management actions, then choose payment actions such as Send bill or Receive payment now.

The behavior is visible when a manager edits a team, selects Request to join, adds questions, and saves. A non-member then opens that team, answers the questions, and sees a pending request state. The manager sees the request and answers, approves it, and the player appears under Team Members with payment status No bill yet. The manager then clicks the player and sends a bill whose amount defaults to the team registration price label. The related event behavior is visible by adding questions in the event form and registering for the event; the manager can then view the submitted answers from the participant management surface.

## Progress

- [x] (2026-06-05T23:02:20Z) Created this ExecPlan after reviewing the existing open team registration, team compliance, event participant billing action, and mobile participant management patterns.
- [x] (2026-06-06T01:10:43Z) Updated the plan so questions are generalized for teams and events, and so team questions apply to both open registration and request-to-join.
- [x] (2026-06-06T02:28:00Z) Added Prisma schema, migration, generated Prisma client, and shared web types for join policy, generalized registration questions, generalized question responses, and join requests.
- [x] (2026-06-06T02:28:00Z) Implemented backend helpers and route handlers for generalized question management, player request submission, manager review, event registration answers, open team registration answers, and team member billing.
- [x] (2026-06-06T02:28:00Z) Updated web team settings, event form, public/team/event registration flows, join request review UI, participant answer review UI, and player management billing actions.
- [x] (2026-06-06T02:28:00Z) Updated mobile DTOs, Room schema/version, team join-policy settings, manager answer-display surfaces, and registration-setting tests.
- [ ] Complete full native mobile question creation/submission, native join-request review/actions, and native team-member billing actions beyond the answer-display and join-policy compatibility patch.
- [x] (2026-06-06T02:28:00Z) Added focused web and mobile tests for question snapshot helpers and mobile request-only price-label behavior.
- [x] (2026-06-06T02:28:00Z) Ran validation commands and recorded results in `Outcomes & Retrospective`.
- [x] (2026-06-06T04:31:55Z) Fixed web QA regressions found after the first end-to-end pass: request-only public team pages now load, public team cards link request-only teams, event participant team rows expose the team registration/request action, team registration actions wait for join context/questions before submitting, and explicit validation errors return their intended HTTP status.
- [x] (2026-06-06T05:27:00Z) Reran focused web tests, type checking, Browser desktop/mobile retests, and a route-level QA flow for open registration with questions, request-to-join with questions from an event team snapshot, manager approval, team bill creation, player bill processing, and webhook-paid bill reconciliation.

## Surprises & Discoveries

- Observation: `TeamRegistrations.status = PENDING` already means payment pending in the team registration flow.
  Evidence: `src/components/ui/TeamDetailModal.tsx` renders PENDING as Payment pending, and `src/server/teams/teamMembership.ts` treats PENDING as an active-like registration for capacity and membership serialization.

- Observation: The current team compliance endpoint already maps team-owned bills to individual members by `BillPayments.payerUserId`.
  Evidence: `src/app/api/teams/[id]/compliance/route.ts` queries `Bills` where `ownerType = TEAM`, `ownerId = team.id`, and `eventId = null`, then groups `BillPayments` by `payerUserId`.

- Observation: The web event schedule page already has a Send Bill modal, and the mobile event participant dialog already has a Payments menu with Receive payment now and Send bill.
  Evidence: `src/app/events/[id]/schedule/page.tsx` has `openCreateBillModal`, `submitCreateBill`, and the Send Bill modal. `C:\Users\samue\StudioProjects\mvp-app\composeApp\src\commonMain\kotlin\com\razumly\mvp\eventDetail\composables\ParticipantsVeiw.kt` has `ParticipantManagementDialog` and `ParticipantPaymentsMenuButton`.

- Observation: Paid open team registration creates a temporary `STARTED` team registration before payment.
  Evidence: `src/server/teams/teamOpenRegistration.ts` uses `STARTED_MEMBER_STATUS`, deletes stale STARTED rows after `TEAM_REGISTRATION_STARTED_TTL_MS`, and activates those rows after payment. Registration question responses for paid open team registration must attach to that temporary registration and remain visible after activation.

- Observation: The first web QA pass showed request-only canonical teams existed but the public team registration route returned 404.
  Evidence: `src/server/publicOrganizationCatalog.ts` filtered `getPublicOrganizationTeamForRegistration` with `openRegistration: true`, while request-only teams intentionally serialize `openRegistration = false` and `joinPolicy = REQUEST_TO_JOIN`.

- Observation: The event participant team modal listed teams but did not let a player join or request one of those teams.
  Evidence: `src/app/discover/components/EventDetailSheet.tsx` rendered static team rows in the `Event Teams` dropdown; the only event-page team control, `View Team Options`, is for selecting a user's own team to register for the event.

- Observation: Open-registration question submission could race if the user clicked before join context loaded.
  Evidence: The Browser pass clicked `Join Team` before `GET /api/teams/:id/join-request-context` had populated questions, causing `POST /api/teams/:id/registrations/self` to submit without answers.

- Observation: The in-app Browser could verify rendered states and clicks, but text entry into login/question fields is not reliable in this environment.
  Evidence: Browser Playwright `fill`, keyboard typing, and DOM typing attempts failed because the Browser virtual clipboard is not installed. Authenticated join/request/billing behavior was therefore validated through the same HTTP routes using bearer sessions generated from the local auth secret.

- Observation: Event-team rows in the public event modal require active `EventRegistrations` rows, not just `EventTeams` snapshots.
  Evidence: The `EventTeams` rows existed, but `GET /api/events/qa_web_team_request_event/participants` returned zero teams until active team `EventRegistrations` were seeded. After that, the public event page rendered `2/8`, the Event Teams modal listed both teams, and the buttons resolved from `Loading registration...` to `Join Team` and `Request to Join - $25.00`.

## Decision Log

- Decision: Add a first-class `joinPolicy` to canonical teams instead of overloading `openRegistration`.
  Rationale: `openRegistration = true` means immediate registration and can trigger payment. Request-to-join must be visibly open to users but must not let older clients bypass approval or payment rules.
  Date/Author: 2026-06-05 / Codex

- Decision: Keep `openRegistration` as a backward-compatible alias that is true only when `joinPolicy = OPEN_REGISTRATION`.
  Rationale: Existing clients and public filters already depend on `openRegistration`. Request-only teams must serialize `openRegistration = false` so old mobile builds do not call the immediate registration endpoint.
  Date/Author: 2026-06-05 / Codex

- Decision: Store join requests in new request tables, not in `TeamRegistrations.PENDING`.
  Rationale: Pending requests must not count against roster capacity, and `PENDING` in `TeamRegistrations` is already payment state.
  Date/Author: 2026-06-05 / Codex

- Decision: In request-to-join mode, `registrationPriceCents` is a label and default bill amount, not an immediate charge.
  Rationale: The user must wait for approval, so the app cannot run the existing immediate registration payment flow. Managers still need to communicate the expected price and later bill the approved player.
  Date/Author: 2026-06-05 / Codex

- Decision: After approval, billing actions live on the approved player row, not on the pending request card.
  Rationale: This matches event management, where clicking a participant opens management actions. A join request card should be about review only; payment belongs to normal member management after the player is on the roster.
  Date/Author: 2026-06-05 / Codex

- Decision: Team registration bills created from player actions should be team-owned bills assigned to a payer through `BillPayments.payerUserId`.
  Rationale: The existing team compliance endpoint already summarizes that shape, and it lets the player row show No bill yet, Bill pending, Payment processing, or Paid in full without inventing a second billing status model.
  Date/Author: 2026-06-05 / Codex

- Decision: Version 1 manager questions are ordered free-text questions with a required flag.
  Rationale: The requested user experience is "a few questions pop up." Ordered text questions deliver that behavior with low risk. The schema can include an answer type enum for future short answer, long answer, yes/no, or select controls, but the first UI should only expose text variants unless more complexity is requested.
  Date/Author: 2026-06-05 / Codex

- Decision: Use generalized `RegistrationQuestions` and `RegistrationQuestionResponses` instead of team-specific question and answer tables.
  Rationale: The user wants the same question system available on event registration and team registration. A generalized scope lets teams and events share creation UI, answer validation, response snapshots, and manager review components.
  Date/Author: 2026-06-06 / Codex

- Decision: Store answers as a response snapshot document in `RegistrationQuestionResponses`, linked to the registration or join request subject.
  Rationale: A snapshot preserves the exact prompt, answer type, required flag, and answer seen at submission time even if the manager edits or removes questions later. A single generalized response table avoids adding different answer JSON fields to every registration table while still supporting team requests, open team registration, and event registration.
  Date/Author: 2026-06-06 / Codex

- Decision: Present submitted answers in manager detail surfaces, not as dense table columns.
  Rationale: Answers can be long and need the original prompt for context. Web should show answers in request/member/participant detail panels, while mobile should show them in bottom sheets or full-screen review dialogs using stacked question-and-answer cards.
  Date/Author: 2026-06-06 / Codex

- Decision: In this pass, native mobile parity covers the new team join-policy field, request-only price-label behavior in team settings, and manager answer display in existing compliance dialogs. Full native question editors, native request submission forms, join-request review actions, and team billing actions remain deferred.
  Rationale: The web/API implementation is the primary feature surface and the native app already needed data-contract changes to safely consume the new responses. Adding the full native interaction set requires repository methods, new request context screens, form state, and billing actions across several flows and should be handled as a separate mobile feature pass.
  Date/Author: 2026-06-06 / Codex

- Decision: Public registration pages should accept both `OPEN_REGISTRATION` and `REQUEST_TO_JOIN` teams, while keeping `openRegistration` false for request-only teams.
  Rationale: Request-only teams are public and user-actionable, but old clients must still be prevented from calling immediate registration by relying on `openRegistration`.
  Date/Author: 2026-06-06 / Codex

- Decision: Event-team join actions should reuse `TeamRegistrationFlow` inside the existing Event Teams modal.
  Rationale: The shared flow already knows how to resolve event team snapshots to their canonical team through `parentTeamId`, load manager questions, handle open registration, and submit request-only applications. Reusing it avoids duplicating request/payment/document logic in `EventDetailSheet`.
  Date/Author: 2026-06-06 / Codex

## Outcomes & Retrospective

Implemented the web/API feature set and a native mobile compatibility/display patch.

Schema and generated client:

- Added migration `prisma/migrations/20260606013000_registration_questions_team_requests/migration.sql`.
- Added `TeamJoinPolicyEnum`, generalized registration-question/response enums, `RegistrationQuestions`, `RegistrationQuestionResponses`, `TeamJoinRequests`, and `CanonicalTeams.joinPolicy`.
- Ran `npx prisma generate` successfully.

Web/API behavior:

- Request-only teams serialize `joinPolicy = REQUEST_TO_JOIN` and `openRegistration = false`; immediate team registration rejects non-open teams.
- Team/event questions are managed through generalized question routes and saved as response snapshots on join requests, team registrations, and event registrations.
- Request-only submission collects answers and creates a pending request without payment. Approval creates/reactivates an ACTIVE team registration and copies the answer snapshot to the team registration response.
- Team manager billing uses `POST /api/teams/[id]/billing/bills` to create a team-owned bill for an approved member, defaulting to the team price label.
- Web manager surfaces show answer snapshots in join request cards, team member compliance/details, event team compliance, and event participant compliance.

Mobile behavior:

- Added `joinPolicy` to mobile team models/DTOs/update payloads and bumped Room database version to 23.
- Updated Android team settings from a boolean open-registration control to Closed/Open registration/Request to join, including the request-only warning that prices are labels until a manager sends a bill.
- Added mobile DTO/domain/cache support for `registrationAnswers` and rendered answer sections in existing team member and event participant management dialogs.
- Deferred full native question editors, native user-facing question/request submission forms, native join request review actions, and native team-member billing actions.

Validation:

- `npx prisma generate` passed.
- `npx jest src/server/__tests__/registrationQuestions.test.ts --runInBand` passed.
- `npx tsc --noEmit --pretty false` passed.
- `.\gradlew.bat :composeApp:compileDebugKotlinAndroid --console=plain` passed.
- `.\gradlew.bat :composeApp:testDebugUnitTest --tests com.razumly.mvp.teamManagement.TeamRegistrationFormStateTest --console=plain` passed. Gradle emitted expected Windows/iOS CocoaPods target warnings and noted no connected device for adb reverse; the build still completed successfully.

Post-fix web QA:

- Browser desktop public event route `http://localhost:3000/o/qa-team-request-flow/events/qa_web_team_request_event` rendered `2/8` teams after reload; the Event Teams modal listed `QA Open Registration Team` with `Join Team` and `QA Request Only Team` with `Request to Join - $25.00`.
- Browser mobile viewport `390x844` kept the same Event Teams modal title, both team rows, and both actions visible.
- Route-level QA flow passed 17 checks: manager question creation; event-team snapshot join-policy enrichment; open-registration required-answer validation and active membership creation; request-only price/question context; request required-answer validation; pending request creation without payment; manager answer review; approval into active membership; answer-copy to team registration; team bill creation; player bill processing authorization; and webhook-paid bill reconciliation.
- `npx jest src/server/events/__tests__/eventRegistrations.test.ts src/server/__tests__/publicOrganizationCatalog.test.ts src/server/__tests__/registrationQuestions.test.ts src/app/discover/components/__tests__/EventDetailSheetDetails.test.tsx src/app/discover/components/__tests__/EventDetailSheetJoinPaymentPlanTeamJoin.test.tsx src/app/discover/components/__tests__/EventDetailSheetJoinPaymentPlanConflict.test.tsx --runInBand` passed: 6 suites, 48 tests.
- `git diff --check` passed with only existing CRLF conversion warnings.
- `npx tsc --noEmit --pretty false` passed.

## Context and Orientation

Canonical organization teams are stored in Prisma model `CanonicalTeams`, which maps to the database table named `Teams` in `prisma/schema.prisma`. Team members are stored in `TeamRegistrations`. The existing field `openRegistration` controls immediate self-registration. The existing field `registrationPriceCents` controls the immediate paid registration amount for open-registration teams. The existing `TeamRegistrations` statuses `ACTIVE`, `INVITED`, `STARTED`, and `PENDING` are used for real roster or payment states and can count against capacity.

Team request-to-join must be separate from those membership rows. A request is an application to join the team. It should contain the applicant, the requested registrant, and review status. Its answers live in the generalized `RegistrationQuestionResponses` table, linked back to the join request. It should not add the player to `TeamRegistrations` until manager approval succeeds.

A registration question is a manager-created prompt shown during registration or request submission. A registration question response is a snapshot of the prompts and answers submitted by a user. The snapshot must copy the question text and metadata at submission time so old answers remain understandable after questions are edited.

The web manager team modal is `src/components/ui/TeamDetailModal.tsx`. It already edits team details, open registration, price, required documents, jersey numbers, and team members. It also already fetches member compliance from `src/app/api/teams/[id]/compliance/route.ts`. The public/user-facing registration flow is `src/components/ui/TeamRegistrationFlow.tsx`, used by public organization team pages and readonly team detail surfaces.

The web event participant billing model to reuse lives in `src/app/events/[id]/schedule/page.tsx`. In manage mode, `renderEditBillingActions` displays Refund and Send Bill actions, and `openCreateBillModal` opens a Send Bill modal. The mobile equivalent is in `C:\Users\samue\StudioProjects\mvp-app\composeApp\src\commonMain\kotlin\com\razumly\mvp\eventDetail\composables\ParticipantsVeiw.kt`, where `ParticipantManagementDialog` shows compliance details and a `ParticipantPaymentsMenuButton`.

The mobile team model is in `C:\Users\samue\StudioProjects\mvp-app\composeApp\src\commonMain\kotlin\com\razumly\mvp\core\data\dataTypes\Team.kt`. Team API DTOs are in `composeApp\src\commonMain\kotlin\com\razumly\mvp\core\network\dto\TeamDtos.kt`. Team management UI is in `composeApp\src\commonMain\kotlin\com\razumly\mvp\teamManagement\CreateOrEditTeamScreen.kt`. Mobile team detail and public join actions are in `composeApp\src\commonMain\kotlin\com\razumly\mvp\core\presentation\composables\TeamDetailsDialog.kt` and `composeApp\src\commonMain\kotlin\com\razumly\mvp\organizationDetail\OrganizationDetailComponent.kt`.

## Plan of Work

First, add the data model. In `prisma/schema.prisma`, add `TeamJoinPolicyEnum` with values `CLOSED`, `OPEN_REGISTRATION`, and `REQUEST_TO_JOIN`. Add `joinPolicy TeamJoinPolicyEnum @default(CLOSED)` to `CanonicalTeams`. Backfill existing rows so teams with `openRegistration = true` become `OPEN_REGISTRATION` and all others become `CLOSED`. Keep the old `openRegistration` column for compatibility, but every serializer must set it to true only for `OPEN_REGISTRATION`.

Add generalized question enums. `RegistrationQuestionScopeTypeEnum` should have `TEAM` and `EVENT`. `RegistrationQuestionAnswerTypeEnum` should have at least `TEXT` and `LONG_TEXT`. `RegistrationQuestionResponseSubjectTypeEnum` should have `TEAM_JOIN_REQUEST`, `TEAM_REGISTRATION`, and `EVENT_REGISTRATION`.

Add a `RegistrationQuestions` model with `id`, `scopeType`, `scopeId`, `prompt`, `answerType`, `required`, `sortOrder`, `isActive`, `createdAt`, `updatedAt`, `createdBy`, and `updatedBy`. A team question uses `scopeType = TEAM` and `scopeId = canonical team id`. An event question uses `scopeType = EVENT` and `scopeId = event id`. Add indexes on `scopeType/scopeId/isActive` and `scopeType/scopeId/sortOrder`.

Add a `RegistrationQuestionResponses` model with `id`, `scopeType`, `scopeId`, `subjectType`, `subjectId`, `responderUserId`, `registrantUserId`, `registrantType`, `answersSnapshot Json`, `createdAt`, and `updatedAt`. A response subject is the concrete row the answers belong to: a team join request, a team registration, or an event registration. The `answersSnapshot` should be an array of objects containing `questionId`, `prompt`, `answerType`, `required`, `sortOrder`, and `answer`. Add a unique index on `subjectType/subjectId` for the current v1 rule of one response snapshot per registration or request. Add indexes on `scopeType/scopeId`, `responderUserId`, and `registrantUserId`.

Add `TeamJoinRequestStatusEnum` with `PENDING`, `APPROVED`, `DECLINED`, `WITHDRAWN`, and `CANCELLED`. Add `TeamJoinRequestRegistrantTypeEnum` with `SELF` and `CHILD`. Add a `TeamJoinRequests` model with `id`, `teamId`, `requesterUserId`, `registrantUserId`, `parentId`, `registrantType`, `status`, `reviewedByUserId`, `reviewedAt`, `reviewNote`, `approvedRegistrationId`, `createdAt`, and `updatedAt`. Add indexes on `teamId/status`, `registrantUserId/status`, and `requesterUserId/status`. Do not add a uniqueness constraint that prevents historical declined requests; enforce "only one pending request per registrant per team" in helper code.

Second, update team serialization and compatibility behavior. In `src/server/teams/teamMembership.ts`, `src/app/api/teams/route.ts`, `src/app/api/teams/[id]/route.ts`, `src/lib/teamService.ts`, and `src/types/index.ts`, include `joinPolicy`. When a new client sends `joinPolicy`, use it as the source of truth and synchronize `openRegistration` to `joinPolicy === OPEN_REGISTRATION`. When an older client sends only `openRegistration`, map true to `OPEN_REGISTRATION`. Map false to `CLOSED` unless the existing team is already `REQUEST_TO_JOIN`; in that case preserve request mode so an old mobile edit does not accidentally close a request-only team.

Third, implement generalized question helpers under `src/server/registrationQuestions.ts`. The helper should accept a scope type and scope id, check the correct manager permission for a team or event, validate and normalize question prompts, soft-archive removed questions by setting `isActive = false`, and keep sort order stable. It should expose a validator that loads active questions for a scope, validates required answers, and returns an answer snapshot suitable for `RegistrationQuestionResponses.answersSnapshot`.

Fourth, implement team join request helpers under `src/server/teams/teamJoinRequests.ts`. The request submission helper should require a signed-in user, reject closed and immediate-open teams, load active team questions, validate required answers, create a PENDING request if the same registrant does not already have a PENDING request for the team, and create a `RegistrationQuestionResponses` row with `subjectType = TEAM_JOIN_REQUEST`. Request-only answers should be shown from that response snapshot in manager review.

Fifth, implement review and approval. A manager list endpoint should return pending and recently reviewed requests with applicant names and answer snapshots. Approval must run in a transaction: lock or reload the team, re-check capacity using the same active capacity rules as open registration, create or update a `TeamRegistrations` row with `ACTIVE` status, copy the original `TEAM_JOIN_REQUEST` response snapshot to a new or updated `TEAM_REGISTRATION` response linked to the approved registration, update canonical roster synchronization if needed, mark the request `APPROVED`, and store `approvedRegistrationId`. Approval must not create a payment intent and must not create a bill. Decline marks the request `DECLINED` with reviewer metadata. Withdraw lets the requester mark their own pending request `WITHDRAWN`.

For children, parent-initiated child requests should store `registrantType = CHILD` and `parentId` and can be approved into an ACTIVE child team registration using the existing parent linkage rules. A child account that tries to request without a parent acting should be handled conservatively: either reject with "A parent or guardian must request for this child" or preserve the existing guardian flow by creating a guardian approval request before roster activation. If the implementation chooses the guardian flow, record the exact decision in this plan before editing.

Sixth, update open team registration to collect questions too. In `src/components/ui/TeamRegistrationFlow.tsx`, immediate open registration should load active team questions before submitting. Free open registration should create an ACTIVE `TeamRegistrations` row and a `TEAM_REGISTRATION` response snapshot in the same transaction. Paid open registration should validate answers before reserving the slot, create the `STARTED` `TeamRegistrations` row, and create the `TEAM_REGISTRATION` response snapshot linked to that STARTED registration. When the payment webhook activates the registration, the same response row remains linked to the registration. When stale STARTED registrations are deleted, delete their `TEAM_REGISTRATION` response rows in the same cleanup path or mark them orphaned only if deletion is not available in the transaction.

Seventh, add event registration questions. In `src/app/events/[id]/schedule/components/EventForm.tsx`, add a Registration Questions section near existing registration/payment/document settings. Persist event questions through generalized question routes after event creation and on event edit. During event registration in `src/app/api/events/[eventId]/participants/route.ts` and any user-facing event registration clients such as `src/app/discover/components/EventDetailSheet.tsx`, load active event questions, validate required answers, and create an `EVENT_REGISTRATION` response linked to the created `EventRegistrations` row. For team-signup events, the person registering the team answers once for the team event registration row. For individual and child event registrations, the response uses the participant or child registration row and records the responder and registrant separately.

Eighth, add route handlers. Add or update these routes:

- `GET /api/teams/[id]/join-request-context`: user-facing context with `joinPolicy`, price label, active questions, and the current user's pending or approved request summary.
- `POST /api/teams/[id]/join-requests`: create a request for the signed-in user or a linked child.
- `GET /api/teams/[id]/join-requests`: manager list of pending and reviewed requests.
- `PATCH /api/teams/[id]/join-requests/[requestId]`: manager approve or decline.
- `DELETE /api/teams/[id]/join-requests/[requestId]`: requester withdraw, or manager cancel if needed.
- `GET /api/registration-questions?scopeType=TEAM&scopeId=:teamId`: manager fetch of editable team questions, and user-facing fetch when a user can register or request.
- `PUT /api/registration-questions?scopeType=TEAM&scopeId=:teamId`: manager replaces active team question set.
- `GET /api/registration-questions?scopeType=EVENT&scopeId=:eventId`: manager fetch of editable event questions, and user-facing fetch when a user can register.
- `PUT /api/registration-questions?scopeType=EVENT&scopeId=:eventId`: manager replaces active event question set.
- `GET /api/registration-question-responses?scopeType=TEAM&scopeId=:teamId&subjectType=:type&subjectId=:id`: manager fetch of a submitted answer snapshot when not already included in a richer endpoint.
- `GET /api/registration-question-responses?scopeType=EVENT&scopeId=:eventId&subjectType=EVENT_REGISTRATION&subjectId=:registrationId`: manager fetch of event participant answers when not already included in participant compliance data.

Ninth, add team billing routes that mirror event management but are team-scoped. Add `POST /api/teams/[id]/billing/bills` to create a team-owned bill. The route must require manager permission, confirm the payer is an active player or valid guardian payer for an active child registration, require a positive amount, create a `Bills` row with `ownerType = TEAM`, `ownerId = team.id`, `eventId = null`, `organizationId = team.organizationId`, line item label defaulting to `Team registration - {team.name}`, and create one `BillPayments` row with `payerUserId` equal to the selected payer. After creation, `GET /api/teams/[id]/compliance` should show that player as Bill pending. If the existing compliance query does not include direct child guardian payer mapping, extend it so the child row shows the guardian-assigned bill status.

Add a team-scoped checkout or payment collection route only if needed to match the existing mobile Payments menu. The preferred shape is `POST /api/teams/[id]/billing/checkout`, modeled after `src/app/api/events/[eventId]/teams/[teamId]/billing/checkout/route.ts`, but with `eventId = null` and the selected team/member payer. If this is too large for the first implementation, keep Send bill fully implemented and hide or disable Receive payment now for team members with a clear unavailable state. Record that decision in the Decision Log.

Tenth, update web manager UI. In `src/components/ui/TeamDetailModal.tsx`, replace the Open registration checkbox with a segmented control: Closed, Open registration, Request to join. Keep registration cost visible for Open registration and Request to join. In Open registration, the price controls checkout cost and should keep the existing Stripe warning. In Request to join, show a warning that the price is only shown as a label and users will not be prompted to pay until the manager sends a bill or receives payment after approval. Add a Registration Questions editor below the registration policy controls for both Open registration and Request to join. The editor should support adding, removing, editing prompt text, toggling required, and reordering questions. It should prevent saving empty active prompts.

In `src/app/events/[id]/schedule/components/EventForm.tsx`, add the same Registration Questions editor near registration/payment/document settings. The section should be available when creating and editing events. For new events, questions may need to be staged client-side until the event id exists; after the event is created, save the staged question set against the new event id.

Add a Join Requests section or tab in the same modal for managers. Show request count, applicant name, submitted time, answer snapshots, and Approve/Decline actions. Keep request review distinct from billing. After approval, show a success message such as "Approved. Use the player actions to send a bill or receive payment." Do not open payment automatically.

Eleventh, update web player and participant actions. In `src/components/ui/TeamDetailModal.tsx`, make clicking a team member open a member management modal or panel similar to event participant management. It should show billing status, document status, registration question answers, required document details, and actions. Use the same labels and grouping as event management where possible: Refund if refundable billing exists, Payments with Send bill and possibly Receive payment now, and Remove. The Send bill action opens a team bill modal based on the event Send Bill modal, prefilled with the selected member, amount from `registrationPriceCents`, tax default 0, and label `Team registration - {team.name}`. The pending request card must not show Send bill because the user is not approved yet.

In the event participant management surface, show submitted event question answers alongside billing and document status. On web this means extending the participant details/compliance modal in `src/app/events/[id]/schedule/page.tsx` or the underlying compliance payloads. On mobile this means extending `ParticipantManagementDialog` to include the submitted answer snapshot.

The answer presentation component should be shared where possible. On web, it should render a read-only `Registration Answers` section as stacked bordered rows: prompt in small bold text, answer below with preserved line breaks, and `No answer` for blank optional answers. In list views, show only a compact preview such as `3 answers` or the first one-line answer; full text belongs in the detail modal or drawer. On mobile, render the same data in a vertical card list inside the existing management dialog or a full-screen review sheet, never in a horizontal table.

Twelfth, update user-facing web flows. In `src/components/ui/TeamRegistrationFlow.tsx`, branch on `joinPolicy`. For `CLOSED`, show not open. For `OPEN_REGISTRATION`, preserve the existing immediate registration, document, and payment behavior but insert the question form before the registration request is submitted. For `REQUEST_TO_JOIN`, show Request to join, a price label such as `Expected team cost: $45.00` when price is positive, and no immediate payment button. Opening the action displays the manager-created questions in a modal. Submitting creates the join request and then shows a pending request state. Public organization team cards and filters in `src/server/publicOrganizationCatalog.ts` and public organization client components should distinguish Open registration from Request to join.

In event registration clients such as `src/app/discover/components/EventDetailSheet.tsx`, insert the event question form before final registration submission. The question form should run before payment or document signing so required answers are collected as part of the registration attempt. For paid event registrations, answers should attach to the registration row that is created before payment, just like team paid open registration.

Thirteenth, update mobile. In `C:\Users\samue\StudioProjects\mvp-app`, add `joinPolicy` to `Team`, `TeamApiDto`, `TeamUpdateDto`, mapping functions, and update Room schema/version in `MVPDatabaseService.kt` if the `Team` entity changes. Add mobile DTOs for generalized registration questions and responses. Run `.\gradlew :composeApp:roomGenerateSchema` after the version bump. Add repository methods for registration questions, join request context, submit request, list/review requests, event registration answers, and team billing. Update `CreateOrEditTeamScreen.kt` to use Closed/Open registration/Request to join and show the request-only price warning and registration question editor for Open registration and Request to join. Update event create/edit screens to include a Registration Questions section. Update `TeamDetailsDialog.kt` and `OrganizationDetailComponent.kt` so request-only teams open a question dialog and never call the immediate team registration or payment intent route. Update open team registration to answer questions before immediate registration. Update event registration to answer questions before submitting. Update team member management in `CreateOrEditTeamScreen.kt` to mirror event participant management: tapping a player opens a management dialog with billing/document details, question answers, and a Payments menu using the existing `ParticipantPaymentsMenuButton` pattern where practical.

For mobile request review, show a Join Requests list of compact cards with applicant name, submitted date, status, and answer count. Tapping a card opens a review sheet or full-screen dialog with the applicant header, a `Registration Answers` section, and Approve/Decline actions fixed at the bottom. For approved team members and event participants, tapping the player or participant opens the existing management dialog pattern and includes a `Registration Answers` section below the payment/document summary.

## Concrete Steps

Work from `C:\Users\samue\Documents\Code\mvp-site` for backend and web unless a step explicitly names the mobile repository.

1. Create the Prisma migration for join policy, generalized questions, generalized responses, and team join requests. Run:

    npx prisma migrate dev --name registration_questions_team_requests
    npx prisma generate

If the local database is not available, create the migration SQL manually under `prisma/migrations` and still run `npx prisma generate` when possible. Record the result in this plan.

2. Update backend serializers and team update routes. Run focused tests for existing team route compatibility:

    npm test -- --runTestsByPath src/app/api/teams/__tests__/teamsRoute.test.ts src/app/api/teams/[id]/__tests__/teamByIdRoute.test.ts src/app/api/teams/[id]/__tests__/teamByIdCanonicalRoute.test.ts

3. Add helper tests for generalized question validation, response snapshot creation, join request creation, duplicate prevention, answer validation, manager approve/decline, capacity failure on approval, and request-only price not triggering payment. Suggested test files:

    src/server/__tests__/registrationQuestions.test.ts
    src/server/teams/__tests__/teamJoinRequests.test.ts

4. Add API route tests for the new generalized question, response, join request, event registration answer, open team registration answer, and billing endpoints. Suggested files:

    src/app/api/teams/[id]/__tests__/teamJoinRequestsRoute.test.ts
    src/app/api/registration-questions/__tests__/route.test.ts
    src/app/api/registration-question-responses/__tests__/route.test.ts
    src/app/api/teams/[id]/__tests__/teamBillingRoute.test.ts
    src/app/api/events/__tests__/participantsRoute.test.ts

5. Update web services and UI. Add component tests where existing test infrastructure supports them. At minimum, cover that Open registration asks questions before immediate registration, Request to join opens questions and does not call payment, event registration asks event questions before submitting, approval does not create a bill, and Send bill is available from approved player actions.

6. Run web validation:

    npm test -- --runInBand src/server/__tests__/registrationQuestions.test.ts src/server/teams/__tests__/teamJoinRequests.test.ts src/app/api/registration-questions/__tests__/route.test.ts src/app/api/registration-question-responses/__tests__/route.test.ts src/app/api/teams/[id]/__tests__/teamJoinRequestsRoute.test.ts src/app/api/teams/[id]/__tests__/teamBillingRoute.test.ts
    npx tsc --noEmit --pretty false

7. Start the web app and smoke test desktop and mobile-sized viewports:

    npm run dev

Open `http://localhost:3000`, edit a team as a manager, set Request to join, add questions, submit a user request, approve it, then send a bill from the approved player action surface. Also edit an open-registration team, add questions, register as a user, and confirm the answers are visible on the approved team member. Edit or create an event, add questions, register as a participant, and confirm the answers are visible from event participant management. In a mobile-sized viewport, verify text does not overlap and the question forms and player action modal remain usable.

8. Work from `C:\Users\samue\StudioProjects\mvp-app` for mobile. Update DTOs, Room entity/version, repositories, and Compose screens. If the Team entity changes, run:

    .\gradlew :composeApp:roomGenerateSchema

Then run a focused compile/test command:

    .\gradlew :composeApp:compileKotlinMetadata

If the Android emulator is available, use the Test Android Apps workflow to smoke test request-only team details and manager player billing actions.

## Validation and Acceptance

Acceptance is met when all of the following are true:

An existing team with `openRegistration = true` becomes `joinPolicy = OPEN_REGISTRATION` after migration and still supports the old immediate registration flow.

A request-only team serializes `joinPolicy = REQUEST_TO_JOIN` and `openRegistration = false`. Old clients cannot use the immediate registration endpoint to join it.

A manager can create, edit, reorder, and remove registration questions for teams and events. Removed questions do not disappear from old submitted response snapshots.

An open-registration team with active questions asks those questions before immediate registration. Free registration creates an ACTIVE team registration and a `TEAM_REGISTRATION` response. Paid registration creates a STARTED team registration and a `TEAM_REGISTRATION` response before payment, and that response remains attached after payment activation.

A non-member can request to join a request-only team, answer required questions, and submit without paying. Duplicate pending requests are rejected or return the existing pending state.

Manager approval checks team capacity at approval time, creates an ACTIVE team registration, copies the request answer snapshot to a `TEAM_REGISTRATION` response, and does not create a bill, payment intent, or checkout session.

An event with active questions asks those questions before event registration. The created `EVENT_REGISTRATION` response is visible to event managers from participant management.

On web, managers can read full submitted answers from the join request review panel, team member management panel, and event participant management panel. Long answers wrap and preserve line breaks.

On mobile, managers can read full submitted answers from the join request review sheet and from tapped team member or event participant management dialogs. No response text is forced into a wide table.

After approval, the player appears in Team Members with payment status No bill yet. Clicking or tapping that player shows the same class of actions as event management. Sending a bill creates a team-owned bill assigned to that player or guardian payer, and the player row updates to Bill pending.

For request-only teams with `registrationPriceCents > 0`, manager settings display a warning that the price is a label/default bill amount only and users are not prompted to pay during request submission.

Web targeted Jest tests pass, `npx tsc --noEmit --pretty false` passes, mobile `compileKotlinMetadata` passes, and Room schema generation is complete if the Team entity changes.

## Idempotence and Recovery

The migration is additive and should not delete existing team data. The backfill can be run safely once; if it needs to be retried, it should only set `joinPolicy` based on existing `openRegistration` for rows still at the default. Do not overwrite teams that were already edited to `REQUEST_TO_JOIN`.

Question updates should be idempotent. Saving the same question list twice should leave one active set with stable sort order for the same team or event scope. Removed questions should be soft-archived with `isActive = false`, not deleted, so historical answer snapshots remain understandable.

Response creation should be idempotent for a concrete subject. If a registration route retries after creating the registration row, the response upsert keyed by `subjectType/subjectId` should update the same response snapshot instead of creating duplicates.

Request submission should be idempotent for a pending request. If the same user submits again while a PENDING request exists, return the existing request or a clear duplicate error instead of creating another row.

Approval should be transactional. If capacity validation fails, leave the request PENDING and return a clear error. If roster creation succeeds but request update fails, the transaction must roll back both changes.

Billing creation should be transactional. If the bill payment row cannot be created, the bill row should not remain. If manager permissions fail, no billing rows should be created.

When touching the mobile repository, preserve the existing untracked `hs_err_pid36364.log` file and do not delete or modify it unless the user explicitly asks.

## Artifacts and Notes

Important current code anchors:

    src/components/ui/TeamDetailModal.tsx
    src/components/ui/TeamRegistrationFlow.tsx
    src/app/events/[id]/schedule/components/EventForm.tsx
    src/app/discover/components/EventDetailSheet.tsx
    src/app/api/events/[eventId]/participants/route.ts
    src/app/api/teams/[id]/registrations/self/route.ts
    src/app/api/teams/[id]/registrations/child/route.ts
    src/app/api/teams/[id]/compliance/route.ts
    src/server/teams/teamOpenRegistration.ts
    src/server/teams/teamMembership.ts
    src/app/events/[id]/schedule/page.tsx

Important mobile anchors:

    C:\Users\samue\StudioProjects\mvp-app\composeApp\src\commonMain\kotlin\com\razumly\mvp\core\data\dataTypes\Team.kt
    C:\Users\samue\StudioProjects\mvp-app\composeApp\src\commonMain\kotlin\com\razumly\mvp\core\network\dto\TeamDtos.kt
    C:\Users\samue\StudioProjects\mvp-app\composeApp\src\commonMain\kotlin\com\razumly\mvp\core\data\repositories\TeamRepository.kt
    C:\Users\samue\StudioProjects\mvp-app\composeApp\src\commonMain\kotlin\com\razumly\mvp\core\data\repositories\EventRepository.kt
    C:\Users\samue\StudioProjects\mvp-app\composeApp\src\commonMain\kotlin\com\razumly\mvp\teamManagement\CreateOrEditTeamScreen.kt
    C:\Users\samue\StudioProjects\mvp-app\composeApp\src\commonMain\kotlin\com\razumly\mvp\eventCreate\CreateEventScreen.kt
    C:\Users\samue\StudioProjects\mvp-app\composeApp\src\commonMain\kotlin\com\razumly\mvp\eventDetail\composables\ParticipantsVeiw.kt

Expected evidence to record after implementation:

    PASS src/server/__tests__/registrationQuestions.test.ts
    PASS src/server/teams/__tests__/teamJoinRequests.test.ts
    PASS src/app/api/teams/[id]/__tests__/teamJoinRequestsRoute.test.ts
    PASS src/app/api/registration-questions/__tests__/route.test.ts
    PASS src/app/api/registration-question-responses/__tests__/route.test.ts
    PASS src/app/api/teams/[id]/__tests__/teamBillingRoute.test.ts
    npx tsc --noEmit --pretty false completed without TypeScript errors
    .\gradlew :composeApp:compileKotlinMetadata completed successfully

## Interfaces and Dependencies

At completion, shared web type definitions in `src/types/index.ts` should include:

    export type TeamJoinPolicy = 'CLOSED' | 'OPEN_REGISTRATION' | 'REQUEST_TO_JOIN';
    export type RegistrationQuestionAnswerType = 'TEXT' | 'LONG_TEXT';
    export type TeamJoinRequestStatus = 'PENDING' | 'APPROVED' | 'DECLINED' | 'WITHDRAWN' | 'CANCELLED';
    export type RegistrationQuestionScopeType = 'TEAM' | 'EVENT';
    export type RegistrationQuestionResponseSubjectType = 'TEAM_JOIN_REQUEST' | 'TEAM_REGISTRATION' | 'EVENT_REGISTRATION';

`Team` should include:

    joinPolicy?: TeamJoinPolicy;
    openRegistration?: boolean;
    registrationPriceCents?: number;

`src/lib/teamService.ts` should expose methods equivalent to:

    getTeamJoinRequestContext(teamId: string): Promise<TeamJoinRequestContext>
    requestToJoinTeam(teamId: string, input: TeamJoinRequestInput): Promise<TeamJoinRequestResult>
    listTeamJoinRequests(teamId: string): Promise<TeamJoinRequest[]>
    reviewTeamJoinRequest(teamId: string, requestId: string, action: 'APPROVE' | 'DECLINE', note?: string): Promise<TeamJoinRequest>
    getRegistrationQuestions(scopeType: 'TEAM' | 'EVENT', scopeId: string): Promise<RegistrationQuestion[]>
    saveRegistrationQuestions(scopeType: 'TEAM' | 'EVENT', scopeId: string, questions: RegistrationQuestionDraft[]): Promise<RegistrationQuestion[]>
    getRegistrationQuestionResponse(subjectType: RegistrationQuestionResponseSubjectType, subjectId: string): Promise<RegistrationQuestionResponse | null>
    createTeamMemberBill(teamId: string, input: TeamMemberBillInput): Promise<Bill>

The mobile `TeamRepository` and event repositories should expose analogous suspend functions using the same route paths and request/response shapes. Mobile data classes should keep `openRegistration` for compatibility and add `joinPolicy` as the source of truth for new team behavior.

Change note: Created this ExecPlan because request-to-join touches the team registration model, manager-created questions, payment timing, billing action UX, and mobile parity. The plan records the decision to keep payment after approval and to reuse event-style player actions for billing.

Change note: Updated this ExecPlan after the scope changed from team-specific join questions to generalized registration questions. The plan now applies questions to events, team open registration, and team request-to-join, and stores answers in generalized response snapshots linked to concrete registration or request subjects.

Change note: Updated the plan to specify manager presentation for submitted answers on web and mobile. Responses should appear in read-only detail panels/sheets, with compact answer counts in lists and full prompt/answer cards in detail views.
