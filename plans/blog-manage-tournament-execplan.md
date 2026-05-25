# Document Tournament Management With Screenshots

This ExecPlan is a living document. Keep `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` current as work proceeds.

This document must be maintained in accordance with [PLANS.md](../PLANS.md).

## Purpose / Big Picture

BracketIQ needs a follow-up guide that teaches an organizer how to manage a tournament after it has been created and published. The article should help a real tournament host review registrations, confirm teams, use the schedule and bracket views, update results, and verify the public page. The finished article should be based on real local BracketIQ screens and should read as end-user instructions, not as a description of the screenshot capture process.

This plan covers tournament management only. The already published creation guide explains how to create and publish the event. Pool play, check-in, real-time schedule updates, and detailed results/advancement workflows belong in separate roadmap articles.

## Progress

- [x] 2026-05-24 Created this ExecPlan for the tournament management article.
- [x] 2026-05-24 Confirmed the existing indoor soccer tournament fixture is published and has teams, registrations, and matches.
- [x] 2026-05-24 Repaired only the fixture teams and registrations so the management screenshots show active registered teams instead of cancelled placeholder registrations.
- [x] 2026-05-24 Added fixture-only parent team ids after confirming the UI filters tournament placeholders by empty `parentTeamId`.
- [x] 2026-05-24 Assigned only the fixture's first-round matches to the registered team ids so the schedule and bracket show team names.
- [x] 2026-05-24 Captured the article screenshot sequence from the real local UI in `public/blog/manage-tournament/`.
- [x] 2026-05-24 Wrote `src/content/blog/manage-tournament-in-bracketiq.mdx` in end-user language from the captured workflow.
- [x] 2026-05-24 Updated the blog registry, roadmap, tests, sitemap expectations, and the creation article's next-step link.
- [x] 2026-05-24 Validated with focused tests, TypeScript, and browser checks for `/blog` and `/blog/manage-tournament-in-bracketiq`.
- [x] 2026-05-25 Replaced the schedule screenshot with Agenda view to match the article screenshot standard.

## Surprises & Discoveries

- Observation: The existing `article_tournament_create_soccer` fixture is already suitable for a management article.
  Evidence: A Prisma query on 2026-05-24 returned state `PUBLISHED`, event type `TOURNAMENT`, 16 teams, 16 registrations, and 15 matches.

- Observation: The fixture teams were generated as bracket placeholders and their team registrations were cancelled, so the Participants tab showed zero teams even though the database had 16 event team rows.
  Evidence: The Participants tab displayed "0 teams are currently participating"; a Prisma query showed all 16 event registrations had status `CANCELLED` and all 16 teams had kind `PLACEHOLDER`.

- Observation: For league and tournament participants, the UI also treats teams without `parentTeamId` as placeholders.
  Evidence: `src/app/events/[id]/schedule/page.tsx` defines `isPlaceholderParticipantTeam` to return true when a league or tournament team has no non-empty `parentTeamId`; after the first repair the Participants tab still displayed zero teams.

- Observation: The existing tournament matches had bracket seeds but no `team1Id` or `team2Id`, so schedule cards rendered as TBD Team vs TBD Team.
  Evidence: The Schedule tab showed match cards with "TBD Team vs TBD Team"; a Prisma query showed first-round matches with `team1Seed` and `team2Seed` populated but `team1Id` and `team2Id` null.

## Decision Log

- Decision: Use the existing indoor soccer tournament fixture from the tournament creation article.
  Rationale: The management article depends on the creation article, and using the same event lets readers understand the progression from setup to operations without switching sports or formats.
  Date/Author: 2026-05-24 / Codex

- Decision: Focus the article on organizer management basics, not on pool-play strategy or advanced bracket seeding.
  Rationale: The roadmap separates broad tournament management from specialized pool play, schedule updates, check-in, and advancement articles. This keeps the guide practical and linkable.
  Date/Author: 2026-05-24 / Codex

- Decision: Repair the local fixture data directly by changing only `article_tournament_create_soccer` teams to realistic registered team names and only that event's registrations to `ACTIVE`.
  Rationale: The article needs to teach registration review from a realistic management screen. Creating 16 team registrations manually through the UI would add noise to a management article and would not change the product behavior being documented.
  Date/Author: 2026-05-24 / Codex

- Decision: Set fixture-only synthetic `parentTeamId` values on the repaired event teams instead of creating full canonical team rows.
  Rationale: The screenshot article only needs the event management view to distinguish filled teams from bracket placeholders. Creating canonical team records would expand the local data setup without changing the user-facing management flow being documented.
  Date/Author: 2026-05-24 / Codex

- Decision: Assign registered teams to the fixture's first-round matches by seed while leaving later-round matches connected by bracket advancement.
  Rationale: This produces realistic schedule and bracket screenshots without pretending later-round winners are known before results are entered.
  Date/Author: 2026-05-24 / Codex

## Outcomes & Retrospective

The tournament management article is now published in the local blog registry with six real UI screenshots. It builds on the indoor soccer tournament from the creation guide, shows organizer management screens for details, teams, schedule, bracket, match score controls, and public verification, and keeps specialized check-in, live updates, pool play, and results advancement for future roadmap articles.

## Context and Orientation

Public blog content lives in `src/content/blog`. Article metadata and publication state live in `src/lib/blog/index.ts`. Blog routes render through `src/app/blog/page.tsx` and `src/app/blog/[slug]/page.tsx`. Screenshots for this article should be committed under `public/blog/manage-tournament/`.

The tournament management UI is the event schedule page at `src/app/events/[id]/schedule/page.tsx`. It exposes organizer tabs such as Details, Participants, Schedule, Standings, and Bracket. The existing tournament creation article lives at `src/content/blog/create-tournament-in-bracketiq.mdx` and should be linked as the prerequisite setup guide.

The final article must use the shared blog metadata/rendering path so the bottom author footer shows Samuel Razumovskiy, the author photo from `public/blog/authors/samuel-razumovskiy.jpg`, and created/updated dates.

## Fixture Event And Users

Use this living local fixture unless a future decision log entry replaces it:

- Event id: `article_tournament_create_soccer`
- Event name: `Saturday Indoor Soccer Tournament`
- Event type: `TOURNAMENT`
- Sport: `Indoor Soccer`
- Host userName: `camka14`
- Host profile id: `3f6f5523-dbeb-4dbd-a99c-8dbe1a7b5977`
- Host auth email: `camka14@gmail.com`
- Host password for local screenshot workflow: `password`
- State: `PUBLISHED`
- Registration model: team registration
- Division: `CoEd Open 18+`
- Teams: 16
- Registrations: 16
- Matches: 15

If the fixture event already exists, update it through the UI unless a screenshot requires a specific state that cannot be reached from the UI. If direct database repair is unavoidable, update only this fixture and record the repair here.

## Plan of Work

First, start or reuse a current-source local dev server. If port 3000 serves a stale bundle or is unavailable, use a free port such as 3001.

Next, sign in as the host and open:

    /events/article_tournament_create_soccer/schedule?mode=edit&tab=details

Capture the management workflow in small observable steps. The target sequence is:

1. Organizer event dashboard or Details tab after opening the published tournament.
2. Participants tab showing registered teams and registration status.
3. Schedule tab showing matches assigned to fields and times.
4. Bracket tab showing the tournament bracket.
5. Score or match editing state if the UI supports a concise result update screenshot.
6. Public page verification after organizer changes.

After screenshots are captured, write `src/content/blog/manage-tournament-in-bracketiq.mdx` in end-user language. The article should tell the reader what to plan, what to click, what to check on each screen, and how to decide when the tournament is ready for day-of operations. Do not mention browser automation, local URLs, fixture ids, Playwright, or failed attempts.

Then update `src/lib/blog/index.ts` with the new article metadata, including `createdAt`, `updatedAt`, `author`, keywords, FAQ, CTAs, and loader. Update tests that assert the number and order of published posts or sitemap entries. Update `docs/blog-article-roadmap.md` to mark the management article as published and to link it from the creation article where useful.

Finally, validate with focused tests, `npx tsc --noEmit`, and browser verification of `/blog` and `/blog/manage-tournament-in-bracketiq`.

## Validation and Acceptance

The work is accepted when:

- The screenshot fixture and user details are documented in this plan.
- The screenshots in `public/blog/manage-tournament/` come from the real UI.
- The article teaches tournament management and does not repeat the tournament creation article.
- The article links to the creation guide as the prerequisite and includes selected next-step links for check-in, schedule updates, and results when appropriate.
- The blog registry, blog index, article route, sitemap, and structured data handle the new published article.
- Focused blog tests pass.
- `npx tsc --noEmit` passes.
- Browser verification confirms the article route renders and screenshots load.

## Idempotence and Recovery

Re-running the browser flow should use the same fixture event rather than creating duplicate article events. If a partial run leaves a match score or status in an awkward state, either keep it if it supports the management article or reset only that fixture match and record the repair here. Do not delete unrelated events, teams, users, organizations, uploaded files, or registrations.

If the host account cannot log in, verify the local password hash before changing fixture users. If the management UI differs from expected article flow, record the difference in `Surprises & Discoveries`, adjust the article to match the product, and avoid inventing unsupported functionality.

## Artifacts and Notes

Planned article slug:

    /blog/manage-tournament-in-bracketiq

Planned screenshot paths:

    public/blog/manage-tournament/01-tournament-dashboard.png
    public/blog/manage-tournament/02-registered-teams.png
    public/blog/manage-tournament/03-schedule-tab.png
    public/blog/manage-tournament/04-bracket-tab.png
    public/blog/manage-tournament/05-match-result-edit.png
    public/blog/manage-tournament/06-public-page-check.png
