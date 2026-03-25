# Sync mvp-site visual theme to mvp-app Material tokens

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document follows `mvp-site/PLANS.md` and must be maintained in accordance with that file.

## Purpose / Big Picture

The web app still used an older neutral palette derived from `#6ABDFF`, while the mobile app now uses explicit Material theme roles centered on `#19497A` with updated surface and text roles. After this change, web components that depend on shared CSS variables and `MOBILE_APP_THEME_TOKENS` render with the same core visual language as mobile without requiring per-component rewrites.

## Progress

- [x] (2026-03-25 10:19 -07:00) Located theme source-of-truth files in both repos and extracted current mobile Material role values from `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/presentation/ThemeTokens.kt`.
- [x] (2026-03-25 10:22 -07:00) Updated `src/app/theme/mobilePalette.ts` to map web token exports to the current mobile light-theme roles and extended accents.
- [x] (2026-03-25 10:24 -07:00) Updated `src/app/globals.css` `:root` and `.dark` token blocks to align with the same palette while preserving existing semantic variable names and utility mappings.
- [x] (2026-03-25 10:27 -07:00) Ran lint validation for modified TypeScript theme file; captured CSS lint limitation and command-environment workaround.

## Surprises & Discoveries

- Observation: Web already centralized theme usage through `src/app/theme/mobilePalette.ts` and CSS custom properties in `src/app/globals.css`, so broad visual sync required only two functional files.
  Evidence: imports in `src/app/layout.tsx`, `src/components/ui/PaymentModal.tsx`, and `src/app/opengraph-image.tsx` reference `MOBILE_APP_THEME_TOKENS`.
- Observation: Running `npm run lint` from a UNC current directory on Windows fails because `cmd.exe` does not support UNC working directories.
  Evidence: lint attempt returned `UNC paths are not supported` and `eslint is not recognized`; rerun through `wsl.exe bash -lc` succeeded.
- Observation: Repository ESLint config does not lint `globals.css` in this invocation path.
  Evidence: `File ignored because no matching configuration was supplied` warning for `src/app/globals.css`.

## Decision Log

- Decision: Keep existing semantic token names (for example `--mvp-primary-100`, `MOBILE_APP_THEME_TOKENS.primary`) and remap values to mobile roles instead of renaming APIs.
  Rationale: This minimizes churn and avoids regressions across many components that already consume these token keys.
  Date/Author: 2026-03-25 / Codex
- Decision: Map `.dark` CSS variables to mobile dark roles now, even though default web scheme is light.
  Rationale: This avoids split-brain theming where dark surfaces still carried non-mobile defaults if dark mode is enabled later.
  Date/Author: 2026-03-25 / Codex

## Outcomes & Retrospective

Theme token synchronization was completed for both TS and CSS token sources. The web app now uses values that directly match mobile `ThemeTokens.kt` for primary, neutral/surface, text, and accent roles while preserving the public token interfaces consumed throughout `mvp-site`.

Remaining gap: no dedicated CSS linter is configured for this path, so CSS validation was limited to static diff review.

## Context and Orientation

`mvp-app` defines the active mobile design system in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/presentation/ThemeTokens.kt` and wiring in `MVPTheme.kt`. `mvp-site` consumes parallel values from:

- `src/app/theme/mobilePalette.ts` for TypeScript consumers and Mantine theme setup.
- `src/app/globals.css` for CSS variables used throughout Tailwind and component styles.
- `src/app/layout.tsx` for Mantine provider primary scale injection.

The goal is to keep API-compatible token names in web while changing their values to match the mobile source.

## Plan of Work

Replace constant values in `src/app/theme/mobilePalette.ts` with direct mappings from mobile light scheme and extended colors. Then update `:root` and `.dark` token values in `src/app/globals.css` so all classes using `--mvp-*` values inherit the aligned palette. Keep semantic success/danger colors for non-theme status states.

## Concrete Steps

From any shell that can access WSL:

    wsl.exe bash -lc "cd /home/camka/Projects/MVP/mvp-site && npm run lint -- src/app/theme/mobilePalette.ts src/app/globals.css"
    wsl.exe bash -lc "cd /home/camka/Projects/MVP/mvp-site && npm run lint -- src/app/theme/mobilePalette.ts"

Expected result: TypeScript theme file lints cleanly; CSS file may be ignored by current ESLint config.

## Validation and Acceptance

Acceptance is met when:

1. `src/app/theme/mobilePalette.ts` values mirror current mobile theme roles (`#19497A`, `#DCEAF7`, `#EFE7D1`, `#1E2633`, `#5E6B78`, `#DE7837` where applicable).
2. `src/app/globals.css` token definitions use the same palette and feed existing semantic variables (`--mvp-bg`, `--mvp-surface`, `--mvp-primary`, `--ocean-*`) without key renames.
3. `npm run lint -- src/app/theme/mobilePalette.ts` exits successfully.

## Idempotence and Recovery

Edits are non-destructive and can be safely re-applied. If visual output is undesirable, revert only `src/app/theme/mobilePalette.ts` and `src/app/globals.css` to prior commits.

## Artifacts and Notes

Important artifacts captured:

- `git diff` for `src/app/theme/mobilePalette.ts` and `src/app/globals.css` shows token remapping.
- Lint output confirms no TypeScript lint errors in `mobilePalette.ts`.

## Interfaces and Dependencies

Preserved interfaces:

- `MOBILE_APP_THEME_TOKENS` object keys in `src/app/theme/mobilePalette.ts`.
- `MOBILE_APP_MANTINE_PRIMARY_SCALE` array length (10 items) for Mantine compatibility.
- Existing CSS custom property names under `:root` in `src/app/globals.css` consumed by components.

Revision note (2026-03-25): Updated this plan after implementation to record completed progress, lint environment findings, and final outcome so another contributor can reproduce or continue from this file alone.
