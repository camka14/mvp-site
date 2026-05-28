# Organization Creation Guide

This plan tracks the BracketIQ guide `How to Create and Set Up an Organization in BracketIQ`. It is a living note for the article, screenshots, roadmap updates, and validation.

## Goal

Create the first Organizations guide so clubs, facilities, and event organizers have a tutorial foundation before later guides cover public pages, staff operations, rentals, events, teams, and payments.

## Scope

- Publish the guide under `/guides/create-organization-in-bracketiq`.
- Use the real local BracketIQ web app for screenshots.
- Keep the guide focused on creating the organization and configuring the first operating surfaces: profile details, visibility, location, tax/facility settings, organization dashboard, public page settings, and staff setup.
- Link only to existing live BracketIQ guides for follow-up event workflows.
- Update the roadmap, registry, guide navigation order, sitemap expectations, and focused tests.

## Workflow

1. Capture the Organizations list and create entry point.
2. Fill the Create Organization modal with realistic club/facility information and capture it.
3. Save the organization and capture the dashboard/overview.
4. Configure the Public Page tab and capture the saved settings.
5. Review Staff setup and capture the staff/roles surface.
6. Write the MDX article as end-user instructions based on the actual UI.
7. Register the guide, update roadmap/tests, and verify the rendered route.

## Fixture

- Browser session account: the currently authenticated local verified user.
- Example organization name: `River City Sports Club`
- Example public slug: `river-city-sports-club`
- Example sports: Indoor Soccer, Indoor Volleyball, Pickleball
- Example location: Vancouver, WA

## Progress

- [x] 2026-05-28 Started the plan and selected the organization creation guide as the next article.
- [x] 2026-05-28 Captured organization guide screenshots from the local app.
- [x] 2026-05-28 Wrote the guide content and registered it in the content registry.
- [x] 2026-05-28 Updated roadmap, AGENTS guidance, guide navigation order, sitemap expectations, and focused tests.
- [x] 2026-05-28 Ran focused validation and rendered route checks.

## Discoveries

- Observation: The active browser session was already signed in as a verified local fixture user with no organizations, which provided a clean first-organization screenshot.
  Evidence: `/organizations` rendered the empty organization state and the create button without another login step.

- Observation: The Public Page settings initially showed preview links as disabled until the enabled page and widget settings finished saving.
  Evidence: after waiting for the PATCH and organization reload, the status changed from `Available` to `Current` and the public page/widget preview links became usable.

## Decision Log

- Decision: Start the Organizations section with a setup tutorial rather than a general team/player management article.
  Rationale: The user wants tutorial-style organization content first, and organization setup is the prerequisite for public pages, staff, facilities, clubs, rentals, and organizer workflows.
  Date/Author: 2026-05-28 / Codex

## Outcomes & Retrospective

- The guide is now drafted with seven real UI screenshots covering organization entry, setup, creation, dashboard review, public-page configuration, public-page verification, and staff setup.
- Focused Jest tests, TypeScript, and the rendered `/guides/create-organization-in-bracketiq` route smoke check passed on 2026-05-28.
