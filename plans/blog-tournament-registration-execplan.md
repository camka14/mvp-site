# How to Set Up Tournament Registration for Teams and Players ExecPlan

This plan is a living document. Update it as the guide, screenshots, fixture, and validation evolve.

## Purpose

Create a BracketIQ Guide for setting up tournament registration for teams and players. The guide should teach organizers how to confirm tournament registration settings, review capacity and division pricing, publish the team-facing registration page, explain the captain team flow, and monitor registered teams.

## Scope

- Publish a guide under `/guides/tournament-registration`.
- Use an indoor soccer tournament example so the guide stays generic for recreational sports.
- Capture real screenshots from the local BracketIQ app.
- Keep this guide focused on registration setup and review. Link to existing tournament creation, tournament management, and pool-play guides for broader workflows.

## Process

- Plan one workflow step.
- Perform that step in BracketIQ.
- Capture the screenshot for the step.
- Write the article language as end-user instructions for that step.
- Continue to the next step only after the previous step is grounded in the product UI.

## Fixture

- Host account: `camka14@gmail.com`
- Host username: `camka14`
- Working event id: `article_tournament_registration_soccer`
- Event name: `Sunday Indoor Soccer Team Registration Tournament`
- Sport: Indoor Soccer
- Event type: Tournament
- Registration type: Team registration
- Division: CoEd Open 18+
- Planned capacity: 12 teams
- Planned entry fee: $120 per team

## Planned Screenshots

1. Details tab showing tournament registration settings.
2. Division card showing team capacity and price.
3. Public event page showing participant capacity, division selection, and team registration controls.
4. Team options or team creation flow for the captain-facing registration step.
5. Participants tab showing registered teams for organizer review.

## Decisions

- Use `/guides/tournament-registration` as the canonical path because it is short, descriptive, and matches the roadmap anchor.
- Use indoor soccer for the example because current tournament guides already use soccer and the user asked generic sport examples to be volleyball or soccer.
- Describe waitlists, waivers, and payments as organizer checks only where the BracketIQ UI supports the related registration, document, or billing status.

## Validation

- Focused blog, guide, and sitemap tests pass.
- TypeScript check passes.
- Browser verification confirms `/guides/tournament-registration`, `/guides`, and `/blog/tournament-registration` route behavior.

## Progress

- 2026-05-26: Started the plan and selected the roadmap's tournament registration guide as the next article.
- 2026-05-26: Built the indoor soccer registration fixture, verified the backend participant snapshot, fixed client-side `id` to `$id` normalization for participant teams, and captured the five guide screenshots.
