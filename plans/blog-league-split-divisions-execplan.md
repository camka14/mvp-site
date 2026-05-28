# League Split Divisions Guide

## Goal

Create the BracketIQ guide `How to Run a League With Separate Regular Season and Playoff Divisions` as the next League guide after league playoffs and standings/seeding.

## Scope

- Use an indoor soccer league as the generic sport example.
- Show a league with regular-season divisions that feed separate playoff divisions, such as Gold and Silver.
- Show the real BracketIQ workflow for configuring split league/playoff divisions, mapping standings positions into playoff divisions, reviewing participants, checking Agenda view, confirming standings, verifying seeded playoff brackets, and checking the public bracket.
- Use Agenda view for schedule screenshots.
- Register the guide under `/guides/league-split-divisions`.
- Update the roadmap and focused tests.

## Workflow

1. Seed a local split-division article fixture with East/West regular-season divisions and Gold/Silver playoff divisions.
2. Capture the guide steps from the rendered app.
3. Write the end-user instructions against those screenshots.
4. Add blog registry metadata, guide nav order, sitemap expectations, and roadmap status.
5. Run focused blog/guide tests, typecheck, and a rendered route smoke test.

## Progress

- [x] 2026-05-27 Created the split-division indoor soccer fixture `article_league_split_playoffs_soccer`.
- [x] 2026-05-27 Added active team registrations to the fixture so the current Divisions tab renders the assigned team columns.
- [x] 2026-05-27 Captured six screenshots in `public/blog/league-split-divisions/` from the rendered local app.
- [x] 2026-05-27 Wrote the guide body, registered `/guides/league-split-divisions`, and updated the roadmap.

## Discoveries

- The refreshed Divisions tab reads active `EventRegistrations`, not only team IDs on the event or division records. The fixture needed active team registration rows for the participant/team columns to show the six teams.
- The Silver playoff side in this fixture is a single match, so it is clearest in Agenda view rather than the connected Bracket tab. The guide uses Agenda view to verify Silver and the Bracket tab to verify the connected Gold bracket.
- The Browser plugin connected successfully, but the authenticated fixture screenshot path used shell Playwright because it can set the exact host and participant auth cookies for isolated contexts.
