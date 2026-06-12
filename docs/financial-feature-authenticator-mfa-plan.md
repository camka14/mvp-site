# Financial Feature Authenticator MFA Plan

## Goal

Require an authenticator app before a user can create a Stripe connected account to collect money through BracketIQ. Normal website sign-in should not force MFA setup, but if a user has enabled MFA, website sign-in must prompt for the current authenticator code. Mobile and watch clients keep the existing login path because they do not expose Stripe account creation.

The active MFA method is TOTP, the 6-digit code flow used by Microsoft Authenticator, Google Authenticator, 1Password, Authy, and similar apps. The earlier Twilio/SMS helper is retained in code for a possible future option, but SMS is not part of the active Stripe account creation requirement.

Implementation is committed on the local `dev` branch. The app can claim website authenticator-app MFA for the current implementation scope: users who enable MFA must enter an authenticator code before a website session is issued, and Stripe connected-account creation is blocked until MFA is enrolled.

## Protected Scope

Gate these actions behind website authenticator MFA:

- Creating a user Stripe connected account.
- Creating an organization Stripe connected account.
- Any future website workflow that creates a payout-capable account, enables payout collection, or collects banking/tax identity data for payment processing.

Do not require MFA merely because a user signs in, creates an organization, or browses organization finance screens. The hard requirement begins when the user tries to create a Stripe connected account to collect money.

## Data Model

Add authenticator fields to user-owned sensitive profile data:

- `totpSecretEncrypted`
- `totpEnabledAt`
- `totpVerifiedAt`
- `totpLastUsedCounter`
- `totpProvider`
- `financialMfaRequiredAt`
- `financialMfaSatisfiedAt`

Use `AuthMfaChallenges` for short-lived login and setup challenges. Setup challenge rows hold the temporary encrypted TOTP secret until the user scans the QR code and proves possession by entering a valid 6-digit code.

## User Flow

Website password login:

1. User submits email and password from `/login`.
2. Server validates the primary credential.
3. If the user already has an authenticator app enrolled, the server returns `MFA_REQUIRED` and does not set `auth_token`.
4. User enters the current 6-digit code from their authenticator app.
5. On success, BracketIQ records MFA satisfaction and issues the normal website auth cookie.

Optional website setup prompt:

1. User completes password login or Google OAuth from `/login`.
2. Server validates the primary credential.
3. If the user has no enrolled authenticator, the server issues the normal website auth cookie.
4. The login page may ask whether the user wants to add an authenticator app.
5. User can scan the QR code and confirm setup, or choose Skip for now and continue.

Google OAuth website login uses the authenticator challenge flow only when the user already has MFA enabled. Otherwise it issues the normal website auth cookie and returns to `/login` with an optional MFA setup offer.

Stripe connected-account creation:

1. User clicks a Stripe onboarding/connect action for themselves or an organization they manage.
2. Server validates the session and organization permission.
3. Server checks whether the acting user has an enrolled authenticator app.
4. If not, the server returns `MFA_REQUIRED_FOR_STRIPE_CONNECT` and does not create or mock a Stripe account.
5. After authenticator setup, the user can retry Stripe onboarding.

Profile setup also supports replacing the authenticator app:

1. User opens Profile > Account security.
2. User starts authenticator setup.
3. BracketIQ displays a QR code.
4. User scans the QR code and enters the current 6-digit code.
5. On success, BracketIQ replaces the encrypted authenticator secret.

## Security Requirements

- Store authenticator secrets encrypted at rest with `src/server/integrations/secretCrypto.ts`.
- Never return the raw `otpauth://` URI or Base32 secret in normal JSON responses.
- Serve QR images with `Cache-Control: private, no-store`.
- Rate-limit setup starts and code verification attempts by challenge/user/IP using existing auth MFA rate-limit policies.
- Expire setup and login challenges after a short time.
- Invalidate old unconsumed challenges when a new challenge is created.
- Store `totpLastUsedCounter` and reject a code for the same or older 30-second counter to reduce replay risk.
- Keep mobile/watch login compatible unless mobile MFA is intentionally designed later.

## UX Requirements

Website login should show a second step for authenticator verification only when MFA is enabled. Existing users without an authenticator should be able to skip optional setup during password or Google login and continue normally.

Profile security should show whether an authenticator app is enabled and allow replacing it through a QR setup and confirm-code flow.

## Backend Requirements

Website auth routes must enforce MFA before setting `auth_token` only for users who already enabled MFA. Client-side gating is only a convenience; Stripe connected-account creation must be blocked by the server route before any Stripe account creation side effect.

Route responses should distinguish:

- `MFA_REQUIRED` when an authenticator app already exists.
- `MFA_REQUIRED_FOR_STRIPE_CONNECT` when Stripe connected-account creation is attempted before authenticator setup.

## Rollout Checklist

1. Apply Prisma migration for authenticator MFA fields.
2. Add TOTP server helpers, QR generation route, and setup/login/profile routes.
3. Add optional password/Google login setup and Profile setup MFA UI.
4. Update Google OAuth callback so it cannot bypass MFA for users who enabled it.
5. Add tests for password login, Google OAuth, Stripe Connect blocking, setup confirmation, mobile-compatible login, replay protection, expired challenges, and invalid codes.
6. Run targeted Jest, `npx tsc --noEmit`, and browser smoke tests.
7. Apply migration and deploy.
8. Browser-test password login, Google login, optional authenticator setup with Skip, existing-authenticator login, profile authenticator replacement, and Stripe Connect blocking before setup.
9. Re-check mobile/watch login because those clients intentionally do not send the website MFA marker.

## Intuit Questionnaire Answer

The Intuit questionnaire answer for app-level MFA should be updated to `Yes` for the current BracketIQ implementation. The basis is website TOTP authenticator-app MFA with QR setup, required code prompts for MFA-enabled website users, and server-side blocking before Stripe connected-account creation when MFA is not enrolled.
