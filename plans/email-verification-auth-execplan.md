# Require Email Verification For Password Signup/Login

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan follows `PLANS.md` at the repository root.

## Purpose / Big Picture

After this change, users who sign up with email/password cannot use the app until they verify their email. Users who try to log in with an unverified email/password account are blocked and prompted to verify, and the backend sends (or resends) a verification email from the server. A user can click the verification link and return to login with a success message, then sign in normally.

## Progress

- [x] (2026-03-31 22:20Z) Audited current auth behavior (`register`, `login`, `email change`, client auth service, login page, auth tests) and confirmed no initial-email verification enforcement exists.
- [x] (2026-03-31 22:33Z) Added `src/server/authEmailVerification.ts` plus `GET /api/auth/verify/confirm` and `POST /api/auth/verify/resend` routes.
- [x] (2026-03-31 22:37Z) Updated `POST /api/auth/register` and `POST /api/auth/login` to block unverified users and send verification email flows.
- [x] (2026-03-31 22:41Z) Updated `src/lib/auth.ts` + `src/app/login/page.tsx` to surface verification-required UX and resend support.
- [x] (2026-03-31 22:46Z) Added/updated Jest coverage for auth verification enforcement and new verification endpoints.
- [x] (2026-03-31 22:52Z) Hardened `GET /api/auth/me` to clear session cookies for users that remain unverified.
- [x] (2026-03-31 23:03Z) Ran targeted auth Jest suites and confirmed pass.
- [x] (2026-03-31 23:04Z) Ran targeted ESLint on all touched auth verification files and confirmed no lint violations.

## Surprises & Discoveries

- Observation: Verification logic already exists for email-change flow but not initial signup/login.
  Evidence: `src/app/api/auth/email/route.ts` + `src/app/api/auth/email/confirm/route.ts` send and confirm change-email tokens; `src/app/api/auth/register/route.ts` and `src/app/api/auth/login/route.ts` do not check `emailVerifiedAt`.

- Observation: Local environments without SMTP currently cannot send emails.
  Evidence: `src/server/email.ts` resolves config from SMTP env and `isEmailEnabled()` returns false when missing.

- Observation: Running `npm test` from a UNC Windows path fails because `cmd.exe` does not support UNC working directories.
  Evidence: Initial command from `\\wsl.localhost\...` failed with `UNC paths are not supported`; running tests through `wsl.exe bash -lc` succeeded.

- Observation: Jest reported a forced worker shutdown warning despite all tests passing.
  Evidence: Test output included `A worker process has failed to exit gracefully...`; no failing assertions or non-zero exit occurred.

## Decision Log

- Decision: Reuse JWT token pattern used by email-change flow, but introduce a dedicated token type and dedicated initial-verification routes to avoid coupling signup verification to change-email semantics.
  Rationale: Keeps behavior explicit, easier to test, and avoids accidental regressions in profile email-change flow.
  Date/Author: 2026-03-31 / Codex

- Decision: Treat unverified email/password users as unauthenticated until verification is complete.
  Rationale: Matches requirement to require email verification for signup/login and avoids granting authenticated sessions before verification.
  Date/Author: 2026-03-31 / Codex

- Decision: Return `202` on registration success when verification is pending, and `403` on login attempts for unverified users.
  Rationale: Distinguishes account-creation completion from authenticated access and keeps login semantics explicit when credentials are valid but verification is missing.
  Date/Author: 2026-03-31 / Codex

- Decision: In `GET /api/auth/me`, immediately clear auth cookie and return a null session when `emailVerifiedAt` is missing.
  Rationale: Prevents older pre-change sessions from remaining usable after verification enforcement is introduced.
  Date/Author: 2026-03-31 / Codex

## Outcomes & Retrospective

Password signup/login now require email verification. Registration creates the account/profile records but no longer creates an authenticated session; instead, it returns a verification-required response and triggers server-side verification email delivery. Login now blocks unverified users, sends a verification email, and returns a structured `EMAIL_NOT_VERIFIED` response.

The UI now detects this response, renders a verification prompt, supports resend from the login/signup form, and displays success/error status when the verification link redirects back to `/login`.

Coverage was extended for both updated auth routes and new verify routes. Targeted auth tests passed.

## Context and Orientation

Auth API routes live under `src/app/api/auth`. Password auth currently uses `src/app/api/auth/register/route.ts` and `src/app/api/auth/login/route.ts`, and session cookie handling is in `src/lib/authServer.ts`. Email transport is centralized in `src/server/email.ts`. The web login/signup UI is combined in `src/app/login/page.tsx`, which calls `authService` methods in `src/lib/auth.ts`.

`AuthUser.emailVerifiedAt` is the database field indicating email verification. Google OAuth routes already set this field for verified Google accounts, but password routes currently do not enforce it.

## Plan of Work

Implement a shared helper in `src/server/authEmailVerification.ts` to sign/verify verification tokens and send verification emails using `sendEmail` and request origin URL construction.

Add `src/app/api/auth/verify/confirm/route.ts` to consume the token, validate user/email match, set `emailVerifiedAt`, and redirect to `/login` with status query params. Add `src/app/api/auth/verify/resend/route.ts` to accept an email, verify that account exists and is still unverified, and send a new verification email.

Update password auth routes so successful register/login attempts for unverified users return a structured verification-required response (with no session cookie set) and trigger verification email sending on the server side.

Update `src/lib/auth.ts` to preserve structured API error metadata (status/code/email), implement `resendVerification`, and let login/signup callers detect verification-required responses. Update `src/app/login/page.tsx` to render a verification prompt and resend button when verification is required and show success/error messages after confirmation redirect.

Update and extend route tests in `src/app/api/auth/__tests__/authRoutes.test.ts`, plus add tests for new verification endpoints in a new test file under `src/app/api/auth/verify/__tests__/route.test.ts`.

## Concrete Steps

From repository root `\\wsl.localhost\Ubuntu\home\camka\Projects\MVP\mvp-site`:

1. Create helper and endpoint files:
   - `src/server/authEmailVerification.ts`
   - `src/app/api/auth/verify/confirm/route.ts`
   - `src/app/api/auth/verify/resend/route.ts`
2. Patch existing routes and client files:
   - `src/app/api/auth/register/route.ts`
   - `src/app/api/auth/login/route.ts`
   - `src/lib/auth.ts`
   - `src/app/login/page.tsx`
3. Add/patch tests:
   - `src/app/api/auth/__tests__/authRoutes.test.ts`
   - `src/app/api/auth/verify/__tests__/route.test.ts`
4. Run tests:
   - `npm test -- src/app/api/auth/__tests__/authRoutes.test.ts src/app/api/auth/verify/__tests__/route.test.ts`

Expected high-level test outcome: all targeted auth tests pass, including new unverified-account flows.

## Validation and Acceptance

Acceptance is satisfied when:

- Signup with email/password returns a verification-required response and does not establish a session.
- Login with valid credentials for an unverified user returns a verification-required response and does not establish a session.
- Verification email resend endpoint can be called from login UI and reports success/failure appropriately.
- Visiting `/api/auth/verify/confirm?token=...` marks the account verified and redirects to `/login` with a success indicator.
- Login page shows clear verification guidance and supports resend from that prompt.
- Targeted auth Jest tests pass and cover new behavior.

## Idempotence and Recovery

These edits are additive and idempotent: rerunning tests is safe, and reapplying verification resend requests should not mutate verified accounts. If verification email cannot be sent (SMTP unavailable), routes return a clear error and no authentication session is created for unverified accounts.

## Artifacts and Notes

Implementation and validation artifact:

- `wsl.exe bash -lc "cd /home/camka/Projects/MVP/mvp-site && npm test -- src/app/api/auth/__tests__/authRoutes.test.ts src/app/api/auth/verify/__tests__/route.test.ts"`
- Result: `2 passed` suites, `19 passed` tests.
- `wsl.exe bash -lc "cd /home/camka/Projects/MVP/mvp-site && npm run lint -- src/lib/auth.ts src/app/login/page.tsx src/app/api/auth/register/route.ts src/app/api/auth/login/route.ts src/app/api/auth/verify/confirm/route.ts src/app/api/auth/verify/resend/route.ts src/server/authEmailVerification.ts src/app/api/auth/__tests__/authRoutes.test.ts src/app/api/auth/verify/__tests__/route.test.ts"`
- Result: ESLint completed with no reported errors.

## Interfaces and Dependencies

New backend helper interface in `src/server/authEmailVerification.ts`:

- `sendInitialEmailVerification(params: { userId: string; email: string; origin: string }): Promise<{ sent: true }>`
- `readInitialEmailVerificationToken(token: string | null): { userId: string; email: string } | null`
- `isInitialEmailVerificationAvailable(): boolean`

New route contracts:

- `POST /api/auth/verify/resend` body: `{ email: string }`; response: `{ ok: true }` or explicit transport error.
- `GET /api/auth/verify/confirm?token=...` redirects to `/login?verification=success|error&verificationMessage=...`.

Updated auth route error contract for unverified users:

- JSON response includes `code: "EMAIL_NOT_VERIFIED"`, `email`, and user-facing `error` message.

Plan revision note: Updated plan to reflect completed backend/client implementation, test execution results, and an execution discovery about running Jest from UNC paths.
