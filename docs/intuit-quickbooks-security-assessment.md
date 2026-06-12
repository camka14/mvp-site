# Intuit QuickBooks Security Assessment

Last updated: June 12, 2026

## Questionnaire Handling

- Do not submit the Intuit questionnaire until every answer has been reviewed by a human owner.
- Save progress only after answers match the current implementation and the remaining operational assumptions below.
- The current QuickBooks app is still WIP on the `dev` branch and should not be represented as production-ready until the remaining items are closed.

## Security Tab Answers

| Question | Current answer | Basis |
| --- | --- | --- |
| Has your company ever had a security breach that required notification to customers or government agencies/authorities? | No | Owner-confirmed answer from Samuel Razumovskiy. |
| Do you have a security team that regularly assesses vulnerabilities and risks for your app? | Yes | Samuel Razumovskiy is the current accountable security owner. Treat this as true only if ongoing dependency audits, vulnerability review, and remediation tracking are maintained before/after releases. |
| Are the client ID and client secret for your app stored securely? | Yes | QuickBooks credentials are read from server-side environment variables and are not hardcoded or exposed as `NEXT_PUBLIC_*` values. |
| Does your app use multi-factor authentication? | Yes | BracketIQ supports website authenticator-app MFA using TOTP QR-code setup. Users who enable MFA must enter an authenticator code before a website session is issued, and Stripe connected-account creation is blocked until the acting user has enrolled an authenticator app. Mobile/watch login remains unchanged because those clients do not expose QuickBooks finance or Stripe account-creation flows. |
| Does your app use Captcha for authentication? | No | BracketIQ authentication does not currently use CAPTCHA. |
| Does your app use WebSocket? | Yes | The custom server includes realtime WebSocket support. |
| Once a customer's Intuit data is in your system, do you allow it to be used by or shown to anyone other than that customer? | No | QuickBooks connection metadata, sync metadata, and error/TID records are restricted to authorized organization finance managers. QuickBooks realm IDs and OAuth tokens are not exposed in client finance payloads. |

## Other Questionnaire Sections

The Intuit questionnaire was filled and saved on June 11, 2026, but not submitted.

### General Questions

- Most answers were already filled.
- The generative AI details field was filled with:

  `BracketIQ includes an optional AI assistant that helps signed-in users navigate supported BracketIQ workflows and prepare app actions for user confirmation. BracketIQ does not use QuickBooks data to train AI models, and the QuickBooks integration does not send QuickBooks accounting records to generative AI features.`

### App Information

Answers saved for the current BracketIQ app:

1. App build/source: `App Scratch` only.
2. Platform: `Web/SaaS`.
3. Intuit product data interaction: `It reads data from Intuit product(s)` and `It writes data to Intuit product(s)`. Delete was not selected.
4. Private/public: `We plan to make our app publicly available`.
5. Expected QuickBooks Online customers: `50`.
6. QuickBooks user types: `Any admin of the QuickBooks Online company`.
7. Other platforms: `Yes`.
8. Other platform details: `Stripe for payments, DigitalOcean for hosting, database, and storage, Google/Gmail for authentication and email, Firebase for mobile push/auth support, BoldSign for document signing, OpenAI for the optional AI assistant, and Apple/Google mobile app platform services.`

### Authorization And Authentication

Answers saved:

1. Sandbox/non-production connect/disconnect/reconnect tested: `Yes`.
   - Local sandbox disconnect and reconnect were tested successfully on June 11, 2026.
   - The Intuit development redirect URI list now includes `http://localhost:3000/api/integrations/quickbooks/callback`, matching the local authorization request exactly.
2. Token refresh frequency: `Only when access tokens expire`.
3. Retry failed authorization/authentication requests: `No`.
4. Ask customers to reconnect after auth errors: `Yes`.
5. Intuit discovery document: `No`.
6. Expired access token errors: `Yes`.
7. Expired refresh token errors: `Yes`.
8. Invalid grant errors: `Yes`.
9. CSRF errors: `Yes`.
10. OAuth playground/offline tools: `No`.

### API Usage

Answers saved:

1. API categories: `Accounting API` only.
2. Frequency: `Only on-demand during customer interactions with your app`.

### Accounting API

Selecting `Accounting API` created an additional questionnaire tab. Answers saved:

1. QuickBooks Online versions: `Simple Start`, `Essentials`, `Plus`, and `Advanced`.
2. Can handle users gaining/losing access to version-specific features: `No`.
3. Verified special features: `None of the above`.
4. Webhooks: `No`.
5. CDC operation: `No`.

### Error Handling

Answers saved:

1. Tested API syntax/validation error handling: `Yes`.
2. Capture `intuit_tid`: `Yes`.
3. Store error information in logs for troubleshooting: `Yes`.
4. In-app support contact: `Yes`.
5. Support contact details: `Customers can contact BracketIQ from within the app through the global footer support email, support@bracket-iq.com. The same support email is also listed on the privacy policy, terms, request demo, and delete data pages.`

## Fixes Implemented In This Pass

- Added encrypted storage for the QuickBooks realm/company ID via `externalCompanyIdEncrypted`.
- Cleared legacy plaintext QuickBooks realm IDs in the new migration.
- Stopped returning or displaying QuickBooks realm/company IDs in organization finance API/UI responses.
- Added Intuit token revocation before local QuickBooks disconnect clears credentials.
- Cleared encrypted realm/company ID and company name on disconnect.
- Sanitized QuickBooks OAuth callback and disconnect logging so full error objects and provider response details are not logged.
- Added central security response headers in `src/proxy.ts`.
- Added production HTTPS redirect handling when `x-forwarded-proto` is `http`.
- Added HSTS in production responses.
- Added no-store/no-cache headers for sensitive app and API routes.
- Blocked TRACE and TRACK methods.
- Added same-origin checking for unsafe browser requests, with explicit webhook/callback exemptions for Stripe, BoldSign, and QuickBooks OAuth.
- Added `npm run security:audit` as a repeatable production dependency audit command.
- Added `docs/quickbooks-data-retention-and-disconnect.md` for QuickBooks retention, storage, and disconnect handling.
- Added QuickBooks payroll account mapping fields for expense and liability/clearing accounts.
- Added approved/paid staff pay-run sync to QuickBooks Online JournalEntry, with durable sync records.
- Added QuickBooks `intuit_tid` capture on API responses and persisted it on the connection and sync record.
- Added expired/invalid refresh-token handling that marks the organization QuickBooks connection `REAUTH_REQUIRED`.
- Added pay-run sync detail UI with QuickBooks transaction id/doc number/TID, synced at/by metadata, retry actions, and reconnect-required actions.
- Added finance category account mappings and organization finance JournalEntry sync for event/team/org/custom line items.

## Remaining Before Final Submission

- Run and retain a production/staging security scan report for Intuit review.
- Confirm DigitalOcean and any CDN/proxy layers enforce HTTPS, current TLS policy, and patched server/runtime images. DigitalOcean App Platform currently reports Node.js buildpack on Ubuntu 22, a managed Postgres 17 database, database SSL enabled via `PG_SSL_REJECT_UNAUTHORIZED=true`, two service instances, active healthy deployment, and domains for `bracket-iq.com` / `www.bracket-iq.com`.
- DigitalOcean credential storage is owner-confirmed secure. Continue marking future credential-like DigitalOcean values as secret env vars; no DigitalOcean credential rotation/conversion action is tracked for this pass.
- Confirm production log retention/redaction policy and verify logs do not include credentials, Intuit tokens, QuickBooks payloads, or user financial data.
- Update the questionnaire answer for app-level MFA to `Yes` for the current BracketIQ implementation. The basis is website TOTP authenticator-app MFA with QR setup, required code prompts for MFA-enabled website users, and server-side blocking before Stripe connected-account creation when MFA is not enrolled.
- Keep the questionnaire answer for CAPTCHA as `No` unless CAPTCHA is implemented for authentication.
- Live sandbox pay-run JournalEntry sync has been confirmed against QuickBooks sandbox Journal Entry 145. The test account selections were random and should be replaced with deliberate payroll accounting mappings before production use.
- The app now avoids version-specific QuickBooks features for pay-run sync and surfaces unsupported-feature/API validation errors. Live sandbox API validation-error handling was confirmed with an invalid read query that returned QuickBooks code `4001`, stored the sanitized `Invalid query` message, kept the connection `CONNECTED`, and captured `intuit_tid` `1-6a2b2977-0b51df827d6c1c4b50e6e73d`. Confirm version-specific feature behavior separately before changing the Accounting API `Acct Change` answer from `No` to `Yes`.
- QuickBooks `intuit_tid` capture is implemented and was visible in BracketIQ after live sandbox pay-run and organization finance JournalEntry syncs.
- Live sandbox connect/disconnect/reconnect has been confirmed. The current local sandbox connection returned to `CONNECTED` after Intuit OAuth redirected to `http://localhost:3000/organizations/org_1/finance?quickbooks=return`.
- Reconnect-required handling for expired access tokens, expired refresh tokens, and invalid grant errors is implemented and reflected in the saved questionnaire. Keep testing these flows before final submission.
- Before final submission, re-open the Intuit questionnaire and verify every saved answer still matches production behavior.

## Validation Evidence

- `npm test -- --runInBand --runTestsByPath src/server/integrations/__tests__/quickBooksConnection.test.ts src/server/integrations/__tests__/quickBooksPayRunSync.test.ts src/app/api/organizations/__tests__/quickBooksFinanceIntegrationRoutes.test.ts src/app/api/organizations/__tests__/organizationFinanceRoutes.test.ts 'src/app/organizations/[id]/__tests__/OrganizationFinancePanel.test.tsx' src/server/finance/__tests__/staffPayRuns.test.ts` passed: 6 suites, 48 tests.
- `npm test -- --runInBand --runTestsByPath src/app/api/auth/__tests__/authRoutes.test.ts src/app/api/auth/google/__tests__/googleOauthRoutes.test.ts src/server/__tests__/authTotpMfa.test.ts src/server/__tests__/authPhoneMfa.test.ts src/app/api/billing/host/__tests__/connect.route.test.ts` passed: 5 suites, 45 tests.
- `npx tsc --noEmit` passed.
- Live sandbox QuickBooks API validation-error handling confirmed on June 11, 2026 with an invalid Accounting API query. The app persisted a sanitized `Invalid query` error, `lastErrorAt`, and `intuit_tid` `1-6a2b2977-0b51df827d6c1c4b50e6e73d` without marking the connection reauth-required.
- Live sandbox QuickBooks disconnect/reconnect confirmed on June 11, 2026. The redirect URI mismatch was fixed by adding `http://localhost:3000/api/integrations/quickbooks/callback` to Intuit Development Redirect URIs, and the OAuth callback returned to the local finance page with `quickbooks=return`.
- `git diff --check` passed.
- `npx prisma migrate deploy` applied `20260611093000_encrypt_quickbooks_realm_ids` locally.
- `npx prisma migrate status` reports the local database schema is up to date.
- Live QuickBooks sandbox verification found Journal Entry 145 for a synced staff pay run. The entry balanced and BracketIQ showed synced transaction metadata, including TID.
- Organization finance JournalEntry sync is implemented, covered by focused route/service/UI tests, and live sandbox verification created QuickBooks JournalEntry 147 with a persisted Intuit TID.
- `npm test -- --runInBand --runTestsByPath src/app/api/organizations/__tests__/organizationFinanceRoutes.test.ts src/app/api/organizations/__tests__/quickBooksFinanceIntegrationRoutes.test.ts 'src/app/organizations/[id]/__tests__/OrganizationFinancePanel.test.tsx' src/server/integrations/__tests__/quickBooksPayRunSync.test.ts` passed: 4 suites, 39 tests.
- `npm audit fix` removed high and critical production dependency findings without force.
- `npm run security:audit` exits 0 at the high threshold. It still reports moderate findings in transitive Prisma, Next/PostCSS, and Firebase/Google dependency paths where npm only offers `--force` fixes that would install breaking versions.

## Owner Answers Needed

These answers cannot be proven from the repository alone:

1. What recurring vulnerability review cadence should Samuel Razumovskiy commit to for the security team answer?
2. Which production/staging security scan report will be retained for Intuit review, and where will it be stored?
3. What log retention period should be documented for DigitalOcean/App Platform logs?
4. Who verifies production logs do not contain credentials, Intuit tokens, QuickBooks payloads, or user financial data?
5. Should the initial Intuit submission wait for a live sandbox JournalEntry sync test, or should the read/write Accounting API answers be revised before submission?
