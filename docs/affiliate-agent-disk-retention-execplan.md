# Bound affiliate agent disk use

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must remain current while work proceeds. Maintain this document in accordance with `PLANS.md` at the repository root.

## Purpose / Big Picture

Affiliate mapping agents must inspect one organization logo without copying the full live logo catalog into every work directory. Agent logs and Codex session records must also stay within explicit retention limits. After this change, an operator can run a logo-fit preview for one organization, remove only verified generated preview copies, and keep the agent host from filling its disk during normal queue processing.

## Progress

- [x] (2026-08-04 20:08Z) Measured the live OVH host and identified repeated full-catalog logo previews as the main disk consumer.
- [x] (2026-08-04 20:24Z) Added a required organization selector, explicit `--all` mode, generated-preview marker, and focused tests.
- [x] (2026-08-04 20:28Z) Added a safe exact-path preview cleanup command and updated mapper and reviewer instructions.
- [x] (2026-08-04 20:31Z) Added bounded retention for Codex session files and affiliate agent terminal logs before each new goal.
- [x] (2026-08-04 20:39Z) Verified that live file rows and object-storage objects remain authoritative before removing generated preview copies.
- [x] (2026-08-04 20:46Z) Removed validated old generated previews, pruned closed Codex sessions, and compacted the stale terminal log on the live VM.
- [x] (2026-08-04 20:52Z) Added Codex `--ephemeral` mode so future goals do not persist session transcripts.
- [x] (2026-08-04 20:55Z) Passed 19 focused Jest tests, TypeScript, ESLint, `git diff --check`, and live post-cleanup checks.
- [ ] Commit, push, deploy, and restart the named agent containers after the user gives explicit publish and process-control authority.

## Surprises & Discoveries

- Observation: The raw ScrapingDog and intake evidence is not the main disk consumer.
  Evidence: The three mapper workspaces contain about 1.4 GB of raw intake captures, while repeated logo preview assets consume about 28.66 GB.

- Observation: A target-specific logo preview still copies every affiliate organization logo.
  Evidence: `scripts/preview-affiliate-org-logo-fit.ts` queries all organization IDs with the `affiliate_org_` prefix and writes source and candidate PNG files for each row. The command accepts an output path but no organization selector.

- Observation: One mapper container also retains repeated preview directories under `/tmp`.
  Evidence: The first mapper container has an 8.22 GB writable layer, with about 7.5 GB in `/tmp/affiliate-logo-fit-*` directories.

- Observation: Docker database data and raw container JSON logs are small compared with generated previews.
  Evidence: The production database volume is about 520 MB. Docker reported zero-byte JSON log files for the agent containers.

- Observation: The agents continued to create full-catalog previews during implementation.
  Evidence: The workspace preview count increased from 66 to 68 directories. Each target-named report contains hundreds of unrelated organization logos.

- Observation: Every current affiliate organization logo object remains in authoritative object storage.
  Evidence: The live database has 958 affiliate organizations with a logo assignment, backed by 956 unique `File` rows because two objects are shared. Read-only `HeadObject` checks found all 956 objects, with zero missing objects and zero provider failures. The primary mapper checkout also has 943 tracked image fixtures under `src/server/affiliateImports/fixtures`.

- Observation: Codex supports an ephemeral execution mode that is stronger than session-file rotation alone.
  Evidence: Codex CLI 0.146.0 documents `codex exec --ephemeral` as running without persisted session files. Mapping, approval, and coverage arguments now enable it. Queue state and committed packages remain the recovery mechanism.

- Observation: Cleanup restored normal disk headroom without touching raw intakes.
  Evidence: Root disk use fell from 99 percent with about 1.3 GB free to 47 percent with about 39 GB free. The three raw intake directories remain at approximately 894 MB, 343 MB, and 178 MB.

## Decision Log

- Decision: Require `--organization-id` for normal logo-fit runs and require an explicit `--all` flag for a full catalog report.
  Rationale: A safe default prevents an agent from copying the full live logo catalog for a single mapping job. The explicit broad mode preserves the existing operator audit when it is genuinely required.
  Date/Author: 2026-08-04 / Codex

- Decision: Keep generated previews disposable and remove them only through a command that validates the directory shape.
  Rationale: The preview PNG files are rendered inspection copies. A cleanup command must refuse unrelated paths and must support a dry run before removal.
  Date/Author: 2026-08-04 / Codex

- Decision: Do not change mapper or reviewer counts in this plan.
  Rationale: The user changed the active request from scaling to disk control. Process-count changes need a separate current instruction.
  Date/Author: 2026-08-04 / Codex

- Decision: Run Codex goals with `--ephemeral` and keep the bounded session cleanup as a migration and fallback control.
  Rationale: Ephemeral mode prevents new transcript growth. Retention removes old transcripts from pre-change runs and protects installations that later disable ephemeral mode.
  Date/Author: 2026-08-04 / Codex

- Decision: Preserve recent legacy previews during live cleanup.
  Rationale: Four preview directories were less than one hour old and could still be part of an active agent inspection. Old validated duplicates were removed. The new exact-path cleanup command will remove future previews after inspection.
  Date/Author: 2026-08-04 / Codex

## Outcomes & Retrospective

The code implementation and safe live cleanup are complete. The live host now has about 39 GB free. Old generated logo previews, closed session transcripts above the retention limit, and the old terminal-log body cannot be recovered from the VM, but each removed preview can be regenerated from the verified live logo object. Raw intake captures, tracked fixtures, live `File` rows, object-storage objects, databases, running containers, and agent counts were not changed. Four recent legacy previews remain to avoid disrupting active work. The new code is local and tested. It still needs an authorized commit, push, deployment, and named agent restart before every future agent run enforces it.

## Context and Orientation

`scripts/preview-affiliate-org-logo-fit.ts` downloads organization logo objects from configured storage, renders comparison assets, and writes `index.html`, `report.json`, and an `assets` directory. A logo preview is a generated inspection copy. It is not the organization logo stored by the application. The application stores the selected logo as a `File` row and an object-storage object. Source setup packages can also include a checked-in fixture that recreates that stored logo.

The mapping instructions live in `.agents/skills/ingest-affiliate-intakes/SKILL.md`, `src/server/affiliateImports/codexCliGoal.ts`, and `docs/affiliate-source-rollout-agent-goal.md`. The independent review instructions live in `.agents/skills/review-affiliate-approvals/SKILL.md` and `src/server/affiliateImports/codexApprovalGoal.ts`.

Codex writes session records under its configured home directory. A session record is a local transcript used for agent continuity. It is not mapping evidence. The agent launch scripts under `scripts/run-affiliate-*-codex-goal.ts` start Codex processes. Retention must preserve recent records and any active record while removing old records before they grow without limit.

## Plan of Work

First, separate logo-fit command-line parsing from the rendering script. Require one exact organization ID by default. Permit the old full-catalog behavior only when the caller supplies `--all`. Make the database query use the exact ID for a scoped run. Write a small metadata marker into every new preview directory so later cleanup can recognize it.

Second, add a cleanup command that accepts exact preview paths. The command must use dry-run mode by default. It must verify the marker, `index.html`, `report.json`, and `assets` directory before it removes anything. It must refuse the repository root, home directories, `/tmp`, and unrecognized folders. Update the mapper instructions to create one scoped preview, inspect it, and apply exact-path cleanup after the result is recorded. Update the reviewer instructions only where a rendered logo-fit check applies.

Third, add a shared retention helper for Codex session files. Keep recent files and apply a bounded total-size policy only to files old enough that they cannot be active. Add a bounded log helper for the known affiliate agent terminal log. Run the helpers before a new Codex goal starts. Expose limits through environment variables with conservative defaults.

Fourth, verify the live generated previews before cleanup. Confirm that the directories are ignored output, that their reports refer to live `File` rows, and that removal targets contain only the generated preview shape. Remove only those confirmed directories and old agent log/session artifacts. Do not remove raw intake captures, checked-in fixtures, database volumes, current Codex sessions, or application file objects.

## Concrete Steps

Run all repository commands from `/Users/elesesy/StudioProjects/mvp-site`.

Add the scoped command parser, cleanup helper, retention helper, tests, and instruction updates with `apply_patch`. Then run:

    npm test -- --runInBand <focused test files>
    npx tsc --noEmit
    git diff --check

Use the logo command without a selector and expect a clear failure. Use it with `--organization-id=<id>` in a configured environment and expect `report.json` to contain one row. Use `--all` only for an intentional full catalog audit.

For live cleanup, first run the cleanup command without `--apply`. Review every printed path and byte count. Then run the same exact command with `--apply`. Compare `df -h /` and workspace sizes before and after.

## Validation and Acceptance

The logo-fit parser test must prove that `--live` or a normal local run without `--organization-id` fails unless `--all` is present. It must prove that `--organization-id` and `--all` cannot be combined. The database selection test must prove that a scoped run uses an exact organization ID.

The cleanup test must prove that dry-run mode removes nothing, apply mode removes a recognized preview directory, and the command refuses an unrelated directory. The retention test must prove that recent and active files remain while expired files beyond the configured size limit are selected for removal.

The live acceptance check must show that generated logo preview disk use drops substantially, raw intake disk use is unchanged, the production application remains healthy, and the existing mapper and reviewer counts remain unchanged.

## Idempotence and Recovery

Logo preview generation removes and recreates only its exact output directory. Use a unique output path per organization. Cleanup is idempotent because a missing target is reported and skipped on a later dry run. The retention helper only removes files that meet both the age and limit rules.

Before live deletion, preserve a list of exact targets and their report hashes. If a preview is needed again, regenerate it from the live `File` row with the scoped logo-fit command. Do not attempt to recover generated preview PNG files from backup because they are reproducible.

## Artifacts and Notes

Initial live measurements:

    root filesystem: 72 GB total, 71 GB used, about 1.3 GB free
    repeated workspace logo preview assets: about 28.66 GB
    mapper 1 repeated /tmp previews: about 7.5 GB
    Codex session directories: about 2.2 GB total
    raw intake captures: about 1.4 GB total

## Interfaces and Dependencies

Add a pure TypeScript command parser that returns an organization ID or an explicit all-organizations mode. The rendering script must use this value in its Prisma `organizations.findMany` query.

Add a cleanup command exposed as `npm run affiliate:logo-fit:cleanup`. Its interface is:

    npm run affiliate:logo-fit:cleanup -- --path=<exact-preview-directory>
    npm run affiliate:logo-fit:cleanup -- --path=<exact-preview-directory> --apply

The first form is a dry run. The second form removes only a validated generated preview directory.

Add a retention helper that receives a root path, an age threshold, and a byte limit. It returns the files it kept and removed so launchers can print a compact result. Use only Node.js standard file-system APIs. Do not add a new package.

Run every Codex mapping, approval, and coverage command with `--ephemeral`. The queue lease, result artifact, source-scoped commit, and database-backed queue provide recovery without a local Codex transcript.

Revision note (2026-08-04): Created this plan after the live disk audit. It records the confirmed full-catalog logo-preview bug, the safe cleanup boundary, and the decision to keep current agent counts unchanged.

Revision note (2026-08-04): Updated the plan after implementation and live cleanup. It records the object-storage verification, safe deletion results, ephemeral Codex mode, passing checks, preserved recent previews, and the remaining publish and restart authority boundary.
