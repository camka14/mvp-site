# Add the Web User Feedback Flow

This ExecPlan is a living document. Keep the sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` current during implementation.

Maintain this document in accordance with `PLANS.md` at the repository root.

## Purpose / Big Picture

BracketIQ users need a direct way to report a problem, suggest an idea, or send general feedback without leaving the product. After this work, an authenticated web user can open a feedback drawer from the global header. A guest can use a standalone Feedback page from the site footer. The form stores the submission in Postgres, sends a best-effort email notification to the administrator, and confirms the saved submission to the user. An administrator can then review and update the submission in a new Feedback tab on the existing admin dashboard.

This change also simplifies the header. Remove the global Logout button from the authenticated desktop header. Put Logout below Edit profile on the web profile page. Keep Logout hidden while the profile edit form is active. On wide desktop screens, show a labeled Feedback button immediately before the AI button. On tighter desktop screens, show an icon-only Feedback button. On mobile web, put Feedback in the hamburger menu instead of adding another header control.

The first release is web-only. The public API and database model must not depend on web-only UI details, so the native mobile app can use the same contract in a later project.

The user-visible result is successful when all of these statements are true:

- An authenticated desktop user sees `Feedback` next to the AI button and does not see `Logout` in the global header.
- An authenticated mobile web user sees `Feedback` in the navigation menu.
- A guest can reach `/feedback` from the site footer.
- A user can submit a Bug, Idea, or General feedback item and receive a confirmation without losing the entered text after a recoverable request error.
- The saved row contains only the approved content and limited technical context. It does not contain an IP address, a query string, or analytics copies of the feedback text.
- An administrator can filter, read, annotate, and change the status of a feedback item in `/admin`.
- The profile page shows a low-emphasis Logout action below Edit profile when the profile is not being edited.
- Account deletion removes feedback that is linked to the deleted user.

## Progress

- [x] (2026-08-06 20:34Z) Reviewed `PLANS.md` and the current navigation, profile, admin dashboard, rate-limit, analytics, notification, privacy, and account-deletion patterns.
- [x] (2026-08-06 20:34Z) Recorded the approved placement and the web-only first-release boundary.
- [x] (2026-08-06 21:10Z) Added the Prisma enums, model, additive migration SQL, and generated Prisma client changes. `prisma format`, `prisma validate`, `prisma generate`, and `npm run prisma:check` pass. `prisma migrate dev` was not run to completion because the existing local database has migration drift; no reset was performed.
- [x] (2026-08-06 21:10Z) Added the public submission route, validation, spam control, rate limit policy, persistence, and best-effort administrator notification.
- [x] (2026-08-06 21:21Z) Added the reusable feedback form, authenticated drawer, guest page, responsive navigation entry, and footer link.
- [x] (2026-08-06 21:21Z) Moved the web Logout action from the global navigation to the profile page and hid it while editing.
- [x] (2026-08-06 21:21Z) Added the administrator list, detail drawer, status, notes, filters, open count, and `/admin?tab=feedback&id=...` deep link.
- [x] (2026-08-06 21:21Z) Added privacy copy and account-deletion cleanup for authenticated feedback rows.
- [x] (2026-08-06 21:21Z) Added allowlisted analytics that exclude feedback content, contact information, and exact paths.
- [x] (2026-08-06 21:21Z) Added and ran focused tests, type checks, lint checks, Prisma checks, and diff checks.
- [ ] Browser acceptance against a fresh build remains deferred because the already-running local server serves the previous build and returns 404 for `/feedback`; it was not restarted.
- [x] (2026-08-06 21:21Z) Recorded final results and remaining work in this document.

## Surprises & Discoveries

- Observation: `src/components/layout/Navigation.tsx` owns logout state changes and routing today. The profile page already has `useRouter`, `authService`, `setUser`, and `setAuthUser`, so the same logout sequence can move there without a new shared auth abstraction.
  Evidence: The navigation calls `authService.logout()`, clears both user contexts, replaces the route with `/login`, and refreshes the router. `src/app/profile/page.tsx` already imports and uses the required dependencies.

- Observation: The authenticated desktop header has a stable order: mobile-app prompt, profile control, AI control, and Logout. The mobile menu does not contain these actions.
  Evidence: The authenticated branch in `src/components/layout/Navigation.tsx` renders those controls after the primary links. The menu rendered for small screens contains only the primary navigation links.

- Observation: The repository already has suitable first-party patterns for each server concern. No new external service is required.
  Evidence: `src/app/api/demo-requests/route.ts` provides Zod and honeypot patterns. `src/server/rateLimit.ts` provides Redis-backed rate limiting with a memory fallback. `src/server/adminNotifications.ts` provides administrator email formatting and recipient fallback. `src/server/razumlyAdmin.ts` protects administrator routes.

- Observation: The administrator dashboard is already large. Adding the feedback body inline would make it harder to maintain.
  Evidence: `src/app/admin/AdminDashboardClient.tsx` owns many tabs and data sets in one file. The feedback panel should be a separate component and should load only when its tab is active.

- Observation: The local development database has pre-existing Prisma migration drift and several applied migration files differ from the recorded migration history.
  Evidence: `npx prisma migrate dev --name add_feedback_submissions` reported modified applied migrations and refused to continue without a destructive schema reset. The implementation uses the exact additive SQL in `prisma/migrations/20260806210000_add_feedback_submissions/migration.sql`; no reset or deployment was performed.

- Observation: The current profile test directory does not have a rendered profile-page test.
  Evidence: `src/app/profile/__tests__/profileImageSelection.test.ts` is the only test in that directory at planning time. Add a focused page test instead of placing logout behavior in an unrelated test.

- Observation: A server is already running from this checkout, but it serves a build from before the new Feedback page existed.
  Evidence: `ps` shows `npm start` with cwd `/Users/elesesy/StudioProjects/mvp-site`; `curl -I http://127.0.0.1:3000/feedback` returns `404`. The process was not restarted because the task did not authorize a process-state change.

## Decision Log

- Decision: Use a structured first-party form instead of a `mailto:` link or an external survey.
  Rationale: BracketIQ needs reliable persistence, submission state, administrator triage, consent controls, and product analytics that do not expose the feedback text.
  Date/Author: 2026-08-06 / Codex and user.

- Decision: Put the authenticated Feedback control immediately before the AI control.
  Rationale: Both are optional product-assistance actions. Feedback remains visible without taking space from primary navigation. The AI action keeps the stronger filled style, and Feedback uses a secondary style.
  Date/Author: 2026-08-06 / Codex and user.

- Decision: Show the text label on wide screens, use an icon-only control on tighter desktop screens, and put Feedback in the hamburger menu on mobile web.
  Rationale: This keeps the action discoverable and prevents header overflow.
  Date/Author: 2026-08-06 / Codex.

- Decision: Move Logout below Edit profile and hide it during profile editing.
  Rationale: Logout is an account action, not a primary navigation action. Hiding it during editing prevents an accidental exit from a form with unsaved changes.
  Date/Author: 2026-08-06 / Codex and user.

- Decision: Support authenticated and guest submissions in the same `POST /api/feedback` route.
  Rationale: Authenticated users get the most direct product entry. A guest entry on `/feedback` gives users a recovery path when sign-in or account access is the problem.
  Date/Author: 2026-08-06 / Codex.

- Decision: Store feedback in Postgres before sending an email notification. Treat email as best effort.
  Rationale: A temporary SMTP failure must not discard user feedback or turn a saved submission into a visible failure.
  Date/Author: 2026-08-06 / Codex.

- Decision: Do not add screenshots or file attachments in the first release.
  Rationale: Attachments require file validation, access rules, retention rules, malware controls, and administrator download controls. Text and limited page context are enough to validate the flow.
  Date/Author: 2026-08-06 / Codex.

- Decision: Store the internal pathname but strip the query and fragment. Read the user agent from the request. Do not persist the IP address.
  Rationale: The page path helps reproduce a problem. Query strings can contain private values. The IP address is useful for short-lived rate limiting but is not required in the feedback record.
  Date/Author: 2026-08-06 / Codex.

- Decision: Require explicit contact consent. Do not persist a contact email when consent is false.
  Rationale: An available account email is not contact permission. The database must match the user's choice.
  Date/Author: 2026-08-06 / Codex.

- Decision: Use four administrator states: `NEW`, `IN_REVIEW`, `PLANNED`, and `CLOSED`.
  Rationale: These states support basic intake and follow-up without introducing a full issue-tracking system.
  Date/Author: 2026-08-06 / Codex.

- Decision: Delete authenticated feedback during user account deletion. Keep guest deletion requests in the existing privacy-request process.
  Rationale: Authenticated rows can be linked to a user ID and removed deterministically. A guest row has no verified account relationship.
  Date/Author: 2026-08-06 / Codex.

- Decision: Keep native `mvp-app` UI changes outside this plan.
  Rationale: The requested placement is for the web header and web profile shown in the supplied image. The new API remains suitable for a later mobile phase.
  Date/Author: 2026-08-06 / Codex.

- Decision: Preserve the local migration history and add the exact additive migration SQL without resetting the local database.
  Rationale: `prisma migrate dev` detected pre-existing modified applied migrations and schema drift. The feedback schema is additive, so the migration can be reviewed and applied later through the normal deployment approval path without destructive local recovery.
  Date/Author: 2026-08-06 / Codex.

## Outcomes & Retrospective

Implemented the web feedback flow across storage, submission, user entry points, administration, privacy, deletion, and analytics. Authenticated users can open Feedback from the desktop header or mobile menu. Guests can use `/feedback` from the footer. Submissions validate and normalize input, apply the 10-per-hour policy, persist as `NEW`, and send an administrator notification on a best-effort basis. The form keeps its draft after recoverable errors and confirms the saved identifier after success. Administrators can filter, inspect, annotate, and update feedback in the new dashboard tab. Logout now lives below Edit profile and is hidden during profile editing.

The migration is `20260806210000_add_feedback_submissions`. `npm run prisma:check` passed, but `npx prisma migrate dev --name add_feedback_submissions` could not apply because the existing local database has unrelated migration drift; no reset, production migration, deployment, or process restart was performed.

Verification completed: 18 focused Jest suites and 64 tests passed; `npx tsc --noEmit` passed; ESLint passed with two pre-existing `@next/next/no-img-element` warnings and no errors; `git diff --check` passed. Browser acceptance was not run against the current code because the already-running server returned 404 for `/feedback` and was not restarted. Native mobile UI work remains intentionally deferred.

## Context and Orientation

BracketIQ uses the Next.js App Router. React client components call service modules in `src/lib`. Route handlers in `src/app/api` validate requests and use Prisma through `src/lib/prisma.ts`. The current user is available through the application context. The administrator dashboard uses Mantine tabs in `src/app/admin/AdminDashboardClient.tsx` and administrator APIs protected by `requireRazumlyAdmin` from `src/server/razumlyAdmin.ts`.

The main files for this work are:

- `src/components/layout/Navigation.tsx`: global desktop and mobile web navigation. It currently renders the AI and Logout actions for authenticated desktop users.
- `src/components/layout/__tests__/Navigation.test.tsx`: current navigation coverage.
- `src/components/layout/SiteFooter.tsx`: global footer. It will link guests to the standalone Feedback page.
- `src/app/profile/page.tsx`: the web profile page and edit controls. It will own the moved Logout action.
- `src/app/admin/AdminDashboardClient.tsx`: existing administrator tabs and count display.
- `src/app/api/admin/counts/route.ts`: aggregate counts for the administrator tabs.
- `src/lib/apiClient.ts`: the shared browser API request helper.
- `src/lib/permissions.ts`: optional and required session helpers.
- `src/server/rateLimit.ts`: shared route rate-limit policies and response behavior.
- `src/server/adminNotifications.ts`: shared administrator email formatter and recipient selection.
- `src/lib/analytics/posthogClient.ts`: allowlist of PostHog event names.
- `src/app/api/auth/account/route.ts`: self-service account deletion transaction.
- `src/app/api/admin/users/[id]/route.ts`: administrator user-deletion transaction.
- `src/app/privacy-policy/page.tsx`: user-visible privacy and retention statements.
- `prisma/schema.prisma`: database enums and models.

In this plan, a **submission** is the database record created by a user. The **source path** is only the internal browser pathname, such as `/discover`; it excludes the query string and URL fragment. **Client context** is a small JSON object with the viewport dimensions and the web surface identifier. **Contact consent** is the user's explicit choice to allow BracketIQ to follow up by email.

## Plan of Work

### Milestone 1: Add durable storage and the public API

Add the feedback enums and model to `prisma/schema.prisma`. Follow the repository's plural model naming pattern and raw string ID pattern. Do not add Prisma relations to user or administrator models. Create a migration named `add_feedback_submissions` and regenerate Prisma Client through the repository's existing Prisma commands.

Use this schema shape:

    enum FeedbackSubmissionTypeEnum {
      BUG
      IDEA
      GENERAL
    }

    enum FeedbackSubmissionStatusEnum {
      NEW
      IN_REVIEW
      PLANNED
      CLOSED
    }

    model FeedbackSubmissions {
      id                 String                           @id
      createdAt          DateTime                         @default(now())
      updatedAt          DateTime                         @updatedAt
      type               FeedbackSubmissionTypeEnum
      status             FeedbackSubmissionStatusEnum    @default(NEW)
      message            String
      additionalContext  String?
      submitterUserId    String?
      allowContact       Boolean                          @default(false)
      contactEmail       String?
      sourcePath         String?
      userAgent          String?
      clientContext      Json                             @default("{}")
      reviewedAt         DateTime?
      reviewedByUserId   String?
      reviewNotes        String?

      @@index([status, createdAt])
      @@index([type, status, createdAt])
      @@index([submitterUserId, createdAt])
    }

Create `src/app/api/feedback/route.ts` with `export const dynamic = 'force-dynamic'` and a `POST` handler. Use `getOptionalSession(req)` so a valid session links the row to `session.userId`, while a missing or invalid session creates a guest row. Validate the JSON with Zod.

The request contract is:

    type CreateFeedbackRequest = {
      type: 'BUG' | 'IDEA' | 'GENERAL';
      message: string;
      additionalContext?: string;
      allowContact: boolean;
      contactEmail?: string;
      sourcePath?: string;
      clientContext?: {
        surface: 'WEB';
        viewportWidth?: number;
        viewportHeight?: number;
      };
      companyWebsite?: string;
    };

Apply these rules in the route, even when the client also validates them:

- Trim all text.
- Require `message` to contain 10 through 5,000 characters.
- Limit `additionalContext` to 2,000 characters.
- Require a valid email of at most 254 characters only when `allowContact` is true.
- Force `contactEmail` to `null` when `allowContact` is false.
- Limit viewport dimensions to positive integers no greater than 20,000.
- Permit only `surface: 'WEB'` in this web release.
- Normalize `sourcePath` to a path that starts with one `/`, does not start with `//`, contains no query or fragment, and is at most 500 characters. Store `null` if the value is invalid.
- Read and trim the `user-agent` request header. Store at most 512 characters.
- Do not write an IP address to Prisma or logs.

Add `feedbackSubmission` to `RATE_LIMIT_POLICIES` in `src/server/rateLimit.ts`. Use 10 requests per 60 minutes and the message `Too many feedback submissions. Please wait before trying again.` Call `applyRateLimit(req, RATE_LIMIT_POLICIES.feedbackSubmission, session?.userId)` after optional session resolution. The helper uses the request IP for the rate-limit identity and adds the user ID when it exists. This data remains in the rate-limit backend and must not enter the feedback row.

Use `companyWebsite` as an invisible honeypot. If it is nonempty, return the same `201` response shape as a real submission with a generated identifier, but do not insert a row or send a notification. This behavior must not disclose which field triggered the spam control.

For a valid request, create the row with `crypto.randomUUID()`. Then call a new `sendAdminFeedbackSubmissionNotification` export in `src/server/adminNotifications.ts`. Catch and log only the notification failure. Do not change the successful API response after the row is stored. Use the existing `ADMIN_NOTIFICATION_EMAIL_TO` recipient with its existing fallback. Include the type, message, additional context, allowed contact email, submitter user ID, source path, created time, and an administrator link. Use `/admin?tab=feedback&id=<submission-id>` as the link when the base URL is available. Do not include an email address when contact consent is false.

Return this success contract with HTTP status `201`:

    type CreateFeedbackResponse = {
      ok: true;
      submission: {
        id: string;
        status: 'NEW';
        createdAt: string;
      };
    };

Return `400` with field details for validation failures, `429` for the rate limit, and `500` only when persistence fails. Keep error copy safe for display. Do not return Prisma error details.

Add `src/app/api/feedback/__tests__/route.test.ts`. Cover an authenticated request, a guest request, validation, contact-consent normalization, source-path normalization, user-agent truncation, the honeypot, rate limiting, a Prisma failure, and a notification failure after a successful insert.

Milestone acceptance: a route test proves that a valid request creates one `NEW` row and returns `201`; a simulated email failure still returns `201`; a false contact-consent value stores no email; and no test fixture expects an IP address in the stored data.

### Milestone 2: Add the reusable user interface and place its entry points

Create `src/lib/feedbackService.ts`. Use `apiRequest` from `src/lib/apiClient.ts`. Export the request and response types and this function:

    export async function createFeedbackSubmission(
      input: CreateFeedbackRequest,
    ): Promise<CreateFeedbackResponse>;

Create `src/components/feedback/FeedbackForm.tsx`. Make it a client component that accepts the current page path, the optional signed-in email, the entry source, and callbacks for successful submission and cancellation. Keep the form reusable so both the drawer and `/feedback` page use it.

Use these visible controls:

- A segmented or radio control labeled `What kind of feedback is this?` with Bug, Idea, and General options.
- A required textarea labeled `Your feedback`.
- A second textarea for Bug with the label `What did you expect to happen?`.
- A second textarea for Idea with the label `What are you trying to accomplish?`.
- No second textarea for General in the first release.
- A checkbox labeled `You may contact me about this feedback`.
- An email field shown only when the checkbox is selected. Prefill it from the authenticated user's email when available, but submit it only while the checkbox remains selected.
- A hidden, keyboard-inaccessible `companyWebsite` honeypot.
- A primary `Send feedback` action and a secondary `Cancel` action when a cancel callback exists.

Build `sourcePath` from `window.location.pathname`, not from `href`. Add the viewport width and height just before submission. Preserve all form state when the server returns an error. Show one useful error alert and keep the fields editable. Disable repeated submission while a request is pending.

After success, replace the form with a confirmation state. State that the feedback was received and show the submission identifier in a copyable, low-emphasis form. Provide `Done` and `Send another` actions. `Send another` clears the text and consent state. `Done` closes the drawer or returns the standalone page to its initial state.

Create `src/components/feedback/FeedbackDrawer.tsx`. Make it a controlled client component with `opened`, `onClose`, and the optional authenticated email. Use a Mantine `Drawer`. Use a right-side drawer on desktop and a full-width surface on small screens. Title it `Send feedback` and add a short description that explains the three feedback types. Let Mantine trap focus, close on Escape, and return focus to the trigger. Keep an unfinished draft in component state when the user closes and reopens the drawer during the current page session. Clear it only after a successful submission followed by `Done`, or after `Send another` begins a new form.

Update `src/components/layout/Navigation.tsx`:

- Remove the desktop Logout button and its handler.
- Remove `authService`, router, and context-setter imports or destructuring that become unused.
- Add controlled feedback-drawer state for authenticated users.
- Insert Feedback immediately before the AI button.
- Use a `MessageSquarePlus` or equivalent Lucide icon.
- Use a secondary outlined style. Keep the AI control visually primary.
- At the wide breakpoint, show the icon and `Feedback` text.
- At the tighter desktop breakpoint, show the icon only with `aria-label="Send feedback"` and a tooltip.
- Add a labeled Feedback item to the authenticated mobile hamburger menu. It opens the same drawer and closes the menu.
- Do not add Feedback to the guest header.
- While editing the mobile menu, add a clear accessible name, `aria-expanded`, and `aria-controls` to the hamburger button.

Keep the authenticated desktop order:

    Get Mobile App -> Profile -> Feedback -> AI

Update `src/components/layout/__tests__/Navigation.test.tsx`. Assert that an authenticated desktop user sees Feedback and AI but not Logout. Assert that a guest sees neither authenticated Feedback nor Logout. Assert that the mobile menu has a labeled Feedback action, and that the menu button exposes its accessible state.

Create `src/app/feedback/page.tsx`. Render the normal Navigation, a centered page title, the shared form, and the normal footer through the root layout. Let authenticated and guest users use the page. Use page metadata with the canonical URL `https://bracket-iq.com/feedback`. Do not index private submission content because no content is rendered into the URL or server page.

Update `src/components/layout/SiteFooter.tsx` to add a visible `Feedback` link to `/feedback`. Update `src/components/layout/__tests__/SiteFooter.test.tsx`.

Add `src/components/feedback/__tests__/FeedbackForm.test.tsx` and `src/components/feedback/__tests__/FeedbackDrawer.test.tsx`. Cover type-dependent fields, length errors, consent-controlled email behavior, authenticated email prefill, loading state, recoverable request failure, success state, `Send another`, drawer close and reopen draft preservation, and focus-visible labels.

Milestone acceptance: a user can open the same form from the authenticated header or mobile menu, a guest can use `/feedback`, and a recoverable API error does not clear any entered value.

### Milestone 3: Move Logout to the profile page

Update `src/app/profile/page.tsx`. Add a local `handleLogout` that keeps the existing logout sequence:

    await authService.logout();
    setUser(null);
    setAuthUser(null);
    router.replace('/login');
    router.refresh();

When the profile is not in edit mode, replace the single right-side Edit profile control container with a vertical stack. Keep Edit profile as the primary button. Put a low-emphasis red text or subtle button labeled `Log out` below it. Use the same right alignment on desktop and a stable layout on small screens. When the page is in edit mode, render only Cancel and Save in that action area. Do not render Logout until editing ends.

Disable Logout while its request is pending. If logout fails, restore the action and show the page's existing notification or error pattern. Do not clear the local user state before `authService.logout()` succeeds.

Create `src/app/profile/__tests__/page.test.tsx` or extract a small `ProfileHeaderActions` component with a focused test if the page's dependency graph makes a full page render unstable. Test the user-visible contract: Edit profile and Logout appear in view mode; Logout disappears in edit mode; a successful logout clears both contexts and routes to `/login`; and a failed logout does not clear the contexts.

Milestone acceptance: no authenticated global navigation layout shows Logout, and the profile page is the single visible web Logout location in normal use.

### Milestone 4: Add administrator triage

Create `src/app/api/admin/feedback/route.ts` with an administrator-protected `GET` handler. Use `requireRazumlyAdmin(req)`. Support these query parameters:

- `page`: positive integer, default 1.
- `pageSize`: positive integer, default 25, maximum 50.
- `type`: one feedback type or omitted.
- `status`: one status or omitted.
- `query`: optional trimmed text, maximum 200 characters. Search `message`, `additionalContext`, `contactEmail`, and `submitterUserId` with case-insensitive matching.

Sort by `createdAt` descending, then `id` descending. Return rows, total count, page, page size, and total pages. Return the full feedback fields needed by the administrator panel, but never return rate-limit identity data because it is not stored.

Create `src/app/api/admin/feedback/[id]/route.ts` with an administrator-protected `PATCH` handler. Accept only:

    type UpdateFeedbackRequest = {
      status: 'NEW' | 'IN_REVIEW' | 'PLANNED' | 'CLOSED';
      reviewNotes?: string;
    };

Limit `reviewNotes` to 5,000 characters. Store an empty trimmed value as `null`. Set `reviewedByUserId` to the administrator user ID and `reviewedAt` to the current time when the state leaves `NEW` or the administrator saves a note. Return `404` for an unknown identifier. Do not add a delete endpoint in this release.

Add route tests at:

- `src/app/api/admin/feedback/__tests__/route.test.ts`
- `src/app/api/admin/feedback/[id]/__tests__/route.test.ts`

Cover administrator authorization, filters, pagination, ordering, query search, valid updates, note trimming, invalid state, and missing rows.

Create `src/app/admin/AdminFeedbackPanel.tsx`. Keep its data loading and mutation code inside the component or a small adjacent service. The panel must provide:

- A count of open items.
- Type, status, and text filters.
- A paginated list or table with created time, type, status, a message preview, and contact-permission state.
- A detail drawer or panel with the full message, additional context, source path, client context, user agent, submitter user ID, and permitted contact email.
- A status control and review-notes field.
- A save action with success and error feedback.
- A clear empty state.

Do not display a contact email when `allowContact` is false, even if malformed historical data contains one. Make source paths internal links only after confirming that they start with one `/` and not `//`.

Add `src/app/admin/__tests__/AdminFeedbackPanel.test.tsx`. Test loading, empty, error, filter, detail, consent, and status-update states.

Update `src/app/admin/AdminDashboardClient.tsx`:

- Add `feedback` to `AdminTab`.
- Add a Feedback tab with its count.
- Render `AdminFeedbackPanel` only when that tab is active.
- Read the initial `tab` query parameter. Accept only known tab values and default to `events`.
- Pass an optional `id` query parameter to the feedback panel so an administrator email link can open the matching item after it loads.
- When the user selects a tab, update the URL with `router.replace` without a full page load. Remove an obsolete feedback `id` when leaving the Feedback tab.

Update `src/app/api/admin/counts/route.ts` and its test. Add a `feedback` count where status is `NEW` or `IN_REVIEW`. Update the `AdminDashboardCounts` type and safe response parsing in the client.

Milestone acceptance: an administrator can follow the email link, open the matching feedback item, add a note, change its state, and see the open count update after refresh. A non-administrator receives `403` from both administrator feedback routes.

### Milestone 5: Add privacy, deletion, and safe analytics

Update `src/app/privacy-policy/page.tsx` and `src/app/privacy-policy/__tests__/page.test.tsx`. State these facts in plain language:

- BracketIQ collects the feedback text, optional follow-up email, feedback type, related page path, and limited device or browser context.
- BracketIQ uses the information to answer feedback, fix problems, and plan improvements.
- BracketIQ contacts the submitter only when the submitter gives permission.
- Authenticated feedback linked to an account is deleted with that account.
- A guest can use the privacy contact method to request deletion of a guest submission and should provide the confirmation identifier.

Update the account-deletion transaction in `src/app/api/auth/account/route.ts` to call:

    tx.feedbackSubmissions.deleteMany({ where: { submitterUserId: userId } })

Add the same cleanup to the administrator deletion transaction in `src/app/api/admin/users/[id]/route.ts`. Update these existing tests:

- `src/app/api/auth/account/__tests__/route.test.ts`
- `src/app/api/admin/users/[id]/__tests__/route.test.ts`

Assert that cleanup runs inside the transaction before the user row is deleted and that a cleanup failure prevents a partial account deletion.

Add `feedback opened` and `feedback submitted` to the allowlist in `src/lib/analytics/posthogClient.ts`. Create `src/lib/analytics/feedbackAnalytics.ts` with small functions that accept only safe properties. Permitted properties are:

- Entry source: `desktop_header`, `mobile_menu`, or `standalone_page`.
- Feedback type on successful submission.
- Whether contact consent is true.
- A normalized path category such as `profile`, `discover`, `admin`, `event`, `organization`, or `other`.

Never send the message, additional context, contact email, exact source path, user agent, viewport dimensions, submission ID, or user ID to PostHog. Capture `feedback opened` once for each drawer-open transition or standalone page load. Do not capture it again because of a component rerender. Capture `feedback submitted` only after the API returns success.

Update `src/lib/analytics/__tests__/posthogClient.test.ts` and add `src/lib/analytics/__tests__/feedbackAnalytics.test.ts`. Assert the exact permitted payload and assert that arbitrary content cannot enter the helper interface.

Milestone acceptance: both account-deletion paths remove linked feedback, the privacy page describes the flow, and analytics tests contain no feedback content or contact information.

### Milestone 6: Verify the integrated web flow

Run all focused automated checks in series. Do not run Jest from multiple agents or shells in this checkout. Then use an already running local server for browser checks. If no local server is running, ask for explicit process-start authorization before running `npm run dev:plain` or another server command.

Perform these manual checks with clean test data:

1. At a 1440-pixel desktop width, sign in. Confirm the order `Get Mobile App`, profile, Feedback, AI. Confirm that Logout is absent.
2. Open Feedback with the mouse and keyboard. Confirm the drawer title, focus behavior, type-dependent fields, consent field, error display, success display, `Done`, and `Send another`.
3. At a tighter desktop width near the responsive breakpoint, confirm that Feedback becomes icon-only and does not cause header overlap. Confirm its tooltip and accessible name.
4. At a 390-pixel mobile width, confirm that Feedback appears in the authenticated hamburger menu and not as a crowded header icon. Confirm that the hamburger exposes its expanded state.
5. Sign out through the profile page. Confirm that Logout is below Edit profile, disappears during edit mode, and routes to `/login` after success.
6. As a guest, open `/feedback` from the footer and submit a General item.
7. As an administrator, open `/admin?tab=feedback`, find both submissions, open the detail view, add a review note, and move one item from New to In review.
8. Confirm with a database read that stored `sourcePath` values have no query strings or fragments, false consent has no contact email, and no IP field exists.
9. Use keyboard-only navigation. Confirm that focus enters the drawer, Escape closes it, focus returns to the Feedback trigger, labels are announced, and the mobile actions have practical tap targets of at least 44 CSS pixels.

Do not deploy the migration or application as part of this plan unless the user gives separate production approval. Do not run `prisma migrate deploy`, restart production, or write to the live database during implementation validation.

## Concrete Steps

Run commands from `/Users/elesesy/StudioProjects/mvp-site`.

1. Before editing, inspect the worktree and preserve all unrelated changes:

       git status --short
       git diff -- prisma/schema.prisma src/components/layout/Navigation.tsx src/app/profile/page.tsx src/app/admin/AdminDashboardClient.tsx

2. Add the Prisma schema changes. Format and validate the schema:

       npx prisma format --schema prisma/schema.prisma
       npm run prisma:check

3. Create the local development migration during implementation:

       npx prisma migrate dev --name add_feedback_submissions

   Record the generated directory name in `Progress`. Inspect its SQL. Confirm that it only creates the two enums, the `FeedbackSubmissions` table, and its indexes.

4. Implement Milestones 1 through 5 in order. After each milestone, run its focused Jest files with `--runInBand`. Mock Prisma, email, navigation, and analytics at the route or component boundary. Do not depend on the live database or SMTP server.

5. Run the focused test set in one process. Adjust the path list if implementation extracts an equivalent focused component test:

       npx jest --runInBand \
         src/app/api/feedback/__tests__/route.test.ts \
         src/app/api/admin/feedback/__tests__/route.test.ts \
         'src/app/api/admin/feedback/[id]/__tests__/route.test.ts' \
         src/app/api/admin/counts/__tests__/route.test.ts \
         src/components/feedback/__tests__/FeedbackForm.test.tsx \
         src/components/feedback/__tests__/FeedbackDrawer.test.tsx \
         src/components/layout/__tests__/Navigation.test.tsx \
         src/components/layout/__tests__/SiteFooter.test.tsx \
         src/app/profile/__tests__/page.test.tsx \
         src/app/admin/__tests__/AdminFeedbackPanel.test.tsx \
         src/app/api/auth/account/__tests__/route.test.ts \
         'src/app/api/admin/users/[id]/__tests__/route.test.ts' \
         src/app/privacy-policy/__tests__/page.test.tsx \
         src/lib/analytics/__tests__/posthogClient.test.ts \
         src/lib/analytics/__tests__/feedbackAnalytics.test.ts \
         src/server/__tests__/rateLimit.test.ts

6. Run static checks:

       npx tsc --noEmit
       npx eslint \
         src/app/api/feedback/route.ts \
         src/app/api/admin/feedback/route.ts \
         'src/app/api/admin/feedback/[id]/route.ts' \
         src/components/feedback/FeedbackForm.tsx \
         src/components/feedback/FeedbackDrawer.tsx \
         src/components/layout/Navigation.tsx \
         src/components/layout/SiteFooter.tsx \
         src/app/feedback/page.tsx \
         src/app/profile/page.tsx \
         src/app/admin/AdminFeedbackPanel.tsx \
         src/app/admin/AdminDashboardClient.tsx \
         src/app/api/admin/counts/route.ts \
         src/app/api/auth/account/route.ts \
         'src/app/api/admin/users/[id]/route.ts' \
         src/app/privacy-policy/page.tsx \
         src/lib/feedbackService.ts \
         src/lib/analytics/feedbackAnalytics.ts \
         src/lib/analytics/posthogClient.ts \
         src/server/adminNotifications.ts \
         src/server/rateLimit.ts

7. Use the browser checks in Milestone 6. Save concise evidence in `Artifacts and Notes`. Do not include real feedback text, private email addresses, or user-agent values in screenshots or notes.

8. Review only the scoped diff and check whitespace:

       git diff --check -- \
         prisma/schema.prisma \
         prisma/migrations \
         src/app/api/feedback \
         src/app/api/admin/feedback \
         src/components/feedback \
         src/components/layout/Navigation.tsx \
         src/components/layout/SiteFooter.tsx \
         src/app/feedback \
         src/app/profile \
         src/app/admin \
         src/app/api/admin/counts/route.ts \
         src/app/api/auth/account \
         'src/app/api/admin/users/[id]' \
         src/app/privacy-policy \
         src/lib/feedbackService.ts \
         src/lib/analytics \
         src/server/adminNotifications.ts \
         src/server/rateLimit.ts \
         docs/user-feedback-flow-execplan.md

       git status --short

9. Update every section of this ExecPlan. Mark only completed work as complete. Record any failed or skipped check with its reason.

## Validation and Acceptance

Automated acceptance requires:

- Prisma schema formatting and `npm run prisma:check` pass.
- The migration SQL contains no unrelated table or enum change.
- All focused Jest tests pass in one `--runInBand` process.
- `npx tsc --noEmit` passes.
- ESLint passes for every touched TypeScript and TSX file.
- `git diff --check` reports no whitespace error for the scoped paths.

API acceptance requires:

- Authenticated and guest requests both create submissions.
- Invalid type, short message, long message, invalid consent email, and oversized context return `400`.
- False contact consent always stores `contactEmail: null`.
- Stored source paths never include `?` or `#`.
- The route stores no IP address.
- The honeypot returns a normal-looking `201` response without persistence or email.
- The eleventh request in the same rate-limit window returns `429` when route limits are enabled in the test.
- A persistence failure returns `500` without an email attempt.
- An email failure after persistence still returns `201`.
- Administrator list and update routes reject non-administrators.

UI acceptance requires:

- The desktop, tighter desktop, and mobile placements match the Purpose section.
- Feedback is always text-labeled or has an accessible name and tooltip.
- The form preserves user input across recoverable errors and drawer close/reopen.
- Success appears only after persistence succeeds.
- Profile Logout is absent in edit mode and present below Edit profile in view mode.
- The administrator view never shows a contact email when consent is false.

Privacy acceptance requires:

- The privacy policy accurately describes collection, use, contact consent, and deletion.
- Both account-deletion transactions remove linked feedback.
- No analytics payload contains feedback text, additional context, email, exact path, submission identifier, user agent, viewport, or user ID.

## Idempotence and Recovery

Most implementation steps are safe to repeat. `npx prisma format`, `npm run prisma:check`, Jest, TypeScript, ESLint, and diff checks are read-only or deterministic.

Run `npx prisma migrate dev --name add_feedback_submissions` only after adding the schema once. If Prisma creates a migration and a later code step fails, keep the migration and repair the code. Do not create a second migration for the same intended schema. If the generated migration contains unrelated changes, stop. Inspect the local database migration state and the existing dirty worktree before removing or replacing any migration. Do not use `git reset --hard`, `prisma migrate reset`, or a destructive database command.

The feedback POST route creates a new row for each accepted request. A browser retry after an unknown network result can create a duplicate. The submit button lock prevents normal double-click duplicates. If production evidence later shows frequent network-retry duplicates, add an idempotency key in a separate change. Do not silently merge similar feedback in this release.

If email fails, the saved row remains the source of truth and appears in the administrator dashboard. The administrator can act on it without an email. If PostHog is unavailable, submission remains successful because analytics runs only after the API success and does not control the UI result.

If the standalone page or drawer fails to load, the footer support email remains available. Do not remove the existing support address.

Production migration and deployment are separate operations. Before any later production migration, review the committed SQL, take the normal database backup, obtain explicit production approval, run the repository's approved migration-deploy command, and verify the table and indexes. Do not infer deployment approval from approval to implement this plan.

## Artifacts and Notes

Planning evidence:

- The supplied profile screenshot shows the current Logout action in the global desktop header and the current Edit profile action in the profile hero.
- `src/components/layout/Navigation.tsx` confirms the current authenticated header order and owns the current logout sequence.
- `src/app/profile/page.tsx` confirms that the profile page has the state and router dependencies required to own logout.
- `src/app/api/demo-requests/route.ts`, `src/server/rateLimit.ts`, `src/server/adminNotifications.ts`, and `src/server/razumlyAdmin.ts` provide repository patterns for validation, spam control, rate limiting, email, and administrator authorization.
- The worktree contained unrelated affiliate-import changes when this plan was written. Preserve them during implementation.

Add implementation evidence here. Use short entries with commands, result summaries, and browser viewport sizes. Do not paste large logs.

Implementation evidence:

- `npm run prisma:check`: passed (`prisma validate`, Prisma Client generation, and generated-client check).
- `npx jest --runInBand --runTestsByPath ...`: 18 suites passed, 64 tests passed, including public/admin routes, form/drawer, navigation/footer, profile logout, deletion, privacy, counts, analytics, and notification behavior.
- `npx tsc --noEmit`: passed.
- `npx eslint ...`: passed with two existing image-optimization warnings and no errors.
- `git diff --check`: passed. Unrelated affiliate-import changes remained untouched.
- Browser check: not run. The existing `npm start` process at `127.0.0.1:3000` returned 404 for `/feedback`, indicating a stale build; no process state was changed.

## Interfaces and Dependencies

No new npm package or external service is required. Use the existing dependencies:

- Next.js route handlers and App Router pages.
- Mantine controls and Drawer.
- Lucide React icons.
- Zod request validation.
- Prisma Client and Postgres.
- The existing SMTP wrapper through `src/server/adminNotifications.ts`.
- The existing Redis or memory rate-limit helper.
- The existing PostHog client wrapper.

The implementation must leave these stable interfaces:

In `src/lib/feedbackService.ts`:

    export type FeedbackSubmissionType = 'BUG' | 'IDEA' | 'GENERAL';

    export type FeedbackEntrySource =
      | 'desktop_header'
      | 'mobile_menu'
      | 'standalone_page';

    export type CreateFeedbackRequest = {
      type: FeedbackSubmissionType;
      message: string;
      additionalContext?: string;
      allowContact: boolean;
      contactEmail?: string;
      sourcePath?: string;
      clientContext?: {
        surface: 'WEB';
        viewportWidth?: number;
        viewportHeight?: number;
      };
      companyWebsite?: string;
    };

    export type CreateFeedbackResponse = {
      ok: true;
      submission: {
        id: string;
        status: 'NEW';
        createdAt: string;
      };
    };

    export async function createFeedbackSubmission(
      input: CreateFeedbackRequest,
    ): Promise<CreateFeedbackResponse>;

In `src/components/feedback/FeedbackDrawer.tsx`:

    export type FeedbackDrawerProps = {
      opened: boolean;
      onClose: () => void;
      authenticatedEmail?: string | null;
      entrySource: 'desktop_header' | 'mobile_menu';
    };

In `src/server/adminNotifications.ts`:

    export type AdminFeedbackSubmissionNotification = {
      id: string;
      type: 'BUG' | 'IDEA' | 'GENERAL';
      message: string;
      additionalContext?: string | null;
      submitterUserId?: string | null;
      allowContact: boolean;
      contactEmail?: string | null;
      sourcePath?: string | null;
      createdAt: Date | string;
      baseUrl?: string | null;
    };

    export async function sendAdminFeedbackSubmissionNotification(
      input: AdminFeedbackSubmissionNotification,
    ): Promise<void>;

In the administrator list response:

    type AdminFeedbackListResponse = {
      items: AdminFeedbackSubmission[];
      total: number;
      page: number;
      pageSize: number;
      totalPages: number;
    };

Do not expose Prisma enums directly to client component props if doing so would pull server-only generated code into the browser bundle. Use the string unions in the client service and validate them again in the server route.

## Plan Revision Notes

- 2026-08-06: Created the implementation plan after the placement discussion. The plan covers the web feedback form, responsive entry points, profile Logout move, durable storage, administrator triage, privacy, deletion, safe analytics, and later mobile compatibility. No product code, runtime, database, or production state changed while creating this plan.
- 2026-08-06: Simplified standalone-page analytics to one unambiguous entry source, required one open event per visibility transition, and added the existing administrator-count route test to the focused validation command.
- 2026-08-06: Implemented the plan. Added the feedback model and migration, web submission surfaces, administrator workflow, privacy/deletion behavior, and safe analytics. Local migration application and fresh-build browser acceptance remain deferred because of pre-existing database drift and the already-running stale server.
