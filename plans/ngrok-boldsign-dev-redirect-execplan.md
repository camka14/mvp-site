# Ngrok-Assisted BoldSign Redirects in Local Dev

This ExecPlan is a living document. Keep `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` updated as implementation proceeds.

## Purpose / Big Picture

In local development, BoldSign completion redirects should never point to localhost/private-network URLs because modern browsers can block follow-up local-network requests from public pages. After this change, local dev startup automatically provisions an ngrok URL and signing routes use that public URL as the redirect fallback for both web and mobile clients.

## Progress

- [x] (2026-02-20 18:05Z) Audited current signing flow (`window.location.origin` passed to sign-link API) and backend route behavior.
- [x] (2026-02-20 18:13Z) Added `npm run dev` wrapper to launch Next.js with ngrok tunnel env injection.
- [x] (2026-02-20 18:13Z) Added backend redirect resolver with private-network fallback.
- [x] (2026-02-20 18:14Z) Updated web signing callsites to use configured public redirect value in dev.
- [x] (2026-02-20 18:15Z) Added regression assertion and ran targeted lint/tests.

## Surprises & Discoveries

- Observation: Mobile signing flow does not send `redirectUrl`, so backend fallback is required to support mobile dev parity.
  Evidence: `mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/BillingRepository.kt`.

## Decision Log

- Decision: Put safety/fallback logic server-side (`/api/events/[eventId]/sign`) instead of client-only.
  Rationale: Protects all clients (web and mobile) and prevents regressions when clients accidentally send localhost origins.
  Date/Author: 2026-02-20 / Codex.

## Outcomes & Retrospective

Completed implementation:

- `package.json` `dev` script now uses `scripts/dev-with-ngrok.mjs`.
- `scripts/dev-with-ngrok.mjs` attempts ngrok startup, discovers HTTPS tunnel URL, and exports `BOLDSIGN_DEV_REDIRECT_BASE_URL` + `NEXT_PUBLIC_BOLDSIGN_DEV_REDIRECT_BASE_URL` for Next runtime.
- `src/lib/signRedirect.ts` normalizes redirect inputs and swaps localhost/private redirect hosts for public dev tunnel URL when available.
- `src/app/api/events/[eventId]/sign/route.ts` now uses resolved safe redirect URL for `getEmbeddedSignLink`.
- Web signing callsites now use `resolveClientSignRedirectUrl()` (`src/lib/signRedirectClient.ts`) instead of raw `window.location.origin`.
- Added test coverage in `src/app/api/events/__tests__/eventSignRoute.test.ts` to assert localhost redirect is converted to ngrok fallback.

Validation:

- `npx eslint src/app/api/events/[eventId]/sign/route.ts src/app/discover/components/EventDetailSheet.tsx src/app/profile/page.tsx src/lib/signRedirect.ts src/lib/signRedirectClient.ts src/app/api/events/__tests__/eventSignRoute.test.ts scripts/dev-with-ngrok.mjs`
- `npm test -- src/app/api/events/__tests__/eventSignRoute.test.ts`
