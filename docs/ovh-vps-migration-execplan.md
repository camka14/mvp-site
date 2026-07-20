# Move BracketIQ from DigitalOcean App Platform to one OVHcloud VPS

This ExecPlan is a living document. Keep `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` current while executing it. Maintain it in accordance with `PLANS.md` at the repository root.

## Purpose / Big Picture

Move the production `mvp-site` Next.js application, PostgreSQL database, and Redis workload onto one OVHcloud VPS while preserving the public `https://bracket-iq.com` contract, the custom WebSocket endpoints, mobile API compatibility, existing user sessions, and DigitalOcean Spaces-backed files. The goal is a lower fixed hosting bill and direct operational control, with explicit backups and rollback boundaries replacing App Platform and managed-database automation.

This is a staged migration, not a single switch. First, prove the containerized application on the VPS against the existing managed PostgreSQL database. Next, move public HTTP/WebSocket traffic while retaining that database, so rollback is still a DNS change. Only after 48 stable hours, a tested logical backup, and a tested restore should PostgreSQL move under a write freeze. Keep the old App Platform app and managed database intact and non-writable for seven days after the database cutover.

The single VPS is one failure domain. If it fails, app, Redis, and PostgreSQL fail together. DigitalOcean Spaces therefore remains external for user objects and encrypted Restic database backups. A provider snapshot is useful but does not replace logical PostgreSQL backups or restore drills.

## Target

Use the provisioned OVHcloud US VPS-2 in Hillsboro, Oregon, with 4 vCores, 8 GiB RAM, 75 GiB NVMe storage, and Ubuntu 26.04 LTS. Put only Caddy ports 80 and 443 on the public internet. The Next.js custom server, PostgreSQL 17, and Redis communicate on private Docker networks. PostgreSQL 5432 and Redis 6379 are never published.

Build immutable application images in GitHub Actions and publish full-commit-SHA tags to `ghcr.io/camka14/mvp-site`. Do not build releases on the production VPS and do not deploy a floating `latest` tag. Keep the root development `docker-compose.yml` unchanged; production lives under `deploy/vm`.

## Progress

- [x] (2026-07-15) Audited the current App Platform deployment, managed PostgreSQL 17 database, DNS, storage provider, runtime environment names, and cost baseline in the superseded Droplet plan.
- [x] (2026-07-15) Measured the live database at approximately 32 MB with 91 base tables and no extension beyond `plpgsql`, making a short `pg_dump`/`pg_restore` cutover appropriate.
- [x] (2026-07-20) Selected OVHcloud VPS-2 in Hillsboro and changed the target from a 2 GiB DigitalOcean Droplet to an 8 GiB provider-neutral Compose stack with Redis enabled.
- [x] (2026-07-20) Added the production Dockerfile, build-context exclusions, manual GHCR publish workflow, private Compose stack, Caddy configuration, secret-file examples, database roles, health routes, deploy rollback, encrypted backup/restore scripts, verification, systemd timers, and operator runbook.
- [x] (2026-07-20) Validated focused Jest, TypeScript through the production Next build, Docker image build/runtime, Compose rendering, shell syntax, Caddy parsing, PostgreSQL role initialization, Redis health, readiness failure behavior, and raw-MDX markdown rendering.
- [x] (2026-07-20) Provisioned the OVHcloud VPS with the dedicated operator key and verified both the Ubuntu operator and non-root `bracketiq` deployment logins.
- [x] (2026-07-20) Bootstrapped and rebooted the host, then passed consolidated verification of effective SSH policy, UFW, Fail2ban, unattended upgrades, Docker, PostgreSQL 17 client, Restic, swap, directory ownership, and public listeners.
- [x] (2026-07-20) Synced the secret-free `deploy/vm` bundle to `/opt/bracketiq/deploy/vm` and rendered its Compose configuration successfully as the `bracketiq` user without starting services.
- [x] (2026-07-20) Triaged the production npm advisories and applied compatible security updates without `npm audit fix --force`; the production audit now has zero high or critical findings.
- [x] (2026-07-20 16:31 PDT) Initialized a client-side encrypted Restic repository in the existing DigitalOcean Spaces bucket, saved a recovery copy at `~/.ssh/bracketiq-restic.env`, installed hourly backup and daily verification timers, and passed isolated restore drills.
- [x] (2026-07-20 15:40 PDT) Deployed image `dce877e5047c4d783d73c08c7d6929cca28d0bcb` to the protected `preview.bracket-iq.com` hostname while continuing to use managed PostgreSQL.
- [ ] Replace preview-only integration credentials before public cutover (remaining: live Stripe secret key, live Stripe webhook secret, live Stripe Connect client identifier, and Apple sign-in private key; the live Stripe publishable key is recoverable from the App Platform spec).
- [ ] Complete the preview acceptance suite, including login, Discover, event/org pages, Spaces files, payment callbacks, `/api/app-version`, and both WebSocket paths.
- [ ] Move apex and `www` traffic to the VPS and observe for at least 48 hours while managed PostgreSQL remains authoritative.
- [x] (2026-07-20 16:28 PDT) Rehearsed PostgreSQL 17 dump and restore from managed PostgreSQL into the unused local database, compared exact counts for all 95 public tables, verified 162 applied Prisma migrations, uploaded an encrypted backup, and restored it into a second isolated database with matching counts.
- [ ] Complete the write-frozen database cutover (completed: explicit approval, final managed snapshot, exact 95-table comparison, local URL switch, migration validation, healthy local-backed app, fresh encrypted local backup, and second restore drill; remaining: repeat the final copy after live credentials are installed, then change DNS and admit public writes). The 2026-07-20 attempt was cleanly rolled back before DNS because the final secret-mode check found test Stripe keys and a missing Apple private key.
- [ ] Observe for seven days and pass a second restore drill.
- [ ] Obtain explicit approval before deleting only the old `mvp-site` App Platform service and its managed database.

## Surprises & Discoveries

- Observation: the production image is not self-contained if it copies only `.next` and `public`.
  Evidence: `src/server/llmsPage.ts` reads `src/content/blog/<slug>.mdx` from `process.cwd()` at request time, so the Dockerfile also copies `src/content`.

- Observation: the custom server already handles graceful shutdown and WebSocket upgrades.
  Evidence: `server.mjs` owns upgrade paths for match realtime and broadcast overlays and closes WebSocket servers, its Redis subscriber, the HTTP server, and Next on SIGINT/SIGTERM.

- Observation: Redis is already an application abstraction rather than a new product dependency.
  Evidence: `src/lib/redis.ts` reads `REDIS_URL`, uses a key prefix, retries failed connections, and supports orderly close. The custom server also publishes realtime updates through Redis when configured.

- Observation: the application had no separate liveness and readiness contracts.
  Evidence: no health route existed before this milestone. `/api/health/live` now avoids dependencies, while `/api/health/ready` performs a minimal PostgreSQL query and hides connection details on failure.

- Observation: the first container build compiled successfully but exhausted Node 20's default heap during Next.js type checking.
  Evidence: the build worker reached approximately 2,040 MB and exited with `Ineffective mark-compacts near heap limit`. Current Firecrawl dependencies also declare Node 22 or newer. The production image now uses Node 22 LTS, a 4 GiB build heap, and a 2.5 GiB runtime heap inside the 3 GiB app limit.

- Observation: the local secure environment is not a complete substitute for the live App Platform inventory.
  Evidence: local files cover most integrations but do not contain all production-only names; the Apple private key is the known value that must be recovered securely before sign-in testing.

- Observation: the production dependency tree has pre-existing security advisories unrelated to the VM files.
  Evidence: `npm run security:audit` reports 19 production findings, including a critical `websocket-driver` advisory through `firebase-admin`, high Nodemailer findings, and high markdown/form-data findings. The automated force fix proposes breaking Prisma, Next, and Firebase changes, so it requires a separate scoped dependency patch and regression tests before the preview is public.

- Observation: the high and critical production advisories can be removed without a forced dependency rewrite.
  Evidence: compatible lockfile updates plus Nodemailer 9.0.1 or newer reduce the production audit from 19 findings (one critical and three high) to 13 moderate findings. Focused email, template, and Firebase push tests and TypeScript pass. The remaining findings are in Firebase Admin's unused Firestore/Storage dependency paths, Next's bundled PostCSS, and Prisma tooling; npm proposes unrelated major downgrades for several of them.

- Observation: the provisioned image is Ubuntu 26.04 LTS rather than the originally planned Ubuntu 24.04 LTS.
  Evidence: Docker's official Ubuntu repository and PostgreSQL's PGDG repository both publish `resolute` packages. The host now runs kernel `7.0.0-28-generic`, Docker Engine `29.6.2`, Compose `5.3.1`, PostgreSQL client `17.10`, and Restic `0.18.1`.

- Observation: an SSH hardening drop-in that sorts after OVH cloud-init does not override `PasswordAuthentication`.
  Evidence: `sshd -T` still reported `passwordauthentication yes` with the initial `99-bracketiq-hardening.conf`. OpenSSH uses the first global value it reads, so the bootstrap now installs `00-bracketiq-hardening.conf`; consolidated verification then reported password, keyboard-interactive, and root login disabled.

- Observation: the initial `sshd -t` failed because `/run/sshd` did not exist yet, and burst verification triggered UFW's SSH rate limiter.
  Evidence: the bootstrap now creates `/run/sshd` before validation. Administrative checks are serialized so the stricter UFW `LIMIT` rule can remain in place alongside key-only authentication and Fail2ban.

- Observation: the live database is still very small but has grown beyond the initial audit.
  Evidence: the frozen 2026-07-20 source measured 40,621,747 bytes. Its PostgreSQL 17 custom-format dump was 2,278,258 bytes, covered 95 public tables and 162 applied Prisma migrations, took 27 seconds to produce, two seconds to upload encrypted, and four seconds to restore and validate locally.

- Observation: the backup status writer and verifier disagreed about timestamp syntax.
  Evidence: `backup-postgres.sh` wrote `20260720T232819Z`, which GNU `date -d` rejected. The writer now records RFC 3339 while `verify-host.sh` remains backward compatible with existing compact timestamps; the systemd verification service subsequently passed.

- Observation: App Platform does not reveal production secret values through its application spec.
  Evidence: production Stripe and Apple values are returned as encrypted `EV[...]` references that can be resubmitted to App Platform but cannot populate the VPS. The VPS final check found Stripe test keys, QuickBooks sandbox mode, and no Apple private key, so the cutover was stopped before DNS and App Platform was returned to HTTP 200 with no data divergence.

## Decision Log

- Decision: Use OVHcloud VPS-2 instead of the originally planned DigitalOcean Droplet.
  Rationale: 8 GiB RAM and 4 vCores provide enough headroom for the custom Next.js process, PostgreSQL, Redis, Caddy, backups, and system overhead while remaining below the current App Platform plus managed-database cost baseline.
  Date/Author: 2026-07-20 / Codex

- Decision: Keep DigitalOcean Spaces during the first migration.
  Rationale: existing database rows already reference Spaces objects, file transfer is unrelated to the compute/database savings, and external object storage avoids making the VPS disk the only copy of user uploads.
  Date/Author: 2026-07-20 / Codex

- Decision: Run Redis on the same VPS and require authentication even though it is private.
  Rationale: the user wants server, database, and Redis on one VM; the application already uses Redis for cross-process rate limiting and realtime fanout. The service is not published, has a bounded 512 MiB cache, and uses AOF for orderly restarts.
  Date/Author: 2026-07-20 / Codex

- Decision: Use separate PostgreSQL owner and runtime roles.
  Rationale: the long-running app does not need schema ownership. Migrations load the owner URL only in a one-off Compose profile, while the app uses DML and sequence privileges.
  Date/Author: 2026-07-20 / Codex

- Decision: Use Caddy file-based maintenance for the final data freeze.
  Rationale: touching `deploy/vm/maintenance/enabled` produces a reversible 503 without rebuilding the app. Health endpoints remain reachable so operators can distinguish maintenance from failure.
  Date/Author: 2026-07-20 / Codex

- Decision: Publish images manually before wiring host SSH into GitHub Actions.
  Rationale: repository artifacts can be validated and GHCR can be configured before a paid host exists. Direct deployment remains an operator action until the VPS host key, deployment user, GitHub environment protections, and SSH secrets exist.
  Date/Author: 2026-07-20 / Codex

- Decision: Require encrypted off-host dumps and actual restore drills.
  Rationale: provider snapshots share a provider failure domain and do not prove PostgreSQL recovery. Restic encrypts the streamed custom-format dump and the restore script refuses non-empty or live targets by default.
  Date/Author: 2026-07-20 / Codex

- Decision: Keep the installed Ubuntu 26.04 LTS image.
  Rationale: the operating system, Docker Engine, Compose plugin, and PostgreSQL 17 client all have current official repository support on the provisioned architecture. Reinstalling to 24.04 would add risk without changing the deployment contract.
  Date/Author: 2026-07-20 / Codex

- Decision: Keep SSH rate-limited and serialize deployment connections.
  Rationale: key-only authentication, disabled root login, UFW rate limiting, and Fail2ban provide layered protection. Parallel SSH sessions are unnecessary for this single-host deployment and can trip the intentional burst limit.
  Date/Author: 2026-07-20 / Codex

- Decision: Block the preview on high or critical npm advisories, but document rather than force-fix the remaining moderate transitive findings.
  Rationale: the severe findings have compatible patched releases. The remaining automated recommendations would downgrade Next or Firebase Admin across major versions even though the affected Firestore and Storage APIs are not used by this application, creating more deployment risk than the scoped patch.
  Date/Author: 2026-07-20 / Codex

- Decision: Keep the `bracketiq` deployment account non-root and use the `ubuntu` operator account for system administration.
  Rationale: unrestricted passwordless sudo for the long-running deployment identity would unnecessarily expand compromise impact. Backups and systemd services already run through the separate administrative account and root-owned secret files.
  Date/Author: 2026-07-20 / Codex

- Decision: Abort the first write-frozen cutover before DNS when the live-secret gate failed.
  Rationale: serving test Stripe keys or a missing Apple sign-in key would break production contracts. Because DNS had not changed and no public writes reached local PostgreSQL, disabling App Platform maintenance restored the still-authoritative managed path without reverse data migration.
  Date/Author: 2026-07-20 / Codex

## Outcomes & Retrospective

Repository and host milestone outcome as of 2026-07-20: the Node 22 production image builds successfully, is approximately 490 MB, runs as UID 1001 rather than root, includes Prisma CLI and raw blog MDX, and renders the guide markdown route inside the container. Liveness returns 200 without dependencies; readiness returns a non-disclosing 503 when PostgreSQL is absent. The production Compose stack renders cleanly, pinned Caddy configuration validates, PostgreSQL 17 and Redis become healthy, and the runtime database role authenticates with no superuser, database-creator, role-creator, or schema-create privilege. The paid VPS is bootstrapped with key-only SSH, root login disabled, UFW, Fail2ban, unattended upgrades, bounded Docker logs, 2 GiB swap, and root-restricted operational directories. The protected preview is healthy. Encrypted off-server backups, hourly and daily systemd timers, exact managed-to-local table comparison, and two independent restore drills now pass. A final frozen copy also passed and the VPS app became healthy against local PostgreSQL, but the cutover was deliberately stopped before DNS because production-only Stripe and Apple credentials were not available on the VPS. App Platform and managed PostgreSQL remain authoritative and production returned to HTTP 200 without data divergence; the local database is a validated but non-authoritative snapshot that must be refreshed at the next cutover.

Update after provisioning with actual VPS commitment and tax, selected backup/snapshot price, host hardening evidence, and preview hostname. Update after database cutover with dump duration, restore duration, maintenance duration, exact table-count result, and first successful production write. Update after the first full billing month with observed savings rather than a starting-price estimate.

## Context and Orientation

`package.json` runs production with `node server.mjs`. `server.mjs` hosts Next.js and custom WebSocket upgrade handlers at `/api/realtime/matches` and `/api/realtime/broadcast-overlays`. Caddy's `reverse_proxy` preserves WebSocket upgrades automatically. `src/lib/prisma.ts` uses the PostgreSQL adapter and `PG_POOL_MAX` defaults conservatively. Start with `PG_POOL_MAX=3` and increase only from measured saturation. `src/lib/storageProvider.ts` selects Spaces through `STORAGE_PROVIDER=spaces` and the five `DO_SPACES_*` variables.

The production deployment files are under `deploy/vm`. Populated `deployment.env`, `app.env`, `migration.env`, `postgres.env`, `redis.env`, and Restic credentials are ignored and must never enter Git, image layers, workflow output, or chat. Preserve `AUTH_SECRET` across the entire transition. Preserve provider webhook secrets because the public hostname does not change.

The source managed database remains authoritative until the final write freeze. During the application-only phase, the VPS app should use the managed TLS URL even though the local PostgreSQL container is running. During the database phase, replace only the VPS `DATABASE_URL` with the private Docker hostname, remove managed TLS overrides, and keep the old environments non-writable.

## Plan of Work

### Milestone 1: prove the repository artifacts

Run the focused health tests and type checker. Run a production Next.js build without live secrets. Build the Linux image locally and start it against disposable PostgreSQL and Redis data. Confirm `/api/health/live` returns 200 without PostgreSQL and `/api/health/ready` returns 200 only with PostgreSQL. Confirm the LLM markdown endpoint can read a blog MDX file from inside the image. Validate the Compose file only with synthetic placeholder env files and `config --quiet`; never render secrets. Run `bash -n` on Bash scripts, `sh -n` on the PostgreSQL initializer, and Caddy validation through the pinned image.

### Milestone 2: provision and harden the OVH VPS

The owner creates the paid VPS and provides the dedicated deployment public key through the OVH control panel. Record the public IP and OVH rescue/console path. Create non-root operator and deployment users, disable password authentication and direct root SSH only after a second login succeeds, enable unattended security updates, configure Docker log retention, add emergency swap, and create a firewall allowing only trusted SSH plus public HTTP/HTTPS. Do not expose application, database, Redis, or Docker daemon ports.

Create `/opt/bracketiq`, root-only `/etc/bracketiq`, and `/var/lib/bracketiq`. Populate environment files from a fresh live inventory without printing their values. Verify every external callback URL and recover the Apple private key through a protected channel. Configure CPU, memory, disk, uptime, certificate-expiry, container-restart, and stale-backup alerts before cutover.

### Milestone 3: preview the application with managed PostgreSQL

Publish a commit-SHA image with the protected manual GitHub workflow. Deploy it to a temporary hostname on the VPS. The app uses managed PostgreSQL and existing Spaces; Redis uses the local private service. Run the acceptance suite from web and mobile, including authenticated flows, Discover filters encoded in paths, event and organization detail pages and their markdown versions, outbound affiliate redirects, `/api/app-version`, email, signed webhooks, object reads, and both WebSocket paths. Measure peak memory, swap, CPU, and managed-database connections.

### Milestone 4: app traffic cutover

Snapshot the DNS zone and reduce only apex and `www` TTLs in advance. Re-run readiness, TLS, WebSocket, Spaces, webhook, backup, and image-tag checks. With explicit owner approval, point only apex and `www` to the VPS. Confirm the apex canonical URL, `www` redirect, one viewport/canonical tag, no `X-Powered-By`, security headers, mobile APIs, and external callbacks. Observe for 48 hours. During this window, rollback is DNS-only because both app paths use managed PostgreSQL.

### Milestone 5: rehearse PostgreSQL and restore

Take a PostgreSQL 17 custom-format dump from managed PostgreSQL, restore it into an empty local database, reapply the runtime role, deploy migrations as the owner, and compare the schema, every base-table count captured from the dump, `_prisma_migrations`, and critical recent `AppReleases` data. Run the application against that disposable database. Stream a logical backup to Restic, restore it into a second empty database, and repeat counts. Do not schedule final cutover until both restores work.

### Milestone 6: final database cutover

Obtain explicit approval for a short maintenance window. Put the old App Platform app in maintenance first. Enable the Caddy maintenance file and stop the VPS app so no connection retains writes. Capture final source counts and migrations, take the final dump, store it in Restic, recreate the local target, restore, apply grants, deploy migrations, and require exact table-count equality. Switch the VPS app to the private PostgreSQL URL, start it, wait for readiness, remove maintenance, and complete the public acceptance suite. Record actual downtime and the first verified write.

After this point, rollback is no longer only DNS. To return to managed hosting, freeze writes again, dump local PostgreSQL, restore and validate it in a clean managed target, update the old app URL, and only then reverse DNS.

### Milestone 7: observation and decommission

For seven days, review uptime, latency, application/Caddy/PostgreSQL logs, Redis memory, container restarts, disk growth, CPU, swap, connection counts, webhooks, email, files, WebSockets, and backup age. Perform another restore drill on day seven. If any restore fails, backup is stale, secrets are missing, or resource thresholds are exceeded, do not delete managed services.

With explicit owner approval, take and verify one final managed backup, export a sanitized App Platform and DNS snapshot, then delete only the old `mvp-site` App Platform app and its managed database. Keep Spaces. Rotate credentials that were unique to App Platform. Measure the first full month's actual OVH, snapshot, Spaces, and backup costs.

## Acceptance and Recovery Criteria

The transition is complete only when the public web and mobile contracts pass, both WebSocket paths work, application files still load from Spaces, local PostgreSQL and Redis have no public ports, the latest hourly database backup is under 90 minutes old, two independent restore drills have succeeded, exact final table counts matched, monitoring is active, seven stable days elapsed, and the owner approved decommissioning.

Application rollback uses the prior immutable image unless a migration broke backward compatibility, in which case roll forward. Host recovery uses a new Ubuntu VPS, the repository deployment files, protected secrets, Spaces user objects, and the latest tested Restic dump. The target recovery point is at most one hour of database writes and the target recovery time is two hours after a replacement host is available.

Revision note (2026-07-20): created this OVH-first plan from the prior DigitalOcean infrastructure audit, added Redis to match the selected all-in-one VM architecture, recorded the first repository implementation milestone, and updated it with the verified OVH host bootstrap and artifact sync.

Revision note (2026-07-20 16:50 PDT): recorded the protected preview, encrypted Restic setup, backup timestamp compatibility fix, exact rehearsal and final-copy evidence, successful restore drills, and the clean rollback caused by missing production-only Stripe and Apple credentials.
