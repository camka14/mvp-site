# Invite Link Origin Fix And Mobile App Prompt

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` are kept up to date as implementation proceeds.

This plan follows `mvp-site/PLANS.md`.

## Purpose / Big Picture

When users click invite links from emails sent in production, links must resolve to the live domain, not localhost. In addition, mobile web users should get an in-app/open-app prompt with store fallbacks so invite flows can smoothly move from web to native app.

## Progress

- [x] (2026-02-14 05:22Z) Audited invite email URL generation and identified `req.nextUrl.origin` as the source of localhost links behind proxyed hosting.
- [x] (2026-02-14 05:24Z) Added shared request-origin resolver and wired invite routes to it.
- [x] (2026-02-14 05:25Z) Added invite route regression test for forwarded-host origin resolution.
- [x] (2026-02-14 05:28Z) Added mobile web app prompt component and mounted it in root layout.
- [x] (2026-02-14 05:29Z) Ran targeted validation (Jest + ESLint).

## Surprises & Discoveries

- Observation: Google OAuth routes already implemented forwarded header origin resolution, but invite routes still used `req.nextUrl.origin`.
  Evidence: `src/app/api/auth/google/start/route.ts` vs `src/app/api/invites/route.ts`.
- Observation: The new React lint rule (`react-hooks/set-state-in-effect`) rejects direct state updates in effect bodies.
  Evidence: ESLint output on `src/components/layout/MobileAppPrompt.tsx` before scheduling updates asynchronously.

## Decision Log

- Decision: Centralize production-origin computation in `src/lib/requestOrigin.ts`.
  Rationale: Prevent repeated localhost bugs and keep email-origin behavior consistent across routes.
  Date/Author: 2026-02-14 / Codex
- Decision: Implement a mobile prompt (open app + store fallback) instead of forced redirect.
  Rationale: A prompt is safer for desktop and browser flows and matches the “or at least a prompt” requirement.
  Date/Author: 2026-02-14 / Codex

## Outcomes & Retrospective

Invite email links now use forwarded/public origin logic and no longer depend on internal localhost origin in production. Mobile website users now see a dismissible prompt to open the native app or go to store links.

## Context and Orientation

Invite email links are produced by `src/server/emailTemplates.ts` using a base URL provided by invite API routes. Those routes previously used `req.nextUrl.origin`. The app prompt is mounted from `src/app/layout.tsx`.

## Plan of Work

Add `getRequestOrigin(req)` utility, use it in invite routes, cover with tests, then introduce a client-side mobile prompt component that supports configurable deep links and store URLs.

## Concrete Steps

1. Add `src/lib/requestOrigin.ts`.
2. Update `src/app/api/invites/route.ts` and `src/app/api/users/invite/route.ts` to use `getRequestOrigin`.
3. Extend `src/app/api/invites/__tests__/inviteRoutes.test.ts` with forwarded-header origin coverage.
4. Add `src/components/layout/MobileAppPrompt.tsx`.
5. Mount `MobileAppPrompt` in `src/app/layout.tsx`.
6. Validate with:
   - `npm test -- src/app/api/invites/__tests__/inviteRoutes.test.ts`
   - `npx eslint src/lib/requestOrigin.ts src/app/api/invites/route.ts src/app/api/users/invite/route.ts src/app/layout.tsx src/components/layout/MobileAppPrompt.tsx`

## Validation and Acceptance

Acceptance criteria:

- Invites route test demonstrates forwarded-host origin (`https://mvp.razumly.com`) is used for email base URL.
- Mobile users on website see a prompt with `Open App`, `Get App`, and dismiss action.
- Lint and targeted tests pass.

## Idempotence and Recovery

Changes are additive. Re-running tests/lint is safe. If prompt behavior needs tuning, it can be disabled with `NEXT_PUBLIC_SHOW_APP_PROMPT=0`.

## Artifacts and Notes

- Jest: `PASS src/app/api/invites/__tests__/inviteRoutes.test.ts` with 3 tests passing.
- ESLint: clean for touched files (aside from tool warning about baseline-browser-mapping package age).

## Interfaces and Dependencies

- New helper: `getRequestOrigin(req: NextRequest): string`.
- New prompt config envs:
  - `PUBLIC_WEB_BASE_URL` (server-side override for canonical origin in email links).
  - `NEXT_PUBLIC_MVP_IOS_APP_STORE_URL`
  - `NEXT_PUBLIC_MVP_ANDROID_PLAY_STORE_URL`
  - `NEXT_PUBLIC_MVP_IOS_DEEP_LINK`
  - `NEXT_PUBLIC_MVP_ANDROID_DEEP_LINK`
  - `NEXT_PUBLIC_SHOW_APP_PROMPT` (`0` disables prompt).
