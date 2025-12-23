# Add TEXT waiver templates and password-confirmed signing

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds. This plan must be maintained in accordance with `mvp-site/PLANS.md`.

## Purpose / Big Picture

Summary / Goals: Allow organization owners to create text-only waiver templates alongside the existing PDF/BoldSign templates, and require participants to confirm their password before signing any required documents during registration. TEXT templates are shown in-app with a checkbox, while PDF templates keep the embedded BoldSign experience; both must be accepted before registration can complete. Out of scope: reworking pricing or payment logic beyond skipping BoldSign calls for TEXT, redesigning the registration UI beyond the signing modal, or adding new tables/fields beyond `templateDocuments.type`, `templateDocuments.content`, and `signedDocuments.ipAddress`. Expected UX differences: PDF templates open a BoldSign iframe with document IDs and external signing, while TEXT templates show the waiver text directly in the modal with a required checkbox; the gating and step progression should feel the same for both types.

## Progress

- [x] (2025-12-23 00:05Z) Drafted ExecPlan.
- [ ] Appwrite schema updates for templateDocuments and signedDocuments applied and documented.
- [ ] mvp-site template creation, selection, and signing flow updated for TEXT and password confirmation.
- [ ] mvp-build-bracket template and document endpoints updated for TEXT handling and IP capture.
- [ ] Tests and manual validation executed.

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: Capture signer IP in a Next.js route handler that forwards the signing write to the Appwrite function.
  Rationale: Keeps IP derivation server-side (not client-supplied) while preserving the existing Appwrite function as the write authority.
  Date/Author: 2025-12-23 / Codex
- Decision: Treat `templateDocuments.type` as the source of truth, default missing values to `PDF`, and allow `templateId` to be omitted for `TEXT` templates while using `$id` for requiredTemplateIds references.
  Rationale: Preserves current BoldSign behavior, keeps requiredTemplateIds compatible with existing code, and avoids inventing new identifiers for TEXT waivers.
  Date/Author: 2025-12-23 / Codex

## Outcomes & Retrospective

To be updated after implementation.

## Context and Orientation

Templates are managed in `mvp-site/src/app/organizations/[id]/page.tsx`, which uses `mvp-site/src/lib/boldsignService.ts` to list and create templates via the Appwrite function in `mvp-build-bracket/src/entrypoints/organizations.py`. The existing flow is PDF-only and relies on BoldSign to create templates and embed a template-builder iframe. Required templates are chosen in `mvp-site/src/app/events/[id]/schedule/components/EventForm.tsx` using the list returned by the templates service and stored on events as `requiredTemplateIds`.

Registration gating and signing happen in `mvp-site/src/app/discover/components/EventDetailSheet.tsx`. It calls `boldsignService.createSignLinks` (Appwrite function: `mvp-build-bracket/src/entrypoints/documents.py:create_sign_links`) to build BoldSign signing links and create pending `signedDocuments` rows. The modal embeds BoldSign, listens for a postMessage when signing completes, and polls Appwrite via `mvp-site/src/lib/signedDocumentService.ts` until the signed row is marked as `signed`. Server-side enforcement happens in `mvp-build-bracket/src/entrypoints/edit_event.py:_ensure_required_documents_signed`, which uses `mvp-build-bracket/src/database/services/documents_service.py:is_template_signed` to block registration if a required template has not been signed.

Appwrite schema lives in `mvpDatabase/appwrite.config.json`. `templateDocuments` currently has `templateId`, `organizationId`, `title`, `signOnce`, `status`, `roleIndex`, and an existing `content` column, but no `type` field and no permissions configured. `signedDocuments` currently has no `ipAddress`. The plan must add a `type` enum (fixed string values) with `PDF` and `TEXT`, ensure `content` is used for TEXT waivers, and add `ipAddress` for sign records while matching the permission patterns used by tables like `events` and `organizations`.

## Plan of Work

Cross-repo breakdown: mvp-site covers UI/UX, Next.js route handlers, and Appwrite calls from the web; mvp-build-bracket covers Appwrite function changes for template creation and signing; `mvpDatabase/appwrite.config.json` captures the schema and permission updates.

Milestone 1: Data model and permissions. Update `mvpDatabase/appwrite.config.json` to add `templateDocuments.type` as an enum with allowed values `PDF` and `TEXT`, default it to `PDF` for existing rows, and ensure `templateDocuments.content` remains available for TEXT templates. Adjust `templateDocuments.templateId` to be optional so TEXT templates are not forced to store a BoldSign ID, and add `signedDocuments.ipAddress` as an optional string field. Align CRUD permissions for `templateDocuments` and `signedDocuments` to the pattern used by `events` and `organizations` (create/read/update/delete for authenticated users and read for guests). If index updates are required for organizationId or type filtering, use the same style as other table indexes in this config.

Milestone 2: mvp-site template creation and selection updates. In `mvp-site/src/types/index.ts`, extend `TemplateDocument` with a `type` field and `content` field, and define a `TemplateDocumentType` union or enum to mirror the Appwrite values. Update `mvp-site/src/app/organizations/[id]/page.tsx` to let owners choose between PDF and TEXT when creating templates, capture the waiver text for TEXT templates, and only show the BoldSign embed section for PDF templates. Ensure the template list UI labels template type so organizers can distinguish PDFs and TEXT waivers. Update `mvp-site/src/app/events/[id]/schedule/components/EventForm.tsx` to keep using requiredTemplateIds but show type-aware labels and keep using `$id` when `templateId` is absent. Adjust `mvp-site/src/lib/boldsignService.ts` (or introduce a dedicated template service) so creation calls include `type` and `content` for TEXT templates and list responses include those fields.

Milestone 3: mvp-build-bracket template and signing endpoints. Extend `mvp-build-bracket/src/database/services/documents_service.py:create_template_document` to accept `template_type` and `content`, and persist them into the template document payload. Update `mvp-build-bracket/src/entrypoints/organizations.py` so template creation branches on `type`: for `PDF`, keep the BoldSign create URL behavior; for `TEXT`, skip BoldSign entirely and create a template row with the provided content and a generated ID. In `mvp-build-bracket/src/entrypoints/documents.py:create_sign_links`, detect template type for each requiredTemplateId, skip BoldSign calls for `TEXT`, and return a response that includes both PDF sign links and TEXT waiver data in the original requiredTemplateIds order so the client can render a single signing flow without reordering. Ensure no BoldSign calls occur when `type=TEXT` to avoid charges.

Milestone 4: Signing flow with password confirmation and IP capture. In `mvp-site/src/app/discover/components/EventDetailSheet.tsx`, add a password confirmation step before signing any document. The UI should prompt for the current password in a modal (or pre-step), call a Next.js route handler (for example `mvp-site/src/app/api/documents/confirm-password/route.ts`) that attempts to create an Appwrite session using the user's email and the entered password, then immediately deletes the temporary session so it does not alter the browser session. If password confirmation fails, block signing and show the error. After confirmation, start the signing flow using the mixed PDF/TEXT items. PDF items continue to use the BoldSign iframe; TEXT items show the waiver content in-app and require a checkbox to continue. When a signing step completes (PDF postMessage event or TEXT checkbox confirm), call a second Next.js route handler (for example `mvp-site/src/app/api/documents/record-signature/route.ts`) that derives the signer IP from headers like `x-forwarded-for`, `x-real-ip`, or `cf-connecting-ip` (with localhost fallback), and forwards the signature write to the Appwrite function endpoint `/documents/signed` with `templateId`, `documentId` (generated for TEXT), `eventId`, and `ipAddress`. Update `mvp-build-bracket/src/entrypoints/documents.py:_handle_mark_signed` and `mvp-build-bracket/src/database/services/documents_service.py:create_signed_document` and `mark_signed_document` to accept and persist `ipAddress`, preserving existing values if already set so repeated calls remain safe.

Milestone 5: Tests and rollout readiness. Update `mvp-build-bracket/tests/appwrite_mocks.py` to include default `type`, `content`, and `ipAddress` fields for template and signed documents. Add unit tests in `mvp-site` to exercise template type branching, password confirmation success/fail, and the text waiver acceptance path, and add integration coverage for the registration gating flow if a harness exists. Prepare a rollout sequence that applies the Appwrite schema update first, deploys the code changes next, and validates signing and registration flows before enabling broad usage.

Permissions & Security Notes: Template creation should remain restricted to organization owners via the `organizations` entrypoint guard and Appwrite table permissions; participant reads should align with existing guest/user read patterns so required templates can be displayed during registration. Password confirmation is required to reduce the risk of unauthorized signing on shared devices; it must validate credentials by creating and then cleaning up a temporary Appwrite session without replacing the user's active session. IP address collection must be server-derived and stored alongside sign records without trusting client-provided values.

Migration / Backward Compatibility: Existing templateDocuments should default to `type=PDF`, and existing signedDocuments rows can retain a null `ipAddress`. Existing `templateId` values remain valid for PDFs; TEXT templates will rely on `content` and `$id` for identification. No one-time data migration is required beyond the schema update and defaulting logic in application code for missing `type` values.

## Concrete Steps

From `/home/camka/Projects/MVP/mvpDatabase`, update `appwrite.config.json` with the templateDocuments `type` enum, optional `templateId` for TEXT, and `signedDocuments.ipAddress`, matching permission patterns used by tables like `events`.

From `/home/camka/Projects/MVP/mvp-site`, update:
  - `src/types/index.ts`
  - `src/app/organizations/[id]/page.tsx`
  - `src/app/events/[id]/schedule/components/EventForm.tsx`
  - `src/app/discover/components/EventDetailSheet.tsx`
  - `src/lib/boldsignService.ts` (or new template service)
  - new Next.js route handlers under `src/app/api/.../route.ts` for password confirmation and signature recording

From `/home/camka/Projects/MVP/mvp-build-bracket`, update:
  - `src/database/services/documents_service.py`
  - `src/entrypoints/organizations.py`
  - `src/entrypoints/documents.py`
  - `tests/appwrite_mocks.py`

Suggested commands for validation (run only after implementation):
  - In `/home/camka/Projects/MVP/mvp-site`: `npm test` and `npm run lint`
  - In `/home/camka/Projects/MVP/mvp-build-bracket`: `python -m pytest`

Rollout / Release Steps: apply Appwrite schema changes first; deploy mvp-build-bracket function updates next; deploy mvp-site after that; verify required-template signing in staging before releasing to production; monitor signing failures and registration errors in logs.

## Validation and Acceptance

Testing plan: add unit tests for template type branching (PDF vs TEXT) and password confirmation (success and failure), add integration coverage for registration gating to ensure required templates block join until signed, and add server-route tests for IP capture with and without proxy headers. Manual validation should include creating both template types, attaching them to an event, and completing registration as a participant.

Acceptance criteria (verify each in staging):
- Organization owners can create a TEXT waiver template with content and see it listed alongside PDF templates.
- Participants see TEXT waiver content in the signing modal, must check the checkbox, and cannot complete registration without accepting.
- Password confirmation is required before signing any template and blocks signing on failure.
- `signedDocuments` rows include `ipAddress` populated from server-side headers (or a localhost fallback in dev).
- TEXT templates do not trigger BoldSign calls or charges, while PDF templates continue to use BoldSign.

## Idempotence and Recovery

Schema changes are additive and can be re-applied safely; if a schema change fails, re-run after correcting the config without data loss. TEXT template creation is safe to retry because template rows are additive; if a signing write fails, the user can retry the signing step and the signedDocuments update should overwrite or ignore duplicate attempts without breaking registration. If password confirmation or IP capture routes fail, fall back to showing an error and keep the user in the signing flow without creating a partial registration.

## Artifacts and Notes

Capture a short diff of `mvpDatabase/appwrite.config.json` and any new route handler request/response shapes for reference during implementation. If unexpected BoldSign errors occur for PDF templates, record the payload and response for troubleshooting in `Surprises & Discoveries`.

## Interfaces and Dependencies

Template documents must expose `type` as a fixed string enum with values `PDF` and `TEXT` and `content` as a string used only when `type=TEXT`. For `type=PDF`, `templateId` continues to store the BoldSign template ID; for `type=TEXT`, `content` holds the waiver text and `$id` is used for requiredTemplateIds references.

The signing flow should consume a unified list of sign steps returned by the Appwrite function at `/events/{eventId}/sign` that preserves requiredTemplateIds order. Each step should include `type`, `templateId`, `title`, and `signOnce`, and for PDF items also include `documentId` and `url`; for TEXT items include `content` and omit BoldSign fields.

The password confirmation route should accept `{ email, password }` (and optionally `eventId` for logging) and return a success/error response after creating and deleting a temporary Appwrite session. The signature-recording route should accept `{ templateId, documentId, eventId, type }`, derive `ipAddress` from request headers (accounting for proxy/CDN headers), and forward the write to the Appwrite function `/documents/signed` with `ipAddress` included. The Appwrite function and documents service must accept `ipAddress` in the payload and persist it to `signedDocuments` without breaking existing PDF webhook updates.

BoldSign integration remains in `mvp-build-bracket/src/integrations/boldsign.py` and `src/entrypoints/documents.py` for PDF templates only; TEXT templates must never call BoldSign APIs.
