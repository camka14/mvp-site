# How to Run a Tournament With Pool Play Guide ExecPlan

This plan is a living document. Update it as the guide, screenshots, fixture, and validation evolve.

## Purpose

Create a BracketIQ Guide for running a tournament with pool play. The guide should teach an organizer how to configure pool play, review pools, manage pool schedules, enter results, inspect standings, and move qualified teams into the playoff bracket.

## Scope

- Publish a guide under `/guides/tournament-pool-play`.
- Use an indoor soccer tournament example so the guide stays generic for recreational sports.
- Capture real screenshots from the local BracketIQ app.
- Keep this guide focused on pool play. Link to existing tournament creation and tournament management guides for broader setup and management.

## Process

- Plan one workflow step.
- Perform that step in BracketIQ.
- Capture the screenshot for the step.
- Write the article language as end-user instructions for that step.
- Continue to the next step only after the previous step is grounded in the product UI.

## Fixture

- Host account: `camka14@gmail.com`
- Host username: `camka14`
- Working event id: `article_tournament_pool_play_soccer`
- Event name: `Sunday Indoor Soccer Pool Play Tournament`
- Sport: Indoor Soccer
- Event type: Tournament
- Divisions: CoEd Open 18+ bracket with generated Pool A and Pool B
- Intended format: 8 teams, 2 pools, 4 teams per pool, 4 teams advancing to bracket

## Planned Screenshots

1. Details tab showing tournament pool-play settings.
2. Division card or setup summary showing bracket teams, pool count, and pool team count.
3. Participants tab showing teams distributed into pools.
4. Schedule tab with the pool filter and pool matches.
5. Standings tab with pool standings and the pool selector.
6. Confirm Results flow after pool standings are reviewed.
7. Bracket tab showing the playoff bracket after pool advancement.

## Decisions

- Use `/guides/tournament-pool-play` as the canonical path because it is short, descriptive, and matches the roadmap anchor.
- Keep sport-specific operational advice out of this guide. Volleyball, pickleball, and soccer-specific logistics can depend on this guide later.

## Validation

- Focused blog and sitemap tests pass.
- TypeScript check passes.
- Browser verification confirms `/guides/tournament-pool-play`, `/guides`, and `/blog/tournament-pool-play` route behavior.

## Progress

- 2026-05-25: Started the plan and confirmed pool-play controls exist in the tournament details, schedule, standings, and bracket surfaces.
- 2026-05-25: Captured guide screenshots for pool configuration, day schedule, confirmed standings, and seeded bracket from the fixture tournament.
- 2026-05-25: Confirmed both pools before capturing the seeded bracket so the bracket showed actual advancing teams instead of placeholders.
- 2026-05-25: Replaced the schedule screenshot with Agenda view to match the article screenshot standard.
