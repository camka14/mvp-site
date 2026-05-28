# League Schedule Communication Guide

## Goal

Create the BracketIQ guide `How to Communicate Schedule Changes During a League Season` as the next unpublished League guide.

## Scope

- Use an indoor soccer league as the generic sport example.
- Show the real BracketIQ workflow for reviewing the affected Agenda schedule, using reschedule/update controls, composing an event notification, checking participant teams, and verifying the public schedule.
- Keep the guide focused on schedule-change communication, not full league creation, full season scheduling, standings, or playoffs.
- Use Agenda view for schedule screenshots.
- Register the guide under `/guides/league-schedule-communication`.
- Update the roadmap and focused tests.

## Workflow

1. Seed a local published indoor soccer league fixture with teams, fields, weekly matches, and a visible upcoming schedule change scenario.
2. Capture each guide step from the rendered app.
3. Write the end-user instructions against those screenshots.
4. Add blog registry metadata, guide nav order, sitemap expectations, and roadmap status.
5. Run focused blog/guide tests, typecheck, and a rendered route smoke test.

## Progress

- [x] 2026-05-28 Started the plan and selected `How to Communicate Schedule Changes During a League Season` from the League roadmap.
- [x] 2026-05-28 Seeded the isolated `article_league_schedule_communication_soccer` fixture with six teams, two fields, eight matches, and a visible upcoming match moved to South Field at 7:50 PM.
- [x] 2026-05-28 Captured guide screenshots for Agenda review, affected match detail, Reschedule menu, notification composer, participant review, and participant-facing Agenda schedule.
- [x] 2026-05-28 Wrote the end-user guide text and registered `/guides/league-schedule-communication` in the blog registry, guide nav order, sitemap expectations, tests, and roadmap.
- [x] 2026-05-28 Verified focused blog/guide tests, TypeScript, and rendered `/guides/league-schedule-communication` on desktop and mobile viewports.

## Discoveries

- Event-team participant counts treat teams without `parentTeamId` as placeholders, so article fixtures need parent-team links when the Participants tab should show active team counts.
- The Send notification composer starts with no audience selected; guides should explicitly show the organizer selecting the audience groups before confirming.
