# BoldSign PDF Template Session + Signup Signing Flow Repair

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan must be maintained in accordance with `PLANS.md`.

## Purpose / Big Picture

Today, choosing `PDF (BoldSign)` in the organization templates UI does not start a usable BoldSign template session, so organizers cannot upload a PDF and configure sign fields/roles. As a result, participants cannot complete PDF signing during event signup. After this change, owners can upload a PDF template, a BoldSign embedded template builder session starts, template metadata is stored in Prisma, and event signup can generate embedded signer links so participants can sign required PDFs before joining.

This work is observable in two places:
1. Organization template creation: selecting `PDF` plus a PDF file opens the BoldSign embedded template builder.
2. Event signup: required PDF templates open in the signing modal and signing completion unblocks join.

## Progress

- [x] (2026-02-12 21:15Z) Investigated current code paths and confirmed the root issue: PDF template creation only writes Prisma row and never calls BoldSign.
- [x] (2026-02-12 21:20Z) Mapped related flows: organization template modal, `/api/organizations/[id]/templates`, `/api/events/[eventId]/sign`, and signing modal.
- [x] (2026-02-12 21:27Z) Researched BoldSign official API endpoints for embedded template creation, template send, and embedded sign link retrieval.
- [x] (2026-02-12 21:42Z) Implemented server BoldSign API client and environment validation in `src/lib/boldsignServer.ts`.
- [x] (2026-02-12 21:49Z) Implemented multipart PDF upload support + BoldSign embedded template session start in `POST /api/organizations/[id]/templates`.
- [x] (2026-02-12 21:56Z) Implemented PDF sign-link generation and real `PDF` step responses in `POST /api/events/[eventId]/sign`.
- [x] (2026-02-12 22:01Z) Updated client template creation flow (`src/lib/boldsignService.ts`, `src/app/organizations/[id]/page.tsx`) to upload PDF files and handle create-url response.
- [x] (2026-02-12 22:07Z) Added tests for BoldSign server client and event sign route behavior.
- [x] (2026-02-12 22:10Z) Ran targeted tests and type checks (`npm test -- ...`, `npx tsc --noEmit`).
- [x] (2026-02-12 22:13Z) Updated retrospective and artifacts with final outcomes.

## Surprises & Discoveries

- Observation: The current event signing route forces all sign steps to `TEXT` (`template.type === 'TEXT' ? 'TEXT' : 'TEXT'`), so PDF paths are effectively dead even when template type is `PDF`.
  Evidence: `src/app/api/events/[eventId]/sign/route.ts`.

- Observation: Password confirmation and signature-recording routes already exist and work with the current text/PDF modal shell; the missing layer is server-side BoldSign session generation.
  Evidence: `src/app/api/documents/confirm-password/route.ts` and `src/app/api/documents/record-signature/route.ts`.

- Observation: `import 'server-only'` in the new BoldSign helper breaks local Jest runs in this repository because the test setup does not resolve that module.
  Evidence: Jest failure `Cannot find module 'server-only' from 'src/lib/boldsignServer.ts'`; resolved by removing that import and keeping helper route-only by usage.

## Decision Log

- Decision: Keep existing Prisma schema and store BoldSign template IDs in `templateDocuments.templateId`; do not introduce schema changes.
  Rationale: The schema already has the fields needed (`templateId`, `type`, role metadata) and the issue is integration logic, not data shape.
  Date/Author: 2026-02-12 / Codex

- Decision: Implement BoldSign API calls server-side only in a dedicated library (`src/lib/boldsignServer.ts`) and never expose API key to client.
  Rationale: Keeps credentials secure and centralizes external API error handling.
  Date/Author: 2026-02-12 / Codex

- Decision: Add PDF upload through the template creation endpoint using `multipart/form-data` while preserving current JSON flow for text templates.
  Rationale: Minimizes blast radius and keeps existing text-template behavior stable.
  Date/Author: 2026-02-12 / Codex

- Decision: Resolve signer email server-side via request payload first, then `sensitiveUserData`, then `authUser`.
  Rationale: Signup signing must still work when client payload omits `userEmail`, and BoldSign embedded signing requires a signer email.
  Date/Author: 2026-02-12 / Codex

- Decision: Fetch template roles from BoldSign properties at signing time and fall back to stored Prisma role metadata when lookup fails.
  Rationale: Embedded template edits can change role indices; runtime lookup prevents stale role mismatches.
  Date/Author: 2026-02-12 / Codex

## Outcomes & Retrospective

Implemented end-to-end repair for PDF template creation and signup signing in the Next.js + Prisma stack without schema changes.

Completed behavior:
1. Owners can create PDF templates by uploading a PDF file; backend starts a BoldSign embedded template session and returns `createUrl`.
2. Organization template modal now enforces PDF upload for `PDF (BoldSign)` templates.
3. Event sign route now emits real mixed steps (`TEXT` and `PDF`) and generates embedded signer URLs for PDF templates.
4. Existing signup signing modal now receives valid PDF iframe URLs/doc IDs and can proceed through the current completion flow.

Validation completed:
- `npm test -- src/lib/__tests__/boldsignService.test.ts src/lib/__tests__/boldsignServer.test.ts src/app/api/events/__tests__/eventSignRoute.test.ts`
- `npx tsc --noEmit`

Remaining manual verification:
- Run live BoldSign flow in an environment with `BOLDSIGN_API_KEY` configured, including full template build and participant sign completion.

## Context and Orientation

Organization template UI lives in `src/app/organizations/[id]/page.tsx`. The `Create template` modal currently lets users choose PDF/TEXT, but PDF path sends metadata only through `boldsignService.createTemplate` and receives no `createUrl`.

Template creation API lives in `src/app/api/organizations/[id]/templates/route.ts`. It currently always writes a Prisma `templateDocuments` row and never calls BoldSign.

Signup signing link generation lives in `src/app/api/events/[eventId]/sign/route.ts`. It currently returns sign steps but forces every step to `TEXT`, which prevents embedded PDF signing.

Signing UI lives in `src/app/discover/components/EventDetailSheet.tsx` and already supports text-vs-iframe rendering plus password confirmation. It needs valid PDF sign URLs/doc IDs from the event sign route.

## Plan of Work

First, add a server-only BoldSign client module with strict environment checks (`BOLDSIGN_API_KEY`, optional `BOLDSIGN_API_BASE_URL`). This module will provide three operations: create embedded template URL from uploaded PDF, send document from template to signer, and get embedded sign link for a signer/document.

Second, update `POST /api/organizations/[id]/templates` to support both JSON and multipart requests. For `TEXT`, keep current Prisma-only behavior. For `PDF`, require an uploaded PDF file, call BoldSign create embedded template API, save a template row with returned `templateId`, and return `createUrl` for iframe embedding.

Third, update `POST /api/events/[eventId]/sign` to correctly handle PDF templates. For each required PDF template that still needs signature, use BoldSign to create a signer document and embedded sign URL, and return `type: 'PDF'`, `documentId`, and `url` for the modal iframe.

Fourth, update `src/lib/boldsignService.ts` and `src/app/organizations/[id]/page.tsx` so PDF template creation sends multipart form data including selected PDF file. Keep text path unchanged.

Fifth, add focused tests covering the server BoldSign helper and route behavior (including `type` correctness and PDF link generation branches), then run targeted checks.

## Concrete Steps

From repository root `/home/camka/Projects/MVP/mvp-site`:

1. Add `src/lib/boldsignServer.ts` with:
   - authenticated fetch wrapper for BoldSign API
   - `createEmbeddedTemplateFromPdf`
   - `sendDocumentFromTemplate`
   - `getEmbeddedSignLink`
   - optional helper to fetch template role metadata
2. Edit `src/app/api/organizations/[id]/templates/route.ts` to parse multipart and create BoldSign session for PDF.
3. Edit `src/app/api/events/[eventId]/sign/route.ts` to create real PDF sign links.
4. Edit `src/lib/boldsignService.ts` to send form-data for PDF template creation.
5. Edit `src/app/organizations/[id]/page.tsx` to collect PDF file in modal and enforce required validation for PDF.
6. Add tests under `src/lib/__tests__/` and/or `src/app/api/events/__tests__/`.
7. Run:
   - `npm test -- src/lib/__tests__/boldsignService.test.ts src/lib/__tests__/boldsignServer.test.ts src/app/api/events/__tests__/eventSignRoute.test.ts`
   - `npx tsc --noEmit`

## Validation and Acceptance

Manual acceptance:

1. As org owner, open organization Templates tab.
2. Click `Create Template`, choose `PDF (BoldSign)`, provide title and upload a `.pdf`, click `Create`.
3. Confirm the page renders embedded BoldSign template builder iframe (non-empty URL).
4. Attach this template to an event (`requiredTemplateIds`) and save event.
5. As participant, start join flow. Confirm required document modal opens PDF in iframe.
6. Complete sign action. Confirm join continues and participant is added.

Automated acceptance:

- New tests pass for BoldSign server helper and event sign route PDF branch.
- Existing `boldsignService` test still passes for text template payload behavior.

## Idempotence and Recovery

All code changes are additive and can be reapplied safely. If BoldSign env vars are missing, server routes should return explicit configuration errors without writing partial records for PDF templates. If BoldSign API call fails after upload parsing, return an error and keep DB unchanged for that request.

## Artifacts and Notes

Expected touched files:
- `plans/boldsign-pdf-template-and-signup-signing-execplan.md`
- `src/lib/boldsignServer.ts`
- `src/app/api/organizations/[id]/templates/route.ts`
- `src/app/api/events/[eventId]/sign/route.ts`
- `src/lib/boldsignService.ts`
- `src/app/organizations/[id]/page.tsx`
- test files for new behavior

Validation transcript summary:
- Jest suites passed: 3/3.
- Tests passed: 7/7.
- Type-check passed with no TypeScript errors.

## Interfaces and Dependencies

Environment variables:
- `BOLDSIGN_API_KEY` (required for PDF template/signing)
- `BOLDSIGN_API_BASE_URL` (optional, defaults to BoldSign public API URL)

New server interface:
- `createEmbeddedTemplateFromPdf({ fileBytes, fileName, title, signerRoleName, signerRoleIndex, disableEmails }) -> { templateId, createUrl }`
- `sendDocumentFromTemplate({ templateId, signerEmail, signerName, roleIndex, signerRole }) -> { documentId }`
- `getEmbeddedSignLink({ documentId, signerEmail, redirectUrl }) -> { signLink }`

Sign route response contract remains:
- each sign step: `{ templateId, type, title, signOnce, documentId?, url?, content? }`

Change note (2026-02-12): Initial ExecPlan created to guide implementation and verification for PDF template upload/session startup and signup-time PDF signing.
Change note (2026-02-12): Updated progress, discoveries, decisions, and outcomes after implementation and local validation.
