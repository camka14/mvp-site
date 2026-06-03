# Organization Payment Processing Guide

This plan tracks the BracketIQ guide `How to Set Up Payment Processing for Your BracketIQ Organization`.

## Goal

Publish an Organizations guide that explains how clubs, facilities, and event organizers prepare a BracketIQ organization for paid registrations, rentals, products, and payouts through Stripe.

## Scope

- Publish the guide under `/guides/organization-payment-processing`.
- Screenshot only BracketIQ-controlled organization and payment setup surfaces.
- Describe the Stripe-hosted onboarding flow at a high level and link to official Stripe documentation instead of reproducing sensitive or change-prone Stripe screens.
- Cover what organizers should verify after returning to BracketIQ: verification status, paid workflow availability, pricing, fees, refunds, and payout readiness.

## Workflow

1. Review official Stripe hosted onboarding docs and capture the current source links for the article.
2. Open the local organization dashboard and capture the BracketIQ payment setup surface.
3. Capture a BracketIQ paid workflow surface that shows Stripe/payment readiness.
4. Write the MDX article as end-user instructions.
5. Register the guide, update roadmap/tests, and verify the rendered route.

## Fixture

- Browser session account: the currently authenticated local verified user.
- Example organization name: `River City Sports Club`
- Example public slug: `river-city-sports-club`

## Progress

- [x] 2026-05-29 Started the plan and selected the organization payment processing guide as the next Organizations tutorial.
- [x] 2026-05-29 Reviewed official Stripe hosted onboarding documentation.
- [x] 2026-05-29 Captured BracketIQ screenshots from the local app.
- [x] 2026-05-29 Wrote and registered the guide.
- [x] 2026-05-29 Updated roadmap, tests, and guide navigation order.
- [x] 2026-05-29 Ran focused validation, rendered route checks, and production build.
- [x] 2026-06-03 Replaced the setup screenshot with a clean unverified Payments card that uses `samuel.razumovsky@gmail.com` for the host payout email.

## Discoveries

- Observation: Stripe-hosted onboarding is dynamic by account country, business type, capabilities, and verification requirements, and account links are single-use.
  Evidence: Official Stripe Connect hosted onboarding documentation.
- Observation: The organization dashboard Payments card shows an unverified status, payout email, and `Connect Stripe Account` before onboarding.
  Evidence: Local screenshot `public/blog/organization-payment-processing/01-organization-payments-card.png`.
- Observation: A verified organization Payments card changes to `Manage Stripe Account` after onboarding is complete.
  Evidence: Local screenshot `public/blog/organization-payment-processing/03-verified-payments-card.png`.

## Decision Log

- Decision: Do not screenshot Stripe-hosted onboarding screens.
  Rationale: The flow can contain sensitive business, identity, and banking information, and Stripe changes requirements dynamically. The guide should point to official Stripe documentation for that portion.
  Date/Author: 2026-05-29 / Codex

## Outcomes & Retrospective

Published the organization payment-processing guide with three BracketIQ-controlled screenshots, added it to the Organizations guide topic, updated the editorial roadmap, and verified tests, TypeScript, browser rendering, image loading, and production build.
