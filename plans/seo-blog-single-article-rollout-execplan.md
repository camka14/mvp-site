# Single-Article SEO Blog Rollout

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with [PLANS.md](../PLANS.md).

## Purpose / Big Picture

BracketIQ currently has one public marketing page and no indexable editorial content layer. After this change, the site will have a public `/blog` hub and one fully indexable article at `/blog/tournament-schedule-maker`, with search metadata, structured data, sitemap inclusion, and internal links that let Google and new users discover the content.

The goal is not to launch all six articles in one pass. The goal is to build the minimum reusable blog infrastructure required to publish exactly one high-value article, prove the pattern works end to end, and then stop. After implementation, a user should be able to run the app, open `/blog`, click into the tournament scheduling article, see the content rendered as a first-class public page, and observe that `robots.txt` and `sitemap.xml` include the new public content.

## Progress

- [x] 2026-03-11 21:24Z Initial ExecPlan created from repo inspection and the approved article sequence.
- [x] 2026-03-11 21:31Z Expanded the first-article brief with the exact keyword strategy, outline, CTA guidance, and writing-style constraints supplied by the user.
- [ ] Add MDX support and a typed blog registry without changing existing authenticated app routes.
- [ ] Build the public blog hub and blog article route.
- [ ] Publish the first article, `tournament-schedule-maker`, using the new content system.
- [ ] Add sitemap, robots, canonical metadata, and JSON-LD for the blog hub and first article.
- [ ] Add tests and build validation for the new public content layer.
- [ ] Stop after the first article is complete; do not implement the second article in the same execution cycle.

## Surprises & Discoveries

- Observation: The repository does not currently contain a blog, article hub, MDX setup, `sitemap.ts`, or `robots.ts`.
  Evidence: `find src/app -maxdepth 2 -type f` only showed the landing page, auth, legal, and app routes; `rg -n "blog|article|mdx|sitemap|robots"` returned no public content implementation.

- Observation: The home page is a client component and the current “Resources” section is an integrations section, not an editorial hub.
  Evidence: `src/app/page.tsx` starts with `'use client'` and its `#resources` section renders integration logos only.

- Observation: Jest is configured only for `ts` and `tsx` transforms today.
  Evidence: `jest.config.ts` transforms `^.+\\.(ts|tsx)$` via `ts-jest`, so MDX correctness should be validated primarily by `next build` unless test support is expanded deliberately.

## Decision Log

- Decision: Use repo-managed MDX files for article bodies and TypeScript for machine-readable article metadata.
  Rationale: This keeps authoring ergonomic, keeps SEO fields strongly typed, and avoids introducing a CMS before the public content model is proven.
  Date/Author: 2026-03-11 / Codex

- Decision: Build route pages in `src/app/blog` and load content through a typed registry instead of turning each MDX file into a direct route.
  Rationale: The registry gives one source of truth for slugs, publish state, metadata, sitemap entries, and future article sequencing. It also makes tests easier because tests can validate registry behavior without having to parse MDX directly.
  Date/Author: 2026-03-11 / Codex

- Decision: The first implementation cycle ends after the blog infrastructure and the `tournament-schedule-maker` article are complete.
  Rationale: The user explicitly wants these articles created one at a time, and the stop condition must be explicit so implementation does not continue into article two.
  Date/Author: 2026-03-11 / Codex

- Decision: Reuse existing conversion destinations such as `/login`, `/discover`, and `/` in article CTAs during cycle one.
  Rationale: The SEO/content system can be shipped without also creating new feature landing pages. That keeps the first cycle focused and testable.
  Date/Author: 2026-03-11 / Codex

- Decision: The first article brief must be treated as prescriptive, including title variants, keyword targets, outline, CTA copy, and writing-style prohibitions.
  Rationale: The user supplied a concrete SEO brief and specific style restrictions, so the implementation should not improvise editorial direction for article one.
  Date/Author: 2026-03-11 / Codex

## Outcomes & Retrospective

The expected outcome of this plan is a reusable public content system that proves BracketIQ can publish search-indexable educational content without coupling it to authenticated application flows. At plan creation time no implementation work has started yet, so there are no shipped outcomes beyond this specification.

The main constraint to watch during implementation is scope creep. The correct result for cycle one is one article plus the minimum shared infrastructure needed to support that article well. Anything beyond that should be captured as follow-up work, not silently added to this cycle.

## Context and Orientation

The current public acquisition surface is centered on `src/app/page.tsx`, which is a client-rendered marketing page for BracketIQ. Shared site metadata lives in `src/app/layout.tsx`. The footer is in `src/components/layout/SiteFooter.tsx` and currently exposes only privacy, delete-data, and support links. There is no blog route, no public content collection, and no file-based SEO metadata routes such as `src/app/sitemap.ts` or `src/app/robots.ts`.

This plan introduces a small public content subsystem. “MDX” means Markdown content with embedded JSX support. In this repository it will be used only for long-form article bodies. A “registry” means a TypeScript module that exports the list of known blog posts and the metadata needed to render routes, generate sitemaps, and produce per-page SEO metadata. “JSON-LD” means machine-readable structured data rendered into the page inside a script tag so search engines can understand article and FAQ content.

The implementation should keep all blog content public and server-rendered. Do not route article pages through auth checks, guest session flows, or app-only layouts. The blog layer is a marketing surface, not an authenticated product surface.

## Plan of Work

First, add MDX support to the Next.js configuration. Update `next.config.mjs` to wrap the existing config with `@next/mdx` and expand `pageExtensions` to include `md` and `mdx`. Add the required dependency in `package.json`. Do not convert existing application routes to MDX. The purpose of this change is only to allow importing MDX files as content modules.

Next, create a server-only content registry under `src/lib/blog`. Add a type module that defines `BlogPostMeta` and `BlogPostEntry`. `BlogPostMeta` must include the fields needed for listing pages and page metadata: `slug`, `title`, `description`, `publishedAt`, `updatedAt`, `isPublished`, `primaryKeyword`, `readingMinutes`, `canonicalPath`, `ctaLabel`, `ctaHref`, `faq`, and `ogImageAlt`. `BlogPostEntry` must extend that metadata with an async loader that imports the MDX module for the article body. Add helpers such as `getPublishedBlogPosts()`, `getBlogPostBySlug(slug)`, and `getBlogSitemapEntries()`. The registry is the single source of truth for all published article URLs.

Then create the content files. Add `src/content/blog/tournament-schedule-maker.mdx` for the first article body. Export a lightweight `metadata` object from the MDX file only for article-level display fields that are convenient to colocate with the copy, but keep route-critical publish state and slug ownership in the TypeScript registry. This article must implement the approved brief: explain tournament formats, show why spreadsheets fail, walk through scheduling inputs and workflow, cover conflict handling and live updates, include an operations checklist, and end with an FAQ section. Use existing product claims only; do not invent unsupported product features.

## First Article Specification

The first and only article for cycle one is “Tournament schedule maker and bracket formats.” Its primary keyword is `tournament schedule maker`. Its long-tail keywords are `tournament bracket generator`, `double elimination bracket`, `round robin tournament schedule`, `how to schedule a sports tournament`, and `tournament scheduling software`. The search intent is a blend of commercial investigation and informational education: the reader wants a tool, but also wants practical guidance on how to create the schedule correctly.

The implementation may choose one of these title variants for the rendered H1 and metadata title:

- `Tournament Schedule Maker: How to Build Brackets That Don’t Break on Game Day`
- `Single vs Double Elimination vs Round Robin: Choosing the Right Tournament Format`
- `How to Create a Tournament Schedule (With Templates + Common Pitfalls)`

The preferred meta description is:

`Build tournament schedules and brackets (round robin, single/double elimination) with fewer conflicts, faster updates, and happier teams.`

The article slug must remain `/blog/tournament-schedule-maker`. The page must self-canonicalize to that clean slug and must not introduce alternate indexable variants for query-string tracking or tag pages.

The article body should land between 2,200 and 3,000 words. The intended reader is a tournament organizer who is worried about conflicts, delays, and last-minute schedule changes. The writing should stay practical and operational: focus on inputs, format choice, workflows, conflict prevention, and day-of-event execution. Close with a simple “tool workflow” and a clear invitation to try BracketIQ.

The article structure should follow this outline closely:

- H2: What a `tournament schedule maker` actually solves and why spreadsheets fail.
- H2: Tournament formats explained.
- H3 under tournament formats: single elimination.
- H3 under tournament formats: double elimination.
- H3 under tournament formats: round robin.
- H3 under tournament formats: pool play.
- H2: Inputs you need before scheduling.
- H2: Step-by-step scheduling workflow.
- H3 under scheduling workflow: build.
- H3 under scheduling workflow: review conflicts.
- H3 under scheduling workflow: publish.
- H3 under scheduling workflow: update live.
- H2: Real-world constraints.
- H3 under real-world constraints: coach conflicts.
- H3 under real-world constraints: travel time.
- H3 under real-world constraints: cancellations.
- H3 under real-world constraints: bracket rebuilds.
- H2: How to publish and communicate updates.
- H2: Checklist for tournament day operations.
- H2: FAQs.
- H3 under FAQs: How long between games?
- H3 under FAQs: How many fields do I need?
- H3 under FAQs: What if a team drops?

The article should internally link to the home page for product positioning, `/login` for primary conversion, and `/discover` to show the participant-side experience. The original strategy also suggested a future “Tournament Scheduling Software” feature page, but that page does not exist in cycle one and must not be created as part of this plan.

The first article CTA copy should use these defaults unless implementation constraints force a small wording adjustment:

- Primary CTA: `Create your first tournament schedule`
- Secondary CTA: `See a demo schedule template`
- Retention CTA: `Download the app to manage updates on the go`

Use `Article` and `FAQPage` structured data on the page. `HowTo` structured data is optional and should be added only if the final structure clearly presents a step-by-step procedural sequence that matches schema expectations.

If the article includes supportive images or diagrams, use alt text that follows the approved direction. The first two preferred examples are `double elimination bracket example for 8 teams` and `round robin schedule example table`.

## Article Writing Constraints

The implementation prompt or authoring instructions for the first article must include these style rules exactly so the generated content does not drift:

- Do not use em dashes.
- Do not use emojis.
- Do not use the rhetorical pattern `it is not X, it's Y` or close variants of that contrastive construction.
- Prefer direct, plain, operational language over hype, motivational language, or clever copywriting.
- Do not claim product capabilities that are not visible in the current BracketIQ codebase or marketing site.

After that, add the public routes in `src/app/blog`. Create `src/app/blog/page.tsx` as a server component that renders the list of published posts from the registry. Create `src/app/blog/[slug]/page.tsx` as a server component that looks up the slug from the registry, calls `notFound()` when the slug is unknown or unpublished, imports the MDX module for known slugs, and renders the article within a reusable blog article shell. Add `generateStaticParams()` from the registry and set `dynamicParams = false` so only known articles are built. Add `generateMetadata()` so each article has a title, description, canonical URL, robots metadata, and Open Graph/Twitter image configuration derived from the registry.

Add a small set of reusable presentation components under `src/components/blog` or `src/components/marketing`, whichever fits the existing layout patterns better. These components should cover the article header, prose wrapper, CTA card, and FAQ block. Keep the styling aligned with the current landing page visual language rather than introducing a new design system. The CTA card on the first article should point to an existing public destination, preferably `/login` for “Create your first tournament schedule” and `/discover` or `/` for secondary exploration.

Next, add the SEO plumbing. Create `src/app/sitemap.ts` to return entries for `/`, `/privacy-policy`, `/delete-data`, `/blog`, and each published blog article. Create `src/app/robots.ts` to allow crawling public pages and point to the sitemap URL. Add a JSON-LD helper in `src/lib/blog/structuredData.ts` or similar that returns an `Article` payload and a `FAQPage` payload for the first article. Render those scripts on the article page in a way consistent with Next.js App Router metadata guidance.

Update internal links so crawlers and users can reach the new hub without guessing the URL. Add a `/blog` link to `src/components/layout/SiteFooter.tsx`. Update the landing page in `src/app/page.tsx` so the current “Resources” section or another suitable public area includes at least one link to the blog hub or the featured tournament article. Do not create a second editorial section for the remaining five articles yet. One featured link is enough for cycle one.

Finally, add validation. Unit test the blog registry and sitemap generation. Add a render test for the footer link and a render test for the blog hub using controlled registry data or the first real entry. Add a route-level or helper-level test that proves unknown slugs are treated as missing. Because Jest does not currently transform MDX, rely on `npm run build` as the authoritative proof that MDX compiles and the App Router can statically build the blog routes.

## Concrete Steps

Work from the repository root, `/home/camka/Projects/MVP/mvp-site`.

1. Install MDX support.

    npm install @next/mdx @mdx-js/loader @mdx-js/react

2. Update `next.config.mjs` to enable MDX imports and include `mdx` in `pageExtensions`.

3. Create the blog registry modules in `src/lib/blog`.

4. Create the first article body in `src/content/blog/tournament-schedule-maker.mdx`.

5. Create `src/app/blog/page.tsx` and `src/app/blog/[slug]/page.tsx`.

6. Create the reusable blog UI components and structured data helpers.

7. Create `src/app/sitemap.ts` and `src/app/robots.ts`.

8. Update `src/components/layout/SiteFooter.tsx` and `src/app/page.tsx` to link to the new blog hub.

9. Add Jest tests for the registry, sitemap, and public links.

10. Run validation.

    npm test -- --runInBand
    npm run build

At the end of step 10, stop. Do not create `league-schedule-maker` or any other additional article in the same execution cycle.

## Validation and Acceptance

Run `npm test -- --runInBand` and expect the existing test suite plus the new blog-related tests to pass. The exact passing count may change as the repository evolves, so treat “all tests pass” as the acceptance signal rather than a hard-coded number.

Run `npm run build` and expect Next.js to complete a production build without MDX import errors, route generation failures, or metadata route errors.

After starting the app locally, open the following URLs and verify these behaviors:

- `/blog` returns HTTP 200 and shows the tournament scheduling article in the listing.
- `/blog/tournament-schedule-maker` returns HTTP 200 and renders the full article body, CTA section, and FAQ section.
- `/blog/does-not-exist` resolves as not found.
- `/robots.txt` includes the sitemap URL and does not disallow the blog.
- `/sitemap.xml` includes `/blog` and `/blog/tournament-schedule-maker`.

Inspect the article page source or DevTools and verify:

- The page has a canonical URL ending in `/blog/tournament-schedule-maker`.
- The page includes Open Graph and Twitter metadata with the article title and description.
- The page includes JSON-LD for both `Article` and `FAQPage`.

## Idempotence and Recovery

These steps are additive and safe to repeat. Re-running `npm install`, `npm test -- --runInBand`, and `npm run build` is safe. Rebuilding the app should not create new article slugs or mutate existing data.

If the MDX setup causes unexpected route behavior, the safe recovery path is to revert only the MDX configuration and new blog files, then rerun `npm run build` until the repository returns to a passing state. Do not alter authenticated product routes as part of recovery because the blog system is intentionally isolated from them.

If test coverage becomes blocked by MDX transform complexity in Jest, keep the route and registry logic in TypeScript modules that can be tested directly, and leave MDX syntax validation to `npm run build`. Do not spend cycle one inventing a custom Jest MDX toolchain unless it is strictly necessary to keep the build green.

## Artifacts and Notes

The future article queue should remain in this order, but none of these may be implemented during cycle one:

1. `league-schedule-maker`
2. `sports-registration-software`
3. `field-rental-software`
4. `local-seo-sports-events`
5. `android-app-links-ios-universal-links`

The tournament article should use only existing BracketIQ destinations for CTAs during cycle one. Recommended defaults are:

- Primary CTA: `/login`
- Secondary CTA: `/discover`
- Brand/navigation CTA: `/blog` and `/`

Implementation stop rule:

Once `npm test -- --runInBand` and `npm run build` both pass with the blog hub and the `tournament-schedule-maker` article live, stop work immediately. Record remaining articles as follow-up tasks in `Progress` or a subsequent ExecPlan update. Do not begin article two.

## Interfaces and Dependencies

Use Next.js App Router with the official `@next/mdx` integration. Do not introduce Contentlayer, a CMS SDK, or database-backed article storage in this cycle.

In `src/lib/blog/types.ts`, define stable exported types equivalent to:

    export type BlogFaqItem = {
      question: string;
      answer: string;
    };

    export type BlogPostMeta = {
      slug: string;
      title: string;
      description: string;
      publishedAt: string;
      updatedAt?: string;
      isPublished: boolean;
      primaryKeyword: string;
      readingMinutes: number;
      canonicalPath: `/blog/${string}`;
      ctaLabel: string;
      ctaHref: string;
      faq: BlogFaqItem[];
      ogImageAlt: string;
    };

    export type BlogPostEntry = BlogPostMeta & {
      load: () => Promise<{ default: React.ComponentType }>;
    };

In `src/lib/blog/index.ts`, export functions with stable names equivalent to:

    export function getPublishedBlogPosts(): BlogPostEntry[];
    export function getBlogPostBySlug(slug: string): BlogPostEntry | null;
    export function getBlogSitemapEntries(): Array<{ url: string; lastModified: string }>;

In `src/app/blog/[slug]/page.tsx`, the route module must expose:

    export const dynamicParams = false;
    export function generateStaticParams(): Array<{ slug: string }>;
    export async function generateMetadata(...): Promise<Metadata>;

The page component itself must call `notFound()` when `getBlogPostBySlug(slug)` returns `null`.

At the bottom of this plan, future contributors must append a dated note whenever they revise the plan, explaining what changed and why.

Revision note, 2026-03-11: Expanded the first-article section with the user-supplied keyword brief, exact outline, CTA guidance, meta description, and writing-style constraints so the implementation agent can draft article one without making editorial decisions.
