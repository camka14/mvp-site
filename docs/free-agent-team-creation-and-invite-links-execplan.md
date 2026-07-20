# Deliver guided free-agent team creation and claimable team invitations

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan is maintained in accordance with `PLANS.md` at the root of the `mvp-site` repository. The feature spans the web repository at `/Users/elesesy/StudioProjects/mvp-site` and the Kotlin Multiplatform mobile repository at `/Users/elesesy/StudioProjects/mvp-app`. Web and API work must land before mobile UI work so released mobile clients always call a compatible server contract.

## Purpose / Big Picture

After this work, a person registering for a team-based event can choose a new path named “Build a team.” BracketIQ walks that captain through team basics, selecting free agents who are already listed for the same event, optionally adding other people, reviewing the roster, creating the reusable team, and continuing through the event’s existing registration, document, and payment flow. Selecting a free agent creates an invitation; it does not silently move the player. The player remains a free agent until the invitation is accepted, at which point the existing team-to-event synchronization moves the accepted player onto the registered event team.

Team captains and managers can also invite a person without requiring an email address or an existing BracketIQ account. The inviter enters first name, last name, optional email, and optional phone. Saving creates a secure, expiring registration URL. Web copies that URL. Mobile opens the operating system share sheet or message composer. If a valid email is present, saving also sends the invitation email and the primary action changes from “Save invite” to “Send email invite.”

Opening the URL shows the team and event context before authentication. A person can sign in or follow the normal registration flow, then claim the invitation. The URL contains an invitation id and a cryptographic signature; it never contains a user id, email address, or phone number. Acceptance is one-time and atomic, which means concurrent attempts cannot claim the same invitation or overfill the team.

The expected experience is illustrated by these planning concepts:

- `docs/images/free-agent-team-invites/web-join-options.png`
- `docs/images/free-agent-team-invites/web-free-agent-picker.png`
- `docs/images/free-agent-team-invites/web-invite-players-step.png`
- `docs/images/free-agent-team-invites/web-invite-player.png`
- `docs/images/free-agent-team-invites/mobile-team-builder.png`
- `docs/images/free-agent-team-invites/mobile-invite-players-step.png`
- `docs/images/free-agent-team-invites/mobile-contacts-invite.png`

The images establish layout and interaction hierarchy, not pixel-perfect implementation. Existing BracketIQ components, typography, responsive behavior, and accessibility requirements remain authoritative.

## Progress

- [x] (2026-07-19 23:40Z) Inspected the current web event registration panel, web team invitation modal, invitation APIs, free-agent APIs, team-to-event synchronization, and public guest registration behavior.
- [x] (2026-07-19 23:40Z) Inspected the current mobile event join sheet, team invitation dialog, free-agent context, share service, deep-link handling, permission dependencies, and platform manifests.
- [x] (2026-07-19 23:40Z) Chose the product flow, secure link contract, contact privacy boundary, delivery behavior, and phased rollout described below.
- [x] (2026-07-19 23:40Z) Generated and saved the five web and mobile planning concepts listed above.
- [x] (2026-07-20 00:35Z) Clarified the four-step create-team walkthrough for every web and mobile create entry point: Step 2 owns free-agent selection and removal; Step 3 uses one roster list instead of a duplicate invite list; free-agent rows are read-only in Step 3; invited-person rows expose Edit and Remove.
- [x] (2026-07-20 02:52Z) Implemented the nullable-contact invitation schema, additive migration, generated Prisma client, signed 14-day team claim links, and link verification tests in `mvp-site`.
- [x] (2026-07-20 02:52Z) Implemented safe public team-invite preview, sign-in/register return, atomic authenticated claiming, claim-link email delivery, and invalid/used-link handling in `mvp-site`.
- [x] (2026-07-20 06:30Z) Replaced the established web email-only player invitation mode with the reusable first-name, last-name, optional-email, optional-phone editor and copyable private-link result.
- [x] (2026-07-20 02:52Z) Added the guided web team builder and made Team Management plus event-originated Manage Teams creation use the same four-step flow.
- [ ] Add shared mobile DTO/repository support, invitation deep links, and the reusable mobile invitation editor.
- [x] (2026-07-20 02:52Z) Added the mobile four-step builder, wired it into Team Management and event-originated create-team state, and added optional-contact invite DTO/repository support.
- [ ] Complete cross-platform regression, security, accessibility, analytics, and manual acceptance testing.
- [x] (2026-07-20 02:52Z) Completed focused web and mobile regression checks plus desktop, responsive-web, and Android-emulator visual QA for the create-team surfaces.
- [x] (2026-07-20 04:10Z) Implemented the event-aware walkthrough order: Team first, then Free Agents only for an upcoming event with selectable free agents, followed by Staff, Invite, and Review; Free Agents is omitted otherwise.
- [x] (2026-07-20 04:10Z) Added creator role selection, pending manager/head-coach/assistant-coach invitations, acceptance-time manager/head-coach handoff, declined-assignment cleanup, and matching web/mobile review states.
- [x] (2026-07-20 06:30Z) Validated account search, optional-contact player and staff invites, registration return, claim, and final membership in a real browser. Avery Brooks claimed a player link and became an active player; Taylor Stone claimed an assistant-coach link and became active staff without consuming a player slot.
- [x] (2026-07-20 06:30Z) Validated the Android team editor on a Pixel 9 Pro API 35 emulator: account search returned Taylor Stone, the phone-only Head Coach editor created Cameron Wells as a pending `HEAD_COACH` invite, the private-link result rendered, and Share opened the native Android chooser. The persisted invite did not create a player registration.
- [x] (2026-07-20 06:30Z) Corrected the Android invite tabs after screenshot review by limiting their labels to two centered lines at a compact tab-label size; rebuilt, reinstalled, and re-captured the phone layout.
- [x] (2026-07-20 16:49Z) Added shared web and mobile phone-input formatting for player and staff invitations, removed placeholders from the established web new-person editor, and covered incremental typing, pasted US country codes, and deletion through formatting separators.
- [ ] Add mobile contact permission, on-device contact search, selected-contact account matching, and native share/message behavior. This is the active implementation milestone after the all-dirty checkpoint commits.

## Surprises & Discoveries

- Observation: Free-agent registration and team invitation are already real database-backed systems; this feature should compose them instead of creating replacement tables for rosters.
  Evidence: `EventRegistrations.rosterRole` already supports `FREE_AGENT`, and `src/server/teams/teamInviteEventSync.ts` already changes an accepted player’s event registration to `PARTICIPANT` and attaches it to the linked event team.

- Observation: The current team member invitation endpoint cannot represent a person with no account and no email.
  Evidence: `Invites.email` is non-null in `prisma/schema.prisma`, while `src/app/api/teams/[id]/member-invites/route.ts` either requires a valid email or resolves one from an existing user and creates placeholder users for new email addresses.

- Observation: Current email invitations do not carry a claim URL. They tell the recipient to create an account using the invited email, after which the invite appears in the authenticated profile.
  Evidence: `src/server/emailTemplates.ts` contains that instruction, and `src/server/inviteEmails.ts` sends profile-invite push notifications rather than a public claim route.

- Observation: The web already exposes free agents on the public event detail and lets a captain choose “Invite to Team,” while the mobile team editor already has “Free Agents,” “Invite User,” and “Invite by Email” tabs.
  Evidence: `src/app/discover/components/eventDetail/EventDetailDialogs.tsx`, `src/app/teams/components/InvitePlayersModal.tsx`, and `composeApp/src/commonMain/kotlin/com/razumly/mvp/teamManagement/CreateOrEditTeamScreen.kt` contain those surfaces.

- Observation: Mobile already has a cross-platform share abstraction and universal/app link handling, but it does not currently read contacts. iOS has a placeholder contacts usage description and Android does not request `READ_CONTACTS`.
  Evidence: `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/presentation/util/ShareService.kt`, its Android/iOS actual implementations, `iosApp/iosApp/Info.plist`, and `composeApp/src/androidMain/AndroidManifest.xml`.

- Observation: The truly accountless event registration surface is the public guest registration route, while authenticated free-agent and team registration routes require a session. The claim link should preserve the existing auth boundary rather than trying to make the private team routes anonymous.
  Evidence: `src/app/api/public/organizations/[slug]/events/[eventId]/guest-registrations/route.ts` is accountless, while event free-agent, event self-registration, and team self-registration routes use `requireSession`.

- Observation: A bounded inner roster plus a scrollable outer screen is necessary on mobile because the optional-contact editor can be taller than one viewport before the roster begins.
  Evidence: The Compose regression test must scroll “Save invite” into view before clicking it, and the Android emulator capture confirms the sticky 48 dp bottom actions remain available while the content scrolls.

- Observation: The native contact-import and post-create share-sheet work is still separate from the create-team walkthrough delivered in this milestone.
  Evidence: Mobile currently presents a privacy primer and then opens the manual optional-contact editor; the repository can submit optional contact fields but does not yet return the claim URL to Compose or query the device address book.

- Observation: The first Staff-step implementation could invite only existing accounts, and the unclaimed-link claim route treated every person invite as a player.
  Evidence: `TeamBuilderModal.tsx` and `CreateTeamBuilderScreen.kt` modeled staff invitations with a required `UserData`, `member-invites/route.ts` rejected staff requests without `userId`, and `team-invites/[id]/claim/route.ts` always reserved a player slot before acceptance. The corrected contract stores the intended team staff role in `Invites.staffTypes` and creates the invited staff assignment when the link is claimed.

- Observation: Creating both a player invite and a staff invite for the same existing account can race if the client submits both requests concurrently.
  Evidence: The first browser walkthrough briefly removed the pending staff assignment while synchronizing the player roster. Builder submissions now preserve invited staff assignments and send displayed invite jobs sequentially, with regression coverage for the combined-role case.

- Observation: React synthetic event objects cannot be read later from inside a functional state updater.
  Evidence: Manual browser entry in the established Team Management invitation dialog produced a null `currentTarget`; capturing the input value before calling the state setter fixed the editor and is covered by the component test.

- Observation: A result dialog declared after the selected-team early return is unreachable when an invitation is created from the edit-team screen.
  Evidence: Android created the first phone-only staff invite but returned directly to the editor. Rendering the shared result dialog in the selected-team branch made the retry show `Invite ready`, the staff role, and the native Share action.

- Observation: Material tabs with three multi-word labels can grow into very tall, poorly wrapped controls inside a phone-width alert dialog.
  Evidence: The first emulator screenshot split `Agents` and `Person` across extra lines. Constraining tab labels to two centered lines at 13 sp reduced the row to a normal compact control while retaining readable full labels.

- Observation: Formatting punctuation as soon as a group becomes complete can make Backspace appear broken because deleting only `)` or `-` immediately recreates that separator.
  Evidence: The shared formatters add `(`, `)`, spaces, and `-` only when the next digit exists. Regression tests repeatedly remove the final displayed character and reach an empty value without a sticky separator.

## Decision Log

- Decision: Treat “Build a team” and “Invite a person” as two capabilities with one shared invitation contract.
  Rationale: A secure, optional-contact invitation is useful from every team surface. The event builder adds event-specific free-agent selection, capacity, division, and registration behavior without forking invitation delivery.
  Date/Author: 2026-07-19 / Codex

- Decision: Create a normal reusable canonical team, then continue through the current event registration workflow.
  Rationale: `CanonicalTeams` is the source of truth for reusable teams, and event-specific rows under `EventTeams` are linked through `parentTeamId`. Creating a special event-only team would split roster behavior and make accepted invites inconsistent with existing team management.
  Date/Author: 2026-07-19 / Codex

- Decision: Make selecting a free agent an invitation, not an assignment.
  Rationale: Free agents have expressed availability, not consent to join any captain’s team. They stay listed until they accept. Declining or letting an invitation expire leaves their free-agent registration unchanged.
  Date/Author: 2026-07-19 / Codex

- Decision: Use a signed invitation URL based on the invitation id, link version, and expiration time; never use a user id as the code.
  Rationale: A user id is stable, enumerable, and not a secret. A domain-separated HMAC signature made with the server auth secret is unforgeable, contains no contact data, can be regenerated for re-sharing, and can be revoked by incrementing `linkVersion` or changing invite status.
  Date/Author: 2026-07-19 / Codex

- Decision: Do not create placeholder `AuthUser` rows for new optional-contact invitations.
  Rationale: A placeholder account is impossible when no email is supplied and creates account-merging complexity. A new invite remains unclaimed with `userId = null`; claiming links it to the authenticated or newly registered account.
  Date/Author: 2026-07-19 / Codex

- Decision: First and last name are required for a new-person invite. Email and phone are optional, but at least one of email, phone, or an explicit request to create a share-only link must be present before saving.
  Rationale: Names let the captain distinguish reserved roster slots. The explicit share-only confirmation prevents accidental blank, unreachable invitations while still supporting in-person QR/link sharing.
  Date/Author: 2026-07-19 / Codex

- Decision: A valid email triggers server email delivery. A phone number does not trigger server SMS in the first release.
  Rationale: BracketIQ already sends email. Mobile can open the native share sheet or SMS composer through a user action without requesting SMS-send permission or adding an SMS vendor. Server SMS can be added later as a separate deliverability and consent project.
  Date/Author: 2026-07-19 / Codex

- Decision: Mobile reads contacts only after a just-in-time explanation and permission request, performs search on-device, and sends only the selected contact’s normalized email/phone to the server for account matching.
  Rationale: Uploading the entire address book is not necessary for the requested flow. The selected-contact boundary is easier to explain, minimizes private data transfer, and still allows BracketIQ to recognize an existing public account before creating a new-person invite.
  Date/Author: 2026-07-19 / Codex

- Decision: Account matching must not reveal private accounts or whether an arbitrary email/phone exists.
  Rationale: Contact discovery can otherwise become an account-enumeration API. The endpoint requires a session, accepts one selected contact at a time, is rate-limited, returns only profiles allowed by current visibility/block rules, and returns the same non-match shape for hidden or nonexistent accounts.
  Date/Author: 2026-07-19 / Codex

- Decision: The captain counts as a roster player by default, with an “I’m playing on this team” control in the Team step.
  Rationale: The current team create route defaults `addSelfAsPlayer` to true. Preserving that default makes capacity math consistent and still supports non-playing managers.
  Date/Author: 2026-07-19 / Codex

- Decision: Build the server contract and web experience before releasing mobile UI.
  Rationale: Old clients must continue using the existing email/user-id invitation paths while new clients need nullable contact fields, claim links, and preview endpoints to exist before app review and release.
  Date/Author: 2026-07-19 / Codex

- Decision: Use the same four-step builder from event registration and Team Management create actions, while leaving established edit-team screens intact.
  Rationale: Creating a team should teach one predictable workflow regardless of entry point. Editing an existing team has additional staff, billing, compliance, refund, and destructive actions that do not belong in the creation walkthrough.
  Date/Author: 2026-07-20 / Codex

- Decision: Step 3 has one bounded, scrollable roster rather than a second “people to invite” list.
  Rationale: The roster already communicates who will occupy each slot. Duplicate lists make capacity and removal state harder to understand. Free agents selected in Step 2 are read-only in Step 3; new or existing invitees show both Edit and Remove, and all removable rows show an X control.
  Date/Author: 2026-07-20 / Codex

- Decision: Make the walkthrough four or five steps based on real event context. Team is always first. For an upcoming event with selectable free agents the order is Team, Free Agents, Staff, Invite, Review. Without that exact condition the Free Agents step is omitted.
  Rationale: Event free agents are the most relevant starting pool when they exist, while an empty or irrelevant event step adds friction to ordinary Team Management creation.
  Date/Author: 2026-07-20 / User and Codex

- Decision: Separate the creator from team roles. The creator may manage, play, captain, or coach in any valid combination. A captain must be a player; coaches do not consume player capacity unless separately added as players. If the creator selects another primary manager, the creator remains a temporary manager until that invitation is accepted.
  Rationale: Creation authority is an audit fact, not a permanent roster or staff role. Keeping temporary management prevents an invited-but-unaccepted manager from orphaning the team.
  Date/Author: 2026-07-20 / User and Codex

- Decision: Use `Invites.staffTypes` to carry manager/head-coach/assistant-coach intent for an unclaimed team invitation.
  Rationale: The field already exists on the invitation record and avoids another schema change. A staff link can remain accountless until registration, then the claim transaction binds the account and creates the correct `INVITED` assignment before the normal acceptance helper activates it. An invite with no team staff type remains a player invite and is the only kind that reserves roster capacity.
  Date/Author: 2026-07-20 / Codex

- Decision: Submit combined player and staff invitation jobs in their displayed order and preserve `INVITED` staff assignments during player-roster synchronization.
  Rationale: One person may validly be both a player and a coach or manager. Sequential submission makes the result deterministic, while preservation prevents a roster sync from interpreting an in-flight staff assignment as stale.
  Date/Author: 2026-07-20 / Codex

- Decision: Display invitation phone values as ten-digit North American numbers and drop a pasted leading `+1` for editing while retaining server-side canonical validation.
  Rationale: The product currently validates US-style ten- or eleven-digit invitation numbers. Formatting as `503`, then `(503) 5`, then `(503) 555-0` makes the typing transition clear and ensures Backspace always removes a digit rather than becoming trapped on punctuation.
  Date/Author: 2026-07-20 / Codex

## Outcomes & Retrospective

The first implementation milestone now delivers one four-step create-team experience on web and mobile from Team Management and event-originated Manage Teams entry points. Step 2 owns free-agent Add/Remove. Step 3 has one bounded roster; free agents are read-only, while existing-account and new-person invitations expose Edit and X. Step 4 is a read-only review. Both outer screens remain scrollable and all primary actions are 48 px/dp high.

The web backend now supports optional email/phone invitations without placeholder accounts, signed expiring registration URLs, safe public previews, normal authentication return, email delivery when supplied, and atomic claiming. The same optional-contact editor is available for players, managers, head coaches, and assistant coaches on web and mobile. Existing-account search works in both builders and established team-management invite surfaces. Mobile returns the created private link and opens the native Android share sheet.

Manual browser acceptance proved two complete paths against the local database: a new player registered from the private link and became an active team player, and a new assistant coach registered from the staff link and became active staff without using roster capacity. Android then created a phone-only Head Coach invitation, displayed its role-specific share result, opened the native chooser, and persisted `staffTypes = [HEAD_COACH]` with no additional player registration. Focused Jest, TypeScript, Kotlin compilation, Compose tests, and screenshot checks cover the touched surfaces.

This does not complete every milestone in the original broader plan. Mobile still needs the real OS contact permission/search implementation, selected-contact account matching, and dedicated claim deep-link destination. The current Contacts primer deliberately falls back to manual entry instead of claiming that device contacts have been read. Analytics plus full keyboard, screen-reader, TalkBack, and VoiceOver acceptance also remain open above.

## Context and Orientation

In `mvp-site`, `prisma/schema.prisma` defines `CanonicalTeams` under the database table named `Teams`, event-specific team rows under the Prisma model `Teams` mapped to `EventTeams`, member rows under `TeamRegistrations`, event roster rows under `EventRegistrations`, and pending invitations under `Invites`. The similar names are important: a canonical team is reusable across events; an event team is a snapshot linked back to a canonical team by `parentTeamId`.

`src/app/api/teams/route.ts` creates canonical teams and defaults the current user to captain/player. `src/app/discover/components/eventDetail/EventTeamRegistrationPanel.tsx` renders the current web choices for an event that accepts teams. It can select an existing team, navigate to team management when no team exists, and separately add the current user as a free agent. `src/app/discover/components/eventDetail/eventJoinActions.ts` and the registration controller hooks in the same directory own the existing questions, documents, billing address, payment, and completion sequence. The builder must enter that sequence after creating the canonical team; it must not reimplement payment or signing.

`src/app/teams/components/InvitePlayersModal.tsx` is the current web invitation UI. It has free-agent, existing-user, and email modes. `src/app/api/teams/[id]/member-invites/route.ts` validates permissions and capacity, creates an `Invites` row, creates or resolves an invited user, updates pending team membership, and sends delivery. `src/server/inviteEmails.ts` and `src/server/emailTemplates.ts` generate current invitation notifications. `src/app/api/invites/[id]/accept/route.ts` delegates team acceptance to `src/server/teams/teamGuardianInvites.ts`.

`src/server/teams/teamInviteEventSync.ts` is the key bridge between the two features. When a team member invite is accepted, it propagates the player to future event teams linked to that canonical team, changes an existing free-agent event registration to an active participant registration, and records enough state in `TeamInviteEventSyncs` to roll back a declined or cancelled invitation. The new event builder and public claim route must call the same helpers rather than directly manipulating event arrays.

In `mvp-app`, `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailJoinAndInviteSheets.kt` renders event join choices. `EventDetailJoinActionPresentation.kt` currently supplies “Join as Free Agent” and “Join as Team.” `composeApp/src/commonMain/kotlin/com/razumly/mvp/teamManagement/CreateOrEditTeamScreen.kt` renders the current team invitation tabs. `TeamManagementComponent.kt` coordinates that screen. Network models live in `core/network/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/InviteDtos.kt`; domain invitations live in `core/model/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/Invite.kt`; HTTP calls live in `core/repository-impl/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/TeamRepository.kt` and `UserRepository.kt`.

The mobile share abstraction is `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/presentation/util/ShareService.kt`, with platform implementations under `composeApp/src/androidMain` and `composeApp/src/iosMain`. Android app links are parsed by `composeApp/src/androidMain/kotlin/com/razumly/mvp/MainActivity.kt`. iOS universal links are parsed by `iosApp/iosApp/ContentView.swift`. Both already recognize invite-related route concepts, so the new `/i/...` path should extend that routing instead of introducing a second deep-link system.

An invitation claim link is a bearer link: possession grants the ability to attempt to claim the invitation. The signed code prevents guessing or changing the invitation id. Authentication is still required before acceptance so the server can create or update membership for a real account and apply guardian rules for a child profile.

## User Experience Specification

On a team-registration event, replace the current “View Team Options” first decision with a join chooser when the person presses the main registration action. The chooser has “Join with my team,” “Build a team,” and “Join as a free agent.” Preserve current full-event and waitlist behavior. If the event is full, “Build a team” either enters the team waitlist path or is unavailable with the same explanation used for existing team registration; it must not bypass capacity.

The Build a team walkthrough has four conceptual steps. On small screens each step is a full screen with a sticky bottom action. On desktop it is a large modal or route-level panel with the same state machine.

The Team step asks for team name, confirms sport and event division, shows the event’s team-size requirement, and defaults “I’m playing on this team” on. Event-provided sport, division, and size are locked when the event contract requires them. If the user already started a compatible team in this walkthrough, resume it instead of creating a duplicate.

The Free agents step lists only active free-agent registrations for this event, selected occurrence, and compatible division. It applies the current user privacy projection; it does not expose email or phone. Each row can show public name, handle, profile image, division, and optional position if that information already exists. The captain can select players until the roster reaches capacity. Selected people are labeled “Invite pending” and expose a Remove action in this step. A free agent remains visible until accepting one event-specific invitation. The result list is height-bounded to roughly four or five rows and scrolls independently; the surrounding step can also scroll on short screens.

The Invite people step is optional. It offers “Search BracketIQ,” “New person,” and, on mobile, “Add from contacts.” A new-person form contains required first and last name plus optional email and phone. With no valid email, the primary label is “Save invite.” When the email becomes valid, cross-fade the icon and label to “Send email invite” without moving or resizing the button. Phone alone keeps the save label because the app will not silently send a text. After save, show “Share invite” on mobile and “Copy registration link” on web. An email send never disables later link sharing.

Step 3 does not render a separate invitation queue below those add controls. It renders one bounded, scrollable roster showing the captain, selected free agents, existing-account invitees, new-person invitees, and open slots. Selecting a free-agent row here does nothing because free-agent choice belongs to Step 2. Free-agent rows are visually read-only in Step 3. Existing-account and new-person invite rows expose an X remove control plus an Edit text action; editing reopens the relevant search or person form with its current values. This prevents the same person from appearing in two competing lists and keeps the slot count authoritative.

The Review step shows team identity, captain/player status, selected free agents, new-person invitations, open roster spots, event division, and the event registration price. “Create team & continue” creates the canonical team and its pending invites idempotently, selects that team in the existing event registration controller, and proceeds through questions, documents, billing, and payment. The review copy must say that the team is reusable and invitations are sent when the team is created. If event registration later fails or is abandoned, the reusable team and its invites remain manageable from My Teams; the event is not shown as joined until the existing registration flow succeeds.

The claim URL opens a public invitation preview with team name, sport/division, inviter name when public, event name/date when the invite has event context, invitee first name, expiration, and one primary action. It never displays the stored email or phone. A signed-in user chooses “Accept invite” or, when guardian rules allow it, a linked child. A signed-out user chooses “Continue,” completes normal sign-in or account registration, and returns to the same signed URL. Successful acceptance routes to the team or event and consumes the invitation. An expired, revoked, already-used, or mismatched link shows the same non-sensitive unavailable state.

On mobile, “Add from contacts” first displays a BracketIQ explanation, then requests contacts permission. Denial leaves the manual entry and share-link paths fully functional and offers an operating-system Settings shortcut only after a permanent denial. Search and list filtering happen on-device. When the user selects one contact, the app normalizes that contact’s chosen email and phone and asks the server whether it maps to a visible BracketIQ account. A match switches to an existing-account invite. A non-match pre-fills the new-person form. Multiple emails or phones require the user to choose one; do not guess.

## Data and Security Contract

Add an additive Prisma migration under `prisma/migrations/<timestamp>_add_claimable_invite_links/migration.sql`. Change `Invites.email` from required to nullable. Add `phoneNumberE164 String?`, `linkVersion Int @default(1)`, and `linkExpiresAt DateTime?`. Add an index that supports pending-expiration cleanup, for example `(status, linkExpiresAt)`. Keep `userId` nullable; an unclaimed new-person invitation deliberately has no user id. Do not store the raw signed URL or raw signature.

Use the existing string status column for backward compatibility. New shareable invitations use `PENDING`; `FAILED` means an attempted delivery failed but the link remains valid; `DECLINED`, `CANCELLED`, and expired time invalidate the link. Acceptance may continue deleting the invitation after event/team sync has produced durable membership records. If implementation changes acceptance to retain rows, update every existing invite query and retention test in the same milestone.

Create `src/server/inviteLinks.ts`. It must normalize the invite id, version, and expiration into one canonical payload and calculate a domain-separated HMAC-SHA256 with the server’s existing secret. A suitable payload is:

    bracketiq-invite-link:v1:<inviteId>:<linkVersion>:<expiresEpochSeconds>

Encode at least 128 bits of the digest in URL-safe base64. Build the public path as `/i/<url-encoded-invite-id>/<signature>`. Verification must use constant-time byte comparison after checking equal lengths. The verifier also checks that the invite exists, is pending or delivery-failed, has not expired, and still points to an active team/event context. Link generation defaults to 30 days and clamps event-context invitations to the event end when that is earlier.

Do not accept `baseUrl` from the request body. Build it with `getRequestOrigin` and production apex-host rules. Do not log complete URLs, signatures, emails, phone numbers, or contact payloads. Analytics receives boolean channel flags and counts only.

Extend the member-invite request contract to accept:

    type TeamMemberInviteInput = {
      role: 'player' | 'team_manager' | 'team_head_coach' | 'team_assistant_coach';
      userId?: string;
      firstName?: string;
      lastName?: string;
      email?: string;
      phoneNumber?: string;
      contextEventId?: string;
      sendEmail?: boolean;
      createShareOnly?: boolean;
    };

The response must include the invitation, a `claimUrl`, and a delivery summary such as `{ email: 'sent' | 'skipped' | 'failed', push: 'sent' | 'skipped' | 'failed' }`. Existing clients that send `userId` or `email` continue to work. Normalize email to lowercase and phone to E.164 on the server. Reject malformed non-empty contact values. For a new-person invite require first and last name and either a valid contact or `createShareOnly: true`.

Capacity must include active members, pending account invitations, and pending unclaimed invitations. A pending unclaimed player invite reserves one slot by invite id. On claim, acquire the same team/event lock used for membership mutations, recheck capacity, bind `Invites.userId` to the claimant, create or update team registration state, and call `acceptTeamInviteWithGuardianRules`. This transaction must ensure one claimant, one slot, and one event team. Event-specific free-agent claims must also recheck that the person is still an active free agent for that event; if another invitation has already moved them to a team, return HTTP 409 with a user-safe message and leave other membership unchanged.

Create an authenticated, rate-limited selected-contact match route such as `POST /api/users/contact-match`. It accepts one normalized email and/or phone plus a client-generated opaque key. It returns either `{ matched: false }` or the existing public `UserData` projection. Match only accounts allowed by visibility and block rules. Use the same response timing and shape for nonexistent and hidden accounts. The route must not persist the contact or include it in logs.

## Plan of Work

### Milestone 1: Add the backward-compatible invitation and claim-link backend

Update `prisma/schema.prisma`, add the migration, regenerate `src/generated/prisma`, and update TypeScript invite mapping so nullable email and optional phone survive round trips. Add `src/server/inviteLinks.ts` and unit tests for deterministic generation, valid verification, altered ids/signatures, expiration, revocation through version changes, and constant-time-safe malformed input handling.

Refactor `src/app/api/teams/[id]/member-invites/route.ts` so existing-user, email, phone, and share-only paths resolve into one normalized invitation command. Move reusable creation logic into a server module under `src/server/invites/` rather than calling one route from another. Stop creating a placeholder user for the new-person path. Preserve the legacy request behavior until both clients have migrated.

Update capacity calculations to count unclaimed pending player invitations, and update `src/server/inviteEmails.ts` plus `src/server/emailTemplates.ts` to include the signed claim URL. Email is sent only when a valid email is present; push continues for known users. Add route tests for name-only share links, phone-only links, email delivery, known-user invites, duplicate requests, full teams, permissions, and delivery failure.

Milestone acceptance: old tests remain green; a signed URL can be created without email; a malformed or expired URL cannot preview or claim an invite; and no placeholder auth/user row is created for a share-only invitation.

### Milestone 2: Add public preview, authentication return, and atomic claim

Create a public route at `src/app/i/[inviteId]/[signature]/page.tsx` and a small client component in the same directory. Add a public preview handler under `src/app/api/public/invites/[inviteId]/[signature]/route.ts` or call a server-only loader from the page. The preview returns only the safe fields described above.

Add an authenticated claim handler at `src/app/api/invites/[id]/claim/route.ts`. Require the signature in the request, acquire the membership lock, bind an unclaimed invite to the session user or selected linked child, recheck status/expiration/capacity/event availability, and delegate to the existing guardian-aware acceptance and event-sync helpers. Make retries idempotent. Preserve and validate a same-origin `returnTo` through login/registration so a new user lands back on the exact invitation.

Add unavailable, expired, already-used, and unauthorized states. All invalid public links return the same non-sensitive preview response. Add tests for existing accounts, newly registered accounts, guardian/child claims, double claims, simultaneous capacity claims, event-specific free-agent races, and open-redirect rejection.

Milestone acceptance: in a private browser, opening a valid link shows safe context, registration returns to it, acceptance adds the account to the team exactly once, and refreshing the used link shows unavailable without exposing who claimed it.

### Milestone 3: Replace web email-only invitations with the reusable editor

Extract a reusable component such as `src/components/teams/TeamInviteEditor.tsx`. Use it from `src/app/teams/components/InvitePlayersModal.tsx`, team detail, and the event builder. It supports existing-account search and new-person entry. First and last name are required for new people; email and phone labels include “(optional).” Add an explicit share-only confirmation when both are blank.

Implement the requested primary-button transition with a stable-width Mantine button and a short cross-fade/slide between “Save invite” and “Send email invite.” Respect reduced-motion preferences by switching labels without motion. Before save, explain that the registration link will be generated. After save, web copies the returned claim URL and reports “Link copied.” Email success reports that the email was sent while keeping copy available. Delivery failure reports that the invite exists and the link still works.

Update `src/lib/teamService.ts`, invitation types in `src/types/index.ts`, and relevant tests. Keep existing free-agent and account-search tabs, but route all final writes through the shared invitation command.

Milestone acceptance: a captain can create and copy a first/last-name-only invite, send an email invite, retry a failed email without creating a second roster reservation, and cancel/revoke an invitation from the team view.

### Milestone 4: Add the web event-scoped team builder

Refactor `src/app/discover/components/eventDetail/EventTeamRegistrationPanel.tsx` so its main registration action opens the three-option join chooser. Add a focused wizard directory such as `src/app/discover/components/eventDetail/teamBuilder/` containing a controller hook, typed state, Team step, Free agents step, Invite people step, Review step, and responsive host.

Build a server endpoint or shared query under `src/app/api/events/[eventId]/free-agent-team-builder/` that returns event-compatible free agents after applying occurrence, division, registration status, privacy, and block rules. Do not return contact data. Mutations should call the same server invitation module introduced in Milestone 1.

Persist an idempotency key for one reviewed submission. Create the canonical team with `addSelfAsPlayer`, sport, division, and team size derived from the event contract. Create selected free-agent invites with `userId` plus `contextEventId`, and create new-person invites from the same reviewed payload. Return the team and invite delivery summaries. Then select the new team and enter the existing event registration controller so questions, documents, billing, payment holds, and completion behavior remain unchanged.

Persist enough client progress under the existing registration-progress conventions to recover after an auth redirect or page refresh. Never auto-resubmit a create command without the same idempotency key. When team creation succeeds but event registration does not, show “Team created; event registration is not complete” with actions to resume registration or manage the team.

Add regression tests for join-option rules, captain capacity, no-free-agent empty state, selection limits, division/occurrence filtering, duplicate submissions, partial delivery failure, paid events, required documents, waitlists, and minors. Add a browser smoke test at desktop and mobile web widths.

Milestone acceptance: a user with no team can start on an event, build a reusable team, invite two event free agents, finish the existing event registration flow, and see accepted invitees move from Free Agents into that event team.

### Milestone 5: Add mobile contracts, invitation links, and contact import

Update `core/network/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/InviteDtos.kt`, `core/model/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/Invite.kt`, and repository interfaces/implementations to support nullable email, phone, claim URL, delivery summary, contact matching, preview, and claim. Add repository contract tests before UI work.

Extend `MainActivity.kt`, `ContentView.swift`, and root navigation so `/i/<inviteId>/<signature>` opens a shared invitation preview destination. Preserve the full signed path through unauthenticated registration. Reuse the web preview/claim API; do not duplicate acceptance rules in Kotlin.

Create a reusable Compose invitation editor and use it from `CreateOrEditTeamScreen.kt` and the later event builder. Reuse `ShareService` for generic sharing. If direct channel actions are included, use Android `ACTION_SENDTO` with `mailto:` or `smsto:` and an iOS URL/composer presented by a user gesture. No SMS-send permission is requested.

Add a common `ContactAccessService` interface with Android and iOS implementations. Android adds `android.permission.READ_CONTACTS`, queries `ContactsContract` only after approval, and performs filtering off the main thread. iOS replaces the placeholder `NSContactsUsageDescription` with an honest BracketIQ-specific explanation, requests `CNContactStore` access, and fetches only name/email/phone fields. Both platforms normalize and deduplicate contacts locally. No contact is written to BracketIQ until selected.

The permission primer must precede the system prompt. Denied, permanently denied, empty-address-book, multiple-contact-value, and no-match states all retain manual entry. Add platform and common tests for permission state mapping, normalization, local search, selected-contact match requests, and share payloads. Analytics records only permission state and result counts.

Milestone acceptance: on Android and iOS, a captain can deny contacts and still invite manually; allow contacts, search locally, select one person, recognize a visible existing account or prefill a new invite, and share the secure link through the native sheet.

### Milestone 6: Add the mobile event team builder and complete cross-platform hardening

Extend `EventDetailJoinActionPresentation.kt` and `EventDetailJoinAndInviteSheets.kt` with the same three join choices as web. Add a dedicated team-builder component/state coordinator rather than expanding `EventDetailScreen.kt`. Reuse the shared team editor fields, free-agent repository query, invitation editor, existing event registration coordinator, and payment/signing flow.

Add Compose tests for each step and reducer transition, configuration/process recreation, capacity, loading/error states, reduced motion, back handling, and success recovery. Validate Android and iOS deep links from email, text, and generic share. Confirm app links fall back to the web invitation preview when the app is not installed.

Add PostHog events for builder started/completed/abandoned, free-agent selected, invite link created/shared/claimed, delivery channel/result, contact permission result, and selected-contact match result. Never attach names, emails, phone numbers, contact counts tied to a user, signatures, or full URLs.

Milestone acceptance: web, Android, and iOS produce the same team, invite, and event-registration outcomes from equivalent inputs; old mobile clients continue to invite by existing user or email; and concurrent acceptance cannot overfill a team or place one player on two event teams.

## Concrete Steps

All web commands run from `/Users/elesesy/StudioProjects/mvp-site`:

    git status --short --branch
    npx prisma validate
    npx prisma generate
    npm test -- --runTestsByPath \
      'src/app/api/teams/[id]/member-invites/__tests__/route.test.ts' \
      'src/app/api/invites/__tests__/acceptInviteRoute.test.ts' \
      'src/app/api/invites/[id]/__tests__/teamInviteEventSyncLifecycle.test.ts'
    npx tsc --noEmit
    git diff --check

Add new focused Jest files for invite-link signing, public preview/claim, contact matching, the invitation editor, and the team-builder controller. Run those files directly during their milestone, then run `npm run test:ci` before publish. Start the app with `npm run dev` and exercise the browser scenarios described under Validation and Acceptance.

All mobile commands run from `/Users/elesesy/StudioProjects/mvp-app`:

    git status --short --branch
    ./gradlew :composeApp:testDebugUnitTest
    ./gradlew :composeApp:compileKotlinAndroid
    ./gradlew :composeApp:compileKotlinIosSimulatorArm64
    git diff --check

When DTO or repository modules change, also run their module tests discovered by `./gradlew tasks --all`; record the exact successful tasks in this document. Do not run Jest or Gradle test suites concurrently in one checkout when they share build/cache artifacts.

Before a live migration, verify the generated SQL against a database snapshot. Deploy the nullable/additive schema before any client sends phone-only or share-only invitations. After deploy, smoke test one legacy email invite and one new share-only invite before enabling the new web UI.

## Validation and Acceptance

Use a seeded team-registration event that has at least one division, one open team slot, one paid or document-required path, and three free agents. Use clean names such as River City FC, Maya Chen, Jordan Lee, and Alex Morgan. Do not use automation names or `example.test` addresses in captured evidence.

On web, open the public event page signed in as a user with no compatible team. Press Register and observe the three choices. Choose Build a team, complete Team, select two event free agents, add one name-only person, and review. Create the team. Observe that the team exists in My Teams, the free agents have pending invites, the name-only person has a copyable claim link, and the app continues into the event’s existing questions/documents/payment flow. Before payment completes, the event must not say the team is registered. After completion, it must.

Accept one free-agent invitation from another account. Observe that the person disappears from the event free-agent list, becomes an active canonical team member, appears on the linked event team, and has one active `EventRegistrations` row with `rosterRole = PARTICIPANT`. Decline another invitation and observe that the person remains a free agent. Attempt to accept two event-specific team invitations concurrently for the same free agent and observe that exactly one succeeds.

Create a first/last-name-only invitation. Copy its link and open it signed out. Observe safe team/event context with no email or phone. Register a new account, return to the invitation, accept it, and observe one roster slot consumed. Refresh the link and observe a generic unavailable state. Alter one signature character and observe the same generic unavailable state without invite details.

Enter a valid email in the invitation editor and observe the stable primary button animate from Save invite to Send email invite. With reduced motion enabled, observe an immediate label change. Send it and confirm one email containing the claim link. Remove email, add only phone, save, and confirm no server SMS is attempted; on mobile, Share invite opens the native share sheet with team/event context and the URL.

On Android and iOS, deny contact permission and verify manual invitation still works. Grant it, search for a local contact, choose one of multiple phone/email values, and verify only the selected contact is submitted for matching. Confirm private/blocked/nonexistent accounts all produce the same non-match UI. Confirm a visible match creates a user-id invitation and a non-match pre-fills the optional-contact form.

Inspect server logs and PostHog payloads during all scenarios. They must contain no contact values, signatures, or full claim URLs. Run keyboard-only and screen-reader checks on web, and TalkBack/VoiceOver checks on mobile. All controls need meaningful labels, visible focus, at least 44-by-44 point touch targets, and announcements for invite saved/sent/copied states.

## Idempotence and Recovery

Schema changes are additive except making `Invites.email` nullable, which is backward compatible for existing rows and clients. The migration must not rewrite or delete invitation data. Re-running generation and tests is safe.

Team-builder submission uses an idempotency key scoped to event, captain, and draft. The server returns the first result for retries instead of creating duplicate teams or invitations. Invitation email retry updates delivery metadata on the same invitation. Link re-sharing regenerates the same signature while version and expiration remain unchanged. Revocation increments `linkVersion` or changes status, invalidating every previously shared URL.

If team creation succeeds but invite delivery fails, keep the team and invitation rows and show retry/copy actions. If event registration fails after team creation, keep the reusable team and show an explicit resume path. Do not delete a created team automatically because it may already have accepted members. If a claim fails after authentication, retain the signed return path and allow retry until the invitation expires or becomes unavailable.

Contact permission denial is recoverable through manual entry. Permanent denial offers a Settings link but never blocks the team builder. Empty or unreadable contacts produce an empty state, not an error that closes the wizard.

## Artifacts and Notes

The planning mockups were generated with the built-in image generation tool and saved under `docs/images/free-agent-team-invites/`. Their intended readings are:

- `web-join-options.png`: make the new path as prominent as existing-team and free-agent registration.
- `web-free-agent-picker.png`: select event-scoped free agents without exposing contact data; pending invites occupy slots.
- `web-invite-players-step.png`: the actual Step 3 desktop hub after free-agent selection, including new-person entry, staged invite rows, the inherited roster plan, and Review as the only forward action.
- `web-invite-player.png`: first/last plus optional email/phone, secure link, and Save-to-Send button state.
- `mobile-team-builder.png`: bottom-sheet entry followed by one-thumb full-screen steps.
- `mobile-invite-players-step.png`: the actual Step 3 mobile hub, with account search, new-person entry, contacts entry, staged invitations, and no delivery before Review.
- `mobile-contacts-invite.png`: permission primer, on-device search, selected-contact match, and native sharing. Its “Matched” badge represents a result already returned for a selected contact; it does not authorize uploading the full address book for batch matching.

The current implementation already provides the event-sync behavior the final flow should preserve:

    FREE_AGENT registration
      -> pending team invitation
      -> user accepts
      -> canonical TeamRegistration becomes ACTIVE
      -> linked EventRegistration becomes PARTICIPANT
      -> eventTeamId points to the registered event team

Do not replace this sequence with direct edits to legacy `freeAgentIds`, `playerIds`, or `pending` arrays. Those arrays are compatibility projections around registration tables and roster synchronization helpers.

## Interfaces and Dependencies

In `src/server/inviteLinks.ts`, expose server-only functions with equivalent behavior to:

    export type InviteLinkRecord = {
      id: string;
      status?: string | null;
      linkVersion: number;
      linkExpiresAt: Date;
    };

    export function buildInviteClaimUrl(
      invite: InviteLinkRecord,
      origin: string,
    ): string;

    export function verifyInviteClaimSignature(
      invite: InviteLinkRecord,
      signature: string,
      now?: Date,
    ): boolean;

In a reusable server invitation module under `src/server/invites/`, expose one command that route handlers and builder orchestration can call:

    export type CreateTeamMemberInviteCommand = {
      teamId: string;
      actingUserId: string;
      role: TeamInviteRole;
      userId?: string;
      firstName?: string;
      lastName?: string;
      email?: string;
      phoneNumber?: string;
      contextEventId?: string;
      sendEmail: boolean;
      createShareOnly: boolean;
      idempotencyKey?: string;
    };

    export type CreateTeamMemberInviteResult = {
      invite: Invite;
      team: Team;
      claimUrl: string;
      delivery: {
        email: 'sent' | 'skipped' | 'failed';
        push: 'sent' | 'skipped' | 'failed';
      };
    };

The mobile contact abstraction should have equivalent common behavior to:

    data class DeviceContact(
        val localId: String,
        val firstName: String,
        val lastName: String,
        val emails: List<String>,
        val phoneNumbers: List<String>,
    )

    interface ContactAccessService {
        suspend fun permissionState(): ContactPermissionState
        suspend fun requestPermission(): ContactPermissionState
        suspend fun loadContacts(): List<DeviceContact>
        fun openSettings()
    }

Use the existing `dev.icerock.moko:permissions` dependency for shared permission state where it supports contacts; otherwise keep the same common interface and implement the platform permission calls directly. Reuse the existing `ShareService` for generic native sharing. Do not add a contact-upload SDK, SMS vendor, or second authentication system.

Revision note (2026-07-19): Created the initial cross-repository plan after inspecting current web/mobile registration and invitation behavior. The design intentionally composes canonical teams, event registrations, and existing event-sync helpers, and adds secure optional-contact claim links plus privacy-bounded mobile contact selection.

Revision note (2026-07-19): Added corrected desktop and mobile concepts for the complete Step 3 Invite players hub. These clarify that search, new-person, and contacts are entry paths inside one builder step and that delivery waits until the team is created after Review.

Revision note (2026-07-20): Replaced the static four-step builder with the conditional Team-first four-or-five-step flow and added the Staff step. Screenshot QA tightened the web Staff list and stacked its search controls on narrow screens; Android emulator QA verified four visible free-agent rows, a scrollable Staff body, and fixed 48 dp navigation actions.

Revision note (2026-07-20): Added the phone-input formatting and backspace acceptance contract before beginning native contact import. The formatting milestone is intentionally committed with the existing dirty work before contact permissions and address-book access are introduced as a separate change.
