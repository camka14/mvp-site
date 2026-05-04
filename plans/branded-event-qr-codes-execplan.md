# Branded event QR codes in mvp-site

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan follows `PLANS.md` at the repository root. It covers the web and backend source of truth for branded event QR images consumed by both `mvp-site` and `mvp-app`.

## Purpose / Big Picture

Event hosts need a quick way to show or download a scannable event link with BracketIQ branding. After this change, `mvp-site` can generate a PNG QR code for an event URL, place the BracketIQ shield in the center, and expose that image through a route that enforces the same visibility rules as event reads. The event management screen will show a QR Code action next to Manage, and the discover event sheet can reuse the same modal near its Manage Event action.

## Progress

- [x] (2026-05-04 16:10Z) Created feature branch `codex/branded-event-qr-codes` for `mvp-site`.
- [x] (2026-05-04 16:10Z) Read `AGENTS.md`, `PLANS.md`, and the React best-practices skill; created this web/backend ExecPlan.
- [x] (2026-05-04 16:13Z) Added `qrcode` and `@types/qrcode`; confirmed the installed `qrcode` package is MIT licensed.
- [x] (2026-05-04 16:15Z) Added `GET /api/events/[eventId]/qr` with high-error-correction QR generation and BracketIQ shield compositing.
- [x] (2026-05-04 16:17Z) Added route tests for success, missing event, restricted-event denial, and restricted-event manager access.
- [x] (2026-05-04 16:19Z) Added reusable `EventQrCodeModal` with Copy link and Download PNG actions.
- [x] (2026-05-04 16:21Z) Wired QR actions next to Manage on the event management page and discover event details sheet.
- [x] (2026-05-04 16:25Z) Ran focused Jest tests and TypeScript checking; recorded results here.

## Surprises & Discoveries

- Observation: The `mvp-site` worktree has pre-existing untracked `.tmp/dev-3100.*.log` files.
  Evidence: `git status --short --branch` showed `?? .tmp/dev-3100.err.log` and `?? .tmp/dev-3100.out.log` before any edits. They are unrelated and will be left untouched.

- Observation: Route tests using real QR/image processing exceeded the Jest 5s timeout.
  Evidence: The initial route test attempt timed out, so the test now mocks `qrcode` and `sharp` and asserts that the route passes high error correction and returns PNG responses deterministically.

- Observation: Installing the QR dependency left the project with npm audit findings.
  Evidence: `npm install qrcode @types/qrcode` reported 24 vulnerabilities: 3 low, 19 moderate, and 2 critical. No audit fix was run because that would be unrelated dependency churn.

## Decision Log

- Decision: Make `mvp-site` the QR image source of truth.
  Rationale: A server route can centralize the event URL, logo composition, permissions, and cache headers. The mobile app and web UI can both render the same PNG and stay visually consistent.
  Date/Author: 2026-05-04 / Codex.

- Decision: Use the existing `sharp` dependency for image compositing and add the free MIT-licensed `qrcode` npm package for QR matrix generation.
  Rationale: `sharp` is already installed and suited to layering the logo over a generated PNG. `qrcode` is a small, established library that supports high error correction, which is required when a logo covers part of the code.
  Date/Author: 2026-05-04 / Codex.

## Outcomes & Retrospective

Implemented branded event QR generation and web UI entry points. The backend route returns a PNG QR code for `/events/{eventId}` with the BracketIQ shield centered on a white plate. Managers see a `QR Code` action next to `Manage` on the schedule/event management page, and host-facing Manage Event action groups in the discover detail sheet now include the same QR action. The reusable modal supports copying the event URL and downloading the generated PNG.

## Context and Orientation

`src/app/api/events/[eventId]/route.ts` is the current event read route. Its `GET` handler loads an event by id and rejects restricted states such as `TEMPLATE`, `UNPUBLISHED`, `PRIVATE`, and `DRAFT` unless the requester can manage that event. The QR route should mirror this behavior so private event links are not exposed.

`src/app/events/[id]/schedule/page.tsx` is the event management page. Around the header action area it renders a `Manage` button when `showEditActionButton` is true, plus a Mantine `Menu` for additional management actions. The QR action requested by the user should appear next to Manage for managers on existing events.

`src/app/discover/components/EventDetailSheet.tsx` is the public event details drawer. It contains `handleViewSchedule()`, which navigates to `/events/{eventId}` for hosts, and several `Manage Event` buttons. The QR modal can be wired near those same action groups.

## Plan of Work

First, install `qrcode` and its TypeScript declarations if needed. Add a route handler at `src/app/api/events/[eventId]/qr/route.ts`. The route will load the event, apply the same restricted-state permission check as the existing event GET route, build the public event URL from `getRequestOrigin(req)` plus `/events/{eventId}`, generate a high-error-correction QR PNG, and use `sharp` to composite `public/bracketiq-shield.svg` in the center with a white background plate. It should return `image/png` with a reasonable cache header.

Next, add route tests in `src/app/api/events/__tests__/eventQrRoute.test.ts`. Mock Prisma, permissions, and access control in the same style as existing event route tests. Assert that public events return PNG bytes, missing events return 404, and restricted events return 403 when the user lacks management permission.

Then, add a small client component such as `src/components/events/EventQrCodeModal.tsx`. It will accept `eventId`, `eventName`, `eventUrl`, `opened`, and `onClose`, render a Mantine modal with the QR image, and provide Copy link and Download PNG actions. Keep the component memo-friendly: derive the QR URL and filename with `useMemo`, keep callbacks stable with `useCallback`, and do not fetch QR bytes until the user clicks download.

Finally, wire the component into `src/app/events/[id]/schedule/page.tsx` and `src/app/discover/components/EventDetailSheet.tsx`. The page should render a `QR Code` button beside `Manage` for existing events. The discover sheet should render `QR Code` next to the host-facing `Manage Event` action where space allows, using the same modal component.

## Concrete Steps

Run these commands from `C:\Users\samue\.codex\worktrees\5946\mvp-site`:

    npm install qrcode @types/qrcode
    npm test -- eventQrRoute
    npx tsc --noEmit

If full type checking is too slow, run the targeted Jest suite and record the exact limitation. Do not remove the unrelated `.tmp/dev-3100.*.log` files.

## Validation and Acceptance

Acceptance is user-visible and API-visible. A browser request to `/api/events/{eventId}/qr` for a visible event returns HTTP 200 with `content-type: image/png`. Opening the event management page as a manager shows `QR Code` next to `Manage`; clicking it opens a modal with a QR image and Copy/Download actions. Opening the discover event sheet as a host shows a QR action near Manage Event. Scanning the QR should open `/events/{eventId}` on the same site origin.

## Idempotence and Recovery

The dependency install can be safely repeated by npm. Route tests mock dependencies and should not need a live database. If QR generation fails at runtime, the route should return HTTP 500 with a generic error and log details server-side; the UI remains dismissible because it only displays an image URL.

## Artifacts and Notes

- `npm test -- eventQrRoute EventQrCodeModal` passed on 2026-05-04: 2 suites, 6 tests.
- `npx tsc --noEmit` passed on 2026-05-04.

## Interfaces and Dependencies

The backend route must exist at:

    src/app/api/events/[eventId]/qr/route.ts

It must export:

    export async function GET(req: NextRequest, { params }: { params: Promise<{ eventId: string }> })

The reusable UI component should exist at:

    src/components/events/EventQrCodeModal.tsx

with props:

    eventId: string
    eventName: string
    eventUrl: string
    opened: boolean
    onClose: () => void
