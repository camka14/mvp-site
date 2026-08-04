/** @jest-environment node */

import {
  runAffiliateCoverageLoopCycle,
  type AffiliateCoverageQueueStatus,
} from '../coverageAgentLoop';

const status = (claimableJobs: number): AffiliateCoverageQueueStatus => ({
  totalJobs: claimableJobs,
  claimableJobs,
  activeLeases: 0,
  claimedWithoutLease: 0,
  statusCounts: claimableJobs ? { QUEUED: claimableJobs } : {},
  typeCounts: claimableJobs ? { MARKET_COVERAGE: claimableJobs } : {},
});

describe('affiliate coverage agent loop cycle', () => {
  it('does not launch Luna when the coverage queue is empty', async () => {
    const launchGoal = jest.fn(async () => undefined);
    const result = await runAffiliateCoverageLoopCycle({
      reconcile: jest.fn(async () => ({ totalCreated: 0 })),
      getStatus: jest.fn(async () => status(0)),
      launchGoal,
    });

    expect(result.launchedGoal).toBe(false);
    expect(launchGoal).not.toHaveBeenCalled();
  });

  it('waits for the active Luna goal before it checks or launches again', async () => {
    let finishGoal: (() => void) | undefined;
    const launchGoal = jest.fn(() => new Promise<void>((resolve) => {
      finishGoal = resolve;
    }));
    const getStatus = jest.fn()
      .mockResolvedValueOnce(status(2))
      .mockResolvedValueOnce(status(0));
    const reconcile = jest.fn(async () => ({ totalCreated: 0 }));
    const pending = runAffiliateCoverageLoopCycle({ reconcile, getStatus, launchGoal });

    await Promise.resolve();
    await Promise.resolve();
    expect(launchGoal).toHaveBeenCalledTimes(1);
    expect(getStatus).toHaveBeenCalledTimes(1);

    finishGoal?.();
    const result = await pending;
    expect(result.launchedGoal).toBe(true);
    expect(reconcile).toHaveBeenCalledTimes(2);
    expect(getStatus).toHaveBeenCalledTimes(2);
    expect(result.queueAfterLaunch.claimableJobs).toBe(0);
  });
});
