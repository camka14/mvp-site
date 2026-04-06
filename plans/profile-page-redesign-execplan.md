# Redesign the profile page around a sidebar shell

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Reference: maintain this plan in accordance with `PLANS.md` in the repository root.

## Purpose / Big Picture

Give `/profile` a stronger account-hub layout that matches the reference project’s sidebar-driven preview and edit experience without losing the sections our real app already supports. After this change, a signed-in user should land on a profile page with a clearer profile header, stats/sidebar navigation, a focused edit mode, and tabbed content for overview, connections, family, documents, templates, and billing including refund requests.

## Progress

- [x] (2026-04-06 11:43Z) Reviewed `src/app/profile/page.tsx`, the reference project under `/Users/elesesy/StudioProjects/Profile page for sports event`, and the existing theme/card tokens in `src/app/globals.css`.
- [x] (2026-04-06 11:49Z) Drafted this ExecPlan for the redesign and identified the target shell: preview sidebar + section navigation in view mode, edit sub-navigation in edit mode, and retention of refund/document/family/team sections the reference mock omits.
- [x] (2026-04-06 12:16Z) Rebuilt `src/app/profile/page.tsx` around a sidebar account shell with view tabs for overview/connections/family/documents/templates/billing and edit tabs for general info/account security.
- [x] (2026-04-06 12:25Z) Validated with `npx tsc --noEmit`, `npm test -- --runInBand src/app/profile/__tests__/profileImageSelection.test.ts src/lib/__tests__/profileBilling.test.ts`, and an authenticated browser smoke test on `/profile` using the seeded `camka14@gmail.com` login.

## Surprises & Discoveries

- Observation: The current profile page already contains the missing real-product sections the reference mock left out, notably embedded team management, profile invites, and both requester/host refund lists.
  Evidence: `src/app/profile/page.tsx` renders `ProfileInvitesSection`, `ManageTeams`, and two `RefundRequestsList` instances.

- Observation: Chrome DevTools full-page screenshots place the fixed top navigation in the middle of the stitched image, while viewport capture and live inspection show the layout is correctly offset beneath the navbar.
  Evidence: During browser validation, the first full-page capture showed the nav overlay artifact, and an immediate viewport capture plus DOM inspection confirmed the real profile layout was correct.

## Decision Log

- Decision: Keep all existing profile data-loading and business actions in `src/app/profile/page.tsx` and focus the refactor on presentation/state orchestration.
  Rationale: The request is design-led, and the current page already contains the needed domain coverage; replacing the shell is lower risk than redistributing logic across new modules during the same change.
  Date/Author: 2026-04-06 / Codex

- Decision: Reinterpret the reference app’s layout rather than copying it literally by using the repo’s existing Mantine surfaces, borders, and card treatments.
  Rationale: The user explicitly asked for consistency with the current app’s cards and design language, especially for billing, documents, templates, and player-style cards.
  Date/Author: 2026-04-06 / Codex

- Decision: Keep refunds as first-class content inside the billing section instead of hiding them behind a nested billing tab switch.
  Rationale: The user explicitly called out refund requests as missing from the reference mock, so the redesign preserves them in the same surfaced billing view as bills and memberships.
  Date/Author: 2026-04-06 / Codex

## Outcomes & Retrospective

`/profile` now behaves like a real account hub instead of a single long stack. The page opens into a stronger hero plus left-rail navigation, the overview tab retains invites and embedded team management, billing includes refund requests, and edit mode now has its own focused sidebar with separate general/security panels. Validation passed via TypeScript, targeted Jest suites, and authenticated browser checks. The main remaining tradeoff is that the render logic still lives in one large page file; that is acceptable for this refactor because service logic stayed untouched, but a future cleanup could extract presentational subcomponents once the design settles.

## Context and Orientation

`src/app/profile/page.tsx` is a large client component that owns the full profile experience. It already loads profile fields, child management data, social graph data, profile documents, event templates, bills, subscriptions, and refund requests. The page currently renders everything as one long vertical stack under a large header and switches only between “view” and “edit” at the top. The reference project under `/Users/elesesy/StudioProjects/Profile page for sports event/src/app` is a separate mock app that demonstrates a better shell: a focused profile hero, a left sidebar with stats/navigation, a separate edit-mode sidebar, and section-based content. The app theme tokens live in `src/app/globals.css`; those tokens define the neutral/blue palette and surface/border shadows the redesign should reuse.

## Plan of Work

Update `src/app/profile/page.tsx` to introduce view-mode section navigation and edit-mode sub-navigation. The new view shell should include a stronger hero with the avatar, name, handle, summary metadata, and edit button, plus a sidebar that shows profile stats and the section list. The main column should render one section at a time: overview (invites + teams), connections, family, documents, templates, and billing. The edit shell should keep the same header but swap the sidebar into edit navigation with “General info” and “Account security”.

Keep the existing content and handlers for each feature area but restyle and regroup them to match the new shell. Bills, memberships, documents, templates, and child cards should keep their current product data while adopting more deliberate card framing so they still resemble the app’s existing billing/document/player surfaces. Billing must continue to include both refund-request lists because the reference mock omitted that real functionality.

If the page needs small presentational helper constants or utility render blocks, keep them local to `src/app/profile/page.tsx` unless extraction materially reduces risk. Do not rewrite service logic.

## Concrete Steps

Work from the repository root `mvp-site`.

1. Edit `src/app/profile/page.tsx` to add view/edit navigation state and replace the long sequential section layout with the new shell.
2. Keep the existing overview, social, family, documents, templates, billing, and modal logic, but mount those sections conditionally based on the active tab and style them to match the new shell.
3. Ensure the billing section still renders payments, bills, memberships, and both refund-request views.
4. Run `npx tsc --noEmit` and at least one targeted Jest suite relevant to unchanged logic, then load `/profile` in the browser and verify the new shell and section switching manually.

## Validation and Acceptance

Acceptance requires `/profile` to show a sidebar-driven account layout with an edit mode that mirrors the reference app’s structure, while preserving all existing data-backed sections. In view mode, the user must be able to switch among overview, connections, family, documents, templates, and billing. In edit mode, the user must be able to switch between general profile editing and account security. Billing must still expose refund requests. Manual browser validation should confirm the profile shell, card layout, and section switching without console/runtime errors.

## Idempotence and Recovery

This is a code-only refactor centered in `src/app/profile/page.tsx`. The change is safe to repeat as long as the existing handlers remain intact. If the new shell causes layout regressions, restore the prior render structure from version control and reapply the refactor in smaller render-block steps. Validation commands can be rerun safely.

## Artifacts and Notes

- Browser validation used an authenticated local session (`camka14@gmail.com`) and Chrome DevTools page snapshots on `/profile` in overview, billing, and edit modes.

## Interfaces and Dependencies

The redesign continues to rely on `useApp`, `userService`, `familyService`, `profileDocumentService`, `billService`, `paymentService`, `productService`, `organizationService`, `RefundRequestsList`, `ProfileInvitesSection`, and `ManageTeams`. UI stays in Mantine plus existing Tailwind utility classes already used throughout `src/app/profile/page.tsx`. Any new icons should come from `lucide-react`, which is already installed.

Update 2026-04-06 12:25Z: Recorded the completed redesign, the billing/refund decision, and the browser-validation screenshot notes.
