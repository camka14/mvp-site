# Web Authenticator MFA For BracketIQ Login

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan follows `PLANS.md` in the repository root. It is self-contained so another agent or developer can continue the work from this file and the current working tree.

## Purpose / Big Picture

BracketIQ needs multi-factor authentication before a user can create a Stripe connected account to collect money. SMS was initially started, but the active MFA method is now an authenticator app such as Microsoft Authenticator, Google Authenticator, 1Password, or Authy. After this change, normal website login does not force MFA setup. If a user already enabled MFA, website login prompts for the current 6-digit authenticator code before issuing the normal web session. Users without MFA get an optional setup prompt with a Skip button after password or Google login, and Stripe connected-account creation is blocked server-side until MFA is enrolled. Mobile and watch clients keep their current login behavior because they do not expose Stripe account creation.

The visible outcome is that signing in from `/login` first verifies the password, then either shows a code-entry step for an already enrolled authenticator or asks whether the user wants to add one. Users can skip optional setup and continue. Signed-in users can manage authenticator enrollment from the Profile security tab. Stripe Connect onboarding returns a clear MFA-required error before any account is created if the acting user has not enrolled an authenticator app. Twilio/SMS code remains in the branch for possible future text MFA, but it is not the active website login or Stripe creation control.

## Progress

- [x] (2026-06-11 19:28Z) Read `PLANS.md`, current auth routes, rate limiting, website login UI, profile security UI, and mobile login usage.
- [x] (2026-06-11 19:28Z) Decided that website MFA is triggered by an explicit `clientType: "web"` request field so existing mobile and watch clients that call `/api/auth/login` are not broken.
- [x] (2026-06-11 20:37Z) Implemented an initial phone/SMS MFA pass with Twilio Verify and local dev fallback.
- [x] (2026-06-12 00:25Z) Pivoted the plan from active SMS MFA to active authenticator app MFA after the user rejected text MFA as too vulnerable.
- [x] (2026-06-12 00:43Z) Added Prisma schema fields and migration `20260612002500_add_web_totp_mfa` for encrypted TOTP authenticator state.
- [x] (2026-06-12 01:03Z) Added reusable server-side TOTP helper, QR rendering route, and login/profile API routes.
- [x] (2026-06-12 01:14Z) Replaced active website login, Google OAuth, and Profile UI paths with authenticator app setup and code confirmation.
- [x] (2026-06-12 01:25Z) Refreshed generated Prisma client files and targeted tests.
- [x] (2026-06-12 01:37Z) Ran targeted Jest tests, typecheck, `git diff --check`, and browser smoke test `/login`.
- [x] (2026-06-12 18:55Z) Corrected product behavior so MFA setup is optional for normal login, required login code prompts only happen for MFA-enabled users, and Stripe connected-account creation is blocked until TOTP is enrolled.

## Surprises & Discoveries

- Observation: The mobile Compose app and both watch apps call `/api/auth/login` directly.
  Evidence: `rg "/api/auth/login|auth/login" /Users/elesesy/StudioProjects/mvp-app` found calls in `composeApp/src/commonMain/.../UserRepository.kt`, `wearApp/.../WearMatchRepository.kt`, and `iosApp/watchApp/WatchMatchRepository.swift`.

- Observation: Google web OAuth previously issued an auth cookie directly in `src/app/api/auth/google/callback/route.ts`.
  Evidence: The callback created a `SessionToken`, called `signSessionToken`, redirected to the destination URL, and called `setAuthCookie(res, token)` before the MFA implementation.

- Observation: The repository already has a QR-code rendering pattern.
  Evidence: `src/app/api/billing/checkout-qr/route.ts` uses `qr-code-styling`, `jsdom`, and `sharp` to return a private no-store PNG response.

- Observation: The active login page loads after the authenticator UI changes without app runtime errors.
  Evidence: Browser opened `http://localhost:3000/login`; the document, `/api/auth/me`, and `/api/sports` returned 200. Console output only contained existing Next/font preload warnings.

## Decision Log

- Decision: Require MFA only when the login request explicitly identifies itself as the website flow with `clientType: "web"`.
  Rationale: The user asked for website-only MFA because mobile does not expose QuickBooks financials, and current mobile/watch code already uses the shared password login endpoint. A request flag preserves compatibility while allowing the website to enforce MFA.
  Date/Author: 2026-06-11 / Codex

- Decision: Keep Twilio/SMS integration code dormant for future use, but make authenticator app TOTP the active MFA method now.
  Rationale: The user called text MFA vulnerable and requested authenticator support with QR scanning. Keeping the Twilio helper avoids throwing away local work that may be useful later, but login and profile should not depend on SMS.
  Date/Author: 2026-06-12 / Codex

- Decision: Store the authenticator secret encrypted on `SensitiveUserData`.
  Rationale: A TOTP secret is equivalent to an MFA credential. It should live with other sensitive per-user data, be encrypted at rest with the existing `secretCrypto` helper, and never be exposed in ordinary profile payloads.
  Date/Author: 2026-06-12 / Codex

- Decision: Generate QR codes from a short-lived setup challenge instead of returning the raw `otpauth://` URI to the browser.
  Rationale: The user asked for QR scanning. A QR image route keyed by a challenge id avoids putting the shared secret in ordinary JSON responses while still letting authenticator apps scan the setup payload.
  Date/Author: 2026-06-12 / Codex

- Decision: Prevent immediate replay of a successful authenticator code by storing the last accepted TOTP counter.
  Rationale: TOTP codes are valid for a short time window. Recording the counter blocks reuse of the same code during the same 30-second period.
  Date/Author: 2026-06-12 / Codex

- Decision: Do not force authenticator enrollment during normal website login.
  Rationale: The user clarified that MFA is only required before creating a Stripe connected account to collect money. Login should prompt for a code only after MFA has been enabled, and users without MFA should be able to skip optional setup.
  Date/Author: 2026-06-12 / Codex

- Decision: Enforce the Stripe account creation requirement in `POST /api/billing/host/connect`.
  Rationale: The server route is the first point with side effects that can create or mock a Stripe connected account. Blocking there prevents UI bypasses and protects both user and organization Stripe account creation.
  Date/Author: 2026-06-12 / Codex

## Outcomes & Retrospective

The active implementation now uses authenticator app TOTP for website MFA. Password login and Google OAuth create authenticator challenges before setting `auth_token` only for users who already enabled MFA. Password and Google login for users without MFA sign in normally and show an optional setup prompt with Skip. Profile security can enroll or replace the authenticator app. Stripe Connect account creation is blocked until the acting user has TOTP enabled. The SMS/Twilio helper and phone routes remain in the branch for a possible future option, but the generic login setup route now returns `SMS_MFA_DISABLED` so SMS is not an active website login bypass.

## Context and Orientation

The web app is a Next.js App Router application in `/Users/elesesy/StudioProjects/mvp-site`. Password login is implemented in `src/app/api/auth/login/route.ts`; it validates email/password, sends an email-verification reminder when needed, signs a JWT session with `src/lib/authServer.ts`, and sets the `auth_token` cookie. The website login page is `src/app/login/page.tsx`, and its client API wrapper is `src/lib/auth.ts`.

The profile security UI lives in `src/app/profile/page.tsx` under `renderSecurityEditTab`. The route helper `src/lib/permissions.ts` verifies existing sessions for authenticated API routes. Rate limiting is in `src/server/rateLimit.ts`.

The Prisma schema is `prisma/schema.prisma`. This repository tracks generated Prisma client files under `src/generated/prisma`, so schema changes require `npx prisma generate`. Additive migrations live under `prisma/migrations/<timestamp>_<name>/migration.sql`.

TOTP means time-based one-time password. An authenticator app stores a shared secret and derives a 6-digit code from the current 30-second time period. BracketIQ can verify the code using Node `crypto` without sending a text message or calling a third-party MFA provider.

The related mobile app is at `/Users/elesesy/StudioProjects/mvp-app`. Its Compose and watch clients call `/api/auth/login` without a website client marker, so `/api/auth/login` must keep issuing sessions for those calls.

## Plan of Work

First, extend Prisma with authenticator MFA state on `SensitiveUserData` and add authenticator setup fields to `AuthMfaChallenges`. The setup challenge needs an encrypted temporary TOTP secret so the QR endpoint and confirmation endpoint can use the same secret without committing it to the user account until the first valid code is entered.

Second, add `src/server/authTotpMfa.ts`. It will generate Base32 TOTP secrets, build standard `otpauth://totp/...` URLs with issuer `BracketIQ`, verify 6-digit codes with a one-step clock window, create/expire challenges, store encrypted secrets, and update the MFA satisfied timestamp after successful verification.

Third, patch `src/app/api/auth/login/route.ts` and `src/app/api/auth/google/callback/route.ts`. When the body contains `clientType: "web"` or Google web OAuth succeeds, a valid primary credential must create an authenticator challenge only if the user already has TOTP enabled. The normal auth cookie is set only after the authenticator code is confirmed for MFA-enabled users. Users without TOTP receive the normal session.

Fourth, add or replace API routes:

- `POST /api/auth/mfa/login/confirm` confirms an existing authenticator login challenge and then signs the normal session.
- `POST /api/auth/mfa/setup/confirm` confirms a setup challenge, stores the encrypted authenticator secret on `SensitiveUserData`, and signs the user in.
- `GET /api/auth/mfa/setup/qr?challengeId=...` returns the QR PNG for a pending setup challenge.
- For already signed-in users, `GET /api/auth/mfa/totp`, `POST /api/auth/mfa/totp/start`, and `POST /api/auth/mfa/totp/confirm` let Profile security display and enroll or replace the authenticator.

Fifth, update `src/lib/auth.ts`, `src/app/login/page.tsx`, and `src/app/profile/page.tsx`. The website login call sends `clientType: "web"`, handles `MFA_REQUIRED`, displays an optional post-login QR setup prompt for users without MFA, handles the same optional prompt after Google OAuth, and posts the 6-digit code for confirmation. Profile security should show authenticator status and start a QR-based replacement flow.

Sixth, add Jest coverage for helper behavior and route behavior. The critical assertions are that web login with an enrolled authenticator returns `MFA_REQUIRED` and does not set a cookie, web login without an enrolled authenticator returns a normal session, setup returns a QR URL, setup confirmation stores an encrypted secret, Stripe Connect account creation returns `MFA_REQUIRED_FOR_STRIPE_CONNECT` before any Stripe side effect when MFA is missing, and login without `clientType: "web"` still returns a normal session for mobile compatibility.

## Concrete Steps

Run commands from `/Users/elesesy/StudioProjects/mvp-site`.

1. Edit `prisma/schema.prisma` and add an additive migration under `prisma/migrations`.
2. Run `npx prisma generate` to refresh tracked generated client files.
3. Add `src/server/authTotpMfa.ts` and API routes under `src/app/api/auth/mfa`.
4. Patch `src/app/api/auth/login/route.ts`, `src/app/api/auth/google/callback/route.ts`, `src/app/api/billing/host/connect/route.ts`, `src/lib/auth.ts`, `src/app/login/page.tsx`, and `src/app/profile/page.tsx`.
5. Update tests in `src/app/api/auth/__tests__/authRoutes.test.ts`, `src/app/api/auth/google/__tests__/googleOauthRoutes.test.ts`, `src/app/api/billing/host/__tests__/connect.route.test.ts`, and add `src/server/__tests__/authTotpMfa.test.ts`.
6. Run targeted tests:
   `npm test -- --runInBand --runTestsByPath src/app/api/auth/__tests__/authRoutes.test.ts src/app/api/auth/google/__tests__/googleOauthRoutes.test.ts src/server/__tests__/authTotpMfa.test.ts`
7. Run typecheck:
   `npx tsc --noEmit`
8. Browser-smoke `/login` and verify the page loads without runtime errors.

## Validation and Acceptance

The feature is acceptable when these behaviors are true:

1. A website login request with valid password and an enrolled authenticator returns HTTP 200 JSON with `code: "MFA_REQUIRED"`, a challenge id, and no normal session cookie.
2. Confirming the correct 6-digit authenticator code for that challenge returns the same user/profile/session shape that login returned before MFA and sets the `auth_token` cookie.
3. A website password or Google login request for a user without an enrolled authenticator returns a normal session, then the login page can ask whether they want to set up an authenticator. Skip continues to the normal destination.
4. A mobile/watch-style login request without `clientType: "web"` still returns a normal session immediately after password verification.
5. Profile security can show authenticator enrollment status and replace the authenticator through a QR setup and confirm-code flow.
6. Stripe connected-account creation returns HTTP 403 with `code: "MFA_REQUIRED_FOR_STRIPE_CONNECT"` before any Stripe account creation side effect when the acting user has no enrolled authenticator.

Current validation evidence from 2026-06-12 after the Stripe-gated MFA clarification and Google optional-prompt update:

    npm test -- --runInBand --runTestsByPath src/app/api/auth/__tests__/authRoutes.test.ts src/app/api/auth/google/__tests__/googleOauthRoutes.test.ts src/server/__tests__/authTotpMfa.test.ts src/app/api/billing/host/__tests__/connect.route.test.ts
    PASS src/app/api/auth/__tests__/authRoutes.test.ts
    PASS src/app/api/auth/google/__tests__/googleOauthRoutes.test.ts
    PASS src/server/__tests__/authTotpMfa.test.ts
    PASS src/app/api/billing/host/__tests__/connect.route.test.ts
    Test Suites: 4 passed, 4 total
    Tests: 43 passed, 43 total

    npx tsc --noEmit
    exited 0

    git diff --check -- <MFA touched paths>
    exited 0

    Browser smoke:
    http://localhost:3000/login loaded with document status 200, /api/auth/me status 200, and /api/sports status 200. The accessibility snapshot showed the login form, Google button, and guest button. Console showed only Fast Refresh logs and existing Next/font preload warnings, with no app runtime errors.
    http://localhost:3000/profile?tab=security loaded with document status 200 and rendered the unauthenticated profile guard instead of an app error.

## Idempotence and Recovery

The schema migration is additive. Because the earlier phone migration may already have been applied locally, authenticator fields should be added with a new migration rather than editing applied history. Challenge rows are short-lived and can be safely expired or deleted if tests leave local data behind.

Authenticator setup secrets are not committed to a user account until a valid code is confirmed. If setup fails, creating a new setup challenge safely supersedes the old one. SMS/Twilio code remains isolated in `src/server/authPhoneMfa.ts`; it can be removed later or wired behind a deliberate future product decision.

## Artifacts and Notes

No Twilio environment variables are required for authenticator MFA. The existing Twilio variables can remain configured for a future SMS option:

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_VERIFY_SERVICE_SID`

The authenticator implementation uses the existing `src/server/integrations/secretCrypto.ts` helper. That helper derives encryption keys from `INTEGRATION_TOKEN_ENCRYPTION_KEY` or `AUTH_SECRET`, so production must have at least one of those secrets configured before authenticator setup can be confirmed.

## Interfaces and Dependencies

`src/server/authTotpMfa.ts` must expose functions for creating login/setup challenges, confirming codes, building QR payloads, and reading authenticator status. API routes should use these helpers instead of duplicating TOTP or storage logic.

No new npm dependency is required. QR rendering uses existing `qr-code-styling`, `jsdom`, and `sharp` dependencies already used by billing and event QR routes.

Revision note, 2026-06-12: This plan was rewritten from the previous phone MFA plan because the user rejected SMS/text MFA as too vulnerable and requested authenticator app setup with QR scanning. The implementation and validation sections now describe TOTP authenticator MFA as the active control and Twilio/SMS as dormant future work.

Revision note, 2026-06-12: The plan was updated again after the user clarified that MFA should not be required for every website login. MFA is now optional during normal password and Google login, required only as a server-side precondition before Stripe connected-account creation, and still prompts for a code during login after a user has enrolled an authenticator.
