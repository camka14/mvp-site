# Minor Privacy, Parent Visibility, and Team Chat Sync

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document follows `/Users/elesesy/StudioProjects/mvp-site/PLANS.md`.

## Purpose / Big Picture

After this change, minors are masked by default across web/mobile data surfaces, social actions to minors are blocked, and team invite/free-agent flows expose minors only in approved manager/parent-child contexts. Team chat groups are automatically created/updated/deleted from team lifecycle changes using UUID chat IDs, chat names synced to team names, and stable `chat.teamId` linkage.

## Progress

- [x] (2026-03-15 18:42Z) Audited existing routes/services for users, teams, invites, events, chat groups, and frontend team invite flow.
- [ ] Implement backend privacy resolver, context-aware visibility rules, and social/minor action guards.
- [ ] Implement `/api/teams/:id/invite-free-agents` with manager + parent-child exceptions.
- [ ] Implement team chat sync service and wire into team create/update/delete + invite accept.
- [ ] Update web UI/team flows for `Name Hidden`, action blocking, and team-scoped free-agent sourcing.
- [ ] Add/adjust backend + web tests.

## Surprises & Discoveries

- Observation: Existing web team invite UI still depends on navigation-passed event context and uses ad-hoc free-agent merges in UI state.
  Evidence: `src/app/teams/page.tsx` + `src/components/ui/TeamDetailModal.tsx` reads `event` query params and uses `eventFreeAgents` props.

## Decision Log

- Decision: Keep generic `/api/users?query=` minor-filtered for everyone, including parents and managers.
  Rationale: User requirement explicitly keeps search minor-filtered and only allows context exceptions in team/event free-agent flows.
  Date/Author: 2026-03-15 / Codex

## Outcomes & Retrospective

Pending implementation.

## Context and Orientation

`src/app/api/users/route.ts` and `src/app/api/users/[id]/route.ts` are the primary profile read surfaces. `src/server/socialGraph.ts` powers friend/follow endpoints. Team lifecycle routes are in `src/app/api/teams/route.ts`, `src/app/api/teams/[id]/route.ts`, and `src/app/api/invites/[id]/accept/route.ts`. Chat groups are in `src/app/api/chat/groups/*`. Team invite UI is in `src/app/teams/page.tsx` and `src/components/ui/TeamDetailModal.tsx`.

## Plan of Work

Implement a shared server visibility module that computes `isMinor`, `isIdentityHidden`, and `displayName` (`"Name Hidden"` when hidden), with parent-child context exceptions. Apply this module to user read/search routes and social-action restrictions. Add a team free-agent route that resolves current team events and returns visibility-filtered user payloads, with manager/parent exceptions. Add team chat sync service to maintain `ChatGroup` rows tied by `teamId`, synced on team create/update/delete and invite accept. Update team/web invite UI to fetch free agents from the new team endpoint instead of route context.

## Concrete Steps

Run from `/Users/elesesy/StudioProjects/mvp-site`:

    npm test -- src/app/api/users/__tests__/usersRoute.test.ts src/app/api/users/__tests__/userByIdRoute.test.ts src/server/__tests__/socialGraph.test.ts src/app/api/invites/__tests__/acceptInviteRoute.test.ts src/app/api/teams/[id]/__tests__/teamByIdRoute.test.ts

    npm run test:ci

## Validation and Acceptance

- Search (`/api/users?query=`) excludes minors.
- Hidden/minor records return `displayName="Name Hidden"` and `isIdentityHidden=true`.
- Parent can see own linked child globally and sees names in team/event contexts where linked child is on that team.
- Team managers can see minors in `/api/teams/:id/invite-free-agents` output.
- Team chat rows are created/updated/deleted with UUID IDs, team name sync, and `teamId` linkage.

## Idempotence and Recovery

Changes are additive. New route/service logic is stateless and safe to re-run. Prisma migration is forward-only; if migration fails, fix SQL and rerun migration before restarting API.

## Artifacts and Notes

Will append test outputs and migration evidence after implementation.

## Interfaces and Dependencies

Use existing Next.js route handlers, Prisma client (`src/lib/prisma.ts`), and server utility modules under `src/server/*`. Team chat sync should not change client API contracts beyond adding optional fields (`isMinor`, `isIdentityHidden`, `displayName`) and introducing `/api/teams/:id/invite-free-agents`.

Plan update note: Initial execution plan created before implementation to satisfy PLANS.md process for this cross-cutting feature.
