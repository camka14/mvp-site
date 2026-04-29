# Remove Event Legacy Participant Arrays

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan follows `PLANS.md` in the repository root.

## Purpose / Big Picture

The event row currently stores duplicate participant and official lists in `Events.userIds`, `Events.teamIds`, `Events.waitListIds`, `Events.freeAgentIds`, and `Events.officialIds`. The normalized tables `EventRegistrations` and `EventOfficials` already represent the same concepts with lifecycle state and richer details. After this change, event participant and official membership is stored only in normalized tables, so adding a free agent, registering a team, assigning officials, accepting invites, and declining invites cannot drift from stale event-array columns.

The visible proof is that joining as a free agent updates `EventRegistrations`, the event detail UI reloads participant data from the participants snapshot, and the Prisma `Events` model no longer contains the five legacy array fields.

## Progress

- [x] (2026-04-29 14:27-07:00) Confirmed the legacy `Events` model still contains `userIds`, `teamIds`, `waitListIds`, `freeAgentIds`, and `officialIds`, while normalized `EventRegistrations` and `EventOfficials` also exist.
- [x] (2026-04-29 14:27-07:00) Confirmed direct event-row usage remains in event list/search fallbacks, event detail hydration, notifications, compliance routes, privacy context, and the free-agent route.
- [ ] Remove the five fields from `prisma/schema.prisma` and add a migration that backfills normalized rows before dropping columns.
- [ ] Add or reuse server helpers that derive participant id groups and official id groups from `EventRegistrations` and `EventOfficials`.
- [ ] Replace server-side event-row reads and writes with derived normalized helpers while preserving compatibility response fields where needed.
- [ ] Update web event detail loading so free agents, participants, teams, and officials come from normalized snapshots.
- [ ] Update tests and generated Prisma artifacts.
- [ ] Run focused Jest tests and `npx tsc --noEmit`.

## Surprises & Discoveries

- Observation: `rg` is not available in this environment because Windows returns "Access is denied"; `git grep` and PowerShell `Select-String` are the reliable search tools for this task.
  Evidence: running `rg -n ...` failed with `Program 'rg.exe' failed to run: Access is denied`.

- Observation: Some `teamIds` and `userIds` fields must remain because they are not the legacy `Events` columns. Examples include `Divisions.teamIds`, scheduler domain types, `ChatGroup.userIds`, `UserData.teamIds`, and organization/team membership fields.
  Evidence: `git grep` found many unrelated `teamIds` and `userIds` references outside the event row model.

## Decision Log

- Decision: This plan removes only the legacy participant/officiating arrays on `Events`: `userIds`, `teamIds`, `waitListIds`, `freeAgentIds`, and `officialIds`.
  Rationale: These are the duplicated event-membership fields discussed by the user. Other similarly named fields model different relationships and should not be removed in this pass.
  Date/Author: 2026-04-29 / Codex.

- Decision: Keep API compatibility fields named `userIds`, `teamIds`, `waitListIds`, `freeAgentIds`, and `officialIds` where existing clients still expect them, but derive those fields from normalized rows.
  Rationale: Removing the database columns prevents future server code from using stale storage while avoiding a same-turn breaking change to web and mobile clients. The follow-up cleanup can replace compatibility fields with explicit `participants` and `eventOfficials` response contracts.
  Date/Author: 2026-04-29 / Codex.

## Outcomes & Retrospective

Not completed yet.

## Context and Orientation

The Prisma schema is in `prisma/schema.prisma`. The `Events` model currently has five duplicated arrays for event membership: `waitListIds`, `freeAgentIds`, `teamIds`, `userIds`, and `officialIds`. `EventRegistrations` stores participant rows with `eventId`, `registrantId`, `registrantType`, `rosterRole`, `status`, optional `eventTeamId`, and optional weekly occurrence fields. `EventOfficials` stores official rows with `eventId`, `userId`, `positionIds`, `fieldIds`, and `isActive`.

The main server helper for registration snapshots is `src/server/events/eventRegistrations.ts`. Its `buildEventParticipantSnapshot` function already returns participant arrays derived from registration rows. Event official normalization utilities live in `src/server/officials/config.ts`. Event create/update and schedule hydration live in `src/server/repositories/events.ts`, `src/app/api/events/route.ts`, and `src/app/api/events/[eventId]/route.ts`.

The web detail screen is `src/app/discover/components/EventDetailSheet.tsx`. It already uses `/api/events/:eventId/participants` for weekly events, but non-weekly free agents still read `baseEvent.freeAgentIds`; that must change because the DB column will be removed.

## Plan of Work

First, remove the five fields from `prisma/schema.prisma` and create a migration under `prisma/migrations`. The migration must insert missing normalized `EventRegistrations` rows for legacy event teams, individual participants, waitlist entries, and free agents, insert missing `EventOfficials` rows for legacy official ids, then drop the five `Events` columns. Inserts must be idempotent enough for retry by using existing row checks and `ON CONFLICT` for `EventOfficials`.

Next, add derived helper functions around `EventRegistrations` and `EventOfficials`. Participant helper output should contain the same compatibility groups clients expect: `teamIds`, `userIds`, `waitListIds`, and `freeAgentIds`. Official helper output should contain active official user ids and full official rows.

Then replace all direct Prisma selects and writes of removed event fields. Event list and search routes should call participant aggregation for attendee counts and should not select removed fields. Event detail routes should enrich responses with derived compatibility arrays. Event create/update should no longer persist participant arrays or official ids to `Events`; official assignments should persist only to `EventOfficials`, and participants should be managed through registration routes. Free-agent, waitlist, self registration, team registration, billing, notification, compliance, privacy, and delete paths should query normalized rows instead of event-row arrays.

Finally, update tests and generated Prisma code, run focused test suites, and run TypeScript checking.

## Concrete Steps

Work from `C:\Users\samue\Documents\Code\mvp-site`.

Run these commands after edits:

    npx prisma generate
    npm test -- --runInBand --runTestsByPath "src/app/api/events/__tests__/freeAgentsRoute.test.ts"
    npx tsc --noEmit

Additional targeted Jest tests should be added or run as files are touched.

## Validation and Acceptance

Acceptance requires all of these to be true:

1. `prisma/schema.prisma` no longer declares `Events.userIds`, `Events.teamIds`, `Events.waitListIds`, `Events.freeAgentIds`, or `Events.officialIds`.
2. The new migration backfills `EventRegistrations` and `EventOfficials` from legacy arrays before dropping those columns.
3. `git grep` over server code shows no Prisma event-row select, update, create, or fallback logic that reads or writes those removed columns.
4. Joining as a free agent writes/updates an `EventRegistrations` row and the event detail UI reads the participant snapshot rather than `event.freeAgentIds`.
5. Focused Jest tests and `npx tsc --noEmit` pass.

## Idempotence and Recovery

The migration uses conditional inserts and conflict handling before dropping columns. If application code fails to compile after schema generation, rerun `git grep` for the removed field names and distinguish real event-row usage from unrelated fields such as `Divisions.teamIds`, `ChatGroup.userIds`, and scheduler types.

Do not revert unrelated dirty work in this checkout. Existing changes from the free-agent event-team sync branch must remain.

## Artifacts and Notes

Initial search evidence:

    git status --short --branch
    ## codex/free-agent-event-team-sync
     M prisma/schema.prisma
     M src/app/api/events/[eventId]/free-agents/route.ts
     ...

    git grep -n -E "\b(userIds|teamIds|waitListIds|freeAgentIds|officialIds)\b" -- ':!src/generated/**'
    showed direct event-row references in event routes, repository hydration, notifications, compliance, privacy, and tests.

## Interfaces and Dependencies

`src/server/events/eventRegistrations.ts` should continue to expose `buildEventParticipantSnapshot` and `getEventParticipantAggregates`. If a new helper is added, it should accept event ids and return a `Map<string, { teamIds: string[]; userIds: string[]; waitListIds: string[]; freeAgentIds: string[] }>` derived from registration rows.

Official loading should use `EventOfficials` rows directly. Compatibility `officialIds` should be `eventOfficials.map((official) => official.userId)`.

Plan revision note, 2026-04-29: Created this plan after the user requested removing legacy event arrays from usage and from the database. The plan deliberately keeps API compatibility fields derived from normalized rows to avoid breaking existing clients while still removing stale DB storage.
