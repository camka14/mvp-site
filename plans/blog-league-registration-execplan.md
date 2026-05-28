# League Registration Guide

## Goal

Create the BracketIQ guide `How to Set Up League Registration for Teams and Players` as the next unpublished League guide.

## Scope

- Use an indoor soccer league as the generic sport example.
- Show the organizer workflow for confirming team registration settings, division price and capacity, public registration details, captain team selection, free-agent visibility, and organizer participant review.
- Keep this guide focused on registration setup and monitoring, not weekly scheduling, standings, or playoffs.
- Capture screenshots from the rendered local app.
- Register the guide under `/guides/league-registration`.
- Update the roadmap and focused tests.

## Workflow

1. Seed or reuse a local paid indoor soccer league registration fixture.
2. Capture the guide steps from the rendered app.
3. Write the end-user instructions against those screenshots.
4. Add blog registry metadata, guide nav order, sitemap expectations, and roadmap status.
5. Run focused blog/guide tests, typecheck, and a rendered route smoke test.

## Progress

- [x] 2026-05-28 Started the plan and selected `How to Set Up League Registration for Teams and Players` from the League roadmap.
- [x] 2026-05-28 Seeded a paid indoor soccer league fixture with team registration, one CoEd Open 18+ division, three registered teams, and a captain-managed team for public registration checks.
- [x] 2026-05-28 Captured guide screenshots for league settings, division price/capacity, public registration, captain team selection, and organizer participant review.
- [x] 2026-05-28 Wrote the end-user guide text and registered `/guides/league-registration` in the blog registry, guide nav order, sitemap expectations, tests, and roadmap.
- [x] 2026-05-28 Verified focused blog/guide tests, TypeScript, and rendered `/guides/league-registration` on desktop and mobile viewports.

## Discoveries

- Public event pages need a short hydration wait before screenshot capture; host and participant counts can briefly render placeholder state before the event detail fetch completes.
- The local event time-slot fixture uses Monday-indexed `dayOfWeek` values, so Thursday is `3` in the saved schedule row.
