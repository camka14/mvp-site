# Move BracketIQ from DigitalOcean App Platform and Managed Postgres to one Droplet

> Superseded on 2026-07-20 by `docs/ovh-vps-migration-execplan.md` after the target provider changed to OVHcloud. This document is retained as the original infrastructure audit and cost baseline; do not execute its Droplet-specific provisioning steps.

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Maintain this document in accordance with `PLANS.md` at the repository root. This plan is scoped to the production `mvp-site` application and its `mvp-db` PostgreSQL database. The other DigitalOcean applications, databases, and the existing `scraping-agent` Droplet are deliberately out of scope.

## Purpose / Big Picture

BracketIQ currently pays separately for two App Platform application instances and a managed PostgreSQL node. After this plan is complete, the same public web and mobile API surface at `https://bracket-iq.com` will run from one low-cost DigitalOcean Droplet, and PostgreSQL will run on that Droplet without being exposed to the public internet. DigitalOcean Spaces remains the file store so user uploads do not depend on the Droplet disk.

The cost reduction is meaningful but comes from accepting a different operating model. DigitalOcean currently handles application replicas, database patching, automatic database recovery, and managed database backups. On the Droplet, BracketIQ becomes responsible for Linux security updates, container updates, PostgreSQL backups, restore tests, monitoring, and recovery. One Droplet is also one failure domain: if it fails, both the app and database are unavailable until the Droplet or its backups are restored.

Use a phased cutover. First run the app on the Droplet while it still uses managed PostgreSQL. This makes the application move easy to reverse by changing DNS. Only after that phase is stable should the database move. Keep the old App Platform app and managed database intact but in maintenance mode until the new database has passed a restore drill and seven days of production observation.

## Recommendation at a Glance

Start with a new, dedicated Basic Droplet named `mvp-site-prod` in `nyc3`, using 1 shared vCPU, 2 GiB RAM, and 50 GiB SSD at the currently published price of $12 per month. Build the application image in GitHub Actions rather than on the Droplet. Add 2 GiB of swap as an emergency cushion, but treat sustained swap use as a signal to resize rather than normal operation. If production memory stays above 75%, swap is used continuously, or CPU saturation harms latency, resize to the 2 vCPU / 4 GiB Basic plan at the currently published price of $24 per month.

Use Docker Compose to run three services on a private Compose network: Caddy for HTTPS and reverse proxying, the custom Next.js server from `server.mjs`, and PostgreSQL 17. Do not publish PostgreSQL port 5432 or the Node port to the public interface. Only Caddy exposes ports 80 and 443. Caddy proxies ordinary HTTP and the WebSocket upgrades used by match realtime and broadcast overlays.

Keep `STORAGE_PROVIDER=spaces`. The existing $5 Spaces subscription is shared by the account and is not eliminated by this migration. Use a separate prefix or bucket path in Spaces for encrypted PostgreSQL backups. Use the account's currently unused free DigitalOcean Uptime check for the public readiness endpoint.

At the inspected June 2026 rates, the current `mvp-site` App Platform service is $24 per month and its managed database is $13 per month, for $37 before tax. The 2 GiB Droplet reduces that pair to $12 plus backups, saving up to $25 per month before backup cost and tax. With percentage-priced weekly Droplet backups at 20%, the pair would cost $14.40 and save $22.60 per month, or $271.20 per year. Usage-based Droplet backups may cost less, but record the actual selected plan and first full-month charge before treating that estimate as final. Spaces is unchanged and therefore excluded from both sides of this comparison.

## Progress

- [x] (2026-07-15 16:00Z) Inspected the repository deployment entry points, Prisma configuration, file storage provider, WebSocket server, production environment-variable names, and planning rules.
- [x] (2026-07-15 16:00Z) Inspected the live DigitalOcean application, database, DNS, Droplets, Spaces-related billing, Uptime checks, and June invoice without changing resources.
- [x] (2026-07-15 16:00Z) Measured the live `mvp-db` database: PostgreSQL 17.10, 32 MB, 91 base tables, 476 indexes, no extension beyond `plpgsql`, and one connection at the inspection instant.
- [x] (2026-07-15 16:00Z) Chose a phased app-first and database-second migration with a seven-day hold before deleting the managed services.
- [ ] Implement the repository deployment, maintenance, health-check, backup, validation, and CI artifacts described in Milestone 1.
- [ ] Provision and harden `mvp-site-prod` as described in Milestone 2.
- [ ] Prove the app on the Droplet against managed PostgreSQL as described in Milestone 3.
- [ ] Move public application traffic to the Droplet and observe it for at least 48 hours as described in Milestone 4.
- [ ] Prove local PostgreSQL migration and backup restoration as described in Milestone 5.
- [ ] Perform the final write-frozen database cutover as described in Milestone 6.
- [ ] Complete the seven-day observation period and rollback readiness checks in Milestone 7.
- [ ] Delete the old App Platform app and managed database only after every decommission gate in Milestone 8 passes.

## Surprises & Discoveries

- Observation: The live database is much smaller than the provisioned managed database disk, so transfer time is not the main risk.
  Evidence: `pg_database_size(current_database())` reported 33,543,859 bytes, shown by PostgreSQL as 32 MB.

- Observation: The live app has two 1 GiB replicas and the custom server keeps WebSocket clients in process memory. Redis is currently represented in configuration but can be disabled.
  Evidence: the App Platform spec reports two `apps-s-1vcpu-1gb` instances, while `server.mjs` holds WebSocket client maps and honors `REDIS_DISABLED=true`.

- Observation: The existing `scraping-agent` Droplet is not a safe consolidation target.
  Evidence: it is a 1 GiB / 1 vCPU Droplet in `sfo2`, belongs to the WebIngest project, has no backups, and already has its own workload. Reusing it would mix failure domains while leaving too little memory for Next.js and PostgreSQL.

- Observation: The current public edge is supplied by App Platform and Cloudflare-backed addresses even though the DNS zone is hosted in DigitalOcean.
  Evidence: the apex has two App Platform edge A records, `www` points at the App Platform hostname, and live response headers show `server: cloudflare`. A direct Droplet loses that managed edge layer.

- Observation: The first DigitalOcean Uptime check is unused and receives a monthly free allowance.
  Evidence: the account currently has zero Uptime checks; current DigitalOcean pricing credits one check per month.

## Decision Log

- Decision: Scope this plan only to `mvp-site` and its `mvp-db` database.
  Rationale: The other two App Platform applications, the second managed PostgreSQL cluster, and the scraping Droplet serve separate projects. Moving them would increase risk and obscure the actual BracketIQ savings.
  Date/Author: 2026-07-15 / Codex

- Decision: Start with a dedicated 2 GiB Basic Droplet rather than 4 GiB.
  Rationale: The database is only 32 MB, the application already fits inside 1 GiB App Platform containers, and CI will perform builds off-server. This is the cost-first choice the migration is meant to test. Explicit resize thresholds prevent cost savings from becoming an availability gamble.
  Date/Author: 2026-07-15 / Codex

- Decision: Keep the new Droplet in `nyc3` and on the same New York VPC used by the managed database during the app-only phase.
  Rationale: This avoids introducing a cross-country app-to-database latency change while the app move is being validated. A later region move can be evaluated separately using real user geography and latency data.
  Date/Author: 2026-07-15 / Codex

- Decision: Keep DigitalOcean Spaces for application files and PostgreSQL logical backups.
  Rationale: Spaces is already paid for at the account level, application rows already reference Spaces-backed objects, and moving files onto the Droplet would make a single disk failure affect both database and uploads.
  Date/Author: 2026-07-15 / Codex

- Decision: Use PostgreSQL 17 in Docker Compose and `pg_dump`/`pg_restore` for migration.
  Rationale: Source and target remain on the same major version; the source has no special extension beyond `plpgsql`; and a 32 MB database can be copied and validated in a short maintenance window without adding logical-replication machinery.
  Date/Author: 2026-07-15 / Codex

- Decision: Move the app before moving the database.
  Rationale: The app-only phase is reversible with DNS while both old and new app instances use the same database. It separates reverse-proxy, TLS, WebSocket, secret, and image problems from data-migration problems.
  Date/Author: 2026-07-15 / Codex

- Decision: Build immutable images in GitHub Actions and pull them from GitHub Container Registry.
  Rationale: Building Next.js and Prisma on a 2 GiB production server can create memory pressure. Immutable commit-tagged images also make application rollback faster and more reproducible.
  Date/Author: 2026-07-15 / Codex

- Decision: Use one application container and keep `REDIS_DISABLED=true` initially.
  Rationale: A single process can deliver its own in-memory WebSocket fanout and avoids paying for a separate Redis service. Reintroduce Redis only if the application is later scaled to multiple processes or Droplets.
  Date/Author: 2026-07-15 / Codex

- Decision: Require hourly encrypted logical backups in addition to Droplet backups.
  Rationale: A system image alone does not provide a sufficiently explicit PostgreSQL recovery point for registrations and payment-related records. Hourly dumps give a target recovery-point objective of no more than one hour while the database remains small.
  Date/Author: 2026-07-15 / Codex

## Outcomes & Retrospective

Planning outcome as of 2026-07-15: the live scope, costs, database size, target architecture, cutover order, rollback boundaries, and decommission gates are documented. No DigitalOcean resource, DNS record, application setting, database row, or secret was changed while producing the plan.

Implementation outcome: pending. Update this section after each major milestone with actual downtime, full-month cost, peak memory, backup size, restore time, and any deviation from the recommendation.

## Context and Orientation

The repository is a Next.js 16 application with a custom Node entry point. `package.json` maps `npm start` to `node server.mjs`. `server.mjs` starts Next.js and mounts WebSocket upgrade handlers at `/api/realtime/matches` and `/api/realtime/broadcast-overlays`. Any reverse proxy must preserve WebSocket upgrades and long-lived connections.

`prisma.config.ts` reads `DATABASE_URL`, and `src/lib/prismaConfig.ts` creates the runtime PostgreSQL pool. The pool defaults to three connections because the current managed plan allows only 25 connections across two app replicas and deployment overlap. Keep `PG_POOL_MAX=3` at the beginning of the Droplet phase; increase it only from evidence. `prisma/schema.prisma` is the canonical schema, and `npm run migrate:deploy` runs `prisma migrate deploy`.

`src/lib/storageProvider.ts` selects DigitalOcean Spaces in production. Continue to provide `STORAGE_PROVIDER=spaces` and the five `DO_SPACES_*` settings. Do not copy stored user objects to local disk as part of this migration.

`src/proxy.ts` already owns canonical-host redirects and security headers. Extend it with a production maintenance mode rather than inventing a second application middleware. The health liveness endpoint must remain available while maintenance mode is on so operators can distinguish intentional maintenance from a failed process.

The inspected live application is `mvp-site`, ID `d847dcfb-b24a-40c0-ba92-bcd6d91fbad7`, in DigitalOcean's New York App Platform region. It deploys `camka14/mvp-site` branch `main` automatically, runs `npm start`, listens on port 8080, and uses two 1 GiB application instances. The inspected managed PostgreSQL cluster is ID `40d936b3-6f84-4a3e-a3ac-62783eb70a7e`, with database name `mvp-db`, PostgreSQL 17, one 1 GiB node, and 10 GiB storage in `nyc1`.

Never put connection strings, passwords, private keys, OAuth secrets, or webhook secrets in this file, Git, container-image layers, workflow output, or command history. Before implementation, export the current App Platform configuration into a secure password manager or an access-controlled local file outside the repository. Preserve `AUTH_SECRET` through cutover so existing sessions remain valid. Preserve all provider webhook secrets because the public hostname is not changing. Create new local PostgreSQL passwords and a new least-privilege Spaces key for the Droplet, then revoke obsolete credentials after decommissioning App Platform.

The production App Platform environment currently contains these groups of settings, which must be accounted for without recording their values in Git:

- Database and runtime: `DATABASE_URL`, `PG_SSL_REJECT_UNAUTHORIZED`, `PG_SSL_CA_CERT_BASE64`, `SCHEDULER_DEBUG`, `REDIS_URL`, and `REDIS_DISABLED`.
- Auth and mobile identity: `AUTH_SECRET`, Google OAuth client settings, Google mobile client IDs, Apple team/key/bundle settings, and the Apple private key.
- Payments and accounting: Stripe secret, publishable, webhook, and Connect settings; Intuit client settings.
- Documents and notifications: BoldSign API and webhook settings, Firebase project/client/private-key settings, SMTP settings, and Gmail OAuth settings.
- Storage and integrations: `STORAGE_PROVIDER`, all `DO_SPACES_*` settings, `OPENAI_API_KEY`, `SCRAPINGDOG_API_KEY`, and PostHog settings.
- Public URLs and client build settings: `PUBLIC_WEB_BASE_URL`, the Google Maps client settings, and mobile App Store/Play Store URLs.

Use the exact live environment inventory at implementation time because settings can change after this plan is written.

## Target Architecture and Operating Boundaries

Public requests resolve `bracket-iq.com` and `www.bracket-iq.com` to a reserved IPv4 address assigned to `mvp-site-prod`. Caddy listens on ports 80 and 443, obtains and renews TLS certificates, redirects `www` to the apex host, and forwards apex traffic to the `app` container. The application container listens only on the private Compose network. PostgreSQL listens only on the private Compose network. The app connects using a runtime database role; migrations use a separate owner role passed only to the one-off migration command.

The Docker host stores PostgreSQL data and Caddy certificate state in named volumes. Spaces stores user objects and encrypted logical database backups. DigitalOcean Droplet backups provide a second, system-level recovery path. Neither the named PostgreSQL volume nor port 5432 may be exposed to the internet.

The target service-level objectives for this cost-reduction phase are:

- Recovery point objective: at most one hour of database writes lost, provided the latest logical backup is healthy.
- Recovery time objective: restore service within two hours from a new Droplet and the latest tested logical backup.
- Planned database-cutover maintenance: less than 15 minutes for the current 32 MB database.
- Normal deploy interruption: less than 60 seconds while using one application container.
- Resize trigger: memory at or above 75% for 15 minutes, repeated out-of-memory restarts, sustained swap input/output, disk at or above 70%, or CPU at or above 80% for 15 minutes with elevated request latency.

## Plan of Work

### Milestone 1: Add reproducible Droplet deployment and operations artifacts

At the end of this milestone, a clean checkout can build a Linux application image, validate health routes and maintenance behavior, and describe the complete production Compose stack without containing production secrets.

Add a multi-stage `Dockerfile` at the repository root. Use the repository's supported Node 20 line, run `npm ci`, run `npm run build`, and make the final image start `node server.mjs`. The final image must include `.next`, `public`, `server.mjs`, `package.json`, the generated Prisma client, `prisma/schema.prisma`, `prisma/migrations`, and the Prisma CLI needed by the one-off migration command. Run the app as a non-root user. Add a Docker health check that calls the internal liveness endpoint.

Add `.dockerignore` so `.git`, `.next`, test artifacts, local environment files, database dumps, coverage, Playwright output, and unrelated local files do not enter the build context. Explicitly ignore `.env`, `.env.*`, and dump/archive extensions, then allow only a tracked `ops/droplet/env.production.example` with empty values.

Add `compose.production.yml` with `caddy`, `app`, and `postgres` services. Pin image major versions and record exact image digests during implementation. Configure restarts, log rotation, health checks, service dependencies, graceful stop periods, memory-aware Node settings, and named volumes. The app should receive `DATABASE_URL` for the runtime role from an untracked root-owned env file. PostgreSQL should use `POSTGRES_INITDB_ARGS=--data-checksums`, conservative settings suitable for 2 GiB total host RAM, and no published port. Caddy should be the only service publishing host ports.

Add `ops/droplet/Caddyfile`. Serve both hostnames, redirect `www.bracket-iq.com` to `https://bracket-iq.com`, proxy the apex to `app`, preserve forwarded protocol and host headers, and support WebSocket upgrades. Include a maintenance-file switch that can return HTTP 503 with `Retry-After` without changing images or application secrets. Do not duplicate the application security headers unless a browser check proves they are missing through the proxy.

Add `src/app/api/health/live/route.ts` for process liveness. It returns HTTP 200 and a small JSON object without touching PostgreSQL or third-party services. Add `src/app/api/health/ready/route.ts` for readiness. It runs a minimal database query through the normal Prisma path and returns HTTP 200 when the database is usable or HTTP 503 without leaking error details when it is not. Add Jest coverage for both states.

Extend `src/proxy.ts` and `src/proxy.test.ts` with `MAINTENANCE_MODE=true`. In production maintenance mode, allow liveness and readiness checks, but return HTTP 503 with `Retry-After` and `Cache-Control: no-store` for ordinary pages and APIs. This mode is needed on the old App Platform app after DNS cutover. Decide explicitly whether webhook paths return 503 so providers retry; the default in this plan is yes, because accepting a webhook while writes are frozen would violate database consistency.

Add the following scripts under `ops/droplet/bin/`:

- `deploy.sh` pulls a commit-tagged image, runs the Prisma migration command with the migration-owner URL, starts the new app, waits for readiness, and returns to the previously recorded image tag if readiness fails.
- `backup-postgres.sh` produces a custom-format PostgreSQL dump without owner or ACL metadata and streams it into an encrypted Restic repository in Spaces. It records success in a local status file and applies retention of 48 hourly, 14 daily, 8 weekly, and 12 monthly snapshots.
- `restore-postgres.sh` restores a selected snapshot only into an explicitly named empty database and refuses to target the live database unless a second destructive confirmation variable is present.
- `verify-database-migration.sh` compares source and target base-table lists, exact row counts for all tables during a write freeze, applied Prisma migration names, and critical recent records. It prints only counts and identifiers, never connection strings.
- `verify-host.sh` checks Compose health, disk space, memory, swap activity, Caddy certificate state, backup age, and the public endpoints used in acceptance.

Add systemd unit templates under `ops/droplet/systemd/` for the hourly logical backup and a daily host-verification run. Use randomized timer delay so jobs do not always coincide with top-of-hour traffic. The backup unit must fail if the dump, Restic upload, retention operation, or verification metadata write fails.

Add `.github/workflows/deploy-droplet.yml`. Initially expose only `workflow_dispatch` and require the GitHub `production` environment. Build and test an image, publish it to `ghcr.io/camka14/mvp-site` tagged with the full commit SHA, connect by SSH to the non-root deployment user, and invoke `deploy.sh` with that immutable tag. Store only deployment transport secrets in GitHub. Keep application secrets on the Droplet. After seven stable days, a separate decision may enable deployment on pushes to `main`.

Run the repository's relevant Jest tests, `npx tsc --noEmit`, `npm run build`, `docker build`, and `docker compose -f compose.production.yml config --quiet`. Do not use `docker compose config` without `--quiet` in CI because resolved environment values can appear in logs.

### Milestone 2: Provision and harden the Droplet

At the end of this milestone, the server is reachable only through intended ports, has monitoring and backups enabled, and can run the Compose stack without public DNS changes.

Create `mvp-site-prod` in `nyc3`, attach it to the same New York VPC used by the managed database, enable IPv6, enable DigitalOcean monitoring, add the `mvp-site-production` tag, and assign a reserved IPv4 address. Use Ubuntu 24.04 LTS and SSH-key authentication. Create a sudo-capable non-root operator and a non-root deployment user. Disable password SSH and direct root SSH after verifying both the new user and DigitalOcean console recovery.

Create a DigitalOcean Cloud Firewall attached by tag. Allow TCP 80 and 443 from all IPv4 and IPv6 addresses. Allow TCP 22 only from the operator's current trusted address or a deliberately configured private access path. Allow required outbound TCP, UDP, and ICMP traffic. Do not allow 3000, 5432, Docker daemon ports, or database ports. Mirror the policy in UFW without creating conflicts between the two firewalls.

Install Docker Engine from Docker's supported Ubuntu repository, the Compose plugin, PostgreSQL 17 client tools, Restic, and the DigitalOcean metrics agent. Configure unattended security updates. Configure a 2 GiB swap file with low swappiness as an emergency buffer. Configure journald and Docker log retention so logs cannot consume the 50 GiB disk.

Create `/opt/bracketiq` owned by the deployment user, `/etc/bracketiq/env.production` owned by root with mode 0600, and a root-only Restic credential file. Copy environment values from the live App Platform inventory without printing them. Replace managed `DATABASE_URL` only when each migration phase says to do so. Use a new Spaces access key limited to the needed bucket when possible. Keep `AUTH_SECRET` and webhook verification secrets unchanged.

Install the backup and verification systemd units but leave the database backup timer disabled until a successful target restore exists. Enable a usage-based daily Droplet backup if available and cost-effective; otherwise enable weekly percentage-based backups. Record the chosen retention and expected monthly price in the Decision Log.

Create free DigitalOcean resource alerts for memory above 75% for 15 minutes, CPU above 80% for 15 minutes, disk above 70%, and load appropriate to one vCPU. Do not wait until after cutover to add alerts.

### Milestone 3: Prove the Droplet app while it still uses managed PostgreSQL

At the end of this milestone, the exact production image runs behind Caddy on a non-public test hostname, connects to the existing managed database through the private VPC path, reads existing Spaces files, and passes web and WebSocket smoke tests.

Add the Droplet or its tag as a trusted source for the managed database. Prefer the managed database's private connection string inside the VPC. Put that URL in the Droplet runtime environment, preserve managed TLS verification, and keep `PG_POOL_MAX=3`.

Create a temporary DNS name such as `droplet-preview.bracket-iq.com` pointing to the reserved IP. Configure Caddy for the preview hostname without changing apex or `www`. Deploy a commit-tagged image manually through the protected GitHub workflow. Confirm that the app and Caddy containers are healthy and that PostgreSQL remains private.

Exercise the public landing page, login, Discover, one organization page, one event page, file preview/download, `/api/app-version`, Stripe webhook signature handling with a non-mutating test, Google sign-in redirect construction, and both WebSocket paths. The preview must not emit mixed-content errors, canonicalize production URLs incorrectly, or overwrite OAuth callback origins. If providers require the canonical hostname, test callback URL generation without completing a live account mutation.

Run a short concurrency smoke test against read-only pages and watch process memory, PostgreSQL pool use, CPU, and event-loop responsiveness. The 2 GiB server must retain at least 20% free or reclaimable memory without sustained swap writes. If it cannot, resize to 4 GiB before public traffic and update the cost decision.

### Milestone 4: Move application traffic while retaining managed PostgreSQL

At the end of this milestone, `bracket-iq.com` is served by the Droplet, while both the new and old application paths still use the same managed database. DNS rollback remains sufficient.

At least one day before cutover, reduce only the apex and `www` record TTLs to 60 seconds. Preserve all MX, TXT, DKIM, Google verification, and unrelated subdomain records. Take a machine-readable DNS snapshot before editing records.

Immediately before cutover, verify the Droplet image tag, readiness endpoint, Caddy certificate preparation, WebSockets, managed database connectivity, Spaces reads, and a fresh application/database backup. Change the apex A record from the App Platform edge addresses to the assigned reserved IPv4 address. Change `www` to a CNAME of the apex or an A record to the same reserved IP. Remove stale apex AAAA records unless IPv6 has been configured and tested on the Droplet. Do not replace the whole zone.

From multiple resolvers, confirm that the apex returns the reserved IP, `www` redirects to the apex, HTTPS is valid, `/` returns 200, `/api/app-version` returns the current contract, response security headers remain present, and both WebSocket endpoints upgrade correctly. Confirm that no `X-Powered-By` header is introduced.

Observe for at least 48 hours while the Droplet still uses managed PostgreSQL. Compare HTTP error rate, p95 response time, memory, swap, CPU, disk, PostgreSQL connection count, email delivery, webhook processing, file access, and WebSocket behavior. DNS rollback is safe during this phase because both app environments use the same source of truth.

After 48 stable hours, set `MAINTENANCE_MODE=true` on the old App Platform service and let its redeployment complete. Verify the old App Platform hostname returns 503 for ordinary traffic while health remains distinguishable. This prevents stale DNS clients from writing to the managed database during the later database cutover.

### Milestone 5: Prove local PostgreSQL, backup, and restore before cutover

At the end of this milestone, PostgreSQL 17 on the Droplet contains a recent production copy, the app can run against it on an operator-only hostname, hourly encrypted backup succeeds, and a backup has been restored into a second disposable database.

Initialize PostgreSQL with a migration-owner role and a separate runtime role. The migration owner owns the database and `public` schema. Restore the source dump with `--no-owner --no-acl` while connected as that owner. Grant the runtime role only connect, schema usage, table DML, and sequence usage. Configure default privileges so future migration-created tables and sequences are automatically usable by the runtime role. The application container receives only the runtime URL; `deploy.sh` receives the owner URL only while running `prisma migrate deploy`.

Install PostgreSQL 17 client tools so the dump client is not older than the PostgreSQL 17.10 source. Temporarily allow the Droplet as a managed database trusted source if the private VPC rule is not sufficient. Create a custom-format dump, inspect its table of contents, restore it to a disposable target database, and run the database verification script. Because production remains writable during this rehearsal, compare schema and a captured set of row counts from the same dump rather than expecting current source counts to remain identical.

Run the app against the restored database using an operator-only preview hostname. Complete the same critical smoke tests as Milestone 3, including a reversible test record created and removed only in the disposable target. Run `npm run migrate:deploy` against the target and expect Prisma to report no pending migration after restoration.

Enable the hourly Restic backup timer. Restore the latest encrypted backup into a second empty database and compare every base-table row count with the backed-up target. Record dump duration, encrypted backup size, restore duration, and the Restic snapshot ID in this document without recording credentials.

Do not schedule final cutover until the restore drill succeeds. A successful backup command without a successful restore is not sufficient evidence.

### Milestone 6: Perform the final database cutover under a write freeze

At the end of this milestone, production traffic reaches the Droplet app, the app uses local PostgreSQL, and exact table counts match the final managed database snapshot.

Announce a 15-minute maintenance window. Confirm the old App Platform instance is already in maintenance mode. Switch the Droplet's Caddy maintenance file on and stop the app container so no request can retain a live database pool. Verify ordinary apex requests return 503 with `Retry-After`.

Capture exact source table counts and the applied `_prisma_migrations` list. Run a final PostgreSQL 17 custom-format dump from managed `mvp-db` with no owner or ACL metadata. Fail the cutover on any dump warning or nonzero exit. Archive the dump into the encrypted Restic repository before changing the target.

Recreate the empty target database, restore the final dump as the migration owner, apply target role grants and default privileges, and run `npm run migrate:deploy` using the migration-owner URL. Run `verify-database-migration.sh` while writes remain frozen. Require identical base-table names, exact row counts for all 91 current tables, identical completed Prisma migrations, and expected current `AppReleases` records.

Change only the Droplet's runtime `DATABASE_URL` to the private Compose PostgreSQL hostname and runtime role. Remove managed PostgreSQL TLS overrides from the local URL. Keep `PG_POOL_MAX=3` at first. Start the app, wait for readiness, turn off the Caddy maintenance file, and exercise the public acceptance suite.

Record start time, stop time, dump duration, restore duration, validation result, first successful production write, and actual maintenance duration. Keep the source managed database and old App Platform app intact and non-writable.

### Milestone 7: Observe production and retain a tested rollback path

At the end of this milestone, the new stack has seven days of evidence, the latest backup is restorable, and operators know how to recover either the application or database.

For seven days, review uptime, application logs, Caddy logs, container restarts, PostgreSQL logs, hourly backup age, disk growth, memory, swap, CPU, database connections, email, webhooks, file access, and WebSocket behavior daily. Use the free DigitalOcean Uptime check for `https://bracket-iq.com/api/health/ready` with downtime and TLS-expiry alerts.

Test application rollback by deploying the previous commit-tagged image while keeping the current local database. The previous image must remain schema-compatible with migrations already applied. If it is not, roll forward with a fixed image rather than reversing a database migration.

The database rollback boundary changes after Milestone 6. Never point the old App Platform app at its frozen managed database after new writes have reached local PostgreSQL. To roll back the hosting stack, first enable maintenance, stop the Droplet app, dump local PostgreSQL, restore that dump into a clean managed database target, validate exact counts, update App Platform to the refreshed managed database, disable its maintenance mode, then return DNS to App Platform. This is a data migration, not a DNS-only rollback.

Perform another restore drill from the latest hourly backup on day seven. If any backup is stale, any restore fails, or resource thresholds are exceeded, do not decommission managed services.

### Milestone 8: Decommission managed resources and lock in the savings

At the end of this milestone, the App Platform app and managed database no longer accrue BracketIQ charges, obsolete credentials are revoked, and the new monthly cost is measured.

Before deleting anything, take one final managed database dump, encrypt it into the backup repository, and verify it can be listed and read. Export the final sanitized App Platform spec and DNS snapshot for recovery notes. Confirm the current local database has all writes since cutover and the latest local backup restores successfully.

Delete only the `mvp-site` App Platform application after confirming no other project references its component URL. Delete only managed database cluster `40d936b3-6f84-4a3e-a3ac-62783eb70a7e` after confirming no other application uses it. DigitalOcean warns that deleting a managed cluster also deletes its managed backups, which is why the independently restored dump is mandatory.

Remove obsolete managed database firewall rules and credentials. Revoke the old App Platform Spaces key after the Droplet key is confirmed. Remove `DATABASE_URL_LIVE` references that target the deleted service from operator secret stores, while preserving any intentionally retained encrypted archive metadata. Restore DNS TTLs to 1800 seconds after stability.

At the first full invoice after decommissioning, record actual Droplet, Droplet backup, Uptime, and Spaces costs. Compare the BracketIQ portion to the $37 pre-tax baseline. If the Droplet was resized, use the actual size rather than the original estimate.

## Concrete Steps

All repository commands run from `/Users/elesesy/StudioProjects/mvp-site` unless a step explicitly says it runs on the Droplet. The commands below use placeholders and must never be pasted with secrets into shared logs.

Before implementation, prove the source state again because it can drift:

    git status --short --branch
    npm ci
    npm run prisma:check
    npx tsc --noEmit
    npm run test:ci
    npm run build

Build and validate the image locally without production secrets:

    docker build --tag mvp-site:plan-validation .
    docker compose -f compose.production.yml --env-file ops/droplet/env.production.test config --quiet

On the Droplet, the expected service inspection is:

    cd /opt/bracketiq
    docker compose -f compose.production.yml ps
    docker compose -f compose.production.yml exec -T app node -e "fetch('http://127.0.0.1:3000/api/health/live').then(async response => { console.log(await response.text()); process.exit(response.ok ? 0 : 1); })"
    sudo systemctl list-timers 'bracketiq-*'

The Node port is tested from inside the application container; it must not be published on the host or opened in the cloud firewall. The public checks go through Caddy:

    curl --fail --silent https://bracket-iq.com/api/health/live
    curl --fail --silent https://bracket-iq.com/api/health/ready
    curl --silent --output /dev/null --write-out '%{http_code} %{redirect_url}\n' https://www.bracket-iq.com/
    curl --silent 'https://bracket-iq.com/api/app-version?platform=ios&versionName=0.0.0&buildNumber=1'

The database migration uses PostgreSQL 17 client tools and environment variables that are already loaded from root-owned files:

    pg_dump --format=custom --no-owner --no-acl --file=/secure-temporary-path/mvp-db.dump "$SOURCE_DATABASE_URL"
    pg_restore --list /secure-temporary-path/mvp-db.dump > /secure-temporary-path/mvp-db.contents
    createdb "$TARGET_DATABASE_NAME"
    pg_restore --exit-on-error --no-owner --no-acl --dbname="$TARGET_OWNER_DATABASE_URL" /secure-temporary-path/mvp-db.dump
    DATABASE_URL="$TARGET_OWNER_DATABASE_URL" npm run migrate:deploy
    ops/droplet/bin/verify-database-migration.sh

Delete the unencrypted temporary dump after it has been encrypted, uploaded, and restored successfully. Never place dumps under the repository.

The first backup acceptance run is:

    sudo systemctl start bracketiq-postgres-backup.service
    sudo systemctl status bracketiq-postgres-backup.service --no-pager
    restic snapshots --tag bracketiq-postgres --latest 1

The restore acceptance run must target a disposable name:

    RESTORE_DATABASE=bracketiq_restore_verify ops/droplet/bin/restore-postgres.sh latest
    VERIFY_TARGET_DATABASE=bracketiq_restore_verify ops/droplet/bin/verify-database-migration.sh

## Validation and Acceptance

The migration is accepted only when all of the following observable behaviors hold:

- `https://bracket-iq.com/` returns HTTP 200 through Caddy, and `https://www.bracket-iq.com/` returns a permanent redirect to the identical apex path and query.
- Exactly one canonical URL and one viewport tag remain in rendered public HTML, security headers remain present, and `X-Powered-By` is absent.
- `/api/health/live` returns 200 when Node is running even if PostgreSQL is unavailable; `/api/health/ready` returns 200 only when the normal runtime role can query PostgreSQL and returns 503 without leaking details otherwise.
- Maintenance mode returns 503 with `Retry-After` and `Cache-Control: no-store` for ordinary pages and APIs, including webhooks, while the documented health exception remains available.
- Match realtime and broadcast overlay WebSocket clients connect through HTTPS, receive an initial message, survive at least two heartbeat intervals, and reconnect after an app restart.
- Login, Google redirect generation, public Discover, an organization page, an event page, a file preview backed by Spaces, email, a safe Stripe webhook test, BoldSign webhook verification, QuickBooks redirect generation, push notification setup, and `/api/app-version` behave as they did before cutover.
- PostgreSQL is not reachable from the public internet on 5432, the Node server is not reachable publicly on 3000 or 8080, and only intended SSH, HTTP, and HTTPS rules exist.
- During the final write freeze, source and target have the same base-table set, exact row count for every table, and the same completed Prisma migration set.
- The hourly logical backup is no more than 75 minutes old, its systemd unit is healthy, and the latest snapshot restores into an empty disposable database whose table counts match the backed-up source.
- DigitalOcean Uptime checks the readiness URL from public regions and sends a test alert to the operator.
- After seven days, no container has an unexplained restart, disk remains below 70%, memory below the resize threshold, and swap is not under sustained input/output.
- After decommissioning, the invoice no longer contains the $24 `mvp-site` App Service line or the $13 MVP managed PostgreSQL line.

## Idempotence and Recovery

Repository artifact creation is additive and can be repeated. Docker image tags are immutable commit SHAs. Compose applies declaratively. Provisioning scripts must check for users, directories, swap, packages, and systemd units before creating them so reruns do not duplicate state.

Database rehearsal always restores into a new disposable database. The restore script refuses the production name by default. Final cutover recreates the target only while both application paths are confirmed non-writable and a verified source dump exists. A failed restore leaves the managed database unchanged; discard the target, fix the cause, and repeat.

DNS changes are captured before mutation. During the app-only phase, restore the old apex and `www` records to roll back. After local database writes begin, follow the data-first rollback in Milestone 7; never direct production traffic to the stale managed database.

Application deploy rollback changes only the image tag. Do not attempt automatic down-migrations. Prisma migrations must remain backward compatible across at least the current and previous image during this single-node phase.

If the Droplet is lost, create a replacement in `nyc3`, attach the reserved IP, apply the same firewall tag, restore the tracked Compose and Caddy files, load secrets from the password manager, restore the latest logical backup, run Prisma migration status, start the app, and run the acceptance suite. The reserved IP avoids waiting for DNS propagation during this recovery.

## Artifacts and Notes

The following live inventory was observed on 2026-07-15 and must be refreshed before execution:

    mvp-site App Platform: 2 x apps-s-1vcpu-1gb, $24/month before tax
    mvp-db managed PostgreSQL: 1 x db-s-1vcpu-1gb, $13/month before tax
    BracketIQ app plus database baseline: $37/month before tax
    mvp-db: PostgreSQL 17.10, 32 MB, 91 tables, 476 indexes, only plpgsql
    Spaces: $5/month account-wide and retained
    Existing scraping-agent Droplet: sfo2, 1 GiB, $8/month, not reused
    June 2026 whole-account invoice: $130.75 including unrelated projects and tax

Current official DigitalOcean pricing used in this plan lists a Basic 1 vCPU / 2 GiB Droplet at $12 per month and a Basic 2 vCPU / 4 GiB Droplet at $24 per month. Percentage backups add 20% for weekly or 30% for daily backups. Usage-based backup rates depend on restorable GiB and selected frequency. Assigned reserved IPs are free; unassigned reserved IPv4 addresses can incur a charge. Monitoring is free, and the first Uptime check receives a monthly credit.

Primary references consulted while writing the plan are included for provenance, but the execution requirements above are self-contained:

- DigitalOcean Droplet pricing: `https://www.digitalocean.com/pricing/droplets`
- DigitalOcean backup pricing: `https://docs.digitalocean.com/products/backups/details/pricing/`
- DigitalOcean production Droplet setup: `https://docs.digitalocean.com/products/droplets/getting-started/recommended-droplet-setup/`
- DigitalOcean managed-to-self-managed PostgreSQL migration: `https://docs.digitalocean.com/products/databases/postgresql/how-to/migrate-to-self-managed/`
- DigitalOcean reserved IP pricing: `https://docs.digitalocean.com/products/networking/reserved-ips/details/pricing/`
- DigitalOcean Uptime pricing: `https://docs.digitalocean.com/products/uptime/details/pricing/`
- PostgreSQL 17 `pg_dump`: `https://www.postgresql.org/docs/17/app-pgdump.html`

## Interfaces and Dependencies

At the end of Milestone 1, these interfaces must exist:

`GET /api/health/live` returns:

    { "status": "ok" }

`GET /api/health/ready` returns HTTP 200 when PostgreSQL is ready:

    { "status": "ready" }

It returns HTTP 503 on database failure:

    { "status": "not_ready" }

The responses must not include exception messages, hostnames, users, passwords, SQL, or stack traces.

`ops/droplet/bin/deploy.sh` accepts exactly one positional image tag and exits nonzero if migration, startup, or readiness fails. It stores the previous successful tag in `/opt/bracketiq/state/previous-image` before changing production.

`ops/droplet/bin/backup-postgres.sh` accepts no destructive argument, exits nonzero on any pipeline failure, tags the Restic snapshot `bracketiq-postgres`, and writes an ISO timestamp only after Restic confirms the snapshot.

`ops/droplet/bin/restore-postgres.sh` accepts one snapshot selector, requires `RESTORE_DATABASE`, rejects the production database name unless `ALLOW_PRODUCTION_RESTORE` matches a documented confirmation token, and uses `pg_restore --exit-on-error --no-owner --no-acl`.

`ops/droplet/bin/verify-database-migration.sh` reads source and target URLs from environment variables, emits a machine-readable summary, and exits nonzero on a table, row-count, or migration mismatch. It must redact URLs in both normal and error output.

Use Node 20, the repository-pinned npm dependency graph, Docker Engine with Compose v2, Caddy 2, PostgreSQL 17, and Restic. Do not introduce Kubernetes, a paid load balancer, DigitalOcean Container Registry, public PostgreSQL access, or local file storage in this cost-reduction phase.

Revision note, 2026-07-15: Created the initial self-contained plan after inspecting the repository, live DigitalOcean resource inventory, June billing line items, live database shape, current DNS behavior, and current official platform pricing. The staged app-first/database-second sequence was chosen to preserve a simple rollback boundary for as long as possible.
