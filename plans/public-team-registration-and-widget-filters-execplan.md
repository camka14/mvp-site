# Public Team Registration And Widget Filters

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with [PLANS.md](C:\Users\samue\Documents\Code\mvp-site\PLANS.md).

## Purpose / Big Picture

After this change, organization admins can build public team widgets that only show teams with open registration, public product widgets that only show single-purchase products or subscriptions, and widget settings UIs that only show controls relevant to the selected widget type. Visitors will also be able to click an open-registration team card from the public page or an embed and land in a real registration flow instead of a dead-end card.

## Progress

- [x] (2026-04-21T10:21:42-07:00) Read `PLANS.md`, the organization public settings panel, the embed route and tests, the public catalog, and the current public event/product/rental flows to map where widget options and public registration links are resolved.
- [x] (2026-04-21T10:21:42-07:00) Confirmed there is no existing public team registration page, so this feature needs a dedicated `/o/[slug]/teams/[teamId]` public flow instead of a small link-only patch.
- [x] (2026-04-21T10:39:41-07:00) Implemented shared public catalog filters for open-registration teams and product purchase mode, then threaded those options through the embed route, embed script, and public teams API.
- [x] (2026-04-21T10:39:41-07:00) Added a public team registration page and client that supports free joins, paid checkout, and public completion redirects.
- [x] (2026-04-21T10:39:41-07:00) Reworked `OrganizationPublicSettingsPanel.tsx` so widget-type selection sits next to the preview button and the visible settings are organized into titled per-widget rows.
- [x] (2026-04-21T10:39:41-07:00) Added regression tests and ran focused validation with Jest plus `npx tsc --noEmit`.
- [x] (2026-04-21T15:03:00-07:00) Added public team occupancy metadata so public page and widget cards show fullness, and full teams now suppress registration links while the direct public team page disables registration.
- [x] (2026-04-21T15:21:00-07:00) Aligned public fullness checks with the registration hold TTL so stale `STARTED` rows no longer count against widget or public-page capacity.

## Surprises & Discoveries

- Observation: The public page already has dedicated public routes for events, rentals, and products, but not for teams.
  Evidence: `src/app/o/[slug]` contains `events/[eventId]`, `rentals`, and `products/[productId]`, but no `teams/[teamId]` route.
- Observation: The widget query and script path only understand event-related options today, so every new filter must be added in three places: the settings panel, `src/app/embed.js/route.ts`, and `src/app/embed/[slug]/[kind]/route.ts`.
  Evidence: `OrganizationPublicSettingsPanel.tsx`, `embed.js`, and the embed HTML route all independently enumerate widget params.
- Observation: The public organization page file contained mojibake in the card metadata separator, so rewriting that file as part of the team-card change also cleaned those labels back to ASCII.
  Evidence: `src/app/o/[slug]/page.tsx` rendered `Â·` in event, team, and rental metadata before the rewrite.
- Observation: Full-project TypeScript validation needs a longer timeout than the focused Jest runs.
  Evidence: the first `npx tsc --noEmit` run exceeded a 124-second tool timeout, while the same command completed successfully with a 300-second allowance.
- Observation: The first public fullness implementation counted every `STARTED` team registration, even though the write path already treats old `STARTED` rows as expired holds after five minutes.
  Evidence: `src/server/publicOrganizationCatalog.ts` counted `ACTIVE` and `STARTED` blindly, while `src/server/teams/teamOpenRegistration.ts` pruned stale `STARTED` rows using `TEAM_REGISTRATION_STARTED_TTL_MS`.

## Decision Log

- Decision: Use a dedicated public team registration page at `/o/[slug]/teams/[teamId]` for open-registration teams.
  Rationale: the repository already uses page-based public flows for events, rentals, and products, and there is no existing public team route to reuse.
  Date/Author: 2026-04-21 / Codex
- Decision: Keep widget filters in the shared catalog contract instead of filtering in the client.
  Rationale: the public page, iframe embeds, script embeds, and public teams API should all agree on what content is visible for the same inputs.
  Date/Author: 2026-04-21 / Codex
- Decision: Model product filtering as `all | single | subscription`.
  Rationale: that matches the user-facing requirement more closely than exposing raw billing periods like `WEEK` or `MONTH`.
  Date/Author: 2026-04-21 / Codex
- Decision: Keep `Data limit` in a shared `Common settings` section rather than repeating it inside every widget row.
  Rationale: the limit applies to every visible section in the generated URL, so a single shared control is clearer than duplicated per-widget copies.
  Date/Author: 2026-04-21 / Codex

## Outcomes & Retrospective

Admins can now build team widgets that only show open-registration teams and product widgets that only show one-time products or subscriptions. The widget builder now changes the visible settings by widget type, keeps the widget selector next to the preview button, and renders titled single-row sections for the visible widget kinds.

Public open-registration team cards now lead into a real public registration flow at `/o/[slug]/teams/[teamId]`. Free teams call the self-registration API directly, paid teams open the existing Stripe payment flow, and successful registrations use the same public completion redirect mechanism as events, rentals, and products.

Public team cards on `/o/[slug]` and `/embed/[slug]/teams` now show roster fullness with a capacity meter. Full teams no longer render a join link in public cards, and the direct public team page surfaces the full-state meter plus a disabled registration action.

Public fullness now ignores stale `STARTED` holds older than the shared five-minute registration TTL, so widget and public-page capacity matches the reservation rules used during actual team registration.

Validation passed with:

`npx jest --runInBand --runTestsByPath "src/server/__tests__/publicOrganizationCatalog.test.ts" "src/app/embed/[slug]/[kind]/__tests__/route.test.ts" "src/lib/__tests__/publicCompletionRedirect.test.ts"`

`npx tsc --noEmit`

## Context and Orientation

The organization admin settings UI lives in `src/app/organizations/[id]/OrganizationPublicSettingsPanel.tsx`. That component does not persist widget presets in the database; it only builds preview URLs and embed snippets from local state. Because of that, changing widget options is a pure front-end and URL-contract task.

The public embed HTML response lives in `src/app/embed/[slug]/[kind]/route.ts`, and the script-embed bootstrapper lives in `src/app/embed.js/route.ts`. These files translate query parameters or `data-*` attributes into calls to `getPublicOrganizationCatalog` in `src/server/publicOrganizationCatalog.ts`.

The branded public organization page lives in `src/app/o/[slug]/page.tsx` with shared styling in `src/app/o/[slug]/PublicOrganizationPage.module.css`. That page already renders clickable event, rental, and product cards. Team cards are still static because there is no public team route yet.

The public catalog server code in `src/server/publicOrganizationCatalog.ts` is the source of truth for public organization content. It currently exposes list functions for events, teams, rentals, and products, plus detail loaders for public event registration, rental selection, and product checkout. This file is where team open-registration URLs and product/team filtering should be centralized.

## Plan of Work

First, extend the public catalog types and list functions. `PublicOrganizationTeamCard` must include whether registration is open, the public registration URL when it is open, and the registration price so public cards can display the correct call to action. `listPublicOrganizationTeams` must accept a boolean option for open-registration-only filtering. `listPublicOrganizationProducts` must accept a purchase-mode option that distinguishes one-time products from subscriptions. `getPublicOrganizationCatalog` must accept and forward both options so every public surface uses the same filtering contract.

Next, add a public team registration loader and route. In `src/server/publicOrganizationCatalog.ts`, add a function that verifies the organization slug, confirms the canonical team belongs to that organization, and only returns open-registration teams. In `src/app/o/[slug]/teams/[teamId]/page.tsx`, render a new client component that starts either a free join or a Stripe checkout using the existing `teamService.registerForTeam`, `paymentService.createTeamRegistrationPaymentIntent`, `BillingAddressModal`, `PaymentModal`, and `navigateToPublicCompletion` helpers. Extend `src/lib/publicCompletionRedirect.ts` and the public completion page to support `team` as a completion kind.

Then, update the embed contract. `OrganizationPublicSettingsPanel.tsx` needs new snippet state for the teams open-registration filter and the product purchase-mode filter, plus URL and `data-*` builders that emit those values. `src/app/embed.js/route.ts` must forward the new `data-*` attributes into iframe query params. `src/app/embed/[slug]/[kind]/route.ts` must parse the new params, pass them into the catalog call, and render team cards as links only when registration is open.

Finally, reorganize the settings UI in `OrganizationPublicSettingsPanel.tsx`. The widget type select must move next to the widget preview button. Below that, render a titled common-settings section for the shared limit and then titled per-widget sections for the visible widget kinds. When `all` is selected, show `Events`, `Teams`, `Rentals`, and `Products` sections together. Otherwise, show only the selected widget’s section. Each section’s controls should fit on a single wrapping row, and the rentals section should plainly state that it has no extra options.

## Concrete Steps

Work from `C:\Users\samue\Documents\Code\mvp-site`.

1. Edit `src/server/publicOrganizationCatalog.ts` to add the new team/product filter types, public team registration loader, and card metadata.
2. Edit `src/app/o/[slug]/page.tsx` and add `src/app/o/[slug]/teams/[teamId]/page.tsx` plus a new client component for the public team registration flow.
3. Edit `src/lib/publicCompletionRedirect.ts` and `src/app/o/[slug]/complete/page.tsx` to support team completion.
4. Edit `src/app/embed/[slug]/[kind]/route.ts`, `src/app/embed.js/route.ts`, and `src/app/api/public/organizations/[slug]/teams/route.ts` to accept and forward the new filters.
5. Rework `src/app/organizations/[id]/OrganizationPublicSettingsPanel.tsx` so visible controls match the selected widget kind and the layout matches the requested titled single-row sections.
6. Add or update tests in `src/server/__tests__/publicOrganizationCatalog.test.ts`, `src/app/embed/[slug]/[kind]/__tests__/route.test.ts`, and `src/lib/__tests__/publicCompletionRedirect.test.ts`.
7. Run focused Jest coverage and a type-check.

## Validation and Acceptance

Acceptance is:

`npx jest --runInBand --runTestsByPath "src/server/__tests__/publicOrganizationCatalog.test.ts" "src/app/embed/[slug]/[kind]/__tests__/route.test.ts" "src/lib/__tests__/publicCompletionRedirect.test.ts"` passes.

`npx tsc --noEmit` passes.

Loading an open-registration team card from `/o/[slug]` or `/embed/[slug]/teams` now links into `/o/[slug]/teams/[teamId]`, and the public team page can either register a free user or open the payment flow for a paid team registration.

Building a widget snippet from the organization settings UI now shows:

- a widget type selector next to the preview button,
- only the settings relevant to the selected widget type,
- separate titled sections when `All sections` is selected,
- a teams checkbox for open-registration-only filtering,
- a products select for `Both`, `Single purchase`, or `Subscription`.

## Idempotence and Recovery

These changes are additive and code-only. If a step fails midway, rerun the affected tests after completing the edit. The only new route is a public team page, so rollback is limited to reverting the changed files if the behavior is not desired. No database migration is required for this feature.

## Artifacts and Notes

The implementation touched the public catalog, the embed route, the public organization page, the new public team page, and the organization widget builder. The regression coverage intentionally stayed at the contract layer instead of adding a UI snapshot-style test for the settings panel.

## Interfaces and Dependencies

At the end of this work:

`src/server/publicOrganizationCatalog.ts` must accept team and product public filters through `getPublicOrganizationCatalog`, expose open-registration metadata on public team cards, and provide a public team registration loader.

`src/app/embed/[slug]/[kind]/route.ts` and `src/app/embed.js/route.ts` must understand the same new widget option names as `OrganizationPublicSettingsPanel.tsx`.

`src/app/o/[slug]/teams/[teamId]/page.tsx` must exist and render a working public team registration flow.

`src/lib/publicCompletionRedirect.ts` must support `team` as a completion kind.

Revision note: created this ExecPlan on 2026-04-21 before implementation so the catalog contract, new public team route, and widget UI work stay aligned.
Revision note: updated on 2026-04-21 after implementation to record the completed milestones, validation commands, and the shared-limit UI decision.
