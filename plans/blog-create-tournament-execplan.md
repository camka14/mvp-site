# Document Tournament Creation With Screenshots

This ExecPlan is a living document. Keep `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` current as work proceeds.

This document must be maintained in accordance with [PLANS.md](../PLANS.md).

## Purpose / Big Picture

BracketIQ needs a foundational product-led article that teaches an organizer how to create and publish a tournament. The final article should be based on the real local web UI and should read as instructions for an end user, not as a browser-capture log. A reader should understand how to start a tournament, complete basic details, configure team registration, add a division, add schedule/court information, review the event, and publish it.

This plan covers tournament creation only. Tournament management, tournament registration details, tournament day check-in, pool play, pool play with playoffs, schedule updates, and results/advancement belong in separate roadmap articles.

## Progress

- [x] 2026-05-24 Created this ExecPlan for the tournament creation article.
- [x] 2026-05-24 Verified local host account, enabled payment state, available sports, and absence of an existing `article_tournament_create` fixture.
- [x] 2026-05-24 Used the real app UI to create and publish the fixture tournament.
- [x] 2026-05-24 Captured the screenshot sequence from the browser in `public/blog/create-tournament/`.
- [x] 2026-05-24 Wrote `src/content/blog/create-tournament-in-bracketiq.mdx` from the captured end-user workflow.
- [x] 2026-05-24 Updated the blog registry, blog page copy, roadmap status, and focused blog/sitemap tests for the second article.
- [x] 2026-05-24 Validated with focused tests, TypeScript, and browser checks for `/blog` and `/blog/create-tournament-in-bracketiq`.
- [x] 2026-05-24 Updated the article example from pickleball to indoor soccer and recaptured screenshots with a soccer field image.
- [x] 2026-05-24 Revalidated the indoor soccer version with focused tests, TypeScript, and browser checks for article content, screenshots, author footer, and Guide Brief sizing.

## Surprises & Discoveries

- Observation: The local `camka14` account is the current usable author/host account, not the older `camka` id recorded in the paid pickup article plan.
  Evidence: Prisma returned profile id `3f6f5523-dbeb-4dbd-a99c-8dbe1a7b5977`, userName `camka14`, auth email `camka14@gmail.com`, and `hasStripeAccount: true`.

- Observation: The local sports table includes common sports needed for the roadmap, including Pickleball, Indoor Volleyball, Indoor Soccer, Basketball, Tennis, Baseball, Hockey, and Football.
  Evidence: Prisma sports query returned those seeded sport names.

- Observation: No local fixture currently exists for `article_tournament_create`.
  Evidence: Prisma query for event ids containing `article_tournament_create` returned an empty set.

- Observation: Google Maps failed to load in the local screenshot browser, so the map picker could not attach coordinates during the first create attempt.
  Evidence: The Event Details section displayed "Oops! Something went wrong. This page didn't load Google Maps correctly." and validation required coordinates.

- Observation: Starting the browser session with the app's saved user location provided a valid default `Vancouver, WA` location and coordinates for the create form.
  Evidence: The second create run showed the Location input as valid, and the event saved successfully with `Vancouver, WA`.

- Observation: The only uploaded image initially visible in `camka14@gmail.com` was the volleyball facility logo, while a soccer field photo was present in local uploads but not listed in the account.
  Evidence: Prisma returned one uploaded file id for the account, and `uploads/ChatGPT_Image_Sep_11__2025__10_55_58_PM-1e12543e5d-8f2371cc31667e92.png` rendered as a soccer field photo.

- Observation: Uploading the soccer field photo through the event image picker selected it for the tournament draft and added it to the local account workflow.
  Evidence: The upload API returned `201`, and the Basic Information screenshot shows the soccer field photo as the selected image.

## Decision Log

- Decision: Use an indoor soccer tournament as the example for the generic tournament creation article.
  Rationale: The generic tournament guide should use a broadly familiar sport such as soccer or volleyball, and the local account has a soccer field image available for screenshots.
  Date/Author: 2026-05-24 / Codex

- Decision: Keep this article focused on creating and publishing a tournament, not managing it after signups begin.
  Rationale: The roadmap intentionally separates creation from management so each article can stay specific and link to relevant next steps.
  Date/Author: 2026-05-24 / Codex

## Context and Orientation

Public blog content lives in `src/content/blog`. Article metadata and publication state live in `src/lib/blog/index.ts`. Blog routes render through `src/app/blog/page.tsx` and `src/app/blog/[slug]/page.tsx`. Article screenshots should be committed under `public/blog/create-tournament/`.

The tournament creation UI lives at `src/app/events/[id]/schedule/page.tsx`, with the main form in `src/app/events/[id]/schedule/components/EventForm.tsx`. Use `buildIndividualEventCreateUrl` from `src/lib/eventCreateNavigation.ts` for the individual host create URL shape.

The screenshot workflow must use the real local Next.js app and local database. Do not use mocked component tests as screenshot sources. The final article copy must come from the browser actions that were actually required.

## Fixture Event And Users

Use this living local fixture unless a future decision log entry replaces it:

- Event id: `article_tournament_create_soccer`
- Event name: `Saturday Indoor Soccer Tournament`
- Event type: `TOURNAMENT`
- Sport: `Indoor Soccer`
- Host userName: `camka14`
- Host profile id: `3f6f5523-dbeb-4dbd-a99c-8dbe1a7b5977`
- Host auth email: `camka14@gmail.com`
- Host password for local screenshot workflow: `password`
- Host requirements: `UserData.hasStripeAccount = true`
- Planned registration model: team registration for soccer teams
- Planned division: `CoEd Open 18+`
- Planned capacity: `16` teams
- Planned price: `$0.00` unless the UI requires a nonzero team price for a screenshot; payment details are covered in separate articles.
- Planned schedule surface: local fields for tournament scheduling

If the fixture event already exists, update it through the UI unless the article needs a fresh create-state screenshot. If direct database repair is unavoidable, update only this fixture and record the repair here.

## Plan of Work

First, start or reuse a current-source local dev server. If port 3000 serves a stale bundle or is unavailable, use a free port such as 3001.

Next, use the browser to sign in as the host and open:

    /events/article_tournament_create/schedule?create=1&mode=edit&tab=details

Create the tournament in small observable steps and capture screenshots after each article-relevant state:

1. Blank tournament create page.
2. Basic Information completed.
3. Event Details completed with `TOURNAMENT`, team registration, dates, signup close timing, and location.
4. Division added with sport-appropriate capacity and registration settings.
5. Courts/fields or schedule surface configured enough to show what a tournament organizer needs before publishing.
6. Created tournament page after save.
7. Published status saved.
8. Participant-facing published tournament page if the article tells organizers to verify the public page.

After screenshots are captured, write `src/content/blog/create-tournament-in-bracketiq.mdx` in end-user language. Do not mention Playwright, local URLs, fixture ids, browser runs, or failed attempts. Link naturally to the paid pickup payments article only where payment collection is discussed, and reserve future links for tournament management and pool-play articles until those articles exist.

Then update `src/lib/blog/index.ts` with the new article metadata, including `createdAt`, `updatedAt`, `author`, keywords, FAQ, CTAs, and loader. Update tests that assert the number of published posts or sitemap entries.

Finally, validate with focused tests, `npx tsc --noEmit`, and browser verification of `/blog` and `/blog/create-tournament-in-bracketiq`.

## Validation and Acceptance

The work is accepted when:

- The screenshot fixture and user details are documented in this plan.
- The screenshots in `public/blog/create-tournament/` come from the real UI.
- The article teaches tournament creation and does not drift into tournament management or pool-play operations.
- The article includes visible created/updated dates and the shared Samuel Razumovskiy author footer through the blog renderer.
- The blog registry, blog index, article route, sitemap, and structured data handle both published articles.
- Focused blog tests pass.
- `npx tsc --noEmit` passes.
- Browser verification confirms the article route renders and screenshots load.

## Idempotence and Recovery

Re-running the browser flow should update the same fixture event rather than creating duplicate article events. If a partial run leaves the event as a draft or with incomplete fields, return to the fixture event edit URL and correct it through the UI. Do not delete unrelated events, teams, users, organizations, or uploaded files.

If the host account cannot log in, verify the local password hash before changing fixture users. If the form behavior differs from expected article flow, record the difference in `Surprises & Discoveries`, adjust the article to match the product, and avoid inventing unsupported functionality.

## Outcomes & Retrospective

The tournament creation article is now published in the local blog registry with eight real UI screenshots. The article uses an indoor soccer tournament and soccer field photo, stays focused on initial tournament creation and publishing, links only to the live paid pickup payments guide where payment behavior is relevant, and leaves tournament management, registration, pool play, and field/court scheduling for future roadmap articles.

## Artifacts and Notes

Planned article slug:

    /blog/create-tournament-in-bracketiq

Planned screenshot paths:

    public/blog/create-tournament/01-create-tournament-entry.png
    public/blog/create-tournament/02-basic-information-complete.png
    public/blog/create-tournament/03-event-details-complete.png
    public/blog/create-tournament/04-division-and-registration-complete.png
    public/blog/create-tournament/05-courts-and-schedule-ready.png
    public/blog/create-tournament/06-created-tournament-page.png
    public/blog/create-tournament/07-published-tournament-saved.png
    public/blog/create-tournament/08-public-tournament-page.png
