# Manage Sports Club Guide

This plan tracks the BracketIQ guide `How to Manage a Sports Club With BracketIQ`.

## Goal

Publish an Organizations guide that shows sports clubs how to use BracketIQ for teams, players, parents, staff access, roles, registrations, schedules, payments, and communication.

## Scope

- Publish the guide under `/guides/manage-sports-club`.
- Use BracketIQ-controlled screenshots from the local app.
- Keep the guide tutorial-first and focused on organization workflows.
- Cover teams, staff, permissions, customers, events, and public-page/mobile visibility at a practical level.
- Link to prerequisite organization setup, public-page setup, registration, and payment-processing guides.

## Workflow

1. Open a local BracketIQ organization with teams and staff-relevant screens.
2. Capture the organization overview, teams, staff, customers, events, and public-page screens.
3. Write the MDX article as end-user instructions.
4. Register the guide, update roadmap/tests, and verify the rendered route.

## Fixture

- Example organization: `Razumly` when seeded teams and events are useful.
- Secondary organization: `River City Sports Club` when empty-state staff or team setup is clearer.

## Progress

- [x] 2026-05-31 Started the plan and selected the sports club management guide as the next Organizations tutorial.
- [x] 2026-05-31 Captured BracketIQ screenshots from the local app.
- [x] 2026-05-31 Wrote and registered the guide.
- [x] 2026-05-31 Updated roadmap, tests, and guide navigation order.
- [x] 2026-05-31 Ran focused validation, rendered route checks, and production build.

## Discoveries

- Observation: The club organization dashboard exposes teams, customers, staff, events, public page, fields, store, payments, and recent events from one workspace.
  Evidence: Local screenshot `public/blog/manage-sports-club/01-club-organization-overview.png`.
- Observation: The Teams, Staff, and Customers tabs provide separate surfaces for rosters/team management, role-based staff access, and parent/player/customer follow-up.
  Evidence: Local screenshots `public/blog/manage-sports-club/02-club-teams.png`, `03-staff-roles-permissions.png`, and `04-customers-parents-players.png`.

## Decision Log

- Decision: Publish this as a BracketIQ Organizations guide rather than a general club operations blog post.
  Rationale: The article is a click-by-click organization tutorial and belongs in the guide navigation.
  Date/Author: 2026-05-31 / Codex

## Outcomes & Retrospective

Published the sports club management guide with six BracketIQ-controlled screenshots, added it to the Organizations guide topic, updated the editorial roadmap, and verified focused tests, TypeScript, clean production build, route rendering, and image loading.
