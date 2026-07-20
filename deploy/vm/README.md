# BracketIQ single-VM production stack

This directory is the provider-neutral production stack for moving `mvp-site` off DigitalOcean App Platform. The first target is an OVHcloud US VPS-2 in Hillsboro, Oregon, running a Docker-supported Ubuntu LTS release. The provisioned host uses Ubuntu 26.04 LTS. The stack keeps DigitalOcean Spaces for application files and encrypted off-server PostgreSQL backups during the transition.

The VM runs four long-lived containers:

- Caddy is the only public service and owns ports 80 and 443, TLS, the `www` redirect, WebSocket proxying, and the maintenance response.
- The custom Next.js server runs `server.mjs` on the private Compose network.
- PostgreSQL 17 stores application data on a named volume and never publishes port 5432.
- Redis supplies shared rate-limit state and realtime fanout and never publishes port 6379.

`compose.production.yml` is intentionally separate from the repository-root development Compose file.

## What the owner must do

Before Codex can provision a server, the account owner must:

1. Create or sign in to an OVHcloud US account, add billing, and order one VPS-2 in Hillsboro with a Docker-supported Ubuntu LTS release. The current host uses Ubuntu 26.04 LTS. Do not cancel DigitalOcean App Platform or managed PostgreSQL.
2. Add a dedicated deployment SSH public key during provisioning. The private key must stay on an operator machine and must never be pasted into chat or committed.
3. Create or approve a protected GitHub `production` environment for the manual image workflow. Add the client-visible Maps key, Stripe publishable key, and PostHog token as environment secrets; add the Maps ID, mobile deep links, and store URLs as environment variables.
4. Make the missing live-only secrets available through a protected channel. In the current inventory, the Apple sign-in private key requires special attention. Populate it directly in `/opt/bracketiq/deploy/vm/app.env`; do not send the value in chat.
5. At the two explicit gates, approve the public DNS switch and later the short write-frozen database migration window.
6. After seven stable days and a successful restore drill, approve deletion of only the old `mvp-site` App Platform service and its managed database.

Everything else in this runbook is reversible preparation and can happen before public traffic changes.

## Files that must remain secret

On the VM, create these files from their tracked examples:

    deployment.env
    app.env
    migration.env
    postgres.env
    redis.env
    /etc/bracketiq/restic.env

Set mode `0600`. `app.env` uses the limited runtime database role. `migration.env` uses the owner role and is loaded only by the one-off migration service. URL-encode database and Redis passwords when placing them inside URLs. Preserve `AUTH_SECRET` and all existing webhook verification secrets through the cutover so sessions and provider callbacks remain valid.

The tracked `app.env.example` is an inventory aid, not an assertion that every optional integration is enabled. Compare it with the live App Platform environment immediately before deployment.

## Initial VM layout

Use a non-root deployment account and keep the checkout at `/opt/bracketiq`:

    sudo install -d -m 0755 -o bracketiq -g bracketiq /opt/bracketiq
    sudo install -d -m 0700 -o root -g root /etc/bracketiq /var/lib/bracketiq

Install Docker Engine and the Compose plugin from Docker's official Ubuntu repository. Install the PostgreSQL 17 client and Restic from supported repositories. Enable unattended security upgrades. Initially rate-limit inbound TCP 22 with key-only authentication and Fail2ban; restrict it to a stable operator or VPN CIDR later if one is available. Allow TCP 80 and 443 plus UDP 443 publicly, and deny 3000, 5432, and 6379. Configure at least 2 GiB swap as an emergency cushion even though the selected VPS has 8 GiB RAM.

Do not use a floating `latest` application tag. Publish an image with the manual GitHub workflow and copy the full commit-SHA tag into `deployment.env`.

## Validate configuration without exposing secrets

From `deploy/vm` on the VM:

    docker compose --env-file deployment.env -f compose.production.yml config --quiet
    docker compose --env-file deployment.env -f compose.production.yml up -d postgres redis
    docker compose --env-file deployment.env -f compose.production.yml --profile tools run --rm migrate

Never run `docker compose config` without `--quiet` in shared logs because it can render resolved environment values.

## Deploy and roll back the app image

Run:

    ./bin/deploy.sh ghcr.io/camka14/mvp-site:<full-commit-sha>

The script accepts only a full commit SHA or image digest, waits for database readiness, and restores the previously recorded image if the new container becomes unhealthy. Set `RUN_MIGRATIONS=true` only when the migration-owner URL is correct and the release actually needs schema deployment. Application rollback does not reverse database migrations; after a non-backward-compatible migration, roll forward with a fixed image.

## Maintenance mode

Enable maintenance without changing the image:

    touch maintenance/enabled

Caddy then returns HTTP 503 with `Retry-After` for ordinary requests but continues proxying the liveness and readiness routes. Disable it with:

    rm maintenance/enabled

Maintenance is required for the final database copy. Do not accept writes in both the managed and self-hosted databases.

## Encrypted database backups and restore drills

Initialize the Restic repository once after populating `/etc/bracketiq/restic.env`:

    sudo sh -c 'set -a; . /etc/bracketiq/restic.env; set +a; exec restic init'

Install the tracked systemd units under `/etc/systemd/system`, then enable the hourly timer only after a manual backup succeeds:

    sudo systemctl daemon-reload
    sudo systemctl start bracketiq-postgres-backup.service
    sudo systemctl enable --now bracketiq-postgres-backup.timer

The backup script streams a custom-format dump directly to encrypted Restic storage and keeps 48 hourly, 14 daily, 8 weekly, and 12 monthly snapshots. It does not create a plaintext dump on the VM.

For a restore drill, create a new empty database, identify the snapshot and stored path with `restic snapshots` and `restic ls`, then run:

    RESTIC_SNAPSHOT=<snapshot-id> \
    RESTIC_DUMP_PATH=/bracketiq/postgres/<timestamp>.dump \
    TARGET_DATABASE=bracketiq_restore_drill \
    sudo --preserve-env=RESTIC_SNAPSHOT,RESTIC_DUMP_PATH,TARGET_DATABASE \
      ./bin/restore-postgres.sh

The restore script refuses a non-empty target. It also refuses the live database unless `ALLOW_LIVE_DATABASE_RESTORE` exactly matches the live database name. A successful backup is not considered production-ready until this restore drill passes.

## Cutover order

1. Deploy this stack on a preview hostname while the app still uses managed PostgreSQL. Validate login, Discover, event and organization pages, uploads, payments/webhooks, `/api/app-version`, and both WebSocket endpoints.
2. Point only the apex and `www` records to the VM. Keep both app paths on managed PostgreSQL for at least 48 hours, making application rollback a DNS-only action.
3. Put the old App Platform service in maintenance mode. During an announced maintenance window, freeze VM writes, take a final PostgreSQL 17 custom-format dump, restore it locally, compare every table and applied migration, switch `app.env` to the private PostgreSQL URL, and resume traffic.
4. Observe for seven days, verify hourly backup age daily, and complete another restore drill. Only then is deletion of the old managed services eligible for approval.

The full gates and rollback boundaries are maintained in `docs/ovh-vps-migration-execplan.md`.
