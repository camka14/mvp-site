# Document League Creation With Screenshots

This ExecPlan is a living document. Keep `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` current as work proceeds.

This document must be maintained in accordance with [PLANS.md](../PLANS.md).

## Purpose / Big Picture

BracketIQ needs the first League guide so the league section can support later guides for league management, registration, multi-week scheduling, standings, playoff seeding, and sport-specific league articles. The final guide should teach an organizer how to create and publish a league from the real web app UI.

This guide covers initial league creation only. Managing teams, weekly results, standings, schedule changes, playoffs, and split playoff divisions belong in later roadmap entries.

## Progress

- [x] 2026-05-26 Created this ExecPlan for the league creation guide.
- [x] 2026-05-26 Confirmed the next League section article should be `How to Create a League in BracketIQ`.
- [x] 2026-05-26 Completed a dry run of the real create flow with a soccer league fixture.
- [x] 2026-05-26 Captured the final screenshot sequence in `public/blog/create-league/`.
- [x] 2026-05-26 Wrote `src/content/blog/create-league-in-bracketiq.mdx` from the captured end-user workflow.
- [x] 2026-05-26 Registered the guide under the Leagues guide topic and updated roadmap/tests.
- [x] 2026-05-26 Validated with focused tests, TypeScript, and browser smoke checks.

## Surprises & Discoveries

- Observation: The local create flow needs a saved location with coordinates before submission.
  Evidence: Filling the visible Location input alone produced `Location and coordinates are required`; seeding the browser's `user-location` and `user-location-info` local storage values produced `Vancouver, WA` with coordinates in the form.

- Observation: Google Maps does not load correctly in the local screenshot browser.
  Evidence: Opening the map showed `Oops! Something went wrong. This page didn't load Google Maps correctly.`

- Observation: Single-division league schedule timeslots automatically use all selected event divisions.
  Evidence: The Schedule section disabled the division multi-select and showed `Single division is enabled, so every timeslot uses all selected event divisions.`

- Observation: Division display names are generated from gender, skill, and age selections for the standard division builder.
  Evidence: Selecting `CoEd`, `Open`, and `18+` generated `CoEd Open 18+`; the Division Name input was disabled until those selections were made.

## Decision Log

- Decision: Use an indoor soccer league as the generic League creation example.
  Rationale: The roadmap guidance says generic examples should use volleyball or soccer, and the local account has a soccer field image available for article screenshots.
  Date/Author: 2026-05-26 / Codex

- Decision: Keep this guide focused on league setup and publishing, not week-to-week league operations.
  Rationale: The roadmap separates creation from management, registration, scheduling, standings, and playoff workflows.
  Date/Author: 2026-05-26 / Codex

## Context and Orientation

Guide content lives in `src/content/blog`. Publication metadata lives in `src/lib/blog/index.ts`. Screenshots for this guide should be committed under `public/blog/create-league/`.

The league creation UI is the event schedule details editor at `src/app/events/[id]/schedule/page.tsx`, with the main form in `src/app/events/[id]/schedule/components/EventForm.tsx`.

## Fixture Event And Users

Use this living local fixture unless a future decision log entry replaces it:

- Event id: `article_create_league_soccer`
- Event name: `Thursday Indoor Soccer League`
- Event type: `LEAGUE`
- Sport: `Indoor Soccer`
- Host userName: `camka14`
- Host profile id: `3f6f5523-dbeb-4dbd-a99c-8dbe1a7b5977`
- Host auth email: `camka14@gmail.com`
- Host password for local screenshot workflow: `password`
- Planned registration model: team registration
- Planned division: `CoEd Open 18+`
- Planned capacity: `8` teams
- Planned price: free
- Planned schedule surfaces: `North Field` and `South Field`
- Planned recurring slot: Thursdays, `6:00 PM` to `9:00 PM`
- Planned league rules: one game per opponent, 45-minute matches, 5 minutes rest
- Planned standings points: win `3`, draw `1`, loss `0`

## Plan of Work

Start or reuse a current-source local dev server. Use a clean port if an existing server is stale or belongs to another project.

Sign in as the host and open:

    /events/article_create_league_soccer/schedule?create=1&mode=edit&tab=details

Seed the browser's saved location to `Vancouver, WA` so the form has coordinates without relying on the broken local Google Maps embed.

Create the league in article-sized workflow steps and capture screenshots after each relevant state:

1. Blank league create page.
2. Basic Information completed with the soccer field image, sport, name, and description.
3. Event Details completed with `League`, team size, location, registration cutoff, field count, and field names.
4. Divisions completed with league capacity, match settings, and `CoEd Open 18+`.
5. League Scoring Config completed.
6. Schedule completed with weekly Thursday fields and times.
7. Created league dashboard after saving.
8. Published league saved.
9. Participant-facing public league page.

Then write the MDX as end-user instructions. Do not mention browser automation, local URLs, fixture ids, local storage, map failures, or dry runs in the article.

## Validation and Acceptance

The work is accepted when:

- The guide is registered under the Leagues topic at `/guides/create-league-in-bracketiq`.
- The guide uses the shared author/date footer.
- The roadmap marks the create-league row as published.
- The guide nav shows the league guide under Leagues.
- Old `/blog/create-league-in-bracketiq` URLs redirect to the guide canonical route.
- Focused blog/guide/sitemap tests pass.
- `npx tsc --noEmit` passes.
- Browser verification confirms the guide route renders, images load, and the public route redirects correctly.

## Idempotence and Recovery

Re-running the browser flow should update the same fixture event id instead of creating duplicate article events. If a partial run leaves the fixture as a draft or with incomplete fields, reopen the create or edit URL and correct only this fixture.

If database repair is unavoidable, update only `article_create_league_soccer` and record the repair here.

## Outcomes & Retrospective

- The new guide is registered at `/guides/create-league-in-bracketiq` under the Leagues guide topic.
- The article uses an indoor soccer league example and the soccer field image selected from the local account.
- The fixture league `article_create_league_soccer` was created and published for the screenshot sequence.
- The public-page screenshot uses the authenticated participant-facing details view because `/events/[id]` currently routes through the schedule page and redirects unauthenticated visitors to login.
- Focused Jest tests, `npx tsc --noEmit`, desktop/mobile guide rendering, image loading, and old blog URL redirect checks passed.

## Artifacts and Notes

Planned guide slug:

    /guides/create-league-in-bracketiq

Planned screenshot paths:

    public/blog/create-league/01-create-league-entry.png
    public/blog/create-league/02-basic-information-complete.png
    public/blog/create-league/03-league-details-complete.png
    public/blog/create-league/04-division-and-league-settings.png
    public/blog/create-league/05-scoring-config-complete.png
    public/blog/create-league/06-weekly-schedule-complete.png
    public/blog/create-league/07-created-league-dashboard.png
    public/blog/create-league/08-published-league-saved.png
    public/blog/create-league/09-public-league-page.png
