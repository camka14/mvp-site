# Repair false claimed states for affiliate organizations

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must stay current as work proceeds. Maintain this document in accordance with `PLANS.md` at the repository root.

This plan is a focused remediation for the ownership-state rollout described in `docs/affiliate-organization-claiming-execplan.md`. It includes all context needed to complete this repair. The earlier plan remains the reference for the full claim, verification, transfer, and dispute product.

## Purpose / Big Picture

An affiliate organization that nobody has claimed must show “Claim this profile” on its organization page. It must not show “Claimed profile,” receive a claimed-profile trust boost, or require an ownership dispute. A Razumly administrator can remain the required internal placeholder owner, but that internal account does not prove public ownership.

After this repair, primary affiliate organization creation paths write an explicit unclaimed state. Legacy affiliate creation paths receive the same fail-closed database defaults. A guarded production repair changes only historical false claims that have no claim evidence. The repair preserves every real claim, pending claim, dispute, suspension, and ownership transfer. The public event and organization cards remain unchanged. Only the organization page presents the claim action, as the current product requires.

The visible acceptance example is `affiliate_org_cyo_camp_howard_sports`. Its organization page must stop showing “Claimed profile.” Its public API must return `originType: "AFFILIATE_IMPORTED"`, `ownershipStatus: "UNCLAIMED"`, and `claimable: true`.

## Progress

- [x] (2026-08-05 03:18Z) Confirmed the false claimed state on the live CYO / Camp Howard Sports page and public API.
- [x] (2026-08-05 03:18Z) Inspected the exact production row, migration defaults, claim evidence, affiliate provenance, shared importer, source-specific setup script, and existing repair command.
- [x] (2026-08-05 03:18Z) Counted 1,201 production organizations with affiliate evidence. Of these, 775 had the same false-claim signature and none had an `OrganizationClaims` record. Treat these numbers as a dated baseline because affiliate ingestion continues to add rows.
- [x] (2026-08-05 03:18Z) Inventoried 161 setup scripts that create or upsert affiliate source organizations without explicit ownership fields.
- [x] (2026-08-05 17:50Z) Added regression tests for the false-default signature, claim preservation, safe migration defaults, generated setup code, live synchronization, and explicit first-party creation. The focused run passed 44 tests in 5 suites.
- [x] (2026-08-05 17:50Z) Added the shared affiliate ownership initializer. Applied it to the shared candidate publisher and generated setup code. Made live sync inserts explicit and made conflict updates preserve ownership fields.
- [x] (2026-08-05 17:50Z) Changed both database defaults to `AFFILIATE_IMPORTED / UNCLAIMED`. Added a claimed-affiliate evidence constraint as `NOT VALID` so it protects new writes without blocking deployment on historical rows.
- [x] (2026-08-05 17:50Z) Replaced the unsafe backfill behavior with claim-aware repair categories, a reviewed digest requirement, an advisory lock, row locks, compare-and-set updates, provenance rechecks, and rollback snapshots.
- [x] (2026-08-05 18:04Z) Applied the additive migration to the local Docker database. Verified fail-closed defaults, false-claim rejection, valid claimed-affiliate evidence, the digest-bound repair, and an idempotent second audit. Passed 108 focused tests, TypeScript, Prisma validation and generation, the production build, the full CI suite, and API route coverage for 315 files.
- [x] (2026-08-05 19:01Z) Superseded the pending local browser check with a rendered production browser check. The CYO page showed “Unclaimed profile” and “Claim this profile.” The claim action opened the ownership wizard and its sign-in link retained the organization-specific return path.
- [x] (2026-08-05 18:58Z) Used the explicit production authorization to take a verified PostgreSQL backup, deploy a descendant of the tested revision, confirm all 172 migrations, review the production dry-run digest, and apply the guarded repair. The write repaired 914 rows and skipped zero rows.
- [x] (2026-08-05 19:01Z) Verified the live API, rendered organization page, claim wizard entry, representative BracketIQ first-party organization, healthy application image, and zero-candidate post-repair audit.

## Surprises & Discoveries

- Observation: The UI is rendering the stored state correctly.
  Evidence: The public organization API returns `FIRST_PARTY`, `CLAIMED`, `NONE`, and `claimable: false` for CYO / Camp Howard Sports. The organization page displays the matching claimed label.

- Observation: The ownership migration gave every pre-existing organization a claimed first-party state.
  Evidence: `prisma/migrations/20260729183000_add_organization_ownership_claims/migration.sql` added `originType` with default `FIRST_PARTY` and `ownershipStatus` with default `CLAIMED`. Production applied this migration on 2026-07-31 at 17:57 UTC.

- Observation: CYO / Camp Howard Sports has no public ownership evidence.
  Evidence: The production row has a Razumly administrator placeholder owner, `claimedAt = null`, `claimedByUserId = null`, `claimVerificationLevel = NONE`, and `ownershipVerifiedAt = null`. It has zero `OrganizationClaims` rows and zero `OrganizationDomains` rows.

- Observation: The local backfill was not applied to production.
  Evidence: The existing classifier returns `AFFILIATE_IMPORTED / UNCLAIMED` for every affiliate profile. The live CYO row and 774 other affiliate-evidenced rows still had the migration defaults during the 2026-08-05 snapshot.

- Observation: This bug can recur after the historical repair.
  Evidence: 161 files under `scripts/` call `organizations.upsert` for affiliate source organizations. None writes `originType` or `ownershipStatus`. The source-file generator in `src/server/affiliateImports/agentTemplates/sourceFiles.ts` has the same omission.

- Observation: The shared candidate publisher already handles a new target organization correctly.
  Evidence: `upsertAffiliateOrganizationForCandidate` in `src/server/affiliateImports/service.ts` creates a target with `AFFILIATE_IMPORTED`, `UNCLAIMED`, and `NONE`. The missing coverage is source-specific organization creation and the historical production backfill.

- Observation: The current backfill command is no longer safe as a permanent repair tool.
  Evidence: `scripts/audit-affiliate-organization-claims.ts` classifies every organization with affiliate evidence as unclaimed. Its write path does not treat an existing claim record or claim audit history as a permanent preservation boundary. It was safe before claims existed, but it can overwrite a future real claim if an operator reruns it without stronger guards.

- Observation: Production ownership data can change between audit and repair.
  Evidence: Affiliate ingestion continued while the read-only production audit ran. A dry-run report and a later write must therefore use a stable digest and row-level state checks instead of trusting counts alone.

- Observation: A safe database origin default removes the need to edit 161 historical setup scripts.
  Evidence: The complete organization-creation inventory found only the normal API, the E2E seed, the shared affiliate publisher, source setup scripts, generated setup code, and the live sync utility. The API is already explicit. The seed is now explicit. Every remaining omitted creation path is an affiliate producer. A default of `AFFILIATE_IMPORTED / UNCLAIMED` therefore fails closed and keeps legacy setup reruns from changing accepted claims.

- Observation: Affiliate ingestion increased the production repair set after the initial baseline.
  Evidence: The reviewed production dry run found 1,452 affiliate-evidenced organizations. It classified 914 with the exact false-default signature, preserved 538 already-safe rows, and sent zero rows to manual review. The expected digest prevented the write from relying on the earlier counts.

## Decision Log

- Decision: Treat `Organizations.ownershipStatus` as the public ownership authority.
  Rationale: `ownerId` must remain non-null and can point to an internal administrator. An email domain, Stripe state, organization ID prefix, or administrator access does not prove ownership.
  Date/Author: 2026-08-05 / Codex

- Decision: Change both database defaults to `AFFILIATE_IMPORTED / UNCLAIMED`.
  Rationale: All current first-party creation paths can and do write `FIRST_PARTY / CLAIMED` explicitly. All identified omitted paths create affiliate profiles. Fail-closed defaults fix the 161 historical setup scripts without broad mechanical edits. The shared importer, generator, and sync insert path still write explicit affiliate ownership values for clarity.
  Date/Author: 2026-08-05 / Codex

- Decision: Add a database check for claimed affiliate organizations.
  Rationale: An `AFFILIATE_IMPORTED / CLAIMED` row must have both `claimedAt` and `claimedByUserId`. The claim acceptance transaction already writes both fields. The check blocks a future script from assigning a positive trust state without ownership evidence.
  Date/Author: 2026-08-05 / Codex

- Decision: Keep placeholder `ownerId` values during the repair.
  Rationale: `ownerId` remains required. Global Razumly administrators already have administrative access. Changing the placeholder is unnecessary and would broaden this repair into a permissions migration.
  Date/Author: 2026-08-05 / Codex

- Decision: Repair only the historical false-claim signature.
  Rationale: A row is repairable only when affiliate provenance exists, the current state is the untouched first-party/claimed default, the owner is an approved Razumly placeholder, all ownership evidence fields are empty, and no claim or claim event exists. Every other row must be preserved or sent to review.
  Date/Author: 2026-08-05 / Codex

- Decision: Bind a production write to an expected report digest.
  Rationale: Counts are not stable while ingestion runs. The write must stop if the classified ID set or preservation state changes after review.
  Date/Author: 2026-08-05 / Codex

- Decision: Make no event-card or organization-card presentation change in this repair.
  Rationale: The current product shows claiming only on the organization page. Correct ownership data makes the existing organization-page badge and claim button behave correctly.
  Date/Author: 2026-08-05 / Codex

- Decision: Treat production deployment and production data repair as separate authorization points.
  Rationale: This ExecPlan can define the operational work, but implementation must not deploy, migrate, back up, or write production data until the user explicitly authorizes those actions in the current turn.
  Date/Author: 2026-08-05 / Codex

## Outcomes & Retrospective

Planning, diagnosis, implementation, automated validation, deployment, and production remediation are complete. The implementation uses fail-closed database defaults, explicit primary producer state, a claimed-affiliate check constraint, and a guarded repair command. The final focused run passed 108 tests in 8 suites. The full CI suite and API route coverage passed. Prisma validation, client generation, TypeScript, and the production build passed.

The local migration and database contract checks passed. Omitted ownership fields produced `AFFILIATE_IMPORTED / UNCLAIMED / NONE`. PostgreSQL rejected a claimed affiliate without evidence and accepted the state after both claim fields were present. A disposable false-default fixture produced one repair candidate. The reviewed digest write repaired one row. The second audit produced zero repair candidates. The disposable source and organization were removed. The final full local audit preserved all 178 affiliate organizations with zero repair and zero manual-review rows. Local CYO remained `AFFILIATE_IMPORTED / UNCLAIMED`.

Production ran image `ghcr.io/camka14/mvp-site:d0470cdba400e91d771619d0709501b131a30afb`, which contains the tested ownership commits. The application was healthy, all 172 Prisma migrations were applied, and the homepage, readiness endpoint, organization API, and organization page returned HTTP 200. Before migration and repair, the operator stored a 68 MB custom-format PostgreSQL backup at `/opt/bracketiq/backups/ownership-remediation-20260805T182641Z.dump`. Its SHA-256 is `7eb379e1d66b8af0f5ccf0e3d65f3737a958173f737042332d77522332c566f4`.

The production dry run found 1,452 affiliate-evidenced organizations. It classified 914 as `REPAIR_FALSE_DEFAULT_CLAIM`, 538 as `PRESERVE` because their ownership state was already safe, and zero as `MANUAL_REVIEW`. No row was preserved because of claim or claim-event history in this run. The reviewed digest was `d9fc261b621cfe57b7d37dcaa20e600d4704083b4a5789309014746cfac0b3ce`. The digest-bound write repaired all 914 candidates and skipped zero state-changed rows. Its pre-change and final rollback snapshots each contain 914 rows. The post-repair audit classified zero rows for repair, preserved all 1,452 affiliate-evidenced rows, and sent zero rows to manual review.

The final production organization groups were 3 `FIRST_PARTY / CLAIMED` rows and 1,577 `AFFILIATE_IMPORTED / UNCLAIMED` rows. The representative BracketIQ first-party organization remained claimed. CYO / Camp Howard Sports returned `AFFILIATE_IMPORTED / UNCLAIMED / NONE` with no claim timestamps. Its rendered page showed “Unclaimed profile” and “Claim this profile.” The claim action opened `/organizations/affiliate_org_cyo_camp_howard_sports/claim`, and the anonymous sign-in action retained that path in its `next` query parameter.

## Context and Orientation

BracketIQ stores organizations in the `Organizations` model in `prisma/schema.prisma`. `ownerId` grants organization owner permissions, but the claim product uses `originType`, `ownershipStatus`, claim timestamps, verification level, `OrganizationClaims`, and `OrganizationClaimEvents` to describe public ownership.

An affiliate organization is an organization connected to imported content or source configuration. The existing audit finds this provenance through `AffiliateScrapeSources.organizationId`, `AffiliateImportCandidates.publishedOrganizationId`, affiliate `Events.organizationId`, affiliate `Teams.organizationId`, and affiliate `Facilities.organizationId`. The repair must retain the evidence reason for each organization in its report.

The ownership migration is `prisma/migrations/20260729183000_add_organization_ownership_claims/migration.sql`. It added safe fields but used compatibility defaults that classified all historical rows as first-party and claimed. The new migration must change only the future default and add a constraint. It must not perform the data backfill inside migration SQL because the repair needs claim-aware evidence, a reviewed report, and a reversible snapshot.

The claim classifier is `src/server/organizationClaims/classification.ts`. The claim state machine is `src/server/organizationClaims/service.ts`. Claim acceptance sets `ownerId`, `CLAIMED`, `claimedAt`, `claimedByUserId`, and the verification timestamps in one transaction. Those writes satisfy the planned database constraint.

The main affiliate publisher is `src/server/affiliateImports/service.ts`. Source-specific setup scripts under `scripts/` also create private or public source organizations. The generator that produces new setup scripts is `src/server/affiliateImports/agentTemplates/sourceFiles.ts`. The live synchronization utility is `scripts/sync-affiliate-organizations-to-live.ts`. All of these are organization producers and must share the same initial state.

The public API summary is assembled in `src/app/api/organizations/[id]/route.ts` with `getOrganizationOwnershipPresentation` from `src/lib/organizationOwnership.ts`. The organization page renders `OrganizationOwnershipBadges` and `OrganizationClaimButton` in `src/app/organizations/[id]/page.tsx`. These components need no behavior change when the data is correct.

A “false-claim signature” means all of the following are true at the same time:

- The organization has at least one durable affiliate provenance record.
- `originType` is `FIRST_PARTY`.
- `ownershipStatus` is `CLAIMED`.
- `claimedAt`, `claimedByUserId`, `ownershipVerifiedAt`, and `ownershipVerificationLastCheckedAt` are null.
- `claimVerificationLevel` is `NONE`.
- The owner is an approved Razumly administrator placeholder.
- No `OrganizationClaims` row exists for the organization.
- No ownership-acceptance, transfer, restoration, or administrator-resolution event exists in `OrganizationClaimEvents`.

An ID such as `affiliate_org_*` is useful audit evidence but is not sufficient by itself. The repair must use durable source, candidate, event, team, or facility provenance.

## Plan of Work

### Milestone 1: Lock the ownership invariant with tests

Add pure repair classification tests under `src/server/organizationClaims/__tests__/`. Reproduce the CYO state as an affiliate-evidenced row with a Razumly placeholder and no claim history. Expect `REPAIR_FALSE_DEFAULT_CLAIM`. Add preservation cases for `UNCLAIMED`, `CLAIM_PENDING`, `CLAIMED` with claim timestamps, `DISPUTED`, `SUSPENDED`, a non-Razumly owner, any `OrganizationClaims` row, and any ownership claim event. Expect `PRESERVE` or `MANUAL_REVIEW`, never a repair.

Add a migration contract test under `src/lib/__tests__/`. It must assert that the new SQL migration sets the ownership default to `UNCLAIMED` and adds the claimed-affiliate evidence constraint. Add a first-party creation route regression that proves `POST /api/organizations` still writes `FIRST_PARTY`, `CLAIMED`, `claimedAt`, and `claimedByUserId` explicitly.

Add a source-contract test at `src/server/affiliateImports/__tests__/affiliateOrganizationOwnershipContract.test.ts`. It must verify the shared initializer, generated setup code, explicit live-sync insert state, and live-sync ownership exclusions. The migration contract covers legacy setup scripts that omit the fields because those scripts now receive the fail-closed database defaults.

This milestone is accepted when the new tests fail against the current checkout for the exact reasons described above.

### Milestone 2: Make every new affiliate organization unclaimed

Create `src/server/affiliateImports/organizationOwnership.ts`. Export one immutable initializer for a new affiliate organization. It returns `originType: AFFILIATE_IMPORTED`, `ownershipStatus: UNCLAIMED`, `claimVerificationLevel: NONE`, and null ownership evidence fields. Do not include `ownerId`; each producer still supplies the required placeholder owner.

Use this initializer in `upsertAffiliateOrganizationForCandidate` in `src/server/affiliateImports/service.ts`. Use it in the generated setup code in `src/server/affiliateImports/agentTemplates/sourceFiles.ts`. Do not mechanically edit the 161 historical setup scripts. Their omitted fields now receive the fail-closed database defaults. Do not add ownership fields to ordinary `update` payloads because a later setup rerun must preserve `CLAIM_PENDING`, `CLAIMED`, `DISPUTED`, `SUSPENDED`, and all claim evidence.

Update `scripts/sync-affiliate-organizations-to-live.ts`. New live inserts must write `AFFILIATE_IMPORTED / UNCLAIMED / NONE` and null claim evidence. Conflict updates must exclude `ownerId`, `originType`, `ownershipStatus`, claim evidence, verified domain state, and all other claimant-controlled ownership fields. The sync must not copy a local unclaimed state over a live claim.

Update `prisma/seed.e2e.ts` so its first-party seed writes `FIRST_PARTY`, `CLAIMED`, `claimedAt`, `claimedByUserId`, and `NONE` explicitly. Keep `POST /api/organizations` unchanged except for tests because it already writes the complete first-party state.

This milestone is accepted when explicit primary producers pass the source-contract test and a legacy setup script that omits the fields receives `AFFILIATE_IMPORTED / UNCLAIMED` from the database.

### Milestone 3: Add database defense in depth

Change `Organizations.originType` and `Organizations.ownershipStatus` in `prisma/schema.prisma` to `@default(AFFILIATE_IMPORTED)` and `@default(UNCLAIMED)`. Create a new additive migration. The migration changes the database column defaults for future inserts. It does not update existing rows.

Add a named check constraint with this meaning: an organization with `originType = AFFILIATE_IMPORTED` and `ownershipStatus = CLAIMED` must have non-null `claimedAt` and `claimedByUserId`. Do not require a positive verification level because legacy or administrator-reviewed claims can validly use `NONE`. Confirm that claim acceptance, upheld disputes, and restored claimed states retain the existing claim timestamps.

Replay all migrations against a fresh temporary PostgreSQL database. Apply the new migration to the current local database only after the local false-claim rows are classified. Validate that no current legitimate affiliate claim violates the constraint.

This milestone is accepted when an omitted ownership status defaults to unclaimed, an explicit false `AFFILIATE_IMPORTED / CLAIMED` insert fails, a valid accepted affiliate claim succeeds, and a normal first-party create remains claimed.

### Milestone 4: Replace the one-time backfill with a guarded repair

Refactor `scripts/audit-affiliate-organization-claims.ts` around a pure classifier. Keep dry run as the default. Preserve `--org=<id>`. Replace the unsafe permanent-write behavior with explicit repair categories and a digest-bound write.

The report must include current state, desired state, affiliate evidence reasons, owner-placeholder classification, claim counts, claim-event counts, domain state, and one action: `REPAIR_FALSE_DEFAULT_CLAIM`, `PRESERVE`, or `MANUAL_REVIEW`. Redact full user emails. Do not include tokens, MFA data, password data, or private claim evidence.

Require `--write --expected-digest=<sha256>` for a write. The digest must cover the sorted repairable organization IDs and every field used by the preservation decision. If the current digest differs from the reviewed dry run, stop without writes and print the changed IDs.

Acquire a process-level PostgreSQL advisory lock for the repair. For each repairable organization, start a transaction, lock its organization row, reload claim and claim-event state, and apply a compare-and-set update only if the false-claim signature still matches. Set `originType = AFFILIATE_IMPORTED`, `ownershipStatus = UNCLAIMED`, and all ownership evidence fields to their empty values. Keep `ownerId`, public content, affiliate links, reviews, tags, events, teams, rentals, Stripe state, and tax state unchanged.

Write a dated pre-change JSON and CSV report plus a machine-readable rollback snapshot. After the write, run the classifier again and report repaired, skipped-because-state-changed, preserved, and manual-review counts. A second write with the new digest must change zero rows.

Do not rely on a possibly stale local `DATABASE_URL_LIVE`. The production run must execute in the deployed application container or another approved environment that uses the authoritative runtime database connection. The command must print a redacted database target fingerprint before any write.

This milestone is accepted when a simulated claim created between dry run and write causes a digest mismatch or a compare-and-set skip, and no real claim state is overwritten.

### Milestone 5: Validate the complete behavior locally

Use a temporary database or reversible fixture. Create a CYO-shaped affiliate source organization through its setup path. Confirm that the API returns affiliate, unclaimed, and claimable. Open the organization page at desktop and 390-pixel widths. Confirm that the header shows “Claim this profile” and does not show “Claimed profile.”

Create a normal first-party organization through the public API. Confirm that it is claimed and does not show the claim action. Complete one local affiliate claim through the existing claim service, then rerun the setup script, shared importer, sync dry run, and ownership repair dry run. Confirm that the accepted owner, claimed state, website, profile fields, and claim history remain unchanged.

Run focused Jest suites in one process. Then run Prisma validation, TypeScript, whitespace checks, and the production build. Preserve the current unrelated dirty files and stage nothing during validation.

This milestone is accepted when the false-claim fixture fails before the implementation and passes after it, all preservation cases pass, and the rendered organization page matches the API state without console errors.

### Milestone 6: Perform a reviewed production repair

This milestone requires a new explicit user instruction for production backup, migration, deployment, and database writes. Do not infer that authorization from this plan.

Take an authoritative PostgreSQL backup and record its path and verification result. Apply the tested migration. Deploy the exact tested application image. Verify the running image and readiness endpoint before any data write.

Run the production ownership audit without writes from the authoritative runtime environment. Review the sorted repair list, preservation list, manual-review list, evidence reasons, and digest. The 2026-08-05 baseline was 1,201 affiliate-evidenced organizations and 775 false-claim candidates with zero claim records. Do not require those counts to remain equal. Investigate every new preservation or manual-review case.

Run the write with the reviewed digest. If the digest changed, stop and review a new dry run. After a successful write, run the audit again. Expect zero remaining repairable default claims and zero second-run changes.

Verify CYO / Camp Howard Sports through the public API and organization page. Verify at least ten other repaired affiliate profiles across source organizations, club targets, event hosts, team hosts, and rental providers. Verify at least five first-party claimed organizations and every preserved claim or dispute. Confirm that event and organization listing cards still show no ownership badges and that only the organization page shows the claim action.

Do not submit a real claim during smoke testing unless the user separately authorizes a controlled production claim. Opening the claim wizard and verifying its initial method screen is read-only.

This milestone is accepted when production has no false claimed affiliate row in the reviewed set, CYO is claimable, real claims remain intact, and the repair rerun is idempotent.

## Concrete Steps

Work from `/Users/elesesy/StudioProjects/mvp-site`. Inspect the worktree before every edit:

    git status --short --branch
    git diff -- docs/affiliate-organization-ownership-state-remediation-execplan.md

Implement the focused tests first:

    npm test -- --runInBand \
      src/server/organizationClaims/__tests__/classification.test.ts \
      src/server/organizationClaims/__tests__/ownershipRepair.test.ts \
      src/server/affiliateImports/__tests__/affiliateOrganizationOwnershipContract.test.ts \
      src/server/affiliateImports/__tests__/service.test.ts \
      src/app/api/organizations/__tests__/organizationsRoute.test.ts \
      src/lib/__tests__/organizationOwnershipDefaultMigration.test.ts

Create and verify the migration:

    npx prisma format
    npx prisma validate
    npx prisma migrate dev --name default_organization_ownership_unclaimed
    npx prisma generate

Run the ownership audit without writes:

    npm run affiliate:org-claims:audit
    npm run affiliate:org-claims:audit -- --org=affiliate_org_cyo_camp_howard_sports

After reviewing the report in a disposable local database, test the digest-bound write:

    npm run affiliate:org-claims:audit -- --write --expected-digest=<reviewed-sha256>
    npm run affiliate:org-claims:audit

The second audit must report:

    repairableDefaultClaims: 0
    changedRows: 0
    skippedStateChanged: 0

Run repository checks:

    npx prisma validate
    npx tsc --noEmit
    git diff --check
    npm run build

Run the full Jest suite only after focused suites pass. Use one process because shared Next.js cache files can make concurrent Jest runs unreliable:

    npm run test:ci -- --runInBand

For browser validation, use the existing local development command only when the user has authorized starting that local process in the current turn:

    npm run dev

Verify the local CYO-shaped fixture at:

    http://localhost:3000/organizations/affiliate_org_cyo_camp_howard_sports
    http://localhost:3000/api/organizations/affiliate_org_cyo_camp_howard_sports

Record the expected API fields:

    {
      "originType": "AFFILIATE_IMPORTED",
      "ownershipStatus": "UNCLAIMED",
      "claimVerificationLevel": "NONE",
      "claimable": true,
      "ownershipAction": "CLAIM"
    }

Document exact production commands only when the implementation reaches Milestone 6 and current authorization exists. Use the OVH runtime database described in `AGENTS.md`. Do not use an older external `DATABASE_URL_LIVE` without proving that it points to the authoritative database.

## Validation and Acceptance

Creation safety is accepted when primary affiliate producers write `AFFILIATE_IMPORTED / UNCLAIMED / NONE`, legacy omitted paths receive the same fail-closed database defaults, and every first-party producer writes `FIRST_PARTY / CLAIMED` explicitly.

Database safety is accepted when a false claimed affiliate insert fails the new check, a real claim acceptance succeeds, and first-party creation remains explicitly claimed.

Repair safety is accepted when only rows with the full false-claim signature change. The repair must preserve any row with a claim, claim event, claim timestamp, verification timestamp, non-placeholder owner, pending state, dispute, suspension, or concurrent state change.

Public behavior is accepted when CYO and every repaired affiliate organization return `claimable: true`, show the claim action on the organization page, and do not show a claimed label or trust boost. Event cards and organization listing cards must remain free of ownership badges.

Claim preservation is accepted when an approved affiliate claim remains claimed after a source setup rerun, importer refresh, synchronization dry run, and ownership repair rerun.

Operational acceptance requires an authoritative backup, exact-image deployment verification, a reviewed production dry-run digest, an idempotent write, a zero-change post-audit, and live API plus browser evidence. No public response or log may expose owner email addresses, claim evidence, tokens, or administrator notes.

No mobile code change is expected. The mobile organization page consumes the same API ownership state. Android and iOS organization-detail smoke tests should confirm the corrected claim action after the server repair.

## Idempotence and Recovery

The source initializer is safe to repeat because it affects only organization creation. Existing organization updates do not write ownership fields.

The migration changes two defaults and adds a `NOT VALID` constraint. It does not repair rows. PostgreSQL enforces a `NOT VALID` check on new and updated rows but does not scan historical rows during deployment. New omitted ownership values become affiliate and unclaimed. First-party producers must remain explicit.

The repair is dry-run by default. A write requires `--write` and the exact reviewed digest. It uses row locks and compare-and-set conditions. A rerun after success must change zero rows.

The rollback snapshot stores only the original ownership fields for rows changed by that run. A rollback may restore a row only if it still has the repaired unclaimed state and no claim or claim event appeared after repair. If a claimant started a request, do not restore that row. Escalate it for administrator review. The database backup remains the last-resort recovery path.

Do not delete organizations, claims, events, teams, rentals, reviews, domains, sources, candidates, or audit history. Do not change `ownerId` during the historical repair. Do not stop or restart affiliate workers unless the user explicitly authorizes that process action in the current turn.

Preserve all unrelated working-tree changes. Use explicit staging paths if the user later requests a commit.

## Artifacts and Notes

The dated read-only production baseline from 2026-08-05 was:

    CYO originType: FIRST_PARTY
    CYO ownershipStatus: CLAIMED
    CYO claimVerificationLevel: NONE
    CYO claimable: false
    CYO claimedAt: null
    CYO claimedByUserId: null
    CYO ownershipVerifiedAt: null
    CYO OrganizationClaims: 0
    CYO OrganizationDomains: 0
    Affiliate-evidenced organizations: 1,201
    False-claim signature: 775
    Affiliate-evidenced organizations with any claim record: 0

Keep production dry-run reports and rollback snapshots outside commits unless the user asks for a sanitized artifact. Reports must identify evidence classes and organization IDs, but they must redact personal email addresses and all security data.

## Interfaces and Dependencies

Use Prisma and PostgreSQL for persistence. Reuse `evaluateRazumlyAdminAccess` from `src/server/razumlyAdmin.ts` for placeholder classification. Reuse the current affiliate provenance queries from `scripts/audit-affiliate-organization-claims.ts`. Do not add a new package.

In `src/server/affiliateImports/organizationOwnership.ts`, export:

    export type AffiliateOrganizationInitialOwnership = {
      originType: 'AFFILIATE_IMPORTED';
      ownershipStatus: 'UNCLAIMED';
      claimVerificationLevel: 'NONE';
      claimedAt: null;
      claimedByUserId: null;
      ownershipVerifiedAt: null;
      ownershipVerificationLastCheckedAt: null;
    };

    export function affiliateOrganizationInitialOwnership(): AffiliateOrganizationInitialOwnership;

Return a new object on each call so callers cannot mutate shared state.

In a new pure repair module such as `src/server/organizationClaims/ownershipRepair.ts`, export:

    export type OwnershipRepairAction =
      | 'REPAIR_FALSE_DEFAULT_CLAIM'
      | 'PRESERVE'
      | 'MANUAL_REVIEW';

    export function classifyOwnershipRepair(
      input: OwnershipRepairInput,
    ): OwnershipRepairDecision;

`OwnershipRepairDecision` must include the action and stable reason codes. The command report and tests must use these reason codes instead of parsing user-facing text.

The repair command must accept:

    --org=<organization-id>
    --write
    --expected-digest=<sha256>

Keep production-target selection separate from write authorization. A production target never implies permission to write.

Plan update note: Created this focused remediation plan on 2026-08-05 after confirming the live CYO false claim, auditing the production ownership signature, inspecting the original claim rollout, and inventorying every current affiliate organization producer. The plan separates code hardening from production repair and adds claim-history, digest, concurrency, rollback, and authorization boundaries that the original one-time backfill did not need.
