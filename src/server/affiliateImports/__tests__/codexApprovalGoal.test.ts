/** @jest-environment node */

import path from 'node:path';
import {
  buildCodexAffiliateApprovalArgs,
  buildCodexAffiliateApprovalGoal,
  buildCodexAffiliateApprovalObjective,
  CODEX_AFFILIATE_APPROVAL_FAST_MODE,
  CODEX_AFFILIATE_APPROVAL_MODEL,
  CODEX_AFFILIATE_APPROVAL_OBJECTIVE_MAX_LENGTH,
  CODEX_AFFILIATE_APPROVAL_REASONING_EFFORT,
  CODEX_AFFILIATE_APPROVAL_SERVICE_TIER,
} from '../codexApprovalGoal';

describe('Codex affiliate approval goal', () => {
  const options = {
    repositoryRoot: '/srv/bracketiq',
    useLiveApprovals: true,
    reviewerId: 'codex-luna-approval-vm-1',
  };

  it('pins one headless Luna max goal in fast mode with bounded authority', () => {
    expect(buildCodexAffiliateApprovalArgs(options)).toEqual([
      '--ask-for-approval',
      'never',
      'exec',
      '--cd',
      path.resolve('/srv/bracketiq'),
      '--model',
      CODEX_AFFILIATE_APPROVAL_MODEL,
      '--config',
      `model_reasoning_effort="${CODEX_AFFILIATE_APPROVAL_REASONING_EFFORT}"`,
      '--config',
      `service_tier="${CODEX_AFFILIATE_APPROVAL_SERVICE_TIER}"`,
      '--config',
      `features.fast_mode=${CODEX_AFFILIATE_APPROVAL_FAST_MODE}`,
      '--config',
      'sandbox_workspace_write.network_access=true',
      '--enable',
      'goals',
      '--sandbox',
      'workspace-write',
      expect.stringMatching(/^Before doing any other work, call the create_goal tool /),
    ]);
    expect(CODEX_AFFILIATE_APPROVAL_MODEL).toBe('gpt-5.6-luna');
    expect(CODEX_AFFILIATE_APPROVAL_REASONING_EFFORT).toBe('max');
    expect(CODEX_AFFILIATE_APPROVAL_SERVICE_TIER).toBe('fast');
    expect(CODEX_AFFILIATE_APPROVAL_FAST_MODE).toBe(true);
  });

  it('names the queue commands, evidence refresh, independence, and stop condition', () => {
    const goal = buildCodexAffiliateApprovalGoal(options);
    expect(buildCodexAffiliateApprovalObjective(options).length)
      .toBeLessThanOrEqual(CODEX_AFFILIATE_APPROVAL_OBJECTIVE_MAX_LENGTH);
    expect(buildCodexAffiliateApprovalObjective({
      ...options,
      reviewerId: 'r'.repeat(80),
    }).length).toBeLessThanOrEqual(CODEX_AFFILIATE_APPROVAL_OBJECTIVE_MAX_LENGTH);
    expect(goal).toContain('$review-affiliate-approvals');
    expect(goal).toContain('affiliate:approvals:reconcile -- --live');
    expect(goal).toContain('affiliate:approvals:queue-status -- --live');
    expect(goal).toContain('affiliate:approvals:claim -- --live --worker=codex-luna-approval-vm-1');
    expect(goal).toContain('affiliate:approvals:policy-evidence -- --live --policy=<policy-key>');
    expect(goal).toContain('affiliate:approvals:package-evidence -- --live --job=<mapping-job-id>');
    expect(goal).toContain('affiliate:approvals:logo-evidence -- --live --approval=<approval-job-id>');
    expect(goal).toContain('--reviewer=codex-luna-approval-vm-1');
    expect(goal).toContain('--page-url=<official-page-url> --logo-url=<official-logo-url>');
    expect(goal).toContain('affiliate:approvals:complete -- --live');
    expect(goal).toContain('claimableJobs=0, activeLeases=0, and claimedWithoutLease=0');
    expect(goal).toContain('Never approve a package produced by this reviewer identity');
    expect(goal).toContain('disposable validation database review-scrape evidence');
    expect(goal).toContain('Use live data only for the approval queue');
    expect(goal).toContain('NOT_APPLIED before approval is expected');
    expect(goal).toContain('need not exist in production');
    expect(goal).toContain('Review organizations independently from child events');
    expect(goal).toContain('event locations do not invalidate a valid organization');
    expect(goal).toContain('evidenced SOURCE_ORGANIZATION fallback');
    expect(goal).toContain('Verify division grouping, source labels');
    expect(goal).toContain('canonical gender M/F/C');
    expect(goal).toContain('compact event price ranges');
    expect(goal).toContain('Independently verify event and organization description quality');
    expect(goal).toContain('descriptionQualityVerified=true');
    expect(goal).toContain('EVENT_DESCRIPTION_INVALID or ORGANIZATION_DESCRIPTION_INVALID');
    expect(goal).toContain('For MANUAL_REVIEW logos');
    expect(goal).toContain('official site');
    expect(goal).toContain('OFFICIAL_LOGO_REPAIR_REQUIRED');
    expect(goal).toContain('do not reject an otherwise-valid package');
    expect(goal).toContain('officialLogoVerified=false and logoAbsenceAccepted=true');
    expect(goal).toContain('Every non-approved mapping result needs mappingDisposition');
    expect(goal).toContain('PRODUCER_REPAIR');
    expect(goal).toContain('HUMAN_REVIEW_REQUIRED and DEFER only');
    expect(goal).toContain('Do not edit producer packages, publish');
  });

  it('rejects reviewer identities that could become command syntax', () => {
    expect(() => buildCodexAffiliateApprovalArgs({
      ...options,
      reviewerId: 'reviewer; unsafe',
    })).toThrow('reviewer id');
  });
});
