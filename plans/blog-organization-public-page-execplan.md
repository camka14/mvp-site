# Organization Public Page Guide

This plan tracks the BracketIQ guide `How to Create a Public Page for Your Sports Organization`.

## Goal

Publish the next Organizations guide so clubs, facilities, and event organizers can configure, preview, and share the BracketIQ public page after the organization exists.

## Scope

- Publish the guide under `/guides/create-public-page-for-sports-organization`.
- Use the real local BracketIQ web app for screenshots.
- Focus on the BracketIQ-controlled Public Page tab, slug, brand colors, page enablement, widgets, headline, intro text, embed settings, preview links, and public-page verification.
- Link back to organization creation and forward to organization payment processing, league setup, tournament setup, and facility/club workflows where useful.

## Workflow

1. Open the organization dashboard and capture the path to the Public Page tab.
2. Review and set the public slug, brand colors, page enablement, widgets, headline, and intro text.
3. Save the settings and capture the preview/embed-ready state.
4. Open the public page and capture what visitors see.
5. Review how an organizer should decide what to add next: events, teams, rentals, products, and payment processing.
6. Write the MDX article as end-user instructions based on the actual UI.
7. Register the guide, update roadmap/tests, and verify the rendered route.

## Fixture

- Browser session account: the currently authenticated local verified user.
- Example organization name: `River City Sports Club`
- Example public slug: `river-city-sports-club`
- Example public page focus: multi-sport club and facility operations.

## Progress

- [x] 2026-05-28 Started the plan and selected the public organization page guide as the next Organizations tutorial.
- [x] 2026-05-28 Captured public page screenshots from the local app.
- [x] 2026-05-28 Wrote and registered the guide.
- [x] 2026-05-28 Updated roadmap, tests, and guide navigation order.
- [x] 2026-05-28 Ran focused validation and rendered route checks.

## Discoveries

- Observation: The Public Page tab exposes the public slug, brand colors, page enablement, widgets, preview URL, headline, intro text, allowed embed domains, completion redirect URL, preview links, widget preset builder, iframe snippet, and script snippet from one workflow surface.
  Evidence: Local screenshots saved under `public/blog/organization-public-page/`.

## Decision Log

- Decision: Keep the Stripe payment-processing setup guide planned but publish the public-page guide next.
  Rationale: The public-page workflow is the next dependency after creating an organization and does not require third-party Stripe screenshots.
  Date/Author: 2026-05-28 / Codex

## Outcomes & Retrospective

- The guide is published with five local UI screenshots covering the organization Public Page tab, settings, widget snippets, public page preview, and widget preview.
- Focused Jest tests, TypeScript, and the rendered `/guides/create-public-page-for-sports-organization` route smoke check passed on 2026-05-28.
