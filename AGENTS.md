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
lastUpdated: "2026-02-04"
---

# TypeScript Next.js Prisma Web App Guide

## Project Overview

This guide covers best practices for developing a **full-stack web application** with **Next.js** (App Router) as the front-end framework, **TypeScript** for type safety, **Mantine** as the UI component library, and **Prisma + Postgres** for backend data. The example project is a volleyball event platform (MVP-site) where users can sign up, create profiles, form teams, join events, chat with other players, and handle payments for event registrations. We emphasize a **modular architecture**: Next.js for routing and SSR, Mantine for cohesive UI components, and Prisma-backed API routes for data access, file uploads, and business logic.

**Legacy references**: The repos `mvpDatabase` and `mvp-build-bracket` are **legacy Appwrite-dependent references** only. Use them to understand data shape and historical behavior, but **do not implement new features using Appwrite**. Any Appwrite-specific files or env vars in this repo should be treated as legacy artifacts.

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

## Security & Permissions

- Enforce row-level access in API routes.
- Avoid client secrets in `NEXT_PUBLIC_*`.
- Admin-only operations must check `session.isAdmin`.

## Legacy Notes

- Appwrite references are legacy only.
- Use `mvpDatabase` and `mvp-build-bracket` **as reference**, not as active dependencies.
