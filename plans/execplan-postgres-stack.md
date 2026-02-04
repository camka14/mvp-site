# MVP Postgres Stack Execution Plan

## Goal
Run the MVP entirely on Next.js API routes + Prisma/Postgres + optional DigitalOcean Spaces (no legacy backend or SDKs).

## Current Implementation
- API routes live in `src/app/api/*` and use Prisma repositories in `src/server/*`.
- Client services call `apiRequest` in `src/lib/*Service.ts`.
- IDs use `createId()` in `src/lib/id.ts`.
- Storage uses `src/lib/storageProvider.ts` (local or Spaces).

## Required Environment
- `DATABASE_URL`
- `AUTH_SECRET`
- Optional storage (if not using local):
  - `DO_SPACES_ENDPOINT`
  - `DO_SPACES_REGION`
  - `DO_SPACES_BUCKET`
  - `DO_SPACES_KEY`
  - `DO_SPACES_SECRET`

## Key Routes (Examples)
- Events: `src/app/api/events/*`
- Scheduling: `src/app/api/events/schedule/route.ts`
- Organizations: `src/app/api/organizations/*`
- Billing: `src/app/api/billing/*`
- Documents: `src/app/api/documents/*`
- Chat: `src/app/api/chat/*`, `src/app/api/messages/*`

## Validation Checklist
1. `npm run dev` boots with Postgres and auth only.
2. Create organization and event (schedule page).
3. Join event as player/team.
4. Upload an image (files route or profile image).
5. Create product and start a payment intent.
6. Send a chat message.
7. Optional: Spaces-backed uploads.

## Notes
All responses preserve `$id/$createdAt/$updatedAt` for UI compatibility via `src/server/legacyFormat.ts`.
