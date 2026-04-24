# BracketIQ — Multi-sport Event Platform

Full-stack Next.js app that lets organizers and players run pickup games, leagues, and tournaments for any sport. Built with TypeScript, Mantine UI, Prisma + Postgres, and self-hosted Next.js APIs for auth, data, media, and billing.

Live: https://bracket-iq.com — Open Graph preview at `/opengraph-image`.

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
  - Mobile Apple OAuth token audience allow-list:
  - `APPLE_MOBILE_BUNDLE_ID` (defaults to `com.razumly.mvp` if omitted)
  - `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
  - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
  - `STORAGE_PROVIDER` (`local` or `spaces`)
  - `STORAGE_ROOT` (for local storage)
  - `DO_SPACES_ENDPOINT`, `DO_SPACES_REGION`, `DO_SPACES_BUCKET`, `DO_SPACES_KEY`, `DO_SPACES_SECRET`
    - Use a region endpoint for `DO_SPACES_ENDPOINT` (for example `https://sfo3.digitaloceanspaces.com`), not a bucket-prefixed host.
  - BoldSign (PDF template builder + embedded signing):
  - `BOLDSIGN_API_KEY`
  - `BOLDSIGN_API_BASE_URL` (optional, defaults to `https://api.boldsign.com`)
  - `BOLDSIGN_DEV_REDIRECT_BASE_URL` (optional override; in dev this is auto-set from ngrok by `npm run dev`)
  - `BOLDSIGN_RECONCILE_SECRET` (required for scheduled reconcile cron auth in production)
  - `STRIPE_CONNECT_CLIENT_ID` (required for Stripe Connect OAuth onboarding + fallback management flows)
  - `STRIPE_CONNECT_REDIRECT_URI` (optional, full callback URL override for Stripe Connect OAuth; use when Stripe app settings require a specific host)
  - SMTP email invites:
  - `SMTP_URL` (or configure host/port/user/password below)
  - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE`
  - `SMTP_FROM`, `SMTP_FROM_NAME`, `SMTP_REPLY_TO`
  - Gmail fallback: `GMAIL_USER`, `GMAIL_PASSWORD`
  - Invite link/app prompt URL controls:
  - `PUBLIC_WEB_BASE_URL` (canonical origin used in invite emails; recommended in production)
  - `NEXT_PUBLIC_MVP_IOS_APP_STORE_URL`
  - `NEXT_PUBLIC_MVP_ANDROID_PLAY_STORE_URL`
  - `NEXT_PUBLIC_MVP_IOS_DEEP_LINK`
  - `NEXT_PUBLIC_MVP_ANDROID_DEEP_LINK`
  - `NEXT_PUBLIC_SHOW_APP_PROMPT` (`0` to disable mobile prompt)
  - Optional DB TLS override for self-signed cert chains: `PG_SSL_REJECT_UNAUTHORIZED=false`
4) Run locally
```bash
npm run dev
# open http://localhost:3000
```

`npm run dev` now starts ngrok (when available) and injects a public redirect URL for BoldSign (`BOLDSIGN_DEV_REDIRECT_BASE_URL`) to avoid browser Private Network Access blocks after signing. To disable this behavior: `MVP_DEV_ENABLE_NGROK=0 npm run dev`.
It also injects `PUBLIC_WEB_BASE_URL` (for canonical web links) and `STRIPE_CONNECT_REDIRECT_URI` (for Stripe OAuth callback), so localhost is not sent as `redirect_uri`.
The default reserved dev tunnel is `https://untarnished-berserkly-everette.ngrok-free.dev`; override it with `NGROK_DOMAIN` or `MVP_DEV_NGROK_DOMAIN` if needed. VS Code launch configs require ngrok and Stripe listener startup so broken webhook forwarding fails immediately.

For automatic tunneling, install and authenticate ngrok on your machine first (`ngrok config add-authtoken <token>`). If ngrok is not available, dev server still starts but BoldSign localhost redirect issues will remain.
When running in WSL, the dev wrapper also attempts to resolve Windows-installed ngrok (`where ngrok` / `Get-Command ngrok`). You can force a specific binary path with `NGROK_BIN=/mnt/c/.../ngrok.exe npm run dev`.

## Scripts
- `npm run dev` — start dev server with ngrok-assisted BoldSign redirect support
- `npm run dev:plain` — start plain Next.js dev server without ngrok wrapper
- `npm run build` — production build
- `npm start` — run built app
- `npm run test` — Jest suite
- `npm run lint` — Next.js lint

## Local Stripe Webhooks
- Preferred local run: `npm run dev`
  - This wrapper starts `stripe listen` automatically and forwards `payment_intent.succeeded` to `http://localhost:3000/api/billing/webhook`.
  - It also injects the session webhook secret into `STRIPE_WEBHOOK_SECRET` for that dev process.
- Manual listener (if using `npm run dev:plain`):
```bash
stripe listen \
  --events payment_intent.succeeded \
  --forward-to http://localhost:3000/api/billing/webhook
```
- Manual trigger test:
```bash
stripe trigger payment_intent.succeeded
```
- If webhook signature checks fail in local-only debugging, you can temporarily allow unverified payloads:
```bash
STRIPE_WEBHOOK_ALLOW_UNVERIFIED_DEV=true
```

## Architecture
- `src/app` — routes (App Router) and metadata; OG image at `opengraph-image.tsx`
- `src/components` — UI components (Mantine, chat widgets)
- `src/context` — chat/state providers
- `src/lib` — service modules + API client wrappers
- `src/server` — server-only helpers and repositories
- `public` — static assets

## Operations
- BoldSign reconcile cron setup (DigitalOcean App Platform): `docs/ops/boldsign-reconcile-cron.md`
