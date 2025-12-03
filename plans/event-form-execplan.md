# Event form replace EventCreationSheet in schedule page

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Reference: maintain this plan in accordance with `PLANS.md` in the repository root.

## Purpose / Big Picture

Replace `EventCreationSheet` usage in `src/app/events/[id]/schedule/page.tsx` with a new `EventForm` component built entirely on `react-hook-form`. Users should be able to edit an event inline with the same capabilities (image upload, location selection, stripe price gating, field creation/selection, league/tournament configuration, weekly timeslots with validation, referee search, immutable defaults) while simplifying state management and eliminating the drawer UI. After the change, editing an event from the schedule page uses `EventForm`, submitting updates emits the correct Event payload (including fields/slots/config) through callbacks, and timeslot generation/validation continues to work.

## Progress

- [x] (2025-12-02 21:37Z) Captured requirements and drafted ExecPlan for replacing EventCreationSheet with EventForm.
- [x] (2025-12-03 00:37Z) Implemented EventForm with react-hook-form defaults, validation, and feature parity for core event fields; added inline layout.
- [x] (2025-12-03 00:37Z) Ported league/tournament config, slots, field selection/creation, referee search, Stripe gating, and draft emission to EventForm.
- [x] (2025-12-03 00:37Z) Replaced EventCreationSheet usage in page.tsx with EventForm; pending tests/manual checks.

## Surprises & Discoveries

- Observation: EventCreationSheet currently mixes many concerns (state, validation, payload building) and uses a drawer/inline rendering pattern; page.tsx relies on `onDraftChange` to update `changesEvent`. EventForm must preserve this interaction without the drawer.
  Evidence: `page.tsx` imports `EventCreationSheet` at the details tab and uses `handleEventDraftChange` to merge drafts into `changesEvent`.

## Decision Log

- Decision: Use `react-hook-form` with zod resolver in EventForm and emit draft payloads via a typed submit handler rather than side effects.
  Rationale: Aligns with recent refactor direction and simplifies validation/state ownership.
  Date/Author: 2025-12-02 / Codex

## Outcomes & Retrospective

To be completed after implementation and validation.

## Context and Orientation

`src/app/events/[id]/schedule/page.tsx` currently renders `EventCreationSheet` inside the Details tab for create/edit flows, relying on `onDraftChange` to update `changesEvent`, and `handlePublish` to persist via `eventService`. `EventCreationSheet` (under `src/app/events/[id]/schedule/components/`) is a large form with image upload, location selector, sport selection, pricing with Stripe check, division toggles, field provisioning (when no organization), league/tournament config, and weekly timeslot validation. It already uses react-hook-form internally but is coupled to drawer UI. The new `EventForm` should live alongside components and encapsulate all form logic, emitting drafts and submit events for page.tsx to consume. Keep support for immutable defaults (organization-provided fields/timeSlots, locked fields), location prefill (user/org), referee search via `userService`, and field provisioning when no organization is present.

## Plan of Work

Create `EventForm` component under `src/app/events/[id]/schedule/components/`:
Explain new props (`event`, `organization`, `currentUser`, `immutableDefaults`, `onSubmit`, `onDraftChange`, `onCancel`, `renderInline` optional) and ensure all inputs are registered with react-hook-form using zod validation for required fields, coordinates, image, sport, divisions, pricing, slot completeness/overlap, and Stripe gating. Reuse helpers from EventCreationSheet (slot normalization, division keys, tournament/league config builders) or refactor shared utilities if needed. Manage dynamic arrays (fields, leagueSlots) within form state and ensure field count selector provisions new fields when no organization exists. Expose slot/field options to LeagueFields to keep weekly timeslots functional.

Integrate EventForm into `page.tsx`:
Replace `EventCreationSheet` imports and usage. Wire `onDraftChange` and submit handlers to update `changesEvent`/`event` as before, preserving create/edit flows (including `create` query mode and Details tab). Remove unused state tied to the old sheet (e.g., modal close handlers). Ensure bracket/schedule logic remains unaffected.

Validation and behavior:
Ensure form emits Event-like payloads on submit with fields, fieldIds, timeSlots (and ids if present), league/tournament config, referee ids, imageId, location/coordinates, hostId/userIds when needed. Maintain Stripe connect gating for price input. Maintain location prefill logic for org/user, referee search UI, and immutable defaults enforcement. Keep memoization for options to avoid re-renders.

## Concrete Steps

Work in `mvp-site` repo root.
1) Add `EventForm` component under `src/app/events/[id]/schedule/components/`. Start from EventCreationSheet logic but remove drawer shell, keep inline layout, and tighten to react-hook-form submit/draft callbacks. Implement props and types; reuse existing helpers; ensure slot/field validation via zod. Add memoized options for sports, fields, divisions, and field counts.
2) Update `page.tsx` to import and render `EventForm` in place of `EventCreationSheet` for both create and edit details tab. Adjust handlers to consume `onSubmit` and `onDraftChange` from EventForm and keep `changesEvent` logic intact. Remove unused imports/state tied to the old sheet.
3) Run checks: `npm test -- --runInBand`; optionally `npm run lint`. Manually verify create/edit flow: load `/events/{id}/schedule?create=1` and `/events/{id}/schedule?mode=edit`, edit fields/slots, ensure timeslot options include locally provisioned fields when no organization, and Stripe gating works.

## Validation and Acceptance

EventForm renders inline on the schedule details tab (and create mode) with all inputs wired through react-hook-form. Submitting or draft changes produce correct Event payloads (fields/slots/config/image/location/referees/ids) and update `changesEvent` in page state. Timeslot validation prevents overlap/missing required fields. Field count selector provisions fields when no organization exists and those fields appear as slot options. Stripe gating disables price until connected. Tests (or agreed subset) pass, and manual create/edit produces no console errors.

## Idempotence and Recovery

Form uses `reset` with defaults; reopening or switching events is safe. Edits are code-only; rerunning tests is safe. If integration breaks, revert page.tsx import/usage to prior component via version control and retry.

## Artifacts and Notes

- Reuse helper functions (slot normalization, division mapping, tournament/league config builders) to avoid drift between EventCreationSheet and EventForm; consider extracting shared utilities if duplication grows.

## Interfaces and Dependencies

- `EventForm` props: `event?: Event`, `editingEvent?: Event`, `currentUser: UserData`, `organization: Organization | null`, `immutableDefaults?: Partial<Event>`, optional `isOpen?: boolean`, callbacks `onSubmit?(draft: Partial<Event>)`, `onDraftChange?(draft: Partial<Event>)`, `onClose?()`.
- Internal: `react-hook-form` + `zod` resolver; uses existing components `ImageUploader`, `LocationSelector`, `LeagueFields`, `TournamentFields`, `LeagueScoringConfigPanel`, etc. Keep `userService` for referee search, `paymentService` for Stripe connect, and `eventService`/others only as needed for hydration.
