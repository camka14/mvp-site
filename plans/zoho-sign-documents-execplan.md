# Zoho Sign embedded signing with Appwrite storage and sign-before-pay UX

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds. Maintain this document in accordance with PLANS.md at /workspace/mvp-site/PLANS.md.

## Purpose / Big Picture

Enable hosts to attach document templates to events and require attendees to sign them through Zoho Sign before paying or joining. Completed signatures must be stored securely in Appwrite Storage with proper permissions and recorded in the TablesDB signedDocuments table. After implementation, a host can select templates during event creation, a registrant will be guided through sequential embedded signing, signed PDFs will be available to the signer and host only, and payment will not open until all required documents are signed.

## Progress

- [ ] (2026-11-22 00:00Z) Draft ExecPlan and baseline repository orientation completed; ready for implementation steps.

## Surprises & Discoveries

- Observation: None yet.  
  Evidence: To be filled during implementation.

## Decision Log

- Decision: Initial plan authorship favors a single documents service module (src/lib/documents.ts) to centralize template fetching, signing session creation, upload, and signed row creation.  
  Rationale: Mirrors existing service wrappers and keeps Appwrite SDK interactions in one place for easier testing and permission handling.  
  Date/Author: 2026-11-22 / Codex agent.

## Outcomes & Retrospective

To be filled after implementation with a summary of achieved behaviors, remaining gaps, and lessons learned.

## Context and Orientation

The repository is a Next.js 13 app using Appwrite for auth, TablesDB, Storage, and Functions. Service wrappers live in src/lib/. Types are centralized in src/types/index.ts. Event creation/editing UI is in src/app/events/[id]/schedule/components/EventForm.tsx (and related event scheduling components). Registration and payment flows rely on backend REST-style function routes (e.g., /billing/purchase-intent) invoked through service helpers.

New capabilities must integrate Zoho Sign embedded signing via backend function endpoints (mvp-build-bracket event_manager routes) and Appwrite Storage buckets. Two buckets will be used: documentTemplates for template PDFs and signedDocuments for completed signatures. TablesDB gains a signedDocuments table (row-based) and documentTemplates table or equivalent metadata store accessed by IDs stored on events.

## Plan of Work

Describe the sequence of edits and additions, focusing on frontend scope while clarifying backend touchpoints that the frontend must call.

1) Types and data model additions in src/types/index.ts

Explain that Event and EventPayload gain an optional documentTemplateIds: string[] to list required templates. Define DocumentTemplate type with fields: id, organizationId/hostId, name, optional fee/price, storageFileId (Appwrite documentTemplates bucket file id) or externalReference, createdAt/updatedAt, and any display description. Define SignedDocument type representing signedDocuments rows: id, userId, organizationId/hostId, templateId, documentName, signedDocumentId (storage file id in signedDocuments bucket), createdAt/updatedAt. Clarify that IDs come from Appwrite TablesDB rows and Storage buckets, with hostId matching event host/organization.

2) New frontend documents service (src/lib/documents.ts)

Create a service wrapper similar to existing src/lib modules. Include functions:

- listTemplatesForHost(hostId): fetch DocumentTemplate rows for the host (Appwrite TablesDB or backend REST path). Used by event form to populate the multi-select.
- getTemplatesByIds(templateIds): fetch specific templates for event details and registration flows.
- getSignedDocumentsForUser({ userId, templateIds }): query signedDocuments table to find existing signatures for this user.
- startEmbeddedSigning({ templateId, eventId, userId, callbackUrl }): call backend REST function route (event_manager) that creates a Zoho Sign embedded signing session and returns { signingUrl, sessionId, expiry }. Document the expected REST path pattern matching other routes (e.g., POST /api/event-manager/documents/:templateId/sign/start) using executionMethod POST and xpath style from rest_function_calls_execplan.md if needed.
- confirmSigningAndUpload({ sessionId, templateId, userId, hostId, documentName }): handle post-sign flow. After Zoho signals completion (via redirect URL or polling), call backend route to download the signed PDF securely (backend holds Zoho secret). Then upload the file to Appwrite Storage signedDocuments bucket using the client SDK with explicit permissions: read access for userId and hostId, owner for userId, no public access. Then call backend/table helper to create signedDocuments row with the uploaded file id and metadata.
- ensureSignedBeforeProceeding({ templateIds, userId, hostId }): helper that checks existing signatures, runs signing flow sequentially, and returns a boolean or signed documents map to gate payment.

Document assumptions about REST endpoints: follow existing function invocation pattern using functions.createExecution with xpath specifying the route and executionMethod POST/GET. Document required payload shapes: templateId, eventId, userId, callbackUrl, sessionId for completion/polling, plus a backend download endpoint that returns a signed URL or file bytes.

3) Appwrite Storage integration (frontend)

Explain bucket usage. DocumentTemplate uploads are assumed to already be stored in documentTemplates bucket by host via admin tooling; frontend only reads metadata and storageFileId. SignedDocument uploads happen on the client after backend returns the signed PDF. Use Appwrite Storage createFile with file input (Blob/ArrayBuffer). Set permissions: read for userId and hostId, write for userId (or host role if needed), no public. Provide explicit example of permissions array using Appwrite object-argument SDK: permissions: [Permission.read(Role.user(userId)), Permission.read(Role.user(hostId)), Permission.update(Role.user(userId)), Permission.delete(Role.user(userId))] if allowed. Clarify that secrets for Zoho API and server-to-server download live only in the backend; frontend only receives pre-authorized download URL or file bytes.

4) Event create/edit UI update

In src/app/events/[id]/schedule/components/EventForm.tsx, add a multi-select dropdown for document templates, patterned after the divisions multi-select. Use documents service listTemplatesForHost(currentHostId) to populate options. When creating or editing an event, selected template ids should map to documentTemplateIds in form state and be sent via existing event create/update payloads (EventPayload). Ensure the form validation and submit handlers include the new field.

5) Registration flow gating before payment

Identify the registration/join flow component (event detail sheet/modal). Insert a document signing gate that triggers on register/join click before payment intent is requested. Flow: fetch event to read documentTemplateIds; if empty, proceed to payment as today. If present, use documents service getSignedDocumentsForUser to find missing templates. For each missing template, open a SigningModal component that embeds the Zoho Sign signingUrl (iframe/webview). States: loading signing URL, in-progress signing, completed, error/retry. Completion detection: prefer backend-provided redirect URL that returns to a Next.js route such as /signing/callback?sessionId=... with polling via documents service confirmSigningAndUpload to fetch PDF and upload. After each signature, update local state and continue to next template. Only after all templates are signed invoke the payment modal and existing purchase-intent flow. Prevent bypass by disabling payment button until signing flow resolves.

6) Payment intent impact

Prefer relying on backend to compute any document-related fees based on event documentTemplateIds. Frontend must ensure these IDs are persisted on events and included when fetching event details. If backend needs explicit template fee info, extend the payment intent request payload to include templateIdsSigned or templatesRequired; document the payload shape and where to add it in the billing service call. Note that the existing /billing/purchase-intent call pattern should remain; only payload augmentation may be required.

7) Validation and acceptance

List commands to run from /workspace/mvp-site:

- npm run lint
- npm test
- npm run dev (manual verification)

Provide an acceptance scenario: Host uploads template (assumed existing UI) and has a DocumentTemplate row with storageFileId. Host creates an event selecting two templates in EventForm; event data shows documentTemplateIds saved. A user opens the event, clicks register, sees signing modal for template 1, completes signing via embedded Zoho page, signed PDF appears in Appwrite signedDocuments bucket with permissions for user and host; signedDocuments row created. User proceeds to template 2 similarly. After both are signed, payment modal opens, payment completes, and user is enrolled; returning to event shows no prompt to re-sign. Include reload handling: if user refreshes mid-signing, on next register click the system re-checks signedDocuments table and resumes with remaining templates.

8) Security, edge cases, recovery

Document handling of bypass: hide/disable payment modal trigger until signing flow completes; guard server payload by refusing purchase intent if templates missing (frontend check plus backend expectation). Describe handling for refresh/reload: re-query signedDocuments; pending sessions can be restarted by re-invoking startEmbeddedSigning for remaining templates. Handle duplicate uploads by making confirmSigningAndUpload idempotent: if signedDocuments row already exists for user/template, skip upload and reuse existing file. If Zoho signing completes but upload fails, allow retry by reusing sessionId or re-downloading file from backend; ensure backend download endpoint can return file while session valid. Clarify redirect/callback URL location: add a Next.js route under src/app/signing/callback/page.tsx or similar to capture Zoho redirect, parse sessionId, and notify documents service to finalize upload.

## Concrete Steps

Commands and checkpoints to run from repository root:

- npm run lint  (ensure lint passes after implementing changes)
- npm test  (run Jest suite; add new tests for documents service and signing gate logic)
- npm run dev  (launch dev server to manually verify event form and registration signing gate)

## Validation and Acceptance

Manual flow:

- Host logs in and ensures a DocumentTemplate exists with storageFileId in documentTemplates bucket (metadata visible via documents service listTemplatesForHost). EventForm multi-select lists available templates.
- Host creates or edits an event, selects templates, saves, and sees documentTemplateIds persisted when reloading the form.
- Guest user opens event detail, clicks register, and is blocked by SigningModal before payment. For each required template, the modal loads signingUrl, user completes Zoho Sign, frontend uploads signed PDF to signedDocuments bucket with permissions for userId and hostId, and a signedDocuments row is created.
- After all templates are signed, payment modal appears and registration completes. Re-opening registration shows no signing prompts because signedDocuments rows already exist.
- Verify permissions via Appwrite console: only user and host can read the signed file; no public access.

## Idempotence and Recovery

All client checks for signedDocuments are re-run on each register attempt, so refreshes resume remaining templates. Signing flow should be tolerant: confirmSigningAndUpload should check for existing signedDocuments row before uploading to avoid duplicates. If upload fails after Zoho completion, allow retry by reusing the download endpoint with the same sessionId until success. Payment modal should only open after successful verification to prevent bypass.

## Artifacts and Notes

Keep short evidence snippets as work proceeds, such as lint/test output or manual flow screenshots, added here when available. For example:

- Example lint output: npm run lint -> passes.
- Example test name: documents service handles missing signature and triggers startEmbeddedSigning.

## Interfaces and Dependencies

List the expected interfaces and signatures to implement:

- src/types/index.ts: Event.documentTemplateIds?: string[]; EventPayload.documentTemplateIds?: string[]. Export interfaces DocumentTemplate and SignedDocument with fields described above. Ensure types reference Appwrite TablesDB row IDs and Storage file IDs explicitly.
- src/lib/documents.ts: exported functions listTemplatesForHost, getTemplatesByIds, getSignedDocumentsForUser, startEmbeddedSigning, confirmSigningAndUpload, ensureSignedBeforeProceeding. Functions should use Appwrite client (tables, storage, functions) and follow existing REST execution pattern with xpath and executionMethod. Each function should return typed objects or booleans and throw/display Mantine notifications on error.
- UI additions: EventForm multi-select bound to documentTemplateIds; SigningModal component (new or existing pattern) that accepts signingUrl, template info, and callbacks for completion. Registration flow component should import ensureSignedBeforeProceeding to gate payment intent calls.
- Callback route: Next.js page under src/app/signing/callback (or similar) to capture Zoho redirect, parse sessionId/templateId, and call confirmSigningAndUpload before closing modal or signaling completion.

