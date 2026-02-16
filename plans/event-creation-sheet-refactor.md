# Refactor EventCreationSheet to react-hook-form

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Reference: maintain this plan in accordance with `PLANS.md` in the repository root.

## Purpose / Big Picture

Modernize `src/app/events/[id]/schedule/components/EventCreationSheet.tsx` so the event creation and edit UI uses `react-hook-form` as the single source of truth for form state, validation, and submission. Today dozens of `useState` hooks mirror input values, require manual validation, and emit drafts through ad-hoc effects. After this refactor the component should register all fields with `useForm`, validate with a resolver, keep derived constraints (e.g., league slot completeness, location coordinates) inside the form, and emit consistent draft payloads for `onDraftChange` without redundant state updates.

## Progress

- [x] (2025-12-02 18:58Z) Analyzed EventCreationSheet.tsx and drafted ExecPlan.
- [x] (2025-12-02 20:41Z) Established `react-hook-form` with zod resolver for core event fields, location/coordinates, sport, and pricing defaults.
- [x] (2025-12-02 20:41Z) Migrated league/tournament configs, scoring, slots, and field provisioning into form state; removed legacy validation state/effects.
- [x] (2025-12-02 20:41Z) Refactored draft emission to read from form values, deduplicated image/location updates, and dropped redundant image state.
- [ ] Run tests and manual create/edit flows to verify validation, slot rules, and draft payloads.

## Surprises & Discoveries

- Observation: EventCreationSheet currently maintains parallel state slices (`eventData`, `leagueData`, `tournamentData`, `playoffData`, `leagueSlots`, `validation`, `selectedImageId/url`) plus many effects to mirror defaults and recompute validity instead of using `react-hook-form`.
  Evidence: `EventCreationSheet.tsx` uses `useState` for each section, recalculates `validation` via `useEffect`, and calls `emitDraft(buildDraftEvent())` from a side effect rather than form submission.

## Decision Log

- Decision: Use `react-hook-form` with a zod resolver to centralize required fields (name, sport, image, location/coordinates, capacity, divisions, league slot completeness/overlaps) and surface errors directly on inputs.
  Rationale: Replaces bespoke `validation` and `leagueFormValid` flags with a single validation path, reducing duplicated logic and making field error handling consistent.
  Date/Author: 2025-12-02 / Codex

## Outcomes & Retrospective

To be updated after implementation and testing.

## Context and Orientation

`EventCreationSheet.tsx` renders both inline and drawer-based creation/edit UI for events/leagues/tournaments. It accepts `onDraftChange`, `currentUser`, `event`/`editingEvent`, optional `organization`, and `immutableDefaults`. The component currently tracks many slices of state (`eventData`, `leagueData`, `tournamentData`, `playoffData`, `leagueSlots`, `fields`/`fieldCount`, validation flags, referee search results, image selection, join toggles). It builds draft payloads in `buildDraftEvent` from those disparate pieces and triggers `onDraftChange` via `emitDraft` plus a `useEffect`, relying on `stableSerialize` to avoid redundant emissions. Validation is manual (`setValidation`, `leagueFormValid`, `computeSlotError`) and blocks submit when flags fail. Defaults from `immutableDefaults`, organization location/fields, and user location are applied through effects and refs rather than declarative form resets. `page.tsx` consumes `onDraftChange` to set `changesEvent` for create/edit flows; it expects an Event-like payload containing fields, slots, league/tournament config, and optional participant IDs.

## Plan of Work

Replace bespoke state with `react-hook-form` by defining a single `EventFormValues` structure that includes base event details (name, description, sportId/sportConfig, eventType, pricing, capacity, imageId, coordinates/location, divisions, team toggles, leagueScoringConfig, joinAsParticipant, doTeamsRef/refereeIds/referees), league scheduling (`leagueSlots`, leagueConfig, playoff config), tournament config, and field definitions when provisioning. Initialize the form with `useForm` defaults derived from `incomingEvent` or `immutableDefaults`, and `reset` when the modal opens or the source event changes. Add a zod schema to enforce required fields, numeric bounds, division requirements for non-league events, image presence, location plus coordinates, Stripe-dependent price rules, slot completeness/overlap checks, and league/tournament timing constraints; use `setError` to surface slot-level validation messages. Swap input bindings to `Controller`/`register` with `setValue`/`watch` instead of `useState` setters, including Mantine selects, date/time pickers, LocationSelector, and LeagueScoringConfigPanel. Manage dynamic arrays with `useFieldArray` (league slots, fields when provisioning, divisions/referees if practical) or controlled updates that write directly into form state, removing redundant local arrays. Replace `validation`/`leagueFormValid` and manual effects with form errors and computed derived state from `watch` (e.g., enforce teamSignup/singleDivision for leagues, sync end date defaults). Rework image handling to store `imageId` in the form and derive preview URL from the watched value; keep non-form UI flags (`connectingStripe`, `hasStripeAccount`, modal open state) as simple state. Update `buildDraftEvent` to pull from `getValues()` (plus watched slot/field arrays), map nested configs back into the Event shape (including fieldIds/timeSlotIds when present), and emit drafts through `handleSubmit` and a `watch` subscription that deduplicates with serialized comparisons. Clean out unused effects and duplicated state updates once form wiring is complete.

## Concrete Steps

Work from `mvp-site`:
    npm test -- --runInBand
    npm run lint
For manual verification, run the dev server and open `/events/{id}/schedule?create=1` (create) and `/events/{id}/schedule?mode=edit` (edit) to exercise the sheet inline and in the drawer.

## Validation and Acceptance

Form fields are controlled solely by `react-hook-form`; changing inputs updates `watch` values without extra `useState` mirrors. Required fields show errors via form validation (missing name/sport/image/location/coordinates/division, invalid capacities, incomplete league slots, overlapping slot times, missing tournament fields). Submit/draft emission uses `handleSubmit`/form subscription and delivers a stable Event-like payload to `onDraftChange` (verified via schedule page `changesEvent` updates) with correct fields/slot IDs and league/tournament config. Manual flows for create and edit succeed without console errors, and existing behavior (Stripe connect gating price, immutable defaults locking fields) remains intact.

## Idempotence and Recovery

Form initialization uses `reset`/default values, so reopening or toggling between events can be repeated safely. Running tests and lint is non-destructive. If a refactor step introduces instability, re-run `reset` with known defaults or revert the specific component changes via version control; no migrations or external state are touched.

## Artifacts and Notes

- Current draft emission relies on `emitDraft(buildDraftEvent())` and `lastDraftRef` to avoid duplicate `onDraftChange` calls; expect to replace this with a `watch` subscription tied to form values.
- Slot overlap detection lives in `computeSlotError`/`normalizeSlotState`; port these into form validation or reuse them within the resolver to keep behavior consistent.
- Image selection currently duplicates state between `selectedImageId` and `eventData.imageId`; plan to collapse into a single form field with preview derived from the watched value.

## Interfaces and Dependencies

Use `react-hook-form` (`useForm`, `Controller`, `useFieldArray`, `FormProvider`) with `@hookform/resolvers/zod` plus `zod` schemas. Define `EventFormValues` with fields mirroring the Event payload: `name`, `description`, `eventType`, `sportId`, `sportConfig`, `price`, `maxParticipants`, `teamSizeLimit`, `teamSignup`, `singleDivision`, `divisions: string[]`, `cancellationRefundHours`, `registrationCutoffHours`, `imageId`, `seedColor`, `location`, `coordinates: [number, number]`, `organizationId`, `joinAsParticipant`, `doTeamsRef`, `refereeIds`, `referees`, `leagueScoringConfig`, `leagueConfig`, `leagueSlots: LeagueSlotForm[]`, `playoffConfig`, `tournamentConfig`, `fields` when provisioning, plus optional `waitList`, `freeAgents`, `teams`, `players`. Maintain non-form UI flags (`connectingStripe`, `hasStripeAccount`, `fieldsLoading`) as local state.
