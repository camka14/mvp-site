/** @jest-environment node */

import { runAffiliateApprovalLoopCycle } from '../approvalLoop';
import type { AffiliateApprovalQueueStatus } from '../approvalQueue';

const status = (claimableJobs: number): AffiliateApprovalQueueStatus => ({
  schemaVersion: 1,
  evaluatedAt: '2026-07-31T12:00:00.000Z',
  complete: claimableJobs === 0,
  claimableJobs,
  queuedJobs: claimableJobs,
  expiredLeases: 0,
  activeLeases: 0,
  claimedWithoutLease: 0,
  statusCounts: claimableJobs ? { QUEUED: claimableJobs } : {},
  subjectTypeCounts: claimableJobs ? { DOMAIN_POLICY: claimableJobs } : {},
});

describe('affiliate approval loop cycle', () => {
  it('does not launch Luna for an empty queue', async () => {
    const launchGoal = jest.fn(async () => undefined);
    const result = await runAffiliateApprovalLoopCycle({
      reconcile: jest.fn(async () => ({ created: 0 })),
      getStatus: jest.fn(async () => status(0)),
      launchGoal,
    });

    expect(result.launchedGoal).toBe(false);
    expect(launchGoal).not.toHaveBeenCalled();
  });

  it('waits for the active Luna goal before checking the queue again', async () => {
    let finishGoal: (() => void) | undefined;
    const launchGoal = jest.fn(() => new Promise<void>((resolve) => {
      finishGoal = resolve;
    }));
    const getStatus = jest.fn()
      .mockResolvedValueOnce(status(1))
      .mockResolvedValueOnce(status(0));
    const pending = runAffiliateApprovalLoopCycle({
      reconcile: jest.fn(async () => ({ created: 0 })),
      getStatus,
      launchGoal,
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(launchGoal).toHaveBeenCalledTimes(1);
    expect(getStatus).toHaveBeenCalledTimes(1);

    finishGoal?.();
    const result = await pending;
    expect(result.launchedGoal).toBe(true);
    expect(getStatus).toHaveBeenCalledTimes(2);
    expect(result.queueAfterLaunch.claimableJobs).toBe(0);
  });
});
