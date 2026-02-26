# Persisted placeholder teams + parent-linked event slots (no team versioning)

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This repository contains `PLANS.md` at `/Users/elesesy/StudioProjects/mvp-site/PLANS.md`. This plan must be maintained in accordance with that file.

## Purpose / Big Picture

After this change, scheduling a league/tournament persists a full roster of event-slot teams, including placeholder teams, so matches always reference real team IDs (never `null`). Placeholder teams are normal `Teams` rows with UUID IDs and names `Place Holder <seed>`. When a real (canonical) team joins, the server fills one placeholder slot by copying the canonical team’s profile into that slot team row and setting `parentTeamId = <canonicalTeamId>`. When the canonical team is edited, we update the canonical team in place (no “team versioning”) and propagate profile changes to future/active event-slot team rows that reference it. Unregistering resets the slot back to its placeholder state, preserving schedule stability.

## Progress

- [x] (2026-02-26 08:07Z) Initialized ExecPlan and captured requirements.
- [x] (2026-02-26 08:55Z) Update scheduler to keep regular placeholders and strip only playoff placeholders.
- [x] (2026-02-26 08:55Z) Persist scheduled roster teams (placeholders) on schedule/create/reschedule.
- [x] (2026-02-26 08:55Z) Update participants join/withdraw to fill/reset placeholders (transactional).
- [x] (2026-02-26 08:55Z) Disable team versioning and propagate canonical edits to future/active events.
- [x] (2026-02-26 08:55Z) Exclude placeholders from teams list endpoint.
- [x] (2026-02-26 08:55Z) Update profile schedule/documents endpoints to include slot teams.
- [x] (2026-02-26 08:55Z) Update/add Jest tests for scheduler and participants route.
- [x] (2026-02-26 08:55Z) Run `npm test` and fix failures.

## Surprises & Discoveries

- (none yet)

## Decision Log

- Decision: A team is a placeholder slot iff `captainId.trim().length === 0`.
  Rationale: No schema changes; deterministic detection across scheduler and APIs.
  Date/Author: 2026-02-26 / Codex

- Decision: Only strip playoff “Seed X” placeholders from persisted schedules.
  Rationale: Bracket seeding placeholders are internal until seeding happens; regular-season slots must remain stable IDs for schedule/matches.
  Date/Author: 2026-02-26 / Codex

- Decision: Propagate canonical team edits to events where `end >= now`.
  Rationale: Keep future/active schedules accurate without rewriting history of past events.
  Date/Author: 2026-02-26 / Codex

- Decision: No migration/backfill is required.
  Rationale: This environment uses dev data and can be reset; new behavior is forward-looking.
  Date/Author: 2026-02-26 / Codex

## Outcomes & Retrospective

- (not started)

## Context and Orientation

Definitions used in this plan:

- Canonical team: a normal team created by users. It is edited in place and (going forward) has `parentTeamId = null`. Canonical teams typically have a non-empty `captainId`.
- Event-slot team: a normal `Teams` row used as the stable identity inside a scheduled event roster. It may start as a placeholder and later be “filled” by linking to a canonical team via `parentTeamId`.
- Placeholder slot: an event-slot team with empty `captainId`. It has UUID id, stable integer `seed`, `name = Place Holder <seed>`, empty roster fields, and `parentTeamId = null`.
- Playoff seed placeholder: an internal “Seed X” team entry used only for playoff bracket matches before seeding; these must not remain in the persisted event roster.

Relevant backend locations:

- Scheduler builder: `/Users/elesesy/StudioProjects/mvp-site/src/server/scheduler/EventBuilder.ts`
- Scheduler tests: `/Users/elesesy/StudioProjects/mvp-site/src/server/scheduler/__tests__/leagueTimeSlots.test.ts`
- Event scheduling routes:
  - Create: `/Users/elesesy/StudioProjects/mvp-site/src/app/api/events/route.ts`
  - Manual schedule: `/Users/elesesy/StudioProjects/mvp-site/src/app/api/events/[eventId]/schedule/route.ts`
  - PATCH reschedule: `/Users/elesesy/StudioProjects/mvp-site/src/app/api/events/[eventId]/route.ts`
- Participants join/withdraw: `/Users/elesesy/StudioProjects/mvp-site/src/app/api/events/[eventId]/participants/route.ts`
- Team updates: `/Users/elesesy/StudioProjects/mvp-site/src/app/api/teams/[id]/route.ts`
- Teams list: `/Users/elesesy/StudioProjects/mvp-site/src/app/api/teams/route.ts`
- Profile schedule/documents:
  - `/Users/elesesy/StudioProjects/mvp-site/src/app/api/profile/schedule/route.ts`
  - `/Users/elesesy/StudioProjects/mvp-site/src/app/api/profile/documents/route.ts`

## Plan of Work

First, adjust the scheduler so regular-season placeholders are real participant teams with UUID IDs and are kept in the built event roster, while playoff placeholders are still stripped. Ensure referee assignment ignores placeholder teams.

Second, ensure that when an event is scheduled (create, initial schedule, reschedule), any slot teams in the scheduler output exist as real rows in `Teams`, and `Events.teamIds` is updated to the scheduler roster list. This must happen before saving matches so match team references are valid.

Third, change the team participants endpoint: when a canonical team joins a schedulable event, pick a placeholder slot (lowest seed, division-aware), copy canonical fields into the slot team, set `parentTeamId`, and store the registration against the slot team ID. When withdrawing, resolve canonical-vs-slot input, reset the slot back to placeholder defaults, remove it from division membership, and delete registrations for that slot.

Fourth, remove team versioning entirely. Always update the canonical team in place, then propagate the canonical profile to any event-slot team rows (where `parentTeamId` matches) that are referenced by events with `end >= now`. Do this in a single transaction.

Finally, keep placeholders out of the general teams listing endpoint (list/search mode), and update profile schedule/documents endpoints to treat slot teams as belonging to the canonical teams via `parentTeamId`.

## Concrete Steps

From `/Users/elesesy/StudioProjects/mvp-site`:

1. Implement scheduler + persistence changes.
2. Update API routes (participants + teams + profile).
3. Update Jest tests:

   - `npm test`

## Validation and Acceptance

Scenario A (new league shows placeholders):

- Create a league with `maxParticipants = 10`.
- Expect `events.teamIds.length === 10`.
- Fetch teams by those ids: names `Place Holder 1..10`, empty `captainId`.
- Matches saved with `team1Id/team2Id` pointing at those placeholder ids (not `null`).

Scenario B (team joins fills a slot):

- POST `/api/events/:eventId/participants` with `{ teamId: <canonicalId> }`.
- Expect one slot team row to have `parentTeamId == canonicalId` and copied profile fields.
- Schedule/matches still reference the same slot team id (stable schedule).

Scenario C (canonical team edit propagates):

- PATCH `/api/teams/:id` changing `name`.
- Expect slot teams with `parentTeamId == id` in events with `end >= now` to update name.
- Expect no new team id to be created.

Scenario D (withdraw resets slot):

- DELETE `/api/events/:eventId/participants` with `{ teamId: <canonicalId OR slotId> }`.
- Expect the slot team to reset to `Place Holder <seed>`, empty roster, `parentTeamId = null`.

## Idempotence and Recovery

No migration/backfill is performed. If the database contains old schedules without slot teams persisted, the new code only guarantees correctness going forward. For development, resetting the DB is an acceptable recovery path.
