/** @jest-environment node */

import path from 'node:path';
import {
  buildCodexAffiliateCoverageArgs,
  buildCodexAffiliateCoverageGoal,
  buildCodexAffiliateCoverageObjective,
  CODEX_AFFILIATE_COVERAGE_FAST_MODE,
  CODEX_AFFILIATE_COVERAGE_MODEL,
  CODEX_AFFILIATE_COVERAGE_REASONING_EFFORT,
  CODEX_AFFILIATE_COVERAGE_SERVICE_TIER,
} from '../codexCoverageGoal';

describe('Codex affiliate coverage goal', () => {
  const options = {
    repositoryRoot: '/srv/bracketiq',
    useLiveCoverage: true,
    agentId: 'codex-luna-coverage-1',
  };

  it('pins Luna max without fast mode and with bounded workspace permissions', () => {
    const args = buildCodexAffiliateCoverageArgs(options);
    expect(args).toEqual([
      '--ask-for-approval',
      'never',
      'exec',
      '--ephemeral',
      '--cd',
      path.resolve('/srv/bracketiq'),
      '--model',
      CODEX_AFFILIATE_COVERAGE_MODEL,
      '--config',
      `model_reasoning_effort="${CODEX_AFFILIATE_COVERAGE_REASONING_EFFORT}"`,
      '--config',
      'sandbox_workspace_write.network_access=true',
      '--enable',
      'goals',
      '--sandbox',
      'workspace-write',
      expect.stringContaining('call the create_goal tool'),
    ]);
    expect(CODEX_AFFILIATE_COVERAGE_MODEL).toBe('gpt-5.6-luna');
    expect(CODEX_AFFILIATE_COVERAGE_REASONING_EFFORT).toBe('max');
    expect(CODEX_AFFILIATE_COVERAGE_SERVICE_TIER).toBeNull();
    expect(CODEX_AFFILIATE_COVERAGE_FAST_MODE).toBe(false);
    expect(args.some((argument) => argument.includes('service_tier'))).toBe(false);
    expect(args.some((argument) => argument.includes('features.fast_mode'))).toBe(false);
    expect(buildCodexAffiliateCoverageArgs(options)).toContain('--ephemeral');
    expect(buildCodexAffiliateCoverageGoal(options)).toContain(
      'use the exact objective as the in-session goal',
    );
  });

  it('defines coverage, competition-operator, manual recovery, and stopping contracts', () => {
    const objective = buildCodexAffiliateCoverageObjective(options);
    const goal = buildCodexAffiliateCoverageGoal(options);
    expect(objective.length).toBeLessThanOrEqual(4_000);
    expect(goal).toContain('$plan-affiliate-discovery-campaigns');
    expect(goal).toContain('claimableJobs=0');
    expect(goal).toContain('activeLeases=0');
    expect(goal).toContain('claimedWithoutLease=0');
    expect(goal).toContain('affiliate:coverage:reconcile -- --live');
    expect(goal).toContain('affiliate:coverage:claim -- --live --worker=codex-luna-coverage-1');
    expect(goal).toContain('affiliate:coverage:create-campaign -- --live --input=<campaign-proposal-json>');
    expect(goal).toContain('affiliate:discovery:run -- --live --campaign=<campaign-id> --max-queries=10 --max-results=10 --summary');
    expect(goal).toContain('affiliate:coverage:manual-evidence -- --live --input=<manual-evidence-json>');
    expect(goal).toContain('league operators and tournament hosts separate coverage');
    expect(goal).toContain('one bounded manual public-page pass');
    expect(goal).toContain('MANUAL_BROWSER');
    expect(goal).toContain('WAITING_FOR_PIPELINE');
    expect(goal).toContain('RETRY_LATER');
    expect(goal).toContain('SOURCE_EXCLUDED');
    expect(goal).toContain('same-policy-key www redirect');
    expect(goal).toContain('Review-only intermediary leads do not block coverage');
    expect(goal).toContain('return the same market job to the queue');
    expect(goal).toContain('Route broken approved-source selectors to the mapper');
    expect(goal).toContain('Do not map sources');
  });

  it('uses local commands without live flags when live coverage is not requested', () => {
    const goal = buildCodexAffiliateCoverageGoal({ ...options, useLiveCoverage: false });
    expect(goal).toContain('npm run affiliate:coverage:queue-status');
    expect(goal).not.toContain('affiliate:coverage:queue-status --');
    expect(goal).toContain('affiliate:coverage:claim -- --worker=codex-luna-coverage-1');
  });

  it('rejects agent ids that could become command syntax', () => {
    expect(() => buildCodexAffiliateCoverageArgs({
      ...options,
      agentId: 'coverage; unsafe',
    })).toThrow('agent id');
  });
});
