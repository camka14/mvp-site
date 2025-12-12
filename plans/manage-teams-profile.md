# Move team management into profile

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Reference: maintain this plan in accordance with `PLANS.md` in the repository root.

## Purpose / Big Picture

Move the existing team management experience from its dedicated `/teams` page into the user profile so players can review teams, accept invites, create teams, and invite players without leaving their account hub. The navigation bar will no longer link to `/teams`; instead the same functionality will appear inside the profile page using a reusable `ManageTeams` component (with the invite modal available alongside it) while keeping the `/teams` route functional for direct links.

## Progress

- [x] (2025-12-09 18:59Z) Drafted ExecPlan to relocate team management into the profile page and remove the nav entry.
- [x] (2025-12-09 19:05Z) Refactored `src/app/teams/page.tsx` into a reusable `ManageTeams` component with navigation/container toggles and kept the default `/teams` wrapper.
- [x] (2025-12-09 19:06Z) Removed the `My Teams` nav item and embedded `ManageTeams` into the profile page inside a bordered section with a Suspense fallback.
- [ ] (2025-12-09 19:14Z) Validation in progress (completed: `npm test -- --runInBand src/lib/__tests__/teamService.test.ts`; remaining: full suite/manual `/profile` and `/teams` smoke checks; full-suite runs timed out at 120s/240s in this environment).

## Surprises & Discoveries

- Observation: Full `npm test -- --runInBand` runs exceeded 4 minutes and hit timeouts despite individual suites reporting passes.
  Evidence: Two runs timed out at 120s and 240s while emitting PASS logs; a targeted `teamService` suite completed successfully.

## Decision Log

- Decision: Expose `ManageTeams` from `src/app/teams/page.tsx` with `showNavigation`/`withContainer` props and keep a default wrapper for the `/teams` route.
  Rationale: Enables reuse inside the profile without duplicating navigation while preserving the standalone route behavior.
  Date/Author: 2025-12-09 / Codex

- Decision: Embed `ManageTeams` in `src/app/profile/page.tsx` within a `Paper` wrapper and `Suspense` fallback while removing the `My Teams` nav item.
  Rationale: Aligns styling with existing profile sections, keeps loading UX for search-param-driven flows, and removes the now-obsolete nav link.
  Date/Author: 2025-12-09 / Codex

## Outcomes & Retrospective

To be completed after implementation and validation.

## Context and Orientation

The current `/teams` route is implemented in `src/app/teams/page.tsx` as a client component that renders `<Navigation />` followed by the full team management UI. It loads teams and invitations for the signed-in user via `teamService`, enriches teams with players, and shows `CreateTeamModal`, `TeamDetailModal`, and `InvitePlayersModal` within the page. It also reads an `event` search param to invite free agents from an event context. `src/app/teams/components/InvitePlayersModal.tsx` contains the invite workflow (search users via `userService`, send invites via `teamService`). The profile page (`src/app/profile/page.tsx`) already renders `<Navigation />` and user account sections but currently has no team management controls. The global nav is defined in `src/components/layout/Navigation.tsx` where `baseNav` includes a `My Teams` link pointing to `/teams`.

## Plan of Work

Refactor `src/app/teams/page.tsx` so the team management UI is exposed as a reusable `ManageTeams` component. The component should accept a prop to control whether it renders its own `<Navigation />` and outer container padding so it can embed cleanly inside the profile page while still supporting the standalone `/teams` route. Keep the existing data loading (user auth checks, team/invitation fetch, event context) and modals intact inside the component.

Adjust `Navigation.tsx` to drop the `My Teams` entry from `baseNav`, ensuring guests and signed-in users no longer see that link.

Update `src/app/profile/page.tsx` to render the `ManageTeams` component (imported from the teams page) within the profile layout, alongside the existing account sections. Ensure `InvitePlayersModal` continues to function via the embedded component. If layout nesting would double containers, wrap `ManageTeams` appropriately and use the new props to avoid duplicate navigation or padding.

## Concrete Steps

Work from the repository root `mvp-site`.

1) Refactor `src/app/teams/page.tsx` to define and export a `ManageTeams` component that contains the existing logic and UI. Add props like `showNavigation?: boolean` and/or `withContainer?: boolean` to control layout; default to the current full-page experience. Keep a default export that renders `<ManageTeams showNavigation withContainer />` for the `/teams` route.
2) Update `src/components/layout/Navigation.tsx` by removing the `My Teams` nav item from `baseNav`.
3) Import and render `ManageTeams` inside `src/app/profile/page.tsx`, using props to avoid double navigation and to blend with the profile container. Place it in a sensible spot (e.g., within the existing profile container as a new "Team Management" section). Confirm modals (create team, invite players, team detail) still work when embedded.
4) Run checks: `npm test -- --runInBand` (or a targeted subset if tests are slow) and perform a manual smoke test: visit `/profile` as an authenticated user, verify the team management section shows teams/invitations and allows creating teams and inviting players; optionally visit `/teams` directly to confirm the route still renders.

## Validation and Acceptance

Acceptance requires the profile page to show the full team management UI (teams list, invitations, create/invite flows) without a separate `My Teams` navigation link. The embedded `InvitePlayersModal` must open and send invites. The `/teams` route should continue to render via the same component when navigated directly. Manual checks on `/profile` and `/teams` should succeed without console errors, and automated tests (or the agreed subset) should pass.

## Idempotence and Recovery

Edits are code-only and can be reapplied safely. If embedding causes layout regressions, revert the profile integration or toggle the layout props on `ManageTeams`, then re-run tests. Version control can restore the previous nav link if needed.

## Artifacts and Notes

None yet.

## Interfaces and Dependencies

Expose `ManageTeams` from `src/app/teams/page.tsx` (or an adjacent component) with props such as `showNavigation?: boolean` and `withContainer?: boolean` to control layout when embedded. It relies on `useApp` for authentication, `teamService` for team data, `userService` for member lookups, and Mantine UI components. `InvitePlayersModal` remains under `src/app/teams/components/InvitePlayersModal.tsx` and is used inside `ManageTeams` to send invites.

Update 2025-12-09: Recorded completion of the component refactor, nav removal, and profile integration steps; validation remains outstanding.
Update 2025-12-09 19:14Z: Captured partial validation (targeted teamService test) and noted full-suite timeouts; manual checks still pending.
