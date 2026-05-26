# How to Manage Tournament Results, Standings, and Advancement ExecPlan

This plan is a living document. Update it as the guide, screenshots, fixture, and validation evolve.

## Purpose

Create a BracketIQ Guide for managing tournament results, standings, and advancement. The guide should teach organizers how to enter scores, review standings, confirm pool results, verify automatic bracket seeding, and continue score entry through bracket rounds.

## Scope

- Publish a guide under `/guides/tournament-results-advancement`.
- Use an indoor soccer tournament example so the guide stays generic for recreational sports.
- Capture real screenshots from the local BracketIQ app.
- Keep this guide focused on results, standings, and advancement. Link to tournament creation, tournament management, and pool-play guides for broader workflows.

## Process

- Plan one workflow step.
- Perform that step in BracketIQ.
- Capture the screenshot for the step.
- Write the article language as end-user instructions for that step.
- Continue to the next step only after the previous step is grounded in the product UI.

## Fixture

- Host account: `camka14@gmail.com`
- Sport: Indoor Soccer
- Event type: Tournament
- Format: Pool play feeding a playoff bracket
- Division: CoEd Open 18+

## Planned Screenshots

1. Schedule Agenda view showing matches ready for score entry.
2. Match editor showing score controls for a completed match.
3. Standings tab showing pool rankings after scores.
4. Standings confirmation controls for automatic playoff reassignment.
5. Bracket tab showing advanced/seeding results.
6. Later bracket match showing winner advancement.

## Decisions

- Use `/guides/tournament-results-advancement` as the canonical path because it matches the roadmap anchor.
- Use Agenda view for schedule screenshots, following the article screenshot standard.
- Treat pool confirmation and bracket verification as separate steps so users understand the transition point.

## Validation

- Focused blog, guide, and sitemap tests must pass.
- TypeScript check must pass.
- Browser verification must confirm the new guide route, guide nav order, and legacy blog redirect behavior.

## Discoveries

- The existing custom dev server shared port behavior with another local mock server prevented client routes from hydrating during capture. A clean `next dev` server on a free port was used for the authenticated screenshot run.
- The fixture's bracket match score editor accepted score changes, but the broader event save path surfaced unrelated event-form validation for missing scheduling defaults. The guide does not claim a persisted bracket-save state beyond the visible score-entry controls.

## Progress

- 2026-05-26: Started the plan and selected the roadmap's tournament results, standings, and advancement guide.
- 2026-05-26: Captured screenshots for Agenda score review, match score controls, standings review, bracket seeding, and bracket score entry.
