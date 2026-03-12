# Event Schedule Staff Refactor

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with [PLANS.md](../PLANS.md).

## Purpose / Big Picture

This change replaces the fragmented host, assistant-host, and referee controls in the event schedule editor with one unified Staff section. After the change, organization-hosted events can browse organization staff and assign them as referee, assistant host, or primary host from one place, while non-organization events can add existing users or stage email invites as referee or assistant host and see those assignments in the same staff columns before saving.

The user-visible proof is on the schedule details tab for an event. Editing staff assignments should immediately enable `Save`. For non-organization events, staged email invites must render as `Email invite` cards before save and resolve into persisted pending staff invite state after save. Event staff invite records must merge roles per user per event instead of duplicating invites.

## Progress

- [x] (2026-03-12 17:38Z) Audited the current `EventForm`, schedule save flow, invite API, event API, and test coverage to map the existing host/referee paths.
- [ ] Implement the `EventForm` staff-state refactor, including generic pending staff invite drafts and the unified Staff section UI.
- [ ] Extend event invite persistence and event loading to support event-scoped `STAFF` invites with merged `staffTypes`.
- [ ] Update schedule save flow to validate pending invite emails, reconcile event staff invites after save, and surface save failures clearly.
- [ ] Replace and expand regression coverage for the new staff UI, dirty-state behavior, and merged invite semantics.

## Surprises & Discoveries

- Observation: the current form already keeps dirty-state tracking in a custom `setValue` wrapper that immediately notifies the page when `shouldDirty` is set.
  Evidence: `src/app/events/[id]/schedule/components/EventForm.tsx` defines a local `setValue` wrapper around `react-hook-form` at roughly line 3057 and calls `onDirtyStateChange?.(true)` there.
- Observation: current non-org referee invites are not persisted as staff invites at all; they are sent as `EVENT` invites after save and then merged only into `refereeIds`.
  Evidence: `submitPendingRefereeInvites` in `src/app/events/[id]/schedule/components/EventForm.tsx` currently posts `type: 'EVENT'` and the page calls it from `syncPendingEventFormInvites` in `src/app/events/[id]/schedule/page.tsx`.
- Observation: the shared invite API currently rejects `STAFF` invites without an `organizationId`, so event-scoped staff invites need an explicit API extension.
  Evidence: `src/app/api/invites/route.ts` returns `Staff invites require organizationId` inside the `inviteType === 'STAFF'` branch.

## Decision Log

- Decision: keep the existing event assignment model of `hostId`, `assistantHostIds`, and `refereeIds` rather than introducing a new `hostIds` event field.
  Rationale: the schedule form, event payload mapper, event API, and organization assignment sanitizers already depend on that contract, and the user confirmed this model during planning.
  Date/Author: 2026-03-12 / Codex
- Decision: implement one event-scoped invite row per `(eventId, userId)` and merge role membership into `Invite.staffTypes`.
  Rationale: the user wants pending state to come from a single invite lookup per assigned user and wants later role additions to update the existing invite instead of creating a second one.
  Date/Author: 2026-03-12 / Codex
- Decision: use event-scoped `STAFF` invites with `eventId`, not `EVENT` invites with added role metadata.
  Rationale: the user explicitly chose `STAFF + eventId`, and this keeps staff-role semantics in the existing `staffTypes` field instead of adding a second role representation.
  Date/Author: 2026-03-12 / Codex

## Outcomes & Retrospective

Implementation has not started yet. The main risks are the breadth of the `EventForm` refactor and the need to update invite surfaces so event-scoped `STAFF` invites continue to render correctly outside the schedule page.

## Context and Orientation

The event schedule editor lives in `src/app/events/[id]/schedule/page.tsx` and embeds the editable details form from `src/app/events/[id]/schedule/components/EventForm.tsx`. The page treats the form as the source of truth for unsaved change tracking through `onDirtyStateChange` and for save payload generation through the imperative `EventFormHandle`.

Today the form has three separate staff-related paths. Primary host and assistant hosts are managed in separate host controls. Referees live in a `Referees` section with a dedicated search flow. Non-organization events also have a referee-only email invite draft list stored in `pendingRefereeInvites`.

Invite persistence uses the shared invite route in `src/app/api/invites/route.ts` and the shared invite type in `src/types/index.ts`. Organization staff invites already use `type: 'STAFF'` plus `staffTypes`, but the route currently requires `organizationId`. Event invites currently use `type: 'EVENT'` and do not carry role metadata.

The event API endpoint in `src/app/api/events/[eventId]/route.ts` currently returns division metadata but does not include event staff invites. `src/lib/eventService.ts` maps that payload into the client `Event` type. Any persisted event staff invite badges shown after save or reload therefore require extending both the API response and the event type/service mapping.

The current schedule regressions live in `src/app/events/[id]/schedule/components/__tests__/EventForm.test.tsx` and `src/app/events/[id]/schedule/__tests__/page.test.tsx`. Those tests are heavily mocked and will need updates because the old referee-only invite controls are being replaced.

## Plan of Work

First, rewrite the staff-related form state in `EventForm.tsx`. Replace `PendingRefereeInvite` with a generic pending-staff invite draft shape that supports email/name, target roles, and pre-save display state. Update the form schema, default values, dirty-state serializer, and imperative handle so every host/referee change and pending invite change flows through the same state model.

Next, replace the current host and referee UI with a single Staff section. Keep the `Teams provide referees` switches at the top. For organization events, build a searchable filtered staff source list using organization roster data already available on the form and render action buttons per card. For non-organization events, build an add/invite control that supports existing-user search and email-invite draft creation. Render assigned referees in the left column and primary host plus assistant hosts in the right column, both with 5-at-a-time infinite reveal.

Then, extend persistence. Update the shared invite route so `STAFF` invites can be event-scoped with `eventId`, and make that branch upsert one invite per `(eventId, userId)` while merging `staffTypes`. Update event loading so saved event staff invites come back on the event payload, and update the schedule save flow so it validates pending invite emails before the event save, then reconciles the event staff invite rows after a successful save.

Finally, update the schedule and profile invite surfaces that distinguish organization staff invites from event-scoped staff invites, then replace the old referee-only tests with new coverage for dirty state, disabled add buttons, role-merging invites, validation errors, and persisted pending-state reload.

## Concrete Steps

Work from `/home/camka/Projects/MVP/mvp-site`.

Run targeted tests while iterating:

    npm test -- --runInBand src/app/events/[id]/schedule/components/__tests__/EventForm.test.tsx
    npm test -- --runInBand src/app/events/[id]/schedule/__tests__/page.test.tsx
    npm test -- --runInBand src/app/api/invites/__tests__/inviteRoutes.test.ts
    npx tsc --noEmit

When the feature is ready for broader validation, load the app locally and exercise these cases in the browser:

    npm run dev

Then open `/events/<eventId>/schedule?mode=edit` and verify:

1. Editing any staff assignment enables `Save`.
2. Org events show a Staff section with org roster cards and disabled per-role add buttons once a role is already assigned.
3. Non-org email invites render `Email invite` before save and `Pending` after save.
4. Adding a second role to the same invited user updates a single pending invite state instead of duplicating the user card.

## Validation and Acceptance

Acceptance is behavioral. The schedule details tab must show one Staff section instead of separate host/referee areas. For organization events, assigning a host, assistant host, or referee must immediately update the assigned columns and enable `Save`. For non-organization events, adding an email invite draft must render an `Email invite` card in the correct column before save, and saving must convert that card into persisted pending-state based on the returned event staff invite data.

Run the targeted Jest suites and TypeScript check. The new tests must prove that duplicate role adds are disabled, pending invite emails that collide with already assigned users fail the save with a clear error, and later role additions update the existing event staff invite instead of creating a second invite row.

## Idempotence and Recovery

This refactor is safe to iterate on because all persistence changes are additive. Re-running tests is idempotent. If a partial UI refactor breaks compilation, recover by restoring the staff section to a compiling intermediate state before moving to the invite API changes. Do not reset unrelated user edits in `EventForm.tsx`; inspect existing local diffs and preserve them.

## Artifacts and Notes

Current local diff before implementation begins:

    src/app/events/[id]/schedule/components/EventForm.tsx

    The only existing local change adds `type="button"` to several existing add/remove buttons. Preserve that change while refactoring the section.

## Interfaces and Dependencies

At the end of this work:

- `src/app/events/[id]/schedule/components/EventForm.tsx` must define a generic pending staff invite draft type and expose an imperative save hook that reconciles non-org event staff invites rather than referee-only invites.
- `src/types/index.ts` must allow `Event.staffInvites?: Invite[]`.
- `src/app/api/invites/route.ts` must accept event-scoped `STAFF` invites and merge `staffTypes` per `(eventId, userId)`.
- `src/app/api/events/[eventId]/route.ts` and `src/lib/eventService.ts` must return and map `staffInvites` for event payloads.
- `src/app/events/[id]/schedule/page.tsx` must validate and reconcile staff invites using the new `EventFormHandle` behavior.

Plan created on 2026-03-12 to implement the staff refactor requested in the schedule editor. It records the current invite API limitation and the chosen event-scoped `STAFF + eventId` invite model so subsequent edits can be evaluated against the same assumptions.
