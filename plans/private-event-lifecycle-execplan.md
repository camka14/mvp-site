# Add private event lifecycle support on web and backend

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with [PLANS.md](/Users/elesesy/StudioProjects/mvp-site/PLANS.md).

## Purpose / Big Picture

After this change, event managers can mark events as `Private` in addition to `Draft` and `Published`. Private events stay hidden from public event discovery the same way draft events do, but event cards and event editing surfaces show a blue `Private` label instead of the existing red `Draft` label. The observable proof is that a host can save an event with `state = PRIVATE`, see the blue label in web UI, and confirm that anonymous discovery endpoints do not return that event while the host can still fetch it.

## Progress

- [x] (2026-04-06 21:06Z) Inspected Prisma event state enum, web event type definitions, event listing/search visibility clauses, event detail route access checks, and event scheduling page lifecycle controls.
- [x] (2026-04-06 21:21Z) Implemented the backend contract for `PRIVATE` in Prisma, event normalization, API route visibility, and restricted-event detail access control.
- [x] (2026-04-06 21:21Z) Implemented the web lifecycle selector and event-card badge updates for `PRIVATE`.
- [x] (2026-04-06 21:21Z) Added focused Jest coverage for visibility and lifecycle conversion, ran the targeted test paths, and confirmed they pass.

## Surprises & Discoveries

- Observation: The backend does not use a single “hidden event” helper. List/search/detail/weekly-session access each hardcode `UNPUBLISHED`.
  Evidence: `src/app/api/events/route.ts`, `src/app/api/events/search/route.ts`, `src/app/api/events/[eventId]/route.ts`, `src/app/api/events/[eventId]/participants/route.ts`, and `src/app/api/events/[eventId]/weekly-sessions/route.ts` each contain separate state checks.
- Observation: The frontend lifecycle model already has a translation layer where `DRAFT` maps back to `UNPUBLISHED` for persistence.
  Evidence: `src/app/events/[id]/schedule/page.tsx` uses `EventLifecycleStatus = 'DRAFT' | 'PUBLISHED'` and saves `DRAFT` as `UNPUBLISHED`.
- Observation: `npx prisma generate` updated the checked-in client output, but it did not refresh `prisma/schema.generated.prisma`.
  Evidence: after generation, `src/generated/prisma/enums.ts` contained `PRIVATE` while `prisma/schema.generated.prisma` still only listed `PUBLISHED` and `UNPUBLISHED`, so the snapshot required a manual sync edit.

## Decision Log

- Decision: Persist `PRIVATE` as a first-class `EventsStateEnum` value instead of aliasing it to `UNPUBLISHED`.
  Rationale: The user explicitly wants a third option “besides draft and published,” which requires preserving the distinction for future reads, badges, and edits.
  Date/Author: 2026-04-06 / Codex
- Decision: Keep `DRAFT` as a UI/backward-compatibility alias for `UNPUBLISHED`, but teach all server visibility checks to treat both `UNPUBLISHED` and `PRIVATE` as non-public.
  Rationale: Existing data and tests already rely on `UNPUBLISHED` and some UI code still emits `DRAFT`; changing both semantics at once would create needless migration risk.
  Date/Author: 2026-04-06 / Codex

## Outcomes & Retrospective

`PRIVATE` is now a first-class event state in the Prisma schema, generated client, TypeScript event types, API normalization, discovery visibility rules, detail-route access control, and the schedule-page lifecycle selector. Web event cards now render a blue `Private` badge while draft-like states keep the red `Draft` badge. Focused validation passed with:

    cd /Users/elesesy/StudioProjects/mvp-site
    npm test -- --runTestsByPath src/app/api/events/__tests__/templatePrivacyRoutes.test.ts src/app/events/[id]/schedule/__tests__/page.test.tsx src/lib/__tests__/eventService.test.ts

The remaining risk is outside the focused scope: there are other pre-existing modified files in the repository unrelated to this feature, so any broader integration or commit step should carefully avoid bundling unrelated work.

## Context and Orientation

`mvp-site` is the source of truth for backend event contracts. Event persistence is defined in `prisma/schema.prisma`, where `EventsStateEnum` currently contains `PUBLISHED`, `UNPUBLISHED`, and `TEMPLATE`. Shared web types live in `src/types/index.ts`, and API response normalization for events lives in `src/lib/eventService.ts`.

Public event listing and searching happen through `src/app/api/events/route.ts` and `src/app/api/events/search/route.ts`. Both files build explicit visibility clauses: anonymous users can only see `PUBLISHED` or `null` state events, while admins or managing hosts can also see `UNPUBLISHED`. Event detail reads live in `src/app/api/events/[eventId]/route.ts`; that route only protects `TEMPLATE` today, so private-event access must be added there. Weekly-session creation and participant writes also gate on `UNPUBLISHED` in `src/app/api/events/[eventId]/weekly-sessions/route.ts` and `src/app/api/events/[eventId]/participants/route.ts`.

The main lifecycle UI is in `src/app/events/[id]/schedule/page.tsx`. It defines a local `EventLifecycleStatus` union and converts between UI options and stored event `state`. Event discovery cards render their lifecycle badge in `src/components/ui/EventCard.tsx`; draft badges are currently red and are only shown for `UNPUBLISHED` or `DRAFT`.

## Plan of Work

First, extend the persistence contract. Add `PRIVATE` to `EventsStateEnum` in `prisma/schema.prisma`, generate or hand-author the matching migration in `prisma/migrations`, and update any generated or checked-in enum artifacts that this repository expects to remain in sync. Expand `EventState` in `src/types/index.ts` and the event normalization allowlist in `src/lib/eventService.ts` so incoming `PRIVATE` values survive round-trips.

Next, update server visibility behavior. In `src/app/api/events/route.ts` and `src/app/api/events/search/route.ts`, treat `PRIVATE` as hidden for anonymous users and as visible for admins or managers/hosts in the same places where `UNPUBLISHED` is currently allowed. When a caller explicitly requests a hidden state, allow both `UNPUBLISHED` and `PRIVATE` only to the appropriate manager/admin audience. In `src/app/api/events/[eventId]/route.ts`, deny reads of private events to non-managers the same way templates are denied today, while preserving manager/host access. Apply the same hidden-state guard to weekly-session and participant routes so child-event creation cannot be driven from a private parent by unauthorized users.

Then update the web UI. In `src/app/events/[id]/schedule/page.tsx`, expand the lifecycle selector from two options to three and preserve `PRIVATE` when loading or saving an event. `DRAFT` should still save as `UNPUBLISHED`; `PRIVATE` should save as `PRIVATE`; `PUBLISHED` should save as `PUBLISHED`. In `src/components/ui/EventCard.tsx`, replace the single draft boolean with a lifecycle badge model that renders `Draft` in red for `UNPUBLISHED`/`DRAFT` and `Private` in blue for `PRIVATE`.

Finally, update tests. Add or adjust backend route tests in `src/app/api/events/__tests__/templatePrivacyRoutes.test.ts` so the visibility clauses include `PRIVATE` for authorized viewers and exclude it for public discovery. Add schedule-page tests in `src/app/events/[id]/schedule/__tests__/page.test.tsx` that assert the selector round-trips `PRIVATE` and that saves emit `state: 'PRIVATE'`.

## Concrete Steps

From `/Users/elesesy/StudioProjects/mvp-site`, apply the contract and UI edits in this order:

1. Edit `prisma/schema.prisma`, `src/types/index.ts`, and `src/lib/eventService.ts`.
2. Edit `src/app/api/events/route.ts`, `src/app/api/events/search/route.ts`, `src/app/api/events/[eventId]/route.ts`, `src/app/api/events/[eventId]/participants/route.ts`, and `src/app/api/events/[eventId]/weekly-sessions/route.ts`.
3. Edit `src/app/events/[id]/schedule/page.tsx` and `src/components/ui/EventCard.tsx`.
4. Edit the affected Jest tests.

Run these commands after the code changes:

    cd /Users/elesesy/StudioProjects/mvp-site
    npm test -- --runTestsByPath src/app/api/events/__tests__/templatePrivacyRoutes.test.ts src/app/events/[id]/schedule/__tests__/page.test.tsx src/lib/__tests__/eventService.test.ts

If Prisma schema changes require an updated migration or generated enum artifact, run the repository’s Prisma workflow that is already in use here and keep the generated files in sync before re-running the tests.

## Validation and Acceptance

Acceptance on web/backend means all of the following are true:

1. A saved event can persist `state = 'PRIVATE'` and later reload with the same value.
2. Anonymous `GET /api/events` and `POST /api/events/search` requests do not include private events.
3. A host or authorized organization manager can still fetch private events they manage.
4. The schedule page lifecycle selector shows `Draft`, `Private`, and `Published`, and saving `Private` sends `state: 'PRIVATE'`.
5. Event cards render a blue `Private` badge for private events and keep the existing red `Draft` badge for draft-like events.

Focused tests should pass, and the new assertions should fail against the pre-change code because `PRIVATE` is currently rejected or ignored.

## Idempotence and Recovery

Most edits are additive and can be reapplied safely. The risky step is the Prisma enum migration: if the migration name or SQL is wrong, correct the migration file before re-running tests instead of creating duplicate migrations for the same enum change. If a partially applied visibility change breaks access, use the updated tests to identify which route still only checks `UNPUBLISHED`.

## Artifacts and Notes

Key current-state references:

    prisma/schema.prisma
    src/app/api/events/route.ts
    src/app/api/events/search/route.ts
    src/app/api/events/[eventId]/route.ts
    src/app/events/[id]/schedule/page.tsx
    src/components/ui/EventCard.tsx

## Interfaces and Dependencies

At the end of this work, the following interfaces must exist and agree:

- `EventsStateEnum` in `prisma/schema.prisma` must include `PRIVATE`.
- `EventState` in `src/types/index.ts` must include `PRIVATE`.
- `EventService.normalizeEventState` in `src/lib/eventService.ts` must accept `PRIVATE` without collapsing it to `PUBLISHED`.
- The lifecycle selector in `src/app/events/[id]/schedule/page.tsx` must map:
  `DRAFT -> UNPUBLISHED`
  `PRIVATE -> PRIVATE`
  `PUBLISHED -> PUBLISHED`
- The default discovery visibility builders in `src/app/api/events/route.ts` and `src/app/api/events/search/route.ts` must treat `PRIVATE` like `UNPUBLISHED` for authorization.

Revision note: updated this plan on 2026-04-06 after implementation and focused Jest validation so the recorded progress, discoveries, and outcomes match the landed code.
