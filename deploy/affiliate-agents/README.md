# Affiliate Codex agent containers

This Compose project defines 10 mapper containers, two reviewer containers,
and one coverage container. Each mapper keeps its own Git workspace and Codex
state. The reviewers share the read-only producer workspaces, but each reviewer
has its own loop lock and Codex state directory.

The tracked defaults limit a mapper to 1.25 CPUs and 3 GiB. They limit each
reviewer and the coverage worker to 1 CPU and 2 GiB. The memory-swap limit is
equal to the memory limit. This setting prevents new agent swap use. The
limits are ceilings. They are not reserved memory.

## Prepare the host

Copy `deployment.env.example` to an untracked `deployment.env`. Keep the
restart policy set to `no` while the fleet is paused. Confirm that every path
in the file exists. The second reviewer needs a separate Codex state directory
with the same authenticated Codex CLI configuration as reviewer 1.

Validate the resolved configuration before changing containers:

    docker compose --env-file deployment.env -f compose.yml config --quiet

Create stopped containers with the configured limits:

    docker compose --env-file deployment.env -f compose.yml create

This command does not start the agents. Inspect the stopped containers and
confirm their commands, mounts, networks, restart policy, and resource limits.

## Start or stop the fleet

Change `AFFILIATE_AGENT_RESTART_POLICY` to `unless-stopped` before a persistent
run. Start only after an operator explicitly authorizes queue processing:

    docker compose --env-file deployment.env -f compose.yml up -d

Stop the fleet without deleting workspaces, Codex state, or queue rows:

    docker compose --env-file deployment.env -f compose.yml stop

Set the restart policy back to `no` before recreating a deliberately paused
fleet. Do not remove a mapper workspace until its branch and generated source
package are preserved.
