# Add organization reviews across web and mobile

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds. This plan is maintained in accordance with `PLANS.md` at the repository root.

## Purpose / Big Picture

After this change, people can read ratings and written reviews on an organization profile, and a signed-in user who is not that organization's owner or staff can create, edit, or delete one review. The organization management page will have a Reviews tab and a compact review summary on Overview. Public organization pages will show a review summary and recent reviews. The Kotlin Multiplatform mobile app will use the same API and expose a Reviews tab with an in-app editor.

## Progress

- [x] (2026-07-09 21:28Z) Inspected the current organization schema, web organization tab host, public organization page, mobile organization detail component, and mobile repository conventions.
- [x] (2026-07-09 21:56Z) Added the Prisma review model, status enum, additive migration, generated client, server helpers, review/report routes, and route/eligibility/moderation tests.
- [x] (2026-07-09 21:56Z) Added the reusable web review service and UI, the organization Reviews tab, Overview summary, editor, deletion, reporting, and moderation-hidden state.
- [x] (2026-07-09 21:56Z) Added the server-rendered public organization review summary, section, empty state, and write-review link.
- [x] (2026-07-09 21:56Z) Implemented matching mobile models, repository methods, component state, scrollable Reviews tab, editor, deletion, and reporting.
- [x] (2026-07-09 21:56Z) Passed focused Jest, TypeScript, Prisma validation, Android production compilation, API smoke checks, and browser desktop/mobile checks. Mobile unit-test execution remains blocked by unrelated common-test compilation drift already present in the checkout.

## Surprises & Discoveries

- Observation: Both repositories already contain unrelated uncommitted work, including organization-tag changes in `prisma/schema.prisma` and generated Prisma files.
  Evidence: `git status --short` on 2026-07-09 showed the existing tag and affiliate edits in `mvp-site`, and event-detail/tag edits in `mvp-app`.

- Observation: A second Next dev process caused a shared `.next` manifest failure, so browser validation required returning to one server process.
  Evidence: The second process reported missing `.next/dev/required-server-files.json`; after stopping it and restarting the existing port-3000 workflow as one process, the review API and pages returned HTTP 200.

- Observation: An organization with malformed legacy affiliate event sport data cannot finish loading the internal organization page, although its public page and review API work.
  Evidence: The client logged `Event record is missing sport relationship data` for one affiliate organization. Browser validation moved to a clean managed organization without modifying unrelated event data.

## Decision Log

- Decision: Store one review row per organization and reviewer, and update that row when the reviewer submits again.
  Rationale: This prevents rating spam while making editing straightforward on both clients.
  Date/Author: 2026-07-09 / Codex

- Decision: Allow any signed-in user except the organization owner or a staff member to review; reading remains public.
  Rationale: This keeps the first release usable before every customer relationship has a uniform database representation, while clearly preventing self-review by organization operators.
  Date/Author: 2026-07-09 / Codex

- Decision: Keep full review collections out of the existing organization payload and expose a dedicated nested API.
  Rationale: Organization records are used in many list and detail flows, while reviews need their own pagination, mutation permissions, and refresh cadence.
  Date/Author: 2026-07-09 / Codex

- Decision: Treat review data as transient mobile profile content rather than adding it to Room.
  Rationale: Reviews are loaded only on a single organization screen, are refreshed directly after mutations, and do not need offline discovery or cross-feature joins in the first release.
  Date/Author: 2026-07-09 / Codex

## Outcomes & Retrospective

Users can now read review summaries and review lists on internal and public organization profiles. Eligible signed-in users can create, edit, delete, and report one review per organization; owners and staff cannot self-review. Actioned moderation reports hide reviews from public lists, and later author edits preserve that hidden status. The same API is implemented in the Kotlin Multiplatform organization screen with a scrollable Reviews tab and modal editor.

Focused web validation passed 24 tests across organization tab routing, review routes, eligibility, reviewer privacy, reporting, and admin hiding. `npx tsc --noEmit`, `npx prisma validate`, and `:composeApp:compileDebugKotlinAndroid` passed. Browser checks covered desktop and 390px mobile internal profiles, Overview-to-Reviews navigation, eligible editor opening, owner restriction, and the public Reviews section. The local `mvp_live_copy` database received migration `20260709213000_add_organization_reviews`; no production database was changed.

## Context and Orientation

`prisma/schema.prisma` is the database source of truth. The new `OrganizationReviews` model will use raw string IDs for `organizationId` and `reviewerUserId`, matching this repository's ID-centric convention. A unique database constraint on those two fields enforces one review per user and organization. A `PUBLISHED` or `HIDDEN` status controls whether a review appears publicly without deleting moderation evidence.

The nested route `src/app/api/organizations/[id]/reviews/route.ts` will support public GET and authenticated POST. `src/app/api/organizations/[id]/reviews/[reviewId]/route.ts` will support authenticated PATCH and DELETE for the original reviewer. The GET response is the cross-client contract: it returns a rating summary, public reviewer display data, the current viewer's review, and whether the viewer may review.

`src/app/organizations/[id]/organizationTabs.ts` defines organization tab routes. `src/app/organizations/[id]/page.tsx` is the client-side organization management/profile host. Review rendering and editing should live in focused files under that route instead of increasing the page's inline business logic. `src/app/o/[slug]/page.tsx` is the public server-rendered organization page and will use a server helper so public review content remains crawlable.

The mobile implementation is tracked in `/Users/elesesy/StudioProjects/mvp-app/plans/org-reviews-execplan.md`. Its `IBillingRepository` consumes the routes defined here, and its organization detail component owns the transient review state.

## Plan of Work

Add an `OrganizationReviewStatusEnum` and `OrganizationReviews` model to Prisma, then create a non-destructive migration. Add a server module that validates review eligibility, computes the average and rating distribution from published reviews, resolves privacy-safe reviewer names and profile images from `UserData`, and returns the API response shape. The POST handler will validate an integer rating from 1 through 5 and optional text no longer than 2,000 characters, reject owner/staff self-review, and upsert by the unique organization/reviewer pair. PATCH and DELETE will require ownership of the review.

Create a client service with typed fetch, save, and delete functions. Add a focused Mantine review component with summary, distribution, loading, empty, error, editor, edit, and delete states. Add `reviews` to organization tab routing immediately after Overview. Render a compact summary in Overview and the full component in the Reviews tab.

On the public organization page, fetch published review data on the server, show the average and count near the organization identity, and render recent written reviews in a Reviews section before upcoming events. Public content will not expose emails or private profile fields.

After the web API is stable, implement the mobile client against the exact response and mutation bodies. Complete both repository and UI validation before considering the feature done.

## Concrete Steps

From `/Users/elesesy/StudioProjects/mvp-site`, update Prisma and generate the client with:

    npx prisma generate

Run focused API and UI tests, then type-check:

    npm test -- --runInBand <focused test paths>
    npx tsc --noEmit

From `/Users/elesesy/StudioProjects/mvp-app`, run the focused organization detail and repository tests, then compile common code:

    ./gradlew :composeApp:testDebugUnitTest --tests '*OrganizationDetail*' --tests '*BillingRepositoryHttpTest*'
    ./gradlew :composeApp:compileDebugKotlinAndroid

At every stopping point, run `git diff --check` in each repository. Do not stage, commit, or revert unrelated existing work.

## Validation and Acceptance

The API is accepted when an unauthenticated GET returns published reviews and an aggregate summary; an unauthenticated POST returns 401; an owner or staff POST returns 403; invalid ratings and overlong text return 400; and a second valid POST by the same user updates rather than duplicates the review. PATCH and DELETE must reject other users.

The web UI is accepted when Reviews appears after Overview, public reviews load without signing in, an eligible signed-in user can create and edit one review, and deleting it updates the summary and empty state. The Overview summary must navigate to the full tab. The public page must render rating and written review content in its HTML.

The mobile UI is accepted when six tabs remain usable on a narrow phone, Reviews loads from the nested endpoint, eligible users can open the editor and save, their review changes to an edit state, and deletion refreshes the list and summary. Owner/staff viewers must see a clear non-editable state.

## Idempotence and Recovery

The migration is additive and can be applied once through normal Prisma deployment. `prisma generate` is repeatable. Review POST uses database upsert and is safe to retry. Existing dirty work must be preserved; if generated Prisma output includes the in-progress organization-tag models, retain both the tag and review additions.

## Artifacts and Notes

The API response will have this conceptual shape: `{ summary, reviews, viewerReview, canReview, cannotReviewReason }`. `summary` contains `averageRating`, `reviewCount`, and counts for ratings 1 through 5. Each review contains only `id`, `organizationId`, `reviewerUserId`, `rating`, `body`, timestamps, and a nested public reviewer with display name and optional profile image URL.

## Interfaces and Dependencies

The server module will export serializable `OrganizationReview`, `OrganizationReviewSummary`, and `OrganizationReviewsPayload` types plus read and eligibility helpers. Route handlers will use Zod, `requireSession`, and the existing lazily initialized Prisma client from `src/lib/prisma.ts`.

The web service will export `getOrganizationReviews(organizationId)`, `saveOrganizationReview(organizationId, input)`, and `deleteOrganizationReview(organizationId, reviewId)`. The mobile `IBillingRepository` will expose corresponding suspend functions using Kotlin serialization and `MvpApiClient`.

Plan update note: Created the initial cross-repository implementation plan on 2026-07-09 after inspecting both current checkouts and recording the first-release product rules. Updated it at completion to record delivered behavior, validation evidence, local migration state, and the pre-existing mobile test blocker.
