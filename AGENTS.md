---
name: "TypeScript Next.js Prisma Web App Guide"
description: "A comprehensive development guide for building a full-stack web application using TypeScript, Next.js, Mantine UI, Prisma, and Postgres with DigitalOcean hosting considerations"
category: "Web Development"
author: "Agents.md Collection"
authorUrl: "https://github.com/gakeez/agents_md_collection"
tags:
  - typescript
  - nextjs
  - mantine
  - prisma
  - postgres
  - web-development
  - react
  - saas
  - digitalocean
lastUpdated: "2026-05-25"
---

# TypeScript Next.js Prisma Web App Guide

## Project Overview

This guide covers best practices for developing a **full-stack web application** with **Next.js** (App Router) as the front-end framework, **TypeScript** for type safety, **Mantine** as the UI component library, and **Prisma + Postgres** for backend data. The example project is BracketIQ, a multi-sport facility and event management platform where users can sign up, create profiles, form teams, join events, chat with other players, and handle payments for event registrations, rentals, leagues, and tournaments. Volleyball is one supported sport and appears in defaults, seed data, and tests, but the product should be described generically unless a request is specifically targeting volleyball facilities. We emphasize a **modular architecture**: Next.js for routing and SSR, Mantine for cohesive UI components, and Prisma-backed API routes for data access, file uploads, and business logic.

**Marketing and outreach positioning**: Describe BracketIQ as a local, multi-sport web and mobile platform for facilities, clubs, and event organizers. Reference specific sports such as volleyball, soccer, basketball, tennis, pickleball, hockey, baseball, or football only when tailoring copy to a known facility or organization. Outreach should emphasize capabilities that matter to facilities: event registration, league and tournament scheduling, team/player management, rentals, payments, public organization pages, embedded event listings, communication, and mobile access for participants and staff.

**SEO and public-page metadata standards**: Public marketing, blog, guide, and policy pages should keep page titles, H1 text, and visible body copy aligned. If a title or H1 uses important terms such as "sports event platform", "facility operations", "tournament", "league", or "BracketIQ", include those terms naturally in visible page content. Use the Next.js App Router metadata APIs for metadata and viewport output: export `metadata` and `viewport` from server layouts/pages, and do not hand-code duplicate `<meta name="viewport">` tags in JSX. Keep exactly one viewport tag, one canonical URL, and use the canonical apex domain `https://bracket-iq.com`. Do not introduce public absolute links, metadata URLs, sitemap URLs, or structured-data URLs on `www.bracket-iq.com`; `www` requests should redirect to the apex host through middleware and production hosting/DNS configuration. Keep `poweredByHeader: false` in `next.config.mjs` so the `X-Powered-By` response header is not sent after restart/deploy. On landing pages, use real heading tags only for the semantic outline. Do not use headings for repeated proof chips, stat cards, feature-card labels, or decorative UI labels; style `p`, `div`, or `span` elements instead. Avoid duplicate heading text and repeated identical paragraphs inside mapped sections. Repeated anchor text is acceptable for repeated CTAs to the same destination, but use more specific anchor text when repeated links point to different destinations. Backlink count is an off-site marketing outcome, not a code-only issue; improve it through partner/facility links, public organization/event pages, embeddable listings, local directories, and useful BracketIQ guides.

**SEO verification checklist**: When changing public SEO-sensitive surfaces, render the page locally and verify the actual HTML, not just component source. Check that there is one viewport tag, one canonical tag, no `X-Powered-By` header after a server restart, no duplicate heading texts, a reasonable heading count for the amount of body text, and no obvious repeated boilerplate paragraphs from mapped components. Confirm `Host: www.bracket-iq.com` redirects to `https://bracket-iq.com/...`. For landing-page edits, run the relevant Jest tests, `npx tsc --noEmit`, and a browser smoke test on desktop and mobile-sized viewports.

**Blog and article roadmap**: Keep the living editorial roadmap in `docs/blog-article-roadmap.md`. Prioritize product-led guides and tutorials that show how to use BracketIQ on web and mobile before broader informational SEO articles. Split "how to create" and "how to manage" topics for leagues and tournaments because setup, operations, communication, standings, and day-of workflows are large enough to deserve separate articles. Every roadmap entry must maintain `Article Name`, `Content`, `Dependencies`, and `Dependants`. Dependencies are prerequisite articles the current article should refer to. Dependants are selected downstream articles the current article should link to as next steps; do not list every sport-specific dependant from broad foundational articles when that would create link bloat. Sport-specific articles should link back to the relevant league or tournament setup/management guides, then focus on sport logistics and nuance such as beach volleyball teams officiating one another, field/court constraints, weather, age groups, rosters, substitutions, pools, playoffs, or facility operations. Organization-specific articles should target clubs, facilities, and event organizers and tie the workflow back to BracketIQ organization pages, registration, scheduling, payments, communication, rentals, and mobile access. Use Agenda view by default for rendered event schedule screenshots in blogs and guides so static article images clearly show match order, times, teams, and field or court assignments. Blog article metadata must include created and updated dates, and article pages must show the bottom author/date footer using Samuel Razumovskiy as the author with the photo at `public/blog/authors/samuel-razumovskiy.jpg`.

**Legacy references**: The repos `mvpDatabase` and `mvp-build-bracket` are **legacy backend references** only. Use them to understand data shape and historical behavior, but **do not implement new features using legacy services**. Any legacy-specific files or env vars in this repo should be treated as artifacts.

**Related app**: The mobile version of this product lives in `C:\Users\samue\StudioProjects\mvp-app`. When a request mentions `mvp-app` or mobile parity, inspect that repo directly and determine whether web-side behavior changes in `mvp-site` also need a corresponding mobile update.

# ExecPlans
When writing complex features or significant refactors, use an ExecPlan (as described in `mvp-site/PLANS.md`) from design to implementation.

## Tech Stack

- **Framework**: Next.js (App Router)
- **Language**: TypeScript
- **UI Library**: **Mantine** for React
- **State Management**: React Hooks and Context API
- **Database**: **Postgres** via **Prisma** (Prisma Client in `src/lib/prisma.ts`)
- **API**: Next.js Route Handlers in `src/app/api`
- **Storage**: Prisma `File` model + storage provider (local in dev; DigitalOcean Spaces or similar in prod)
- **Auth**: Self-hosted JWT/session flow (see `src/lib/authServer.ts` and `src/lib/permissions.ts`)
- **Payments**: Stripe API via server routes
- **Styling**: Tailwind + Mantine components

## Development Environment Setup

### Installation Requirements

- **Node.js**: 20+
- **Package Manager**: npm
- **Database**: Postgres (local or hosted)
- **Environment Variables** (`.env.local`):
  - `DATABASE_URL`
  - `JWT_SECRET`
  - Google OAuth (login button on `/login`):
    - `GOOGLE_OAUTH_CLIENT_ID`
    - `GOOGLE_OAUTH_CLIENT_SECRET`
  - `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
  - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
  - **Storage** (if using Spaces):
    - `DO_SPACES_ENDPOINT`, `DO_SPACES_REGION`, `DO_SPACES_BUCKET`
    - `DO_SPACES_KEY`, `DO_SPACES_SECRET`

### Installation Steps

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
# Create/update .env.local with DATABASE_URL and JWT_SECRET

# 3. Run migrations (if needed)
npx prisma migrate dev

# 4. Run the development server
npm run dev

# 5. Open http://localhost:3000
```

## Project Structure

```
mvp-site/
├── src/
│   ├── app/                       # Next.js App Router
│   │   ├── layout.tsx             # MantineProvider + global providers
│   │   ├── page.tsx               # Home
│   │   ├── api/                   # Route handlers (auth, files, users, etc.)
│   │   └── ...
│   ├── components/
│   │   ├── ui/                    # Mantine-based reusable UI
│   │   └── ...
│   ├── context/
│   ├── lib/                       # Prisma, auth helpers, services
│   ├── types/
│   └── globals.css
├── prisma/
│   └── schema.prisma
└── ...
```

## Core Development Principles

### Code Style and Structure

- **Functional Components & Hooks**: Client interactivity lives in client components (`'use client'`).
- **Separation of Concerns**: UI calls **service modules** in `src/lib/*Service.ts`. Services wrap API calls so components don’t talk to Prisma directly.
- **Naming**: Booleans as `is*/has*`; service methods `createX/getX/updateX/deleteX`.
- **Types**: Strong interfaces for rows; extend with computed fields for UI.
- **Immutability**: Functional state updates; async service functions with `try/catch` + user feedback.

## Database — ID-centric Modeling (Prisma)

We persist raw string IDs for associations (for example `teamIds`, `friendIds`, `fieldIds`) and **hydrate** related data in service modules. This keeps writes simple and reads explicit.

**Guidelines**:
- Persist raw IDs in Prisma updates; do not embed nested objects.
- Hydrate related data in service modules by querying Prisma for each ID list.
- Throw when referenced IDs are missing so data issues surface early.
- Chunk Prisma queries when the ID list is large.

## Storage — Files & Images

- Uploaded files are tracked in the Prisma `File` model (`prisma/schema.prisma`).
- API routes in `src/app/api/files/*` handle uploads and downloads.
- Use server-side routes to enforce permissions and to proxy access.
- For production hosting, prefer object storage (DigitalOcean Spaces or compatible S3). Keep local file storage for development.

## Auth & Permissions

- Auth is handled via server-side JWT/session flows.
- **Never** expose secrets via `NEXT_PUBLIC_*` env vars.
- Use `requireSession` and `assertUserAccess` from `src/lib/permissions.ts` in API routes.

## Testing & Quality Assurance

### Tooling & Commands

- **Test runner**: Jest
- **Run quickly during development**: `npm run test:watch`
- **CI quality checks**: `npm run test:ci`
- **Type checks**: `npx tsc --noEmit`

### When to Write Tests

- **Every new function or feature** ships with at least one Jest test (happy-path + failure mode).
- **Bug fixes** include a regression test first.
- **UI components** with business logic get component tests using `@testing-library/react`.

### Test Review Checklist

- Does the change include Jest coverage for new/modified logic?
- Are mocks/spies reset to avoid test bleed?
- Are async tests using `await`/`waitFor`?
- Is coverage meaningful (assert on outputs/side-effects)?
- Do not run Jest suites concurrently from multiple agents in the same checkout; shared `.next`/cache artifacts can cause flaky results.

## Form & Scheduling Standards

- Use date-only calendar inputs for all date-of-birth fields (signup/profile/children). Do not capture time for DOB values.
- Use 12-hour AM/PM time presentation for user-facing time pickers and labels.
- Keep one scoring-format control path per form section; do not expose duplicate controls for the same setting.
- When playoffs are enabled, `playoffTeamCount` must be unset by default and validated as required until explicitly chosen.
- Field-to-division mapping is mandatory for league/tournament scheduling. Apply fallback in this order: field divisions from payload, then event divisions, then persisted field divisions, then `OPEN`.
- Weekly scheduling must support multi-day selection at the form boundary (`daysOfWeek`) while remaining backward compatible with legacy `dayOfWeek`.
- Any event create/edit scheduling change must include regression tests for validation, payload mapping, and scheduler behavior.

## Security & Permissions

- Enforce row-level access in API routes.
- Avoid client secrets in `NEXT_PUBLIC_*`.
- Admin-only operations must check `session.isAdmin`.

## Legacy Notes

- Legacy references are read-only.
- Use `mvpDatabase` and `mvp-build-bracket` **as reference**, not as active dependencies.
