# Add Division-Level Price and Capacity Rules for Multi-Division Events (Web/Backend)

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan follows `PLANS.md` at repository root and must remain compliant with its requirements.

## Purpose / Big Picture

Event organizers need different pricing and capacity rules per division when an event has multiple divisions, while preserving the current event-level controls for single-division events. After this change, division configuration carries `price` and `maxParticipants`, scheduling uses division capacity for multi-division events, and form behavior makes the active source-of-truth obvious through disabled/gray controls and synchronized values.

## Progress

- [x] (2026-02-21 20:10Z) Audited current web/backend model, form mapping, participant-capacity checks, and scheduler capacity logic.
- [x] (2026-02-21 20:14Z) Created this ExecPlan and recorded implementation semantics for single vs multi-division behavior.
- [ ] Add Prisma/type changes for `Divisions.price` and `Divisions.maxParticipants` with migrations and generated client updates.
- [ ] Implement repository + scheduler semantics: single-division uses event-level values, multi-division uses per-division values for capacity planning.
- [ ] Update schedule event form division section to include three-column settings with division price/capacity and mode-dependent disabling/gray state.
- [ ] Add/adjust tests for payload mapping, scheduler capacity, and edge cases (missing division values, fallback behavior, single/multi transitions).
- [ ] Run lint/tests for touched backend/web files and capture evidence in this plan.

## Surprises & Discoveries

- Observation: The participant join route currently does not enforce capacity server-side and most capacity behavior is currently UI-driven.
  Evidence: `src/app/api/events/[eventId]/participants/route.ts` mutates participant arrays without comparing against `maxParticipants`.
- Observation: Scheduler placeholder generation currently relies on event-level `maxParticipants`.
  Evidence: `src/server/scheduler/EventBuilder.ts` uses `desiredParticipantCapacity()` with `event.maxParticipants`.

## Decision Log

- Decision: Preserve the canonical behavior as: single-division events use event-level `price` and `maxParticipants`; multi-division events use division-level values.
  Rationale: This aligns with explicit user requirement for per-division controls when not single-division and avoids mixed source-of-truth for scheduling.
  Date/Author: 2026-02-21 / Codex
- Decision: In single-division mode, division price/capacity fields are read-only mirrors of event-level values in the form.
  Rationale: Users can see effective division values while only editing the canonical event-level fields.
  Date/Author: 2026-02-21 / Codex

## Outcomes & Retrospective

Implementation in progress. Outcome details and final validation evidence will be added after code and tests complete.

## Context and Orientation

Data definitions live in `prisma/schema.prisma` and generated Prisma client output under `src/generated/prisma`. Shared event/division contracts live in `src/types/index.ts`. Event schedule editing UI and payload mapping are in `src/app/events/[id]/schedule/components/EventForm.tsx`. Scheduler capacity and placeholder behavior is mainly in `src/server/scheduler/EventBuilder.ts` and related scheduler test files under `src/server/scheduler/__tests__`.

## Plan of Work

First add database and type support for division-level capacity and pricing. Then wire conversion logic in event form payload mapping so division fields serialize in cents/integers consistently. Next update scheduler capacity calculations to resolve effective capacity by division when multi-division is enabled, while preserving event-level behavior for single-division events. Finally add regression tests covering transitions between single and multi-division modes, missing values, and scheduling placeholder counts per division.

## Concrete Steps

Run from `/home/camka/Projects/MVP/mvp-site`:

1. Edit `prisma/schema.prisma` to add `price` and `maxParticipants` fields to `Divisions`.
2. Create and apply a Prisma migration; regenerate client/types if needed.
3. Edit `src/types/index.ts` and affected mappings in `src/app/events/[id]/schedule/components/EventForm.tsx`.
4. Edit scheduler logic in `src/server/scheduler/EventBuilder.ts` and supporting helpers/tests.
5. Run targeted lint/tests for touched files.

Expected command examples:

    npx prisma migrate dev --name division_price_capacity
    npm run lint -- src/app/events/[id]/schedule/components/EventForm.tsx src/server/scheduler/EventBuilder.ts
    npm test -- --runTestsByPath "src/server/scheduler/__tests__/leagueTimeSlots.test.ts"

## Validation and Acceptance

Acceptance is met when:

1. Multi-division events persist and load per-division `price` and `maxParticipants`.
2. Single-division events keep event-level values authoritative and division controls are read-only mirrors.
3. Scheduler uses per-division capacity for multi-division events and event-level capacity for single-division events.
4. Updated tests pass and cover edge cases around missing/zero values and mode toggles.

## Idempotence and Recovery

Code edits are additive. Migration can be rerun safely in local dev using normal Prisma workflows. If migration fails due drift, reset local dev DB or baseline migration history before retrying. Any generated file changes should be regenerated from schema rather than edited manually.

## Artifacts and Notes

Validation output and diff snippets will be captured here as work completes.

## Interfaces and Dependencies

Use existing Prisma schema/migrate workflow and existing event/scheduler modules only. No new external libraries are expected. Database contract changes must remain aligned with mobile/backend shared API expectations in `/home/camka/Projects/MVP/mvp-site`.

Revision note (2026-02-21 / Codex): Initial plan created before implementation to satisfy PLANS.md for this multi-area feature.
