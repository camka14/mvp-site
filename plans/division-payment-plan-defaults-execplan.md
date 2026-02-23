# Add Division-Level Payment Plans with Event-Level Defaults (Web + Backend)

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan follows `PLANS.md` at repository root and must remain compliant with its requirements.

## Purpose / Big Picture

Organizers need payment plans to behave like pricing/capacity in split-by-division mode: each division should own its payment plan, while event-level fields stay editable as defaults for new divisions. After this change, web form editing, API normalization, and persistence support per-division payment plans and use event-level values only as defaults in multi-division mode.

## Progress

- [x] (2026-02-23 21:15Z) Audited current form, API route, repository sync, and discover join flow for payment-plan behavior.
- [x] (2026-02-23 21:22Z) Created this ExecPlan before implementation.
- [ ] Add `Divisions` schema/migration support for payment-plan fields.
- [ ] Update shared types + service mapping for division payment-plan fields.
- [ ] Update event form defaults/validation/payload behavior for split-by-division default semantics.
- [ ] Update discover/join billing logic to use selected division price/payment plan when `singleDivision=false`.
- [ ] Run targeted lint/tests and capture evidence.

## Surprises & Discoveries

- Observation: Current discover payment-plan flow always uses event-level price/installments.
  Evidence: `src/app/discover/components/EventDetailSheet.tsx` `createBillForOwner` reads `currentEvent.price` and event installments only.

## Decision Log

- Decision: Persist event-level payment-plan fields unchanged, but treat them as defaults when `singleDivision=false`.
  Rationale: This matches the requested UX and preserves compatibility for existing API consumers.
  Date/Author: 2026-02-23 / Codex

## Outcomes & Retrospective

Implementation in progress; final outcomes and validation evidence will be appended after code/test completion.

## Context and Orientation

Event form behavior is implemented in `src/app/events/[id]/schedule/components/EventForm.tsx`. API normalization and update orchestration are in `src/app/api/events/[eventId]/route.ts`. Persistence and division synchronization are in `src/server/repositories/events.ts`, backed by `prisma/schema.prisma` and migrations. Discover/join payment behavior is in `src/app/discover/components/EventDetailSheet.tsx`.

## Plan of Work

First add division-level payment-plan fields in Prisma and repository normalization/sync paths. Then propagate those fields through type mapping (`src/types/index.ts`, `src/lib/eventService.ts`) so UI and join flows can read/write them. Next update EventForm to maintain event-level defaults while editing per-division payment plans and applying defaults to newly created divisions. Finally update discover join behavior to resolve effective division pricing/payment-plan details for billing actions.

## Concrete Steps

Run from `/Users/elesesy/StudioProjects/mvp-site`:

1. Edit Prisma schema and add migration for division payment-plan columns.
2. Update route/repository/type mappings to parse/serialize new fields.
3. Update EventForm schema/state/UI/payload logic for default semantics.
4. Update discover join payment logic for selected division.
5. Run targeted lint/tests.

## Validation and Acceptance

Acceptance is met when:

1. Division detail payloads persist/load payment-plan fields (`allowPaymentPlans`, `installmentCount`, `installmentDueDates`, `installmentAmounts`).
2. In split-by-division mode, event-level price/payment-plan/max/playoff fields are editable defaults and used when adding new divisions.
3. Discover join uses selected division payment-plan and price when `singleDivision=false`.
4. Targeted test/lint commands pass.

## Idempotence and Recovery

Changes are additive and safe to rerun. Migration is additive (`ALTER TABLE ... ADD COLUMN`) and can be reapplied only once per DB; if already applied, continue with code/test steps. If local DB drift exists, use normal Prisma local reset workflow before rerunning migration commands.

## Artifacts and Notes

Validation output will be appended after implementation.

## Interfaces and Dependencies

No new external dependencies. Use existing Prisma/event form/service/repository modules only and keep compatibility with existing event payload contracts.

Revision note (2026-02-23 / Codex): Initial plan created prior to implementation for this cross-cutting feature.
