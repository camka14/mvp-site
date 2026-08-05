# Require canonical sports in affiliate mappings

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must remain current while work proceeds.

Maintain this document in accordance with `PLANS.md` at the repository root.

## Purpose / Big Picture

Affiliate mapping packages must not silently introduce unsupported or ambiguous sport names. After this change, mapper agents use the exact names in BracketIQ's `Sports` table when the stored source evidence identifies one of those sports. A package that contains a source sport outside that catalog can still preserve the mapping, but the independent reviewer must reject it into terminal human review. Generic labels such as `Volleyball` cannot be approved when the catalog instead contains `Indoor Volleyball`, `Grass Volleyball`, and `Beach Volleyball`.

The behavior is visible in the mapping-package evidence report. It will include a sport-quality section that lists the current canonical catalog, every candidate and organization sport checked, and any unsupported or noncanonical values. Focused tests will prove that an exact canonical sport passes, a casing or naming defect returns to the mapper, and an unsupported sport stops for human review.

## Progress

- [x] (2026-08-04 20:05 PDT) Inspected the mapper, reviewer, publication, package-evidence, and human-review paths.
- [x] (2026-08-04 20:05 PDT) Identified recent generic `Volleyball` and `Soccer` aliases that conflict with the requested exact-catalog rule.
- [x] (2026-08-04 20:38 PDT) Added deterministic candidate and organization sport-quality inspection to package evidence.
- [x] (2026-08-04 20:38 PDT) Added reviewer result codes, terminal routing, and admin guidance.
- [x] (2026-08-04 20:38 PDT) Updated mapper and reviewer skills, goal text, and contracts.
- [x] (2026-08-04 20:38 PDT) Removed the runtime generic-sport auto-conversion and added publication safety without deleting the committed migration history.
- [x] (2026-08-04 20:38 PDT) Passed 119 focused Jest tests, TypeScript, targeted ESLint, and whitespace checks.

## Surprises & Discoveries

- Observation: The current publication resolver accepts case-insensitive sport names and returns `null` for unsupported names, which lets an affiliate event be created without a sport.
  Evidence: `src/server/affiliateImports/service.ts` resolves `sportName` with a case-insensitive lookup and assigns its nullable result to `Events.sportId`.

- Observation: The current commit contains aliases that convert generic `Volleyball` and `Soccer` to indoor variants. It also contains an already committed migration that backfilled generic affiliate volleyball events to `Indoor Volleyball`.
  Evidence: The baseline in `src/server/affiliateImports/service.ts` and `prisma/migrations/20260804123000_backfill_affiliate_volleyball_sports/migration.sql` conflicts with the new rule for future mapping and review.

- Observation: Deleting an existing migration would make migration history inconsistent and could break a database where it already ran.
  Evidence: The migration is tracked in commit `3febda035`. The implementation keeps that file intact and rejects the preserved generic candidate label when those packages are reviewed again.

## Decision Log

- Decision: Query the `Sports` table in the disposable validation database instead of maintaining a second hard-coded affiliate allowlist.
  Rationale: The database is the product catalog. New implemented sports, including the current uncommitted Racquetball work, should become valid without editing affiliate-specific constants.
  Date/Author: 2026-08-04 / Codex

- Decision: Route unsupported sport names to `REJECT` with `HUMAN_REVIEW_REQUIRED`, while routing missing, malformed, or wrong-case names that have an exact catalog correction to producer repair.
  Rationale: A reviewer must not guess that Badminton should become another sport or that generic Volleyball means indoor play. Simple formatting defects remain deterministic mapper repairs.
  Date/Author: 2026-08-04 / Codex

- Decision: Keep unsupported source labels in review-ready mappings rather than failing intake production.
  Rationale: The mapping preserves useful source evidence and gives a human the information needed to add a sport to the product catalog or stop the source.
  Date/Author: 2026-08-04 / Codex

## Outcomes & Retrospective

The mapper and reviewer now share an exact-catalog rule. Package evidence checks every candidate and source organization sport against the current `Sports` table. Unsupported sports stop in terminal human review. Correctable spelling or casing defects return to the mapper. Publication rejects missing or unsupported sport names, so manual approval cannot bypass the rule.

Validation passed with 119 focused Jest tests, `npx tsc --noEmit`, targeted ESLint, and `git diff --check`. No runtime, live database, queue, process, deployment, or published record changed.

## Context and Orientation

`src/server/affiliateImports/service.ts` extracts candidates and publishes approved candidates into events, facilities, and organizations. `scripts/report-affiliate-mapping-package-evidence.ts` bridges the mapper and reviewer by reading candidates from the disposable validation database. `src/server/affiliateImports/approvalResult.ts` validates the reviewer's machine-readable decision. `src/server/affiliateImports/approvalQueue.ts` applies that decision and moves terminal packages to human review. The repo-backed skills under `.agents/skills/ingest-affiliate-intakes` and `.agents/skills/review-affiliate-approvals` are the operating instructions used by the Luna mapper and reviewer goals.

A canonical sport is a row in the `Sports` table. Exact sport names are the `name` values in those rows. Sport variants are separate sports when the catalog says they are separate, such as indoor, grass, and beach volleyball. Human review is a terminal queue state that prevents the mapping agent from repeatedly retrying a source that needs a product decision.

## Plan of Work

Add `src/server/affiliateImports/sportQuality.ts`. It will compare every candidate `sportName` and every source organization sport with the canonical names from `Sports`. It will return a structured report with exact-match counts and issue codes for missing names, noncanonical names with a deterministic catalog suggestion, and names absent from the catalog.

Extend `scripts/report-affiliate-mapping-package-evidence.ts` to include that report. Extend the approval result schema with `sportQualityVerified`, `SPORT_NAME_INVALID`, and `SPORT_NOT_IN_CATALOG`. The first code is a producer repair. The second is terminal human review. Update the human-review display guidance so the admin page asks whether the unsupported sport should be added to BracketIQ or the source should remain stopped.

Update both Luna goal builders, their tests, and the mapper/reviewer skill contracts. Mappers must use exact canonical names when evidence supports them, must not infer a volleyball or soccer surface, and may preserve an unsupported source label for human review. Reviewers must check `sportQuality` before approval and must reject unsupported values directly to human review.

Remove the runtime generic sport aliases because they guess a surface. Keep the already committed migration file intact so migration history remains valid. Add a publication assertion so an unsupported candidate cannot be published even if an operator bypasses the package reviewer.

## Concrete Steps

Work from `/Users/elesesy/StudioProjects/mvp-site`.

Run the focused validation with:

    npx jest --runInBand \
      src/server/affiliateImports/__tests__/sportQuality.test.ts \
      src/server/affiliateImports/__tests__/approvalResult.test.ts \
      src/server/affiliateImports/__tests__/sourceMappingHumanReview.test.ts \
      src/server/affiliateImports/__tests__/codexCliGoal.test.ts \
      src/server/affiliateImports/__tests__/codexApprovalGoal.test.ts \
      src/server/affiliateImports/__tests__/service.test.ts

Then run:

    npx tsc --noEmit
    git diff --check

## Validation and Acceptance

The sport-quality tests must show that `Indoor Volleyball` passes when present in `Sports`; `Volleyball` and `Badminton` produce `SPORT_NOT_IN_CATALOG`; and `indoor volleyball` produces a deterministic canonical-name issue. Package evidence must contain `sportQuality`.

Approval-result tests must accept `SPORT_NOT_IN_CATALOG` only with `HUMAN_REVIEW_REQUIRED` and must accept `SPORT_NAME_INVALID` only with `PRODUCER_REPAIR`. A mapping approval must fail unless `sportQualityVerified` is true.

Service tests must show that publishing a generic `Volleyball` candidate fails instead of silently converting it to `Indoor Volleyball` or creating an event with a null sport. Existing exact canonical sport tests must continue to pass.

## Idempotence and Recovery

The quality inspection is read-only and can run repeatedly. It reads the catalog and candidate rows from the same disposable database used for package review. No migration is required. If the product later adds Badminton, the same package will pass the catalog-presence check after the sport row exists, subject to all other review gates.

The implementation preserves unrelated local UI and Racquetball work. It removes only the runtime alias behavior that directly conflicts with the new rule. It does not delete the committed historical backfill migration. No live data is rewritten as part of this plan.

## Artifacts and Notes

Expected evidence excerpt for an unsupported package:

    sportQuality.passed = false
    sportQuality.issues[0].code = SPORT_NOT_IN_CATALOG
    mappingDisposition.nextAction = HUMAN_REVIEW_REQUIRED

## Interfaces and Dependencies

`src/server/affiliateImports/sportQuality.ts` will export `analyzeAffiliateSportQuality` for pure tests and `inspectAffiliateSportQuality` for package evidence. The inspector accepts the existing `pg`-style query interface and a source ID.

`affiliateApprovalResultSchema` will require the boolean check `sportQualityVerified`. Its disposition reason-code union will include `SPORT_NAME_INVALID` and `SPORT_NOT_IN_CATALOG` with the routing described above.

Revision note: Created and completed 2026-08-04 to implement exact canonical sport validation for affiliate mappings and approvals without changing live runtime state.
