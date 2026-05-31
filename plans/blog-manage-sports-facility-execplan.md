# Manage Sports Facility Guide

This plan tracks the BracketIQ guide `How to Manage a Sports Facility With BracketIQ`.

## Goal

Publish an Organizations guide that shows facility operators how to use BracketIQ as the operating hub for fields or courts, public pages, events, rentals, products, payments, staff, and customer follow-up.

## Scope

- Publish the guide under `/guides/manage-sports-facility`.
- Use BracketIQ-controlled screenshots from the local app.
- Keep the guide tutorial-first and focused on the organization dashboard.
- Link to prerequisite organization, public page, and payment-processing guides.
- Avoid turning the article into a broad marketing explainer.

## Workflow

1. Open the local BracketIQ app with an organization that has facility data.
2. Capture the organization overview and facility-relevant tabs.
3. Capture field/court, event, store/payment, and public-page surfaces where available.
4. Write the MDX article as end-user instructions.
5. Register the guide, update roadmap/tests, and verify the rendered route.

## Fixture

- Example organization: `Razumly` when seeded facility data is useful.
- Secondary organization: `River City Sports Club` when empty-state setup is clearer.

## Progress

- [x] 2026-05-31 Started the plan and selected the sports facility management guide as the next Organizations tutorial.
- [x] 2026-05-31 Captured BracketIQ screenshots from the local app.
- [x] 2026-05-31 Wrote and registered the guide.
- [x] 2026-05-31 Updated roadmap, tests, and guide navigation order.
- [x] 2026-05-31 Ran focused validation, rendered route checks, and production build.

## Discoveries

- Observation: The facility organization dashboard gives staff one place to move between events, customers, staff, refunds, public page, fields, store, payments, and recent events.
  Evidence: Local screenshot `public/blog/manage-sports-facility/01-facility-organization-overview.png`.
- Observation: The public page tab includes page enablement, widgets, preview links, widget type, and embed snippets for facility listings.
  Evidence: Local screenshot `public/blog/manage-sports-facility/05-public-page-widgets.png`.

## Decision Log

- Decision: Publish this as a BracketIQ Organizations guide rather than a general blog post.
  Rationale: The article is a tutorial through BracketIQ organization screens and belongs in the guide navigation.
  Date/Author: 2026-05-31 / Codex

## Outcomes & Retrospective

Published the sports facility management guide with five BracketIQ-controlled screenshots, added it to the Organizations guide topic, updated the editorial roadmap, and verified focused tests, TypeScript, production build, route rendering, and image loading.
