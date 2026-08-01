/** @jest-environment node */

import path from 'node:path';
import {
  buildCodexAffiliateIngestionArgs,
  buildCodexAffiliateIngestionGoal,
  buildCodexAffiliateIngestionObjective,
  CODEX_AFFILIATE_INGESTION_MODEL,
  CODEX_AFFILIATE_INGESTION_REASONING_EFFORT,
} from '../codexCliGoal';

describe('Codex affiliate intake goal', () => {
  const options = {
    repositoryRoot: '/srv/bracketiq',
    useLiveIntakes: true,
    workerId: 'codex-luna-vm-1',
  };

  it('pins Luna x-high with persisted goals and bounded workspace permissions', () => {
    const args = buildCodexAffiliateIngestionArgs(options);

    expect(args).toEqual([
      '--cd',
      path.resolve('/srv/bracketiq'),
      '--model',
      CODEX_AFFILIATE_INGESTION_MODEL,
      '--config',
      `model_reasoning_effort="${CODEX_AFFILIATE_INGESTION_REASONING_EFFORT}"`,
      '--config',
      'sandbox_workspace_write.network_access=true',
      '--enable',
      'goals',
      '--sandbox',
      'workspace-write',
      '--ask-for-approval',
      'never',
      expect.stringMatching(/^Before doing any other work, call the create_goal tool /),
    ]);
    expect(CODEX_AFFILIATE_INGESTION_MODEL).toBe('gpt-5.6-luna');
    expect(CODEX_AFFILIATE_INGESTION_REASONING_EFFORT).toBe('xhigh');
    expect(args).not.toContain('--dangerously-bypass-approvals-and-sandbox');
  });

  it('defines the complete queue, organization, logo, and approval contract', () => {
    const goal = buildCodexAffiliateIngestionGoal(options);
    const objective = buildCodexAffiliateIngestionObjective(options);

    expect(objective.length).toBeLessThanOrEqual(4_000);
    expect(goal).toContain('call the create_goal tool');
    expect(goal).toContain('$ingest-affiliate-intakes');
    expect(goal).toContain('claimableJobs=0');
    expect(goal).toContain('eligibleReadyIntakesWithoutJob=0');
    expect(goal).toContain('claimedWithoutLease=0');
    expect(goal).toContain('queuedCaptureRuns=0');
    expect(goal).toContain('runningCaptureRuns=0');
    expect(goal).toContain('affiliate:mapping:queue-status -- --live');
    expect(goal).toContain(
      'affiliate:mapping:claim -- --live --worker=codex-luna-vm-1',
    );
    expect(goal).toContain(
      'affiliate:mapping:complete -- --live --job=<job-id> --result=<result-json>',
    );
    expect(goal).toContain(
      'affiliate:intakes:enqueue-urls -- --live --input=<proposal-json> --result=<result-json> --job=<job-id> --worker=codex-luna-vm-1',
    );
    expect(goal).toContain(
      'affiliate:intakes:process -- --live --limit=25 --summary',
    );
    expect(goal).toContain('Complete that parent job as EXPANDED');
    expect(goal).toContain('organization setup');
    expect(goal).toContain('official normalized logo');
    expect(goal).toContain('two duplicate-safe review scrapes');
    expect(goal).toContain('Keep valid organizations reviewable when individual events lack locations');
    expect(goal).toContain('SOURCE_ORGANIZATION fallback with stored evidence');
    expect(goal).toContain('Preserve the exact source division label');
    expect(goal).toContain('group every division by its stable event identity/detail-page context');
    expect(goal).toContain('canonical gender M/F/C, ratingType AGE/SKILL');
    expect(goal).toContain('differing division prices must produce a compact event range');
    expect(goal).toContain('Setup scripts must support guarded --live');
    expect(goal).toContain('TEAM-only');
    expect(goal).toContain('Do not publish candidates or organizations');
    expect(goal).toContain('source-scoped commit');
  });

  it('uses local queue commands when live intakes were not requested', () => {
    const goal = buildCodexAffiliateIngestionGoal({
      ...options,
      useLiveIntakes: false,
    });

    expect(goal).toContain('affiliate:mapping:queue-status.');
    expect(goal).not.toContain('affiliate:mapping:queue-status --');
    expect(goal).toContain(
      'affiliate:mapping:claim -- --worker=codex-luna-vm-1',
    );
    expect(goal).toContain(
      'affiliate:intakes:enqueue-urls -- --input=<proposal-json> --result=<result-json> --job=<job-id> --worker=codex-luna-vm-1',
    );
  });

  it('uses danger-full-access only when an external container boundary was requested', () => {
    const args = buildCodexAffiliateIngestionArgs({
      ...options,
      containerIsolated: true,
    });

    expect(args).toEqual(expect.arrayContaining([
      '--sandbox',
      'danger-full-access',
    ]));
    expect(args).not.toContain('workspace-write');
    expect(args).not.toContain('--dangerously-bypass-approvals-and-sandbox');
  });

  it('rejects worker ids that could become command syntax', () => {
    expect(() => buildCodexAffiliateIngestionArgs({
      ...options,
      workerId: 'worker; npm run unsafe',
    })).toThrow('worker id');
  });
});
