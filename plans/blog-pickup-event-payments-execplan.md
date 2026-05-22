# Document Paid Pickup Event Creation With Screenshots

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with [PLANS.md](../PLANS.md).

## Purpose / Big Picture

BracketIQ's current published blog article is about tournament scheduling, but the next article should teach a non-organization user how to create a paid sports pickup event and collect participant payments. After this work is complete, the website should have an accurate, screenshot-backed article based on the real local product flow rather than guessed instructions. A reader should be able to follow the article to create a beach volleyball pickup event, set a participant price, publish it, and understand how participants reach the paid join flow.

This plan covers one event type only: a single paid pickup event. Future event types, such as leagues, tournaments, weekly events, rentals, or team-registration flows, must get their own ExecPlan files instead of extending this one.

## Progress

- [x] 2026-05-22 00:00Z Created this ExecPlan and moved article flow planning out of `src/content/blog/AGENTS.md`.
- [x] 2026-05-22 00:00Z Recorded the reserved local fixture event id, host user, participant user, and image asset for this article.
- [x] 2026-05-22 02:40Z Verified fixture users, host Stripe state, sport, and image upload through the local Prisma client.
- [x] 2026-05-22 02:58Z Used Playwright against the local Next.js app to create, publish, and verify the living pickup event.
- [x] 2026-05-22 02:58Z Captured the screenshot sequence from the verified host and participant browser actions.
- [x] 2026-05-22 03:10Z Rewrote the existing article metadata and body around the paid pickup-event flow.
- [x] 2026-05-22 03:10Z Updated the blog registry, article slug, landing resource link, article CTA text, and tests for the new topic.
- [x] 2026-05-22 03:20Z Ran focused validation and recorded outcomes here.

## Surprises & Discoveries

- Observation: No local event matched the reserved fixture id or name when planning began.
  Evidence: a Prisma query for events whose id or name contained `article`, or whose name contained `Beach`, returned an empty array.

- Observation: `Beach Volleyball` already exists in the local `Sports` table.
  Evidence: querying `prisma.sports.findMany` showed `Beach Volleyball` among the seeded sports.

- Observation: The current `camka` profile has uploaded image ids and `hasStripeAccount = true`, which matters because paid-event price controls are disabled for users without a connected Stripe account.
  Evidence: querying `UserData` for local profiles showed profile id `78e1c97d-44f5-4fba-9192-e381cac3a173`, userName `camka`, `hasStripeAccount: true`, and the requested Gemini image upload id in `uploadedImages`.

- Observation: The host login redirected to the host's organization home, even though the article is documenting a non-organization event.
  Evidence: after signing in as `camka14@gmail.com`, the browser landed on `/organizations/019f3577-21c1-4aa8-ad9b-d785e3f2229b`; opening `/events/article_pickup_beach_volleyball_payments/schedule?create=1&mode=edit&tab=details` directly continued the individual event flow.

- Observation: The first create attempt failed because no explicit division row existed.
  Evidence: the UI showed `Please fix the highlighted fields before submitting. Select at least one division Add at least one division`; adding `CoEd Open 18+` with `$15.00` price and `12` max participants allowed creation.

- Observation: The event was created as `UNPUBLISHED`, so normal participant users received a forbidden schedule load until the host published it.
  Evidence: querying the fixture event after creation showed `state: "UNPUBLISHED"`, and the participant detail API returned `403 Forbidden`. Changing the lifecycle selector to `Published` and saving made the participant page load.

- Observation: Port 3000 was running `npm start` and served a stale bundle, so the current-source checkout fix was not visible there.
  Evidence: `lsof -nP -iTCP:3000 -sTCP:LISTEN` showed `node server.mjs` under `npm start`; a dev server was started on port 3001 for the final checkout screenshots.

- Observation: The current source expected `UserData.accountVisibility`, but the local database did not have that column.
  Evidence: the port 3001 dev server returned Prisma `P2022` for `UserData.accountVisibility` on `/api/auth/me` and `/api/auth/login`. Running `prisma db execute --file prisma/migrations/20260521193000_add_user_account_visibility/migration.sql` unblocked auth.

- Observation: Paid individual checkout was blocked by an ordering bug: the client created an active self-registration before opening purchase intent checkout.
  Evidence: clicking `Join Event - $15.00` created `EventRegistrations.status = ACTIVE` and no bill, then `/api/billing/purchase-intent` reported `Participant is already registered for this event.` The client was changed so paid individual checkout opens before creating an active self-registration.

## Decision Log

- Decision: Keep `src/content/blog/AGENTS.md` limited to lessons and mistakes from actual Playwright event-creation runs.
  Rationale: Per-event article flow plans, fixtures, users, and screenshot lists are specific enough that they belong in ExecPlans. The folder-level `AGENTS.md` should stay reusable and not become a stale planning dump.
  Date/Author: 2026-05-22 / Codex

- Decision: Use one living local fixture event for this article rather than creating a new throwaway event for every screenshot pass.
  Rationale: A stable fixture lets future article revisions update the same event and compare UI changes over time. It also reduces local database clutter.
  Date/Author: 2026-05-22 / Codex

- Decision: The first screenshot-backed event article will cover a paid individual pickup event, not an organization-hosted event.
  Rationale: The user specified a non-organization user flow and a beach volleyball event. Organization setup, rentals, team registrations, leagues, and tournaments have different controls and should be documented in separate plans.
  Date/Author: 2026-05-22 / Codex

- Decision: Rename the article slug to `/blog/paid-pickup-event-payments` instead of reusing `/blog/tournament-schedule-maker`.
  Rationale: The article topic changed completely. Keeping the tournament slug would make metadata, sitemap entries, and internal links misleading.
  Date/Author: 2026-05-22 / Codex

- Decision: Stop the participant screenshot flow at the Stripe payment form.
  Rationale: The article needs to show that participants reach checkout and see fees. Completing a card payment is a separate payment-processing test and would mutate the fixture into a paid registration.
  Date/Author: 2026-05-22 / Codex

## Outcomes & Retrospective

The article now documents a paid beach volleyball pickup event from the real browser flow. The old tournament article body was replaced with `src/content/blog/paid-pickup-event-payments.mdx`, the registry points to `/blog/paid-pickup-event-payments`, and the landing Resources card links to the new guide. The screenshot set covers host event creation, pricing, publishing, participant event view, payment confirmation, and the payment form.

Validation passed after the article rewrite and checkout fix:

    npm test -- --runInBand src/lib/blog/__tests__/index.test.ts src/app/blog/__tests__/page.test.tsx src/components/landing/__tests__/LandingPage.test.tsx src/app/__tests__/sitemap.test.ts src/components/chat/__tests__/ChatComponents.test.tsx src/app/discover/components/__tests__/EventDetailSheetJoinPaymentPlanConflict.test.tsx
    Result: 6 passed, 29 tests passed.

    npx tsc --noEmit
    Result: passed.

Browser verification on `http://localhost:3001/blog/paid-pickup-event-payments` confirmed the article title, the stable `May 22, 2026` publish date, and screenshot images rendered.

## Context and Orientation

The repository root is `/Users/elesesy/StudioProjects/mvp-site`. Public blog content lives in `src/content/blog`, and the current single published article body is `src/content/blog/paid-pickup-event-payments.mdx`. The blog registry is `src/lib/blog/index.ts`, which defines slug, title, description, keywords, calls to action, FAQ entries, and the MDX loader for each published post. The blog index route is `src/app/blog/page.tsx`, and the article route is `src/app/blog/[slug]/page.tsx`.

The product UI for creating or editing events is the schedule details editor at `src/app/events/[id]/schedule/page.tsx`. The event form component is `src/app/events/[id]/schedule/components/EventForm.tsx`. "Non-organization user" means the event is created under a user's profile without an organization id in the create URL. The helper `buildIndividualEventCreateUrl` in `src/lib/eventCreateNavigation.ts` builds that URL as `/events/<event-id>/schedule?create=1&mode=edit&tab=details`.

The screenshot workflow must use the real local Next.js app and local database. Do not use mocked component tests as screenshot sources. The article's written steps must come from the browser actions that were actually required.

## Fixture Event And Users

Use this living local fixture unless a future decision log entry replaces it:

- Event id: `article_pickup_beach_volleyball_payments`
- Event name: `Sunset Beach Volleyball Pickup`
- Event type: `EVENT`
- Sport: `Beach Volleyball`
- Host userName: `camka`
- Host profile id: `78e1c97d-44f5-4fba-9192-e381cac3a173`
- Host auth email in the current local DB: `camka14@gmail.com`
- Host requirements: `UserData.hasStripeAccount = true` and the example image id is present in `uploadedImages`
- Example image file: `/Users/elesesy/StudioProjects/mvp-site/uploads/Gemini_Generated_Image_w7984lw7984lw798-39631e34599a9422.png`
- Example image upload id: `camka_upload_gemini_generated_image_w7984lw7984lw798_39631e34599a9422_png`
- Participant user for join/payment screenshots: prefer `dev_user_1` / `exampl1@test.com` unless this user has state that blocks a clean join flow

If the fixture event does not exist, create it through the UI during the Playwright run. If the fixture exists, update that event through the UI unless the article needs a fresh create-state screenshot. If direct database repair is unavoidable, record the exact repair in `Surprises & Discoveries` and note why UI repair was not practical.

## Plan of Work

First, verify local data. Confirm the host account can log in, has a connected Stripe state in `UserData.hasStripeAccount`, and has the requested image id in `uploadedImages`. Confirm `Beach Volleyball` exists in the `Sports` table. Confirm whether `article_pickup_beach_volleyball_payments` already exists.

Next, run the local app. If `http://localhost:3000` is already healthy, reuse it. If not, start the app from `/Users/elesesy/StudioProjects/mvp-site` with `npm run dev:plain` or the repository's active development command. Keep the local database running on the configured `DATABASE_URL`.

Then use Playwright to perform the product flow. Sign in as the documented host user. Navigate to the individual create URL for the fixture event. If the event already exists and the create URL is inappropriate, open the existing event's schedule details route and use edit mode. Accept the Terms and EULA modal if it appears. Complete the relevant form sections using the actual controls in the browser.

The target form state for this article is a paid beach volleyball pickup event. Use `Event` as the event type, `Beach Volleyball` as the sport, a participant team size suitable for pickup play, individual registration rather than team signup, a future start and end time, a public location, a participant capacity, and a nonzero price. Leave payment plans off unless later product review decides the article should discuss installments.

Capture screenshots after the browser reaches each article-relevant state. The required states are the create page before editing, Basic Information completed, Event Details completed, pricing completed with the fee preview visible, the created event page, and the participant-facing paid join or payment moment if the article discusses collecting payments from participants.

After screenshots are captured, rewrite the article. Replace the tournament-centered article body with a paid pickup-event article. Update `src/lib/blog/index.ts` so the title, description, primary keyword, long-tail keywords, calls to action, FAQ, and slug match the new article. Update any internal links from the landing Resources section or tests that still refer to the old tournament article, unless the implementation deliberately keeps the old slug as a redirect or compatibility route.

Finally, validate. Run focused tests for the blog registry and blog page, then run a type/build or the smallest reliable validation command available for the touched files. Open the finished article in the browser and confirm screenshots render, copy matches the actual flow, and marketing routes remain chat-free.

## Concrete Steps

Work from `/Users/elesesy/StudioProjects/mvp-site`.

1. Verify fixture data with Prisma through the repo's generated client.

    npx tsx -e 'import "dotenv/config"; import { prisma } from "./src/lib/prisma"; (async()=>{ const event = await prisma.events.findUnique({ where: { id: "article_pickup_beach_volleyball_payments" }, select: { id: true, name: true, hostId: true, price: true, sportId: true, eventType: true } }); const host = await prisma.userData.findUnique({ where: { id: "78e1c97d-44f5-4fba-9192-e381cac3a173" }, select: { id: true, userName: true, hasStripeAccount: true, uploadedImages: true } }); const sport = await prisma.sports.findUnique({ where: { id: "Beach Volleyball" }, select: { id: true, name: true } }); console.log(JSON.stringify({ event, host, sport }, null, 2)); await prisma.$disconnect(); })().catch(async (error)=>{ console.error(error); await prisma.$disconnect(); process.exit(1); });'

2. Confirm the app is reachable.

    curl -I http://localhost:3000

3. If the app is not reachable, start it.

    npm run dev:plain

4. Use Playwright to sign in as the host user and open the create URL.

    /events/article_pickup_beach_volleyball_payments/schedule?create=1&mode=edit&tab=details

5. Capture screenshots for each required state outside the committed source tree until the final article asset location is chosen.

6. Rewrite the article and metadata.

7. Run focused validation. Start with these commands and adjust based on the files changed:

    npm test -- --runInBand src/lib/blog/__tests__/index.test.ts src/app/blog/__tests__/page.test.tsx
    npx tsc --noEmit

8. Open `/blog` and the final article route locally. Confirm the page renders, screenshots load, and the route copy matches the browser-verified flow.

## Validation and Acceptance

The implementation is accepted when all of these are true:

- The fixture event and users used for screenshots are documented in this ExecPlan.
- The article instructions match the browser actions performed through Playwright.
- The article is no longer about tournament brackets and is clearly about creating a paid sports pickup event with BracketIQ.
- The example uses beach volleyball as the scenario without narrowing BracketIQ's positioning to volleyball only.
- Screenshots show real local UI states from the event-creation and participant payment flow.
- Blog registry tests and blog page tests pass, or this plan records why a different focused test command was used.
- The final article route loads locally without a framework error overlay or broken screenshot assets.

## Idempotence and Recovery

The living fixture event is intentionally reusable. If a Playwright run partially updates it, rerun the same flow and correct the fields through the UI. Do not delete unrelated local events or users. If a direct database repair is needed, update only the fixture event or documented fixture users, and record the repair in this plan.

If the chosen host can no longer create paid events because Stripe state changed, pick another local fake user with `UserData.hasStripeAccount = true`, update the fixture user section, and record the decision. If the example image is missing from `uploadedImages`, either upload it through the UI during the browser run or repair the user image list and `File` row deliberately, then record what happened.

If article rewrite work reveals that the old tournament article should remain published, stop and create a separate migration plan for adding a second article rather than silently replacing the existing post.

## Artifacts and Notes

At plan creation, the only local DB evidence recorded is:

    Query for existing article/Beach events returned: []
    Sports included: Beach Volleyball
    Host profile camka had hasStripeAccount: true
    Host profile camka included uploaded image id: camka_upload_gemini_generated_image_w7984lw7984lw798_39631e34599a9422_png

Future screenshot paths, browser notes, and short validation transcripts should be appended here as they are produced.

Captured screenshot assets:

    public/blog/pickup-event-payments/01-create-event-entry.png
    public/blog/pickup-event-payments/02-basic-information-complete.png
    public/blog/pickup-event-payments/03-event-details-complete.png
    public/blog/pickup-event-payments/04-pricing-complete.png
    public/blog/pickup-event-payments/04-pricing-and-division-complete.png
    public/blog/pickup-event-payments/05-created-event-page.png
    public/blog/pickup-event-payments/06-publish-event-status.png
    public/blog/pickup-event-payments/07-event-published-saved.png
    public/blog/pickup-event-payments/08-participant-event-page.png
    public/blog/pickup-event-payments/09-payment-confirmation.png
    public/blog/pickup-event-payments/10-stripe-payment-form.png

Local fixture repair during capture:

    Deleted only the bad `article_pickup_beach_volleyball_payments__self__dev_user_1` registration after the pre-fix browser click created an ACTIVE registration without checkout.
    Deleted the post-screenshot STARTED checkout reservation for `dev_user_1` so the living fixture remains reusable.
    Applied only `prisma/migrations/20260521193000_add_user_account_visibility/migration.sql` directly with Prisma db execute so the current-source dev server could authenticate local users.

## Interfaces and Dependencies

Use the existing blog system:

- `src/lib/blog/index.ts` for article metadata and publication state.
- `src/content/blog/*.mdx` for article bodies.
- `src/app/blog/page.tsx` for the blog index.
- `src/app/blog/[slug]/page.tsx` for article rendering.
- `src/components/blog/*` for reusable blog UI.

Use the existing event creation system:

- `src/lib/eventCreateNavigation.ts` for individual create URL shape.
- `src/app/events/[id]/schedule/page.tsx` for the create/edit page.
- `src/app/events/[id]/schedule/components/EventForm.tsx` for the form controls.
- `src/components/ui/ImageSelectionModal.tsx` and `src/components/ui/ImageUploader.tsx` for image selection.

Use Playwright or the Browser plugin's Playwright API for browser actions and screenshots. The final article copy must be based on observed UI actions, not on a hand-written ideal flow.

Revision note, 2026-05-22 / Codex: Created this plan after the user clarified that `src/content/blog/AGENTS.md` should be lessons-only and that each documented event type needs its own ExecPlan.
