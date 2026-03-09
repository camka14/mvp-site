# BracketIQ Brand Rename

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This repository contains `PLANS.md` at the repository root. This plan must be maintained in accordance with that file.

## Purpose / Big Picture

After this change, the web app presents itself to users as BracketIQ instead of MVP while keeping the existing product behavior, routes, environment variables, and internal identifiers intact. A user should see the BracketIQ name in the browser title, landing page, navigation, invite copy, billing fee labels, and generated social preview assets, and the shield logo asset should have a BracketIQ-specific filename.

## Progress

- [x] (2026-03-09 15:02Z) Reviewed `PLANS.md` requirements and enumerated current `MVP`/`file.svg` references across the repository.
- [x] (2026-03-09 15:15Z) Renamed the shield asset to `bracketiq-shield.svg`, repointed the landing page and authenticated navigation, and refreshed `src/app/icon.svg` from the renamed SVG.
- [x] (2026-03-09 15:17Z) Updated user-facing app text to BracketIQ in metadata, Open Graph image text, invite copy, and billing fee labels, including the affected Jest expectations.
- [x] (2026-03-09 15:18Z) Updated assistant-facing docs where the product name was described (`AGENTS.md`, `README.md`) and confirmed root `PLANS.md` did not require edits because its `mvp-site` mentions are repository-path references, not app-name text.
- [x] (2026-03-09 15:21Z) Validated with `npx tsc --noEmit`, two targeted Jest suites, asset sync checks, and targeted searches showing no remaining user-facing `MVP` strings in the app shell/docs under scope.

## Surprises & Discoveries

- Observation: Most `mvp` references in the repository are technical identifiers such as repo paths, CSS custom properties, env defaults, function names, or URLs rather than user-facing app name text.
  Evidence: `rg -n "\\bMVP\\b|\\bmvp\\b|Mvp|BracketIQ|file\\.svg" .` showed user-visible strings in a small set of app files, while most remaining matches were paths like `mvp-site`, URLs like `mvp.razumly.com`, or variables like `calculateMvpAndStripeFees`.

- Observation: A first Jest run only executed the invite-email suite because the billing route test path containing square brackets was treated as a pattern instead of a literal path.
  Evidence: `npx jest --runInBand src/server/__tests__/inviteEmails.test.ts "src/app/api/events/[eventId]/teams/[teamId]/billing/bills/__tests__/route.test.ts"` reported `Ran all test suites matching ...` but executed only one suite; rerunning with `--runTestsByPath` executed the billing suite successfully.

## Decision Log

- Decision: Limit the rename to user-facing product-name text and logo asset filenames, leaving technical identifiers unchanged unless they are rendered to users.
  Rationale: The request explicitly said to keep everything the same except for the logo/app name. Changing domains, repo paths, deep links, env vars, or CSS token names would widen scope and create avoidable risk.
  Date/Author: 2026-03-09 / Codex

- Decision: Rename `file.svg` to `bracketiq-shield.svg` and use that filename for the served logo asset, while keeping `src/app/icon.svg` as the App Router icon entrypoint.
  Rationale: The filename should describe the brand asset, but Next.js still expects `src/app/icon.svg` for automatic icon generation.
  Date/Author: 2026-03-09 / Codex

- Decision: Leave root `PLANS.md` unchanged.
  Rationale: Its `mvp-site` mentions are repository-path and process references, not visible product branding. Renaming them would create inaccurate file paths.
  Date/Author: 2026-03-09 / Codex

## Outcomes & Retrospective

Completed the product-name rename within the requested scope. The runtime app now presents BracketIQ in visible branding surfaces while keeping URLs, technical identifiers, repository paths, and internal helper names stable. The remaining `mvp` references are implementation details or historical/parallel-plan documentation outside the rename scope.

## Context and Orientation

The app shell metadata lives in `src/app/layout.tsx`. The generated social preview image lives in `src/app/opengraph-image.tsx`. The public landing page header is in `src/app/page.tsx`, and the authenticated navigation header is in `src/components/layout/Navigation.tsx`. Invite push/email orchestration lives in `src/server/inviteEmails.ts`, with tests in `src/server/__tests__`. Billing fee labels appear both in the schedule UI (`src/app/events/[id]/schedule/page.tsx`) and server billing routes (`src/app/api/billing/webhook/route.ts`, `src/app/api/events/[eventId]/teams/[teamId]/billing/bills/route.ts`), with matching tests under `src/app/api/events/[eventId]/teams/[teamId]/billing/bills/__tests__/route.test.ts`.

The current logo asset source file is the repository-root `file.svg`, which is also mirrored to `public/file.svg` for `next/image` usage and to `src/app/icon.svg` for the browser/app icon. This change should rename the source asset and the public asset, then repoint the UI to the new filename while preserving the same SVG artwork.

`AGENTS.md` contains product-description guidance for future coding agents. `PLANS.md` is primarily a process document; it should only be edited if it contains product-name text rather than repository-path references.

## Plan of Work

First, rename the shield asset from `file.svg` to `bracketiq-shield.svg`, copy it into `public/bracketiq-shield.svg`, and refresh `src/app/icon.svg` from that same source so the visible logo and browser icon remain identical. Then update the landing page and authenticated navigation to use `/bracketiq-shield.svg` and to display the text label `BracketIQ` next to the logo.

Next, update app metadata in `src/app/layout.tsx` so the browser title, Open Graph metadata, Twitter metadata, and social-preview alt text use BracketIQ while keeping the existing domain and route values. Update `src/app/opengraph-image.tsx` so the generated preview image says BracketIQ instead of Razumly MVP. Update invite copy and billing fee labels so any user-visible `MVP` string becomes `BracketIQ`.

Finally, adjust tests that assert the renamed strings, then run TypeScript and repository searches to verify that visible product-name references are updated while technical `mvp` identifiers remain unchanged.

## Concrete Steps

Work from the repository root:

1. Rename the root SVG asset and refresh the runtime copies.
2. Update visible brand strings and logo references in app shell, homepage, navigation, invite copy, billing labels, and assistant docs.
3. Update any affected tests to match the new user-facing copy.
4. Run `npx tsc --noEmit`.
5. Search for `\bMVP\b` and review any remaining matches to ensure they are either technical identifiers or intentionally unchanged.

Expected command examples:

    $ npx tsc --noEmit
    # exits with code 0 and no output

    $ rg -n "\bMVP\b" src AGENTS.md PLANS.md
    # no user-facing MVP strings remain after the change

## Validation and Acceptance

Acceptance is satisfied when the browser/app metadata identifies the product as BracketIQ, both headers show the shield logo next to the BracketIQ name, invite notifications and billing fee labels use BracketIQ wording, and the runtime logo asset is loaded from the renamed file. TypeScript must pass, and targeted searches must show no remaining user-facing `MVP` strings in the app or the assistant guidance docs.

## Idempotence and Recovery

The edits are safe to re-run because the asset copy steps simply refresh derived copies from the canonical renamed SVG. If a rename step is partially applied, restore consistency by copying `bracketiq-shield.svg` back to `public/bracketiq-shield.svg` and `src/app/icon.svg`, then rerun the validation searches.

## Artifacts and Notes

Initial discovery command:

    $ rg -n "\bMVP\b|\bmvp\b|Mvp|BracketIQ|file\.svg" .
    # showed that most `mvp` references are technical identifiers; the user-facing rename scope is small and explicit.

Validation commands and outcomes:

    $ npx tsc --noEmit
    # exits with code 0 and no output

    $ npx jest --runInBand src/server/__tests__/inviteEmails.test.ts
    PASS src/server/__tests__/inviteEmails.test.ts

    $ npx jest --runInBand --runTestsByPath "src/app/api/events/[eventId]/teams/[teamId]/billing/bills/__tests__/route.test.ts"
    PASS src/app/api/events/[eventId]/teams/[teamId]/billing/bills/__tests__/route.test.ts

    $ cmp -s bracketiq-shield.svg public/bracketiq-shield.svg && cmp -s bracketiq-shield.svg src/app/icon.svg && echo synced
    synced

## Interfaces and Dependencies

No new libraries are required. Continue using `next/image` for rendered logos and the existing Next.js App Router `src/app/icon.svg` convention for the browser icon. Preserve existing function names such as `calculateMvpAndStripeFees` and existing repo paths such as `mvp-site` unless a string is directly shown to users or documented as the product name.

Plan update note (2026-03-09): Updated the plan after implementation to record the completed BracketIQ rename, the reason `PLANS.md` stayed unchanged, and the exact validation commands used.
