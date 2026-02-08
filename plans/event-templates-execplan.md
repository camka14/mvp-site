# Event Templates (TEMPLATE state) + Create-From-Template Flow

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Reference: maintain this plan in accordance with `mvp-site/PLANS.md`.

## Purpose / Big Picture

Enable hosts to save an existing event as an **Event Template** and then create new events from those templates.

After this change:

- Hosts can click **Create Template** on an existing event to clone it into a new event with `state = TEMPLATE` and name suffix `(TEMPLATE)`.
- Templates do **not** copy participants (teams/users) or matches.
- When creating a new event, if the host has templates, they are prompted to pick a template and a **new start date**. The new event is pre-filled from the template, and league time slots are copied with start/end aligned to the new event start/end.
- Templates are **private**: they are not returned by public event search/listing, and template reads require the host session.

## Progress

- [x] (2026-02-08) Add Prisma enum value `TEMPLATE` and migrate DB.
- [x] (2026-02-08) Update TS `EventState` + normalizers to support `TEMPLATE`.
- [x] (2026-02-08) Hide templates from public event search/list responses; require session to read template events.
- [x] (2026-02-08) Add "Create Template" action on event schedule page (host only) to clone event into a TEMPLATE.
- [x] (2026-02-08) Add create-mode modal prompting for template + start date; seed EventForm from template with new time slot ids.
- [x] (2026-02-08) Add tests for template filtering/permission and template cloning/seed logic.

## Surprises & Discoveries

- Observation: `EventForm` only resets defaults when the incoming event id changes. In create mode, the event id is fixed by the route, so applying a template must force a remount/reset.
  Evidence: `mvp-site/src/app/events/[id]/schedule/components/EventForm.tsx` reset effect depends on `activeEditingEvent?.$id`.
- Observation: Mantine v8 `DatePickerInput` emits `YYYY-MM-DD` strings (not `Date`) in `onChange`.
  Mitigation: Use `parseLocalDateTime` to coerce into a `Date` before seeding templates.

## Decision Log

- Decision: Model event templates as regular `Events` rows using `EventsStateEnum = TEMPLATE` (rather than a new table).
  Rationale: Reuses existing event + time slot persistence/hydration logic and keeps templates selectable via existing APIs.
  Date/Author: 2026-02-08 / Codex

- Decision: Templates are private and excluded from public discovery/search.
  Rationale: Templates are intended as personal/org scaffolding and should not appear as real events.
  Date/Author: 2026-02-08 / Codex

## Outcomes & Retrospective

- Implemented `TEMPLATE` as an `Events` state enum + UI flow for create-from-template.
- Templates are private and excluded from all public discovery/search/list views.
- Tests passing: `npx tsc --noEmit` and `npm test -- --runInBand`.

## Context and Orientation

- Event persistence uses Prisma model `Events` in `mvp-site/prisma/schema.prisma` with `state: EventsStateEnum?`.
- Event create/upsert lives in `mvp-site/src/app/api/events/route.ts` and `mvp-site/src/server/repositories/events.ts` (`upsertEventFromPayload`).
- The event creation/edit UI is the schedule page `mvp-site/src/app/events/[id]/schedule/page.tsx` which renders `EventForm` in create mode.
- `EventForm` uses React Hook Form and maps DB cents to UI dollars; league time slots are stored in `TimeSlots` and emitted from `leagueSlots` with `startDate/endDate` set to the event start/end.

## Plan of Work

1) Data model: add `TEMPLATE` to `EventsStateEnum` and run a migration + Prisma generate.
2) Types: include `TEMPLATE` in `EventState` and normalize it in `eventService`.
3) Privacy + filtering:
   - Exclude templates from `/api/events/search` and default `/api/events` listing.
   - Gate template reads: `/api/events?state=TEMPLATE` and `/api/events/[eventId]` when `state=TEMPLATE` require session and host ownership.
4) Template creation (host action):
   - Add a button on the schedule page for hosts to clone the current event into a new `TEMPLATE` event.
   - Clone time slots (new ids) and (for non-org events) clone fields + rewire time slots to the new field ids.
   - Do not copy teams/users/waitlists/registrations/matches.
5) Create-from-template:
   - In create mode, fetch the host’s templates (scoped to the org if applicable). If any exist, show a modal to select a template and new start date.
   - Seed the draft event with template values and freshly generated time slot ids; set event start/end based on selected start date + template duration.
   - Force `EventForm` remount/reset after applying the template to ensure defaults render.

## Concrete Steps

Work in `mvp-site/`.

1) Update Prisma schema and run:
   - `npx prisma migrate dev --name add_event_template_state`
   - `npx prisma generate`
2) Update TS types and services, then run:
   - `npm test -- --runInBand`
   - `npx tsc --noEmit`
3) Manual verification:
   - Create an event (league) with weekly time slots.
   - From the event schedule page, click "Create Template" and verify a new `(TEMPLATE)` event exists and has no teams/users.
   - Create a new event; verify you are prompted to choose a template + start date, and after selection the form is prefilled and league slots match the template.

## Validation and Acceptance

- Templates do not show in public discover/search or org event calendars.
- Template event reads are forbidden unless the session user is the host (or admin).
- Creating a template clones the event config and time slots, but not participants or matches.
- Creating an event from a template seeds the form and results in newly created time slot records (no shared ids with the template) after publishing.

## Idempotence and Recovery

- Re-running migrations and Prisma generate is safe.
- Template creation is additive (new ids) and does not mutate the source event.
- If template seeding breaks the create flow, disable the modal prompt and fall back to blank creation.
