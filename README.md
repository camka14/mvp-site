# Razumly MVP — Multi-sport Event Platform

Full-stack Next.js app that lets organizers and players run pickup games, leagues, and tournaments for any sport. Built with TypeScript, Mantine UI, Prisma + Postgres, and self-hosted Next.js APIs for auth, data, media, and billing.

Live: https://mvp.razumly.com — Open Graph preview at `/opengraph-image`.

## Highlights
- Create and manage multi-sport events (pickup, leagues, brackets) with scheduling and field/court slots
- Team and roster management with real-time chat for coordination
- Stripe-powered payments and receipts via server-side API routes
- Image uploads via the storage provider (local dev or DigitalOcean Spaces)
- Mantine-driven UI, responsive layouts, and Next.js App Router

## Tech Stack
- Next.js 16 (App Router) + TypeScript
- Mantine UI + Emotion
- Prisma + Postgres
- Auth: self-hosted JWT/session flow
- Storage: local filesystem in dev, DigitalOcean Spaces (S3-compatible) in prod
- Jest + Testing Library for UI/service tests

## Getting Started
1) Use Node 20.9+ (Next.js 16 requires it)
```bash
nvm install 20.9.0
nvm use
```
2) Install dependencies
```bash
npm install
```
3) Environment
- Update `.env` / `.env.local` with at minimum:
  - `DATABASE_URL`
  - `AUTH_SECRET`
- Optional (recommended for full feature parity):
  - Google OAuth (login button on `/login`):
  - `GOOGLE_OAUTH_CLIENT_ID`
  - `GOOGLE_OAUTH_CLIENT_SECRET`
  - Mobile Google OAuth token audience allow-list:
  - `GOOGLE_MOBILE_ANDROID_CLIENT_ID`
  - `GOOGLE_MOBILE_IOS_CLIENT_ID`
  - `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
  - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
  - `STORAGE_PROVIDER` (`local` or `spaces`)
  - `STORAGE_ROOT` (for local storage)
  - `DO_SPACES_ENDPOINT`, `DO_SPACES_REGION`, `DO_SPACES_BUCKET`, `DO_SPACES_KEY`, `DO_SPACES_SECRET`
  - SMTP email invites:
  - `SMTP_URL` (or configure host/port/user/password below)
  - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE`
  - `SMTP_FROM`, `SMTP_FROM_NAME`, `SMTP_REPLY_TO`
  - Gmail fallback: `GMAIL_USER`, `GMAIL_PASSWORD`
4) Run locally
```bash
npm run dev
# open http://localhost:3000
```

## Scripts
- `npm run dev` — start dev server
- `npm run build` — production build
- `npm start` — run built app
- `npm run test` — Jest suite
- `npm run lint` — Next.js lint

## Architecture
- `src/app` — routes (App Router) and metadata; OG image at `opengraph-image.tsx`
- `src/components` — UI components (Mantine, chat widgets)
- `src/context` — chat/state providers
- `src/lib` — service modules + API client wrappers
- `src/server` — server-only helpers and repositories
- `public` — static assets
