# Enforce one canonical row for every sport name

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Maintain this document in accordance with `PLANS.md` at the root of `/Users/elesesy/StudioProjects/mvp-site`.

## Purpose / Big Picture

After this change, BracketIQ will have exactly one `Sports` row for a display name, ignoring capitalization and surrounding whitespace. Discover will therefore show one filter per sport and React will never receive duplicate filter keys. Existing event, division, template, field, team, and organization references will continue to point at the retained canonical sport if an older database contains duplicate rows. The behavior is visible in focused API/default-sport tests and in a PostgreSQL migration fixture that starts with duplicate names, applies the migration, verifies every reference, and proves a second case-insensitive duplicate insert is rejected.

This closes DATA-031 without relying on the current database merely happening to be clean.

## Progress

- [x] (2026-07-14 04:00Z) Re-read `PLANS.md`, reviewed the current schema, default seeding, `/api/sports`, client cache, and Discover filter identity path.
- [x] (2026-07-14 04:05Z) Queried the configured local and live databases read-only: each currently has 15 sport rows and zero duplicate `lower(trim(name))` groups.
- [ ] Add a defensive canonical-name helper and use it in default seeding, the sports API, and the browser cache boundary.
- [ ] Add a data-preserving migration that rewires every known reference, removes duplicate rows, trims names, and creates a case-insensitive unique index plus a nonblank-name constraint.
- [ ] Add focused unit/API regressions and a real PostgreSQL duplicate-reference migration fixture.
- [ ] Run the focused Jest suites, TypeScript, Prisma validation/generation checks, and a clean migration replay.
- [ ] Render Discover locally and verify one filter per sport with no duplicate-key console error, then commit and reconcile DATA-031 in `docs/code-audit/README.md`.

## Surprises & Discoveries

- Observation: The duplicate filter seen during the audit is not present in either database configured on this machine today.
  Evidence: Read-only queries against local `localhost:5433/mvp` and the configured managed live URL each returned 15 total sports and no `GROUP BY lower(btrim(name)) HAVING count(*) > 1` rows.

- Observation: Sport references use two different representations.
  Evidence: `Events.sportId`, `Divisions.sportId`, `EventTemplates.sportId`, and `Fields.sportIds` carry IDs, while `Teams.sport`, `EventTeams.sport`, and `Organizations.sports` carry display names. A safe migration must preserve both forms.

- Observation: Prisma cannot directly express a unique index over `lower(trim(name))` in `schema.prisma`.
  Evidence: The current `Sports.name` field is an ordinary `String`; a manual PostgreSQL expression index is needed unless the model gains a second normalized column or the database adopts `citext`.

## Decision Log

- Decision: Keep the public `Sports` shape unchanged and enforce normalized identity with a manual PostgreSQL expression index.
  Rationale: Adding a required slug/normalized column would expand every generated client and write path even though sport creation is controlled and the user-facing contract already treats name as canonical. The expression index closes the database invariant directly.
  Date/Author: 2026-07-14 / Codex

- Decision: Make the migration data-preserving rather than failing when duplicates exist.
  Rationale: The original audit reproduced duplicate rows. Other deployed or developer databases may still contain them, so a uniqueness migration that only works on today's clean database would not remediate the unsafe state.
  Date/Author: 2026-07-14 / Codex

- Decision: Prefer a row whose ID already matches its normalized name, then the most populated row, then the earliest stable ID when selecting a canonical row.
  Rationale: Default sport IDs are their display names and usually carry the canonical scoring templates. Counting populated columns preserves a richer legacy row when no default-ID row exists, while stable tie-breakers make the migration deterministic.
  Date/Author: 2026-07-14 / Codex

- Decision: Keep a defensive application dedupe during rollout even after adding the database invariant.
  Rationale: Old application instances and databases may coexist temporarily. Returning and caching one row per normalized name prevents duplicate UI keys before every environment has applied the migration.
  Date/Author: 2026-07-14 / Codex

## Outcomes & Retrospective

Implementation is pending. At completion, record the migration name, exact canonical-selection and reference-rewrite behavior, focused test counts, PostgreSQL replay transcript, rendered Discover evidence, commit hash, and any limitation that remains.

## Context and Orientation

The repository is `/Users/elesesy/StudioProjects/mvp-site`. `prisma/schema.prisma` defines `model Sports`; its `name` field currently has no uniqueness constraint. `src/server/defaultSports.ts` exports `ensureDefaultSports`, which seeds the canonical built-in catalog and fills missing configuration but currently stores duplicate names in a `Map`, silently selecting one while returning every database row. `src/app/api/sports/route.ts` calls that helper and returns the rows. `src/lib/sportsService.ts` maps and caches the API payload in memory and local storage. `src/app/discover/page.tsx` reduces the rows to name strings and uses each name as the filter key/value, so duplicate names create indistinguishable controls and duplicate React keys.

In this plan, a “canonical name” means `lower(trim(name))`: capitalization and whitespace do not create a second identity. A “canonical row” is the one retained for a duplicate-name group. A “reference rewrite” changes an old duplicate ID or name to the retained row's ID or display name before deletion.

The checkout contains unrelated broadcast, scoring, admin, and organization-plan work. Stage only the files named by this plan. Do not deploy the migration to live as part of this implementation unless the user separately authorizes deployment.

## Plan of Work

First, add a small pure helper near `src/server/defaultSports.ts` or in a focused `src/server/sports` module. It must normalize a name with trim/lowercase, reject empty canonical names, group rows by that key, and select one deterministic row. Prefer the row whose normalized ID equals the normalized name; otherwise prefer the row with more non-null configuration; break ties by `createdAt` and ID. Use this helper when `ensureDefaultSports` reads and returns rows and immediately before `/api/sports` serializes its response. Add a lightweight client-side dedupe in `src/lib/sportsService.ts` so stale local-storage payloads cannot reintroduce duplicates during rollout. Preserve the chosen row's full object and stable ID.

Next, add `prisma/migrations/20260713230000_enforce_canonical_sport_names/migration.sql`. The migration must create temporary canonical-group and duplicate-ID mappings. It must update exact duplicate IDs in `Events.sportId`, `Divisions.sportId`, `EventTemplates.sportId`, and every element of `Fields.sportIds`. It must also canonicalize name-based values in `Teams.sport`, `EventTeams.sport`, and every element of `Organizations.sports`. Array rewrites must preserve original order while removing values that collapse to the same canonical ID or name. After references are safe, delete noncanonical `Sports` rows, trim retained display names, reject blank names, and add a unique index over `lower(name)`. Add a schema comment explaining that the expression index is migration-enforced and intentionally not representable in Prisma schema syntax.

Do not guess that the listed references are exhaustive. Before finalizing the migration, repeat the schema search for `sport`, `sportId`, `sportIds`, and `sports`; document why extracted affiliate `sportName` text is not a relational reference. If another relational reference exists, include it.

Add regression coverage to `src/server/__tests__/defaultSports.test.ts`, `src/app/api/sports/__tests__/route.test.ts`, and the existing sports-service test location or a new focused service test. Prove case/whitespace duplicates collapse deterministically, a canonical configured row wins, and a stale cached duplicate list becomes unique. Add a PostgreSQL fixture script or Jest integration test that creates a disposable schema/database state with duplicate sport rows and every reference shape, applies only the new migration SQL, and asserts the retained row, ID/name/array rewrites, order-preserving deduplication, blank-name constraint, and case-insensitive unique index. The fixture must not modify the configured live database.

Finally, run the focused tests and the repository's Prisma/build preflights. Replay the full migration chain into a disposable PostgreSQL database as the strongest proof that the migration composes with all prior migrations. Start the local app against the migrated local database, open Discover, expand sport filters, and verify each visible name occurs once and the browser console has no duplicate-key error. If current data contains no duplicates, the rendered test still proves normal behavior while the migration fixture proves the repaired legacy state.

## Concrete Steps

From `/Users/elesesy/StudioProjects/mvp-site`, inspect and test serially:

    rg -n '^\s+(sport|sportId|sportIds|sports|sportName)\s+' prisma/schema.prisma
    npm test -- --runInBand src/server/__tests__/defaultSports.test.ts src/app/api/sports/__tests__/route.test.ts <sports-service-test-path>
    npx tsc --noEmit
    npx prisma validate
    npx prisma generate

Run the migration fixture command selected by the implementation and expect one canonical row for each normalized name, all fixture references rewritten, and a duplicate insert rejected with a unique-index error. Then run the existing full migration-replay helper or create a disposable PostgreSQL database using the local server on port 5433, apply every migration in order, and drop only that disposable database afterward.

For rendered verification, start the app using the repository's existing local command and exact configured host. The flow under test is: `/discover` loads -> sport filters open -> every canonical sport appears once -> toggling one filter changes only that control and produces no duplicate-key console error.

## Validation and Acceptance

The implementation is accepted only when all of the following are proven. The database rejects `Indoor Volleyball`, ` indoor volleyball `, or another capitalization/whitespace variant when one canonical row exists. A migration fixture beginning with two such rows finishes with one row and no dangling references. ID arrays and name arrays retain their relative order and contain no duplicates introduced by the collapse. `ensureDefaultSports`, `/api/sports`, and `sportsService` each return/cache one row per canonical name even against a simulated pre-migration payload. Focused Jest, TypeScript, Prisma validation/generation, and the clean migration replay pass. The rendered Discover filter contains unique controls and no duplicate-key error.

Do not claim migration safety based only on today's zero-duplicate live query. Do not claim the UI fixed based only on a unique database index; stale cache/API payload regressions are part of acceptance.

## Idempotence and Recovery

All read-only audits and tests are safe to rerun. Prisma applies a migration once, so the migration SQL only needs to be correct within its transaction, but its data transformation should produce the same canonical result if exercised repeatedly in a disposable fixture. Use temporary tables scoped to the migration transaction. Never drop referenced sport rows before every reference rewrite completes. If the fixture exposes an unhandled reference, update the migration and recreate the disposable database rather than editing a partially applied production database.

If a live deployment later fails its preflight, stop before manual deletion, query duplicate groups and reference counts read-only, back up the database, and repair the migration in a new reviewed commit. Do not bypass the unique invariant or mutate live rows ad hoc.

## Artifacts and Notes

Current read-only preflight evidence:

    local localhost:5433/mvp: totalSports=15, duplicateGroups=0
    configured live database: totalSports=15, duplicateGroups=0

The audit's historical rendered failure remains relevant because no invariant currently prevents it from recurring.

## Interfaces and Dependencies

Use existing Prisma and PostgreSQL only; add no runtime package. The pure canonical helper should accept the existing sport row shape and return a list of the same shape. Name normalization must be shared between server dedupe call sites, while the browser cache may use a small dependency-free equivalent to avoid importing server code into the client bundle.

The database invariant must be named clearly, for example:

    CREATE UNIQUE INDEX "Sports_name_ci_key" ON "Sports" (lower(name));

and the migration must add a named nonblank check such as `Sports_name_nonblank_check`. Keep names stable so future diagnostics and rollback planning can identify the exact invariant.

Revision note (2026-07-14): Initial plan created after current-source review and read-only local/live duplicate preflights. It chooses a data-preserving reference rewrite, a manual case-insensitive PostgreSQL index, and temporary application-side dedupe for safe rollout.
