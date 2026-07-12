# Fix and verify every critical audit finding

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds. This document is maintained in accordance with `PLANS.md` at the `mvp-site` repository root.

## Purpose / Big Picture

The comprehensive code audit identified critical authorization, privacy, payment, data-integrity, consent, messaging, and Android workflow defects. After this plan is complete, untrusted callers cannot use the affected site endpoints to act outside their authority, sensitive privacy output is minimized, payment and refund transitions are bound to verified financial records, and Android preserves the same authoritative contracts without silent data loss or unsafe UI behavior. The result is observable through focused regression tests, broad type/build checks, browser exercises of affected site flows, and emulator exercises of affected Android flows.

## Progress

- [x] (2026-07-10) Enumerated all 34 audit findings currently marked critical and separated site, cross-repository, and Android ownership.
- [x] (2026-07-10) Traced the 18 site or cross-repository critical findings through current handlers, helpers, schema, callers, and tests.
- [x] (2026-07-10) Implemented focused site fixes for bill/event/invite/user authorization, typed session tokens, MFA enforcement, public profile privacy, Stripe webhook/rental verification, chat/topic authority, bill splitting, signed-document assertions, guest identity binding, and immutable refund scopes. Focused suites are green; broad gates remain.
- [x] (2026-07-11) Closed the immediate Android scoring, notification, required-signature, logout-ordering, and generic user-update contract defects (APP-119, APP-120, APP-122, SEC-044, DATA-027). The Android production compile is green; JVM test-fixture and manifest configuration follow-up remains before the full mobile suite can be accepted.
- [x] (2026-07-11) Started the next severity tier with fail-closed Stripe configuration, organization and field/time-slot privacy boundaries, rental lock canonicalization, email-membership scoping, and message payload hardening.
- [x] (2026-07-11) Completed the combined automated validation pass: `npx tsc --noEmit`, 414 serial Jest suites / 2,635 tests, Prisma schema validation, a clean 148-migration isolated PostgreSQL replay, and 117 Android unit suites / 835 tests (3 skipped, zero failures).
- [x] (2026-07-11) Established Android Room v3 as the earliest evidence-backed supported source version. Versions 1 and 2 remain fail-closed rather than receiving a fabricated migration path.
- [ ] Trace and implement the 16 Android/shared critical fixes, including cross-repository DTO/schema changes.
- [x] Run targeted tests for every changed site cluster, then the broad TypeScript, Jest, Gradle, and Android build gates applicable to changed code.
- [ ] Manually verify affected site behavior in the in-app browser and affected Android behavior on the configured emulator.
- [ ] Reconcile `docs/code-audit/README.md` and `docs/code-audit/file-coverage.tsv` with fixed status and concrete verification evidence.

## Surprises & Discoveries

- Observation: The critical set spans 34 findings rather than a single feature cluster.
  Evidence: The audit headings marked `Severity: **critical**` include SEC-001, SEC-009, SEC-011, SEC-012, SEC-014, SEC-015, SEC-017, SEC-018, DB-001, SEC-020, SEC-023, SEC-027 through SEC-030, SEC-043, SEC-044, TEST-007, DATA-018, DATA-021, DATA-024 through DATA-027, DATA-029, APP-076, APP-078, APP-091, APP-100, APP-108, APP-112, and APP-119 through APP-122.
- Observation: `src/server/chatAccess.ts` already owned chat-terms enforcement and had to remain the shared home for new membership/management checks.
  Evidence: The first typecheck after adding chat access predicates caught the missing pre-existing `ensureUserHasAcceptedChatTerms` export; the functions were merged rather than replacing the module.
- Observation: The mvp-app audit branch contains a complete Room migration graph, but the active checkout needs its dependent durable rental/outbox model types as part of the same integration.
  Evidence: The audited migration path raises the Room version through the historical schemas and includes pending-rental and payer-scoping tables; copying only the old destructive-delete removal would leave supported upgrades without a complete migration path.
- Observation: Android database user versions 1 and 2 cannot be safely supported from repository evidence.
  Evidence: `87e8eeed` changed the physical v1 schema without changing the Room version, `e2053fec` jumped directly from version 1 to 3, no committed version-2 annotation exists, and the later synthetic 1-to-2 bridge conflicts with the retained schema deltas. The registered and instrumented graph therefore begins at v3.

## Decision Log

- Decision: Treat the audit report as the authoritative enumeration, but validate every finding against current source before editing.
  Rationale: The repositories may have changed after the audit, and a fix is complete only when current behavior and tests prove the defect is closed.
  Date/Author: 2026-07-10 / Codex
- Decision: Remediate by contract cluster, beginning with server authorization and payment boundaries before client UX.
  Rationale: Server-side enforcement protects every client and provides stable contracts for subsequent Android changes.
  Date/Author: 2026-07-10 / Codex
- Decision: Add schema changes only where durable scope or idempotency cannot be represented safely in existing canonical data.
  Rationale: Financial approval and outbox correctness require persisted authoritative identity, while unnecessary schema churn would increase migration risk.
  Date/Author: 2026-07-10 / Codex
- Decision: Do not synthesize Room migrations for Android user versions 1 or 2; define v3 as the evidence-backed support floor.
  Rationale: A guessed path could transform real user data according to the wrong one of two incompatible historical version-1 layouts. Failing closed is safer until a released database sample or committed schema provenance is recovered.
  Date/Author: 2026-07-11 / Codex

## Outcomes & Retrospective

Automated validation is complete for the current remediation set. Work remains in progress: no critical finding is considered closed until its regression test and relevant manual runtime path both provide evidence.

## Context and Orientation

`mvp-site` is a Next.js App Router application. API handlers under `src/app/api` authenticate through `src/lib/authServer.ts` and authorize through `src/lib/permissions.ts` or domain-specific helpers. Prisma in `prisma/schema.prisma` is the canonical server data model; migrations live under `prisma/migrations`. Payment processing uses Stripe through server-owned routes. The audit tracker is `docs/code-audit/README.md` and the per-file disposition ledger is `docs/code-audit/file-coverage.tsv`.

`mvp-app` is the Kotlin Multiplatform mobile repository at `C:\Users\samue\StudioProjects\mvp-app`. Android and shared code live primarily under `composeApp/src/androidMain`, `composeApp/src/commonMain`, and the `core` modules. Room is the offline database. Ktor DTOs and repositories communicate with `mvp-site`. Android verification uses package `com.razumly.mvp` on the configured Pixel 9 Pro XL API 35 emulator.

The server is the authority for identity, authorization, payment state, signed-document state, refunds, and shared social relationships. Clients may cache or optimistically present data, but cannot broaden authority or preserve a rejected mutation as canonical state.

## Plan of Work

First, inspect every critical site handler and its current regression coverage. Introduce narrow authorization helpers where repeated ownership rules exist, and make handlers derive actor identity from the authenticated session. Scoped JWTs must remain scoped and cannot enter the normal application session path. Privacy policy output must be projected through a safe public shape. Stripe webhook, rental, refund, and billing transitions must be bound to verified Stripe and persisted payment records.

Second, add durable refund-request scope and approval-preview data to Prisma with a migration, update creation and approval handlers to operate only on the immutable snapshot, and update Android models/UI to display the exact approval scope. Cross-repository nullable patch DTOs will use explicit presence semantics so `null` means clear and omission means unchanged.

Third, make Android outbox enqueue/claim/drain behavior serialized and transactional, classify terminal versus retryable failures, reconcile terminal optimistic overlays, and preserve finalized match state. Then fix the remaining consent, payment-plan, rental-selection, checkout ownership, signing, loading-overlay, scoring, and notification contracts with targeted tests.

Finally, run automated verification and launch both products. Browser tests will exercise authorized and unauthorized requests plus affected user-facing flows. Android tests will build/install the current variant, launch via resolved activity, navigate using UI-tree-derived coordinates only, and capture screenshots and logcat. The audit report will record only evidence observed after the fixes.

## Concrete Steps

In `C:\Users\samue\Documents\Code\mvp-site`, use `rg` to locate every handler/helper/test cited by the critical findings. Run focused Jest suites during each cluster, followed by `npx tsc --noEmit` and `npm run test:ci` when the site work stabilizes. Create Prisma migrations with deterministic SQL and validate by replaying migrations against an isolated database before calling the schema work complete.

In `C:\Users\samue\StudioProjects\mvp-app`, run focused module tests for each changed coordinator/repository/helper. Then run the broad supported Gradle test tasks and `:composeApp:installDebug --console=plain`. Resolve the activity with `adb shell cmd package resolve-activity --brief com.razumly.mvp`, launch it, inspect UI Automator output, and capture logcat for the affected paths.

For browser verification, start the local site using the repository’s supported development command and use the in-app Browser plugin first. Verify DOM, console, responsive behavior, and affected API responses without using screenshot coordinates for interaction.

## Validation and Acceptance

Acceptance requires all 34 critical audit headings to have a code fix, a regression test or direct invariant verifier, and no remaining source path matching the documented exploit or corruption scenario. Site authorization tests must prove unrelated users receive denial responses and authenticated actors cannot override their identity. Payment tests must prove unsigned webhooks and unverified payment identifiers cannot transition state. Refund tests must prove one occurrence/participant cannot broaden into other payments and approval shows the immutable amount/payment scope.

Android tests must prove nullable clears serialize distinctly from omission; one outbox writer/drainer preserves sequence and terminal failures do not remain authoritative; finalized matches remain finalized; payment plans survive create; rental validation matches the server; one payment result has one owner; document signing fails closed and matches the selected template; the loading overlay consumes input; deuce scoring follows win-by-two; and notification text/topic match the host event. Manual browser and emulator evidence must confirm affected flows render and reject unsafe actions without crashes or ANRs.

## Idempotence and Recovery

All migrations must be additive and safely replayable through Prisma’s migration system. Tests may create isolated records and must clean them through existing test database teardown. Do not reset, discard, or overwrite unrelated worktree changes. If an external Stripe, email, or push service is unavailable, use the project’s mocked test boundary for deterministic regression proof and record the limitation before manual local verification.

## Artifacts and Notes

The authoritative source list is the critical-severity sections in `docs/code-audit/README.md`. Implementation evidence and any changed assumptions will be summarized here as work proceeds. Screenshots, UI trees, logcat files, and temporary database outputs must remain outside the repository.

## Interfaces and Dependencies

Use existing `requireSession`, row-access helpers, Prisma client, Stripe server SDK, Ktor client, Room database, Kotlin coroutines, and Compose APIs. New authorization helpers must accept the authenticated session and canonical persisted row rather than caller-supplied actor fields. New financial snapshot types must carry stable payment or bill identifiers, amount in integer cents, ISO currency, occurrence scope when applicable, and an idempotency/version token. Android checkout result routing must use one immutable operation identity and exhaustive operation type rather than several nullable pending fields.

Revision note (2026-07-10): Created the initial self-contained remediation plan after inventorying the complete critical finding set.
Revision note (2026-07-10): Recorded completion of the focused site remediation cluster and the chat-access module integration discovery.
Revision note (2026-07-11): Recorded the current Android critical-contract progress and the post-critical server hardening work while the remaining Room and full-suite validation work continues.
Revision note (2026-07-11): Recorded green broad web/mobile unit gates and the isolated full Prisma migration replay; runtime browser/emulator evidence and unresolved Android critical clusters remain.
