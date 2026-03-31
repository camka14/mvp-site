# Migrate Field-Division Ownership To Division Field Maps

This ExecPlan is a living document. The sections Progress, Surprises & Discoveries, Decision Log, and Outcomes & Retrospective will be kept up to date as work proceeds.

This plan follows PLANS.md at the repository root.

## Purpose / Big Picture

After this change, field eligibility by division is derived from division-owned field mappings (division.fieldIds) instead of legacy field-level division tags (ield.divisions). This removes ambiguity when the same field is reused across events and aligns web/mobile behavior with backend source of truth. Observable result: schedule filtering and validation use division mappings, and database no longer stores Fields.divisions.

## Progress

- [x] (2026-03-31 18:30Z) Audited current usage and identified migration touchpoints.
- [x] (2026-03-31 19:02Z) Implemented web form/filtering updates to remove derivation from ield.divisions and keep division map normalization paths.
- [x] (2026-03-31 19:11Z) Removed backend persistence/read paths for Fields.divisions in repository + event/field routes.
- [x] (2026-03-31 19:14Z) Updated Prisma schema, added migration to drop Fields.divisions, regenerated Prisma client.
- [x] (2026-03-31 19:17Z) Ran targeted Jest suites touching upsert/event patch/field routes; all passing.

## Surprises & Discoveries

- Observation: Backend already comments ield.divisions as backward-compatible mirror data.
  Evidence: src/server/repositories/events.ts local field upsert block.

## Decision Log

- Decision: Remove storage-level field divisions now and keep compatibility at event division map layer.
  Rationale: Required by request and aligns with canonical model already present.
  Date/Author: 2026-03-31 / Codex

## Outcomes & Retrospective

Migration goals for web/backend/DB in this repository are complete: event and field flows no longer persist or read Fields.divisions, and division ownership remains on Divisions.fieldIds. Targeted regression suites passed for touched areas.

## Context and Orientation

prisma/schema.prisma currently contains model Fields { divisions String[] }, while model Divisions already carries ieldIds String[]. Scheduling and event forms still include legacy fallback to field-level divisions in several paths.

## Plan of Work

Remove all read/write dependencies on Fields.divisions; rely on divisionFieldIds/Divisions.fieldIds for ownership mapping and field eligibility. Keep fallback only to event-level selected fields where explicit division mappings are missing.

## Concrete Steps

From /home/camka/Projects/MVP/mvp-site:

    rg -n -S 'field\.divisions|divisions: fieldDivisions|model Fields|select: \{[^}]*divisions' src prisma

    npm test -- --runInBand src/server/scheduler/__tests__/leagueTimeSlots.test.ts

## Validation and Acceptance

- Event create/edit payload processing should succeed without reading/writing Fields.divisions.
- Scheduler and schedule preview should derive availability from division field maps.
- Prisma schema and migrations should reflect removal of Fields.divisions.

## Idempotence and Recovery

Code changes are repeatable. If migration causes issues, restore schema column and corresponding API/repository assignments.

## Artifacts and Notes

Primary files:

- src/app/events/[id]/schedule/components/EventForm.tsx
- src/app/api/events/[eventId]/route.ts
- src/app/api/fields/route.ts
- src/app/api/fields/[id]/route.ts
- src/server/repositories/events.ts
- prisma/schema.prisma

## Interfaces and Dependencies

Canonical ownership mapping is Division.fieldIds. Event-level payload map remains divisionFieldIds: Record<string, string[]>.

Revision note (2026-03-31): Initial plan created for migration requested by user.

Revision note (2026-03-31): Updated plan status after implementing and validating the migration.
