# Teams Rename and Expanded Team Staff Roles

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document is maintained in accordance with `PLANS.md`.

## Purpose / Big Picture

After this change, team data and APIs use the name `Teams` instead of `VolleyBallTeams` in application code, and each team explicitly supports `manager`, `headCoach`, and `assistantCoaches` roles. Team creation auto-assigns the creator as manager and captain. Team managers/captains can invite players and team staff roles from team detail/edit surfaces. The behavior is visible in the team create/edit UI and `/api/teams` + `/api/invites` API responses.

## Progress

- [x] (2026-02-20 00:00Z) Audited backend references to `VolleyBallTeams`, `/api/teams`, and invite flow touchpoints.
- [x] (2026-02-20 00:00Z) Applied Prisma/application rename to `Teams` with database table mapping compatibility (`@@map("VolleyBallTeams")`) and regenerated Prisma client.
- [x] (2026-02-20 00:00Z) Added `headCoachId` role field and wired create/update defaults; preserved `coachIds` storage with API alias `assistantCoachIds`.
- [x] (2026-02-20 00:00Z) Extended team invite API/service logic to support role invites (`team_manager`, `team_head_coach`, `team_assistant_coach`) and role assignment on invite acceptance.
- [x] (2026-02-20 00:00Z) Updated web team details/edit UI to invite/manage manager/head coach/assistant coaches and show pending role invites.
- [x] (2026-02-20 00:00Z) Ran targeted web tests (`inviteRoutes`, `teamService`, `inviteEmails`, `fileRoutes`) and `npx tsc --noEmit`.
- [ ] Run broader API regression suite covering all team/event route paths in this dirty branch.

## Surprises & Discoveries

- Observation: The database table name is used in historical migrations, but app behavior can be safely renamed by using Prisma model/table mapping.
  Evidence: `prisma/migrations/*` SQL references `"VolleyBallTeams"` while route code now uses `prisma.teams`.

- Observation: Existing invite route tests assumed player invites without `teamId` are valid and mocked Prisma without `teams` delegate.
  Evidence: `src/app/api/invites/__tests__/inviteRoutes.test.ts` initially failed with HTTP 400 and missing delegate access, then passed after compatibility fallback logic was added.

## Decision Log

- Decision: Keep the physical table name unchanged for now and rename only Prisma model/API symbols to `Teams`.
  Rationale: Avoids risky production table rename while delivering required app-level rename and behavior changes.
  Date/Author: 2026-02-20 / Codex

- Decision: Keep `coachIds` as persistence field and expose `assistantCoachIds` as an API/client alias.
  Rationale: Preserves backward compatibility with existing payloads and mobile/web code paths while adopting the new role naming.
  Date/Author: 2026-02-20 / Codex

## Outcomes & Retrospective

The web/backend implementation now supports explicit team staff roles and role-specific invites while preserving compatibility for legacy fields and existing invite tests. Prisma has been regenerated with the `Teams` model and new `headCoachId` field. A broader suite run is still pending due large existing branch churn, but targeted route/service tests and type-checking passed.

## Context and Orientation

Team create/update and invite behavior are implemented in:

- `src/app/api/teams/route.ts`
- `src/app/api/teams/[id]/route.ts`
- `src/app/api/invites/route.ts`
- `src/app/api/invites/[id]/route.ts`
- `src/app/api/invites/[id]/accept/route.ts`
- `src/lib/teamService.ts`
- `src/components/ui/TeamDetailModal.tsx`
- `src/app/teams/page.tsx`

Prisma source-of-truth team model is in `prisma/schema.prisma`.

## Plan of Work

Rename Prisma model to `Teams` while preserving table mapping. Add explicit head coach role and assistant coach API aliasing over legacy coach storage. Update create/update validation and normalization in team routes. Extend invite APIs/services to permit role-specific invite types and role assignment on acceptance. Update team details/edit UI so managers/captains can invite role members similarly to players.

## Concrete Steps

From `mvp-site`:

1. Update `prisma/schema.prisma` model name/fields and regenerate Prisma client.
2. Update backend routes/services/tests to use renamed Prisma delegate and role fields.
3. Update team detail/edit UI and type definitions to show and invite team roles.
4. Run targeted tests and type-check.

## Validation and Acceptance

Executed:

- `npm run test -- src/app/api/invites/__tests__/inviteRoutes.test.ts`
- `npm run test -- src/lib/__tests__/teamService.test.ts`
- `npm run test -- src/server/__tests__/inviteEmails.test.ts`
- `npm run test -- src/app/api/files/__tests__/fileRoutes.test.ts`
- `npx tsc --noEmit`

Acceptance achieved for implemented scope:

- Creating a team returns creator as `captainId` and `managerId`.
- Team payload includes `headCoachId` and `assistantCoachIds` (with `coachIds` alias).
- Managers/captains can send role invites and accept flow assigns the invited role.
- Team detail/edit shows current role assignments and pending role invites.

## Idempotence and Recovery

The schema rename is non-destructive by using table mapping. If route changes fail, revert only modified files and regenerate Prisma client. Invite logic updates are retry-safe because pending lists and invite rows are deduplicated before insert.

## Artifacts and Notes

Artifacts captured via test transcripts in this run:

- `inviteRoutes.test.ts` initially failed under stricter teamId assumptions, then passed after compatibility fixes.
- `teamService.test.ts` expectation updated by preserving legacy 2-arg call for player invites.

## Interfaces and Dependencies

- Prisma model: `Teams` mapped to existing table `VolleyBallTeams`.
- Team API shape adds optional `headCoachId: string | null` and `assistantCoachIds: string[]` while preserving `coachIds` alias.
- Invite type expansion adds `team_manager`, `team_head_coach`, and `team_assistant_coach` while preserving existing `player` behavior.

Plan update note: Updated after implementation to reflect shipped backend/web changes, test evidence, and remaining broader regression pass.
