# Razumly MVP — Multi-sport Event Platform

Full-stack Next.js app that lets organizers and players run pickup games, leagues, and tournaments for any sport. Built with TypeScript, Mantine UI, and Appwrite (TablesDB/Storage/Functions) for auth, data, media, and billing.

Live: https://mvp.razumly.com — Open Graph preview at `/opengraph-image`.

## Highlights
- Create and manage multi-sport events (pickup, leagues, brackets) with scheduling and field/court slots
- Team and roster management with real-time chat for coordination
- Stripe-powered payments and receipts via Appwrite Functions
- Image uploads via Appwrite Storage (with previews)
- Mantine-driven UI, responsive layouts, and Next.js App Router

## Tech Stack
- Next.js 14 (App Router) + TypeScript
- Mantine UI + Emotion
- Appwrite: Account, TablesDB, Storage, Functions (object-argument SDK)
- Jest + Testing Library for UI/service tests

## Getting Started
1) Install dependencies
```bash
npm install
```
2) Environment
- Copy `.env.example` to `.env.local`
- Set `NEXT_PUBLIC_APPWRITE_ENDPOINT`, `NEXT_PUBLIC_APPWRITE_PROJECT_ID`, `NEXT_PUBLIC_APPWRITE_DATABASE_ID`, and table/bucket/function IDs used in the app.
3) Run locally
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
- `src/lib` — Appwrite client/services; Stripe calls routed through Functions
- `public` — static assets
