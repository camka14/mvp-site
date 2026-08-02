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
    expect(result.launchedGoalCount).toBe(0);
    expect(launchGoal).not.toHaveBeenCalled();
  });

  it('lets an armed full-review gate enqueue work before deciding whether to launch Luna', async () => {
    const launchGoal = jest.fn(async () => undefined);
    const advanceFullReview = jest.fn(async () => ({ state: 'ENQUEUED' }));
    const getStatus = jest.fn()
      .mockResolvedValueOnce(status(0))
      .mockResolvedValueOnce(status(1))
      .mockResolvedValueOnce(status(0));
    const result = await runAffiliateApprovalLoopCycle({
      reconcile: jest.fn(async () => ({ created: 0 })),
      getStatus,
      advanceFullReview,
      launchGoal,
    });

    expect(advanceFullReview).toHaveBeenCalledWith(status(0));
    expect(launchGoal).toHaveBeenCalledTimes(1);
    expect(result.fullReview).toEqual({ state: 'ENQUEUED' });
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
    expect(result.launchedGoalCount).toBe(1);
    expect(getStatus).toHaveBeenCalledTimes(2);
    expect(result.queueAfterLaunch.claimableJobs).toBe(0);
  });

  it('runs the configured reviewer pool and waits for every reviewer', async () => {
    const releases = new Map<string, () => void>();
    const launchGoal = jest.fn((reviewerId?: string) => new Promise<void>((resolve) => {
      releases.set(String(reviewerId), resolve);
    }));
    const getStatus = jest.fn()
      .mockResolvedValueOnce(status(4))
      .mockResolvedValueOnce(status(0));
    const pending = runAffiliateApprovalLoopCycle({
      reconcile: jest.fn(async () => ({ created: 0 })),
      getStatus,
      reviewerIds: ['reviewer-1', 'reviewer-2'],
      launchGoal,
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(launchGoal).toHaveBeenCalledTimes(2);
    releases.get('reviewer-1')?.();
    await Promise.resolve();
    expect(getStatus).toHaveBeenCalledTimes(1);

    releases.get('reviewer-2')?.();
    const result = await pending;
    expect(result.launchedGoalCount).toBe(2);
    expect(getStatus).toHaveBeenCalledTimes(2);
  });
});
