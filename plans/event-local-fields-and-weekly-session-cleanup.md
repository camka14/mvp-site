# Event Local Fields and Weekly Session Cleanup

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document follows `PLANS.md` in the repository root. It is self-contained so a future contributor can continue the work without needing prior conversation context.

## Purpose / Big Picture

Organization hosts should be able to create league and tournament events with event-only free fields that are not owned by the organization. Organization `EVENT` and parent `WEEKLY_EVENT` creation should use reusable organization field selection only, without showing a field-count control. Event-only free fields are normal `Fields` rows with `organizationId` unset and are linked to the event only through `Events.fieldIds`, time slot `scheduledFieldIds`, and related event scheduling data. Weekly event registrations should continue to use the parent weekly event plus `slotId` and `occurrenceDate`; the old child-session event creation surface should be removed so there is only one supported model.

After this change, a host can open create mode for an organization event without being blocked just because the organization has no saved fields. If they save with no resolved fields, the API returns a clear validation error. If a template contains a mix of organization fields and event-only free fields, the new event reuses the organization field IDs and clones the free field IDs.

## Progress

- [x] (2026-05-18T16:13:06Z) Read `PLANS.md`, checked git status, located weekly child-session references, and inspected template field cloning.
- [x] (2026-05-18T16:42:00Z) Removed stale weekly child-session client/server creation code and kept parent occurrence registration paths intact.
- [x] (2026-05-18T16:42:00Z) Updated EventForm field mode so organization `EVENT`s and parent `WEEKLY_EVENT`s select saved organization fields without local field-count controls, while league/tournament creation manages event-only free fields.
- [x] (2026-05-18T16:42:00Z) Updated event create and patch persistence so nested event fields stay free fields instead of inheriting `payload.organizationId`.
- [x] (2026-05-18T16:42:00Z) Replaced the old saved-organization-field guard with a resolved-field validation that blocks zero-field saves for any event.
- [x] (2026-05-18T16:42:00Z) Updated template cloning/seeding so organization fields are reused while non-organization fields are cloned and remapped.
- [x] (2026-05-18T16:42:00Z) Updated external-rental detection so organization events with local free fields do not become schedule-locked.
- [x] (2026-05-18T16:42:00Z) Added focused regressions and ran the targeted Jest suites.

## Surprises & Discoveries

- Observation: The route `src/app/api/events/[eventId]/weekly-sessions/route.ts` already returns `410` and says weekly child sessions are no longer created, but the old client method and server resolver still exist.
  Evidence: `src/lib/eventService.ts` still exposes `createWeeklySession`, and `src/server/events/weeklySessionResolver.ts` still defines `resolveOrCreateWeeklySessionChild`.
- Observation: Template cloning currently decides local-field cloning at the event level. For any template with `organizationId`, all fields are reused, even if some field rows are event-only free fields.
  Evidence: `src/lib/eventTemplates.ts` sets `hasLocalFields = !isOrganizationTemplate && Array.isArray(template.fields)`.

## Decision Log

- Decision: Do not add `Fields.eventId` for this change.
  Rationale: Event-only fields are not searched independently; event ownership is represented by the event's `fieldIds` and slot field references. This keeps the change smaller and avoids a migration.
  Date/Author: 2026-05-18 / Codex
- Decision: Keep saved organization field selection for organization `EVENT`s and parent `WEEKLY_EVENT`s, but hide local field-count controls for those event types.
  Rationale: Organizations should still be able to create events on their own saved fields. League and tournament scheduling keeps the local free-field count control because those types need explicit field provisioning.
  Date/Author: 2026-05-18 / Codex
- Decision: Weekly sessions should not create child events.
  Rationale: The active API path already stores weekly registrations against the parent event using `slotId` and `occurrenceDate`; keeping an unused child-event resolver is confusing and risky.
  Date/Author: 2026-05-18 / Codex

## Outcomes & Retrospective

Implemented the agreed field ownership split. Organization `EVENT` and parent `WEEKLY_EVENT` forms now expose reusable organization field selection without field-count controls. League and tournament creation still exposes local event field count/name controls; organization league/tournament creation defaults that count to `0`, and switching from org `EVENT` to league/tournament resets the carried count to `0`. Drafts include selected organization field IDs plus local field IDs in `fieldIds`, but send only ownerless local field objects in `fields`.

Server create/upsert and PATCH now create nested event fields with `organizationId: null` and reject saves that resolve to zero field IDs with `Select or create at least one field for this event.`

Template cloning and seeding now classify fields individually. Organization-owned fields keep their IDs, while ownerless local fields get fresh IDs and are remapped through time slots and division field maps.

Removed the old `weekly-sessions` route, the `EventService.createWeeklySession` client method, and the unused weekly child resolver. Remaining parent-linked weekly row handling is compatibility-only text/UI for historical rows; new weekly registrations continue to use the parent event with `slotId` and `occurrenceDate`.

Validated with:

    npm test -- --runTestsByPath src/lib/__tests__/eventTemplates.test.ts src/server/repositories/__tests__/events.upsert.test.ts 'src/app/events/[id]/schedule/components/__tests__/externalRentalField.test.ts' 'src/app/events/[id]/schedule/components/__tests__/EventForm.test.tsx' src/app/api/events/__tests__/eventSaveRoute.test.ts src/app/api/events/__tests__/scheduleRoutes.test.ts

## Context and Orientation

`src/app/events/[id]/schedule/components/EventForm.tsx` is the large form used for event creation and editing. It currently loads organization fields into `fields` for organization events and manages local free fields only when there is no organization. The relevant form concepts are:

An organization field is a `Fields` row whose `organizationId` points to an organization. These fields are reusable from the organization Fields tab.

An event-only free field is a `Fields` row whose `organizationId` is unset. It is linked to one event by `Events.fieldIds` and by any time slots that reference it. This plan does not add a direct `eventId` column.

`src/server/repositories/events.ts` implements `upsertEventFromPayload`, the server-side create/upsert path used by `/api/events` and `/api/events/schedule`. It currently rejects new organization events when the organization has no saved fields and defaults nested fields to the event organization. Both behaviors must change.

`src/app/api/events/[eventId]/route.ts` implements PATCH for existing events and contains a similar nested field upsert block. It must match the create/upsert behavior so edit mode does not accidentally convert event-only fields into organization fields.

`src/lib/eventTemplates.ts` clones events to templates and seeds new events from templates. It currently clones all fields only for non-organization templates. It needs field-level ownership logic so saved org fields are reused and event-only free fields are cloned.

`src/app/events/[id]/schedule/components/externalRentalField.ts` detects events that are using fields owned by another organization and locks schedule editing. It must distinguish external rental fields from event-only free fields.

Weekly event sessions are represented by a parent weekly event plus a selected `slotId` and `occurrenceDate`. The active participant and registration routes already use that shape. The legacy child-session event creation code can be removed.

## Plan of Work

First remove dead weekly child-session creation code by deleting the old resolver module, the `EventService.createWeeklySession` client method, and the obsolete `weekly-sessions` route that only returns 410 if it has no other callers. Search after removal to prove there are no remaining imports or public client helpers for creating child session events.

Next update EventForm. Replace the single `shouldManageLocalFields` concept with separate ideas: whether the form can manage event-local free fields, and whether it should show organization field selection. Organization `EVENT`s and parent `WEEKLY_EVENT`s should show `Organization Fields` without the `Number of Fields` / `Field Names` local-field controls. League and tournament creation should continue to use local field provisioning and scheduling field pickers; organization league/tournament creation should default the count to `0`. The draft builder must put saved org selected IDs plus local free field IDs in `draft.fieldIds`, but put only local free field objects in `draft.fields`.

Then update server persistence. In `upsertEventFromPayload`, remove the early saved-organization-field-count guard. After resolving canonical time slots, payload `fieldIds`, and incoming nested fields, throw a clear validation error when the final field ID list is empty. When creating nested fields from event payloads, use `organizationId: null` unless the incoming field explicitly has an organizationId and that existing persisted field already owns that organization. The PATCH route should apply the same local-field create behavior and same zero-field validation.

Then update templates. Replace event-level local-field cloning with field-level classification. A field is reusable if it has the template/source organization ID. A field is cloned if it has no organization. Field IDs inside time slots, field lists, and division field maps should be remapped only for cloned fields. This preserves organization fields while giving new IDs to event-only fields.

Finally update tests and validation. Add unit coverage around template mixed-field cloning, event upsert zero-field validation and local-field ownership, EventForm organization-field rendering plus league/tournament field-count transitions, and external-rental detection for org events with local free fields.

## Concrete Steps

Work from `/Users/elesesy/StudioProjects/mvp-site`.

Use `rg` before and after removal:

    rg -n "resolveOrCreateWeeklySessionChild|createWeeklySession|weekly-sessions|Weekly child sessions" src --glob '!src/generated/**'

Run targeted tests after edits:

    npm test -- --runTestsByPath src/lib/__tests__/eventTemplates.test.ts src/server/repositories/__tests__/events.upsert.test.ts src/app/events/[id]/schedule/components/__tests__/externalRentalField.test.ts src/app/events/[id]/schedule/components/__tests__/EventForm.test.tsx src/app/api/events/__tests__/eventSaveRoute.test.ts src/app/api/events/__tests__/scheduleRoutes.test.ts

If shell globbing complains about `[id]`, quote the path exactly as shown in the command when running it manually in zsh.

## Validation and Acceptance

The targeted Jest command should pass. The acceptance behaviors are:

An organization `EVENT` or parent `WEEKLY_EVENT` create form shows `Organization Fields` when saved org fields exist and does not show field-count controls. Organization league/tournament creation shows field-count controls defaulted to `0`; switching from org `EVENT` into league/tournament resets any carried local count to `0`. Saving an event with free fields creates `Fields` rows with `organizationId = null`.

Saving any event with no resolved fields returns a 400-level validation error instead of silently creating a fieldless event or requiring saved organization fields specifically.

A template created from an organization event with both an org field and a free field reuses the org field ID and clones/remaps only the free field ID when a new event is seeded.

Weekly participant registrations use `slotId` and `occurrenceDate` on the parent event. There is no remaining supported client/server helper that creates weekly child event rows.

## Idempotence and Recovery

All edits are source-level and repeatable. If a test fails, inspect the failing assertion and adjust the smallest relevant file. No database migration is planned. No destructive database command is required.

## Artifacts and Notes

Important evidence from the initial scan:

    src/app/api/events/[eventId]/weekly-sessions/route.ts already returns 410.
    src/lib/eventTemplates.ts currently has hasLocalFields = !isOrganizationTemplate && Array.isArray(template.fields).
    src/server/repositories/events.ts currently rejects new organization events when client.fields.count({ organizationId }) is 0.

## Interfaces and Dependencies

In `src/app/events/[id]/schedule/components/EventForm.tsx`, maintain the public `EventFormHandle` methods and existing props. The draft returned by `getDraft()` must continue to be a `Partial<Event>`.

In `src/server/repositories/events.ts`, keep `upsertEventFromPayload(payload, client)` as the persistence entry point. Add or update small local helpers only if they reduce duplication and keep behavior explicit.

In `src/lib/eventTemplates.ts`, keep `cloneEventAsTemplate(source, options)` and `seedEventFromTemplate(template, params)` signatures unchanged.

Revision note 2026-05-18: Created this ExecPlan before implementation to record the agreed field ownership and weekly-session cleanup decisions.
