/** @jest-environment node */

import path from 'node:path';
import {
  buildCodexAffiliateApprovalArgs,
  buildCodexAffiliateApprovalGoal,
  CODEX_AFFILIATE_APPROVAL_MODEL,
  CODEX_AFFILIATE_APPROVAL_REASONING_EFFORT,
} from '../codexApprovalGoal';

describe('Codex affiliate approval goal', () => {
  const options = {
    repositoryRoot: '/srv/bracketiq',
    useLiveApprovals: true,
    reviewerId: 'codex-luna-approval-vm-1',
  };

  it('pins one headless Luna x-high goal with bounded authority', () => {
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
      'sandbox_workspace_write.network_access=true',
      '--enable',
      'goals',
      '--sandbox',
      'workspace-write',
      expect.stringMatching(/^Before doing any other work, call the create_goal tool /),
    ]);
    expect(CODEX_AFFILIATE_APPROVAL_MODEL).toBe('gpt-5.6-luna');
    expect(CODEX_AFFILIATE_APPROVAL_REASONING_EFFORT).toBe('xhigh');
  });

  it('names the queue commands, evidence refresh, independence, and stop condition', () => {
    const goal = buildCodexAffiliateApprovalGoal(options);
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
    expect(goal).toContain('Use the live database only for the approval queue');
    expect(goal).toContain('expected NOT_APPLIED state, not a rejection reason');
    expect(goal).toContain('guarded APPROVE completion creates the package');
    expect(goal).toContain('do not exist in production');
    expect(goal).toContain('Review organization validity independently from child event validity');
    expect(goal).toContain('events without usable locations were correctly excluded and logged');
    expect(goal).toContain('explicit SOURCE_ORGANIZATION mode');
    expect(goal).toContain('group every source division under the correct parent event');
    expect(goal).toContain('Preserve the exact organization division label as display name');
    expect(goal).toContain('canonical gender M/F/C, ratingType AGE/SKILL');
    expect(goal).toContain('differing division prices require a compact event range');
    expect(goal).toContain('For MANUAL_REVIEW logos');
    expect(goal).toContain('manually inspect the public official site');
    expect(goal).toContain('OFFICIAL_LOGO_REPAIR_REQUIRED');
    expect(goal).toContain('DEFER only when neither stored nor freshly captured official-site evidence');
    expect(goal).toContain('Every non-approved MAPPING_PACKAGE result must include mappingDisposition');
    expect(goal).toContain('nextAction PRODUCER_REPAIR');
    expect(goal).toContain('Use HUMAN_REVIEW_REQUIRED only');
    expect(goal).toContain('do not use DEFER for a fixable producer defect');
    expect(goal).toContain('Never publish an organization or candidate');
  });

  it('rejects reviewer identities that could become command syntax', () => {
    expect(() => buildCodexAffiliateApprovalArgs({
      ...options,
      reviewerId: 'reviewer; unsafe',
    })).toThrow('reviewer id');
  });
});
