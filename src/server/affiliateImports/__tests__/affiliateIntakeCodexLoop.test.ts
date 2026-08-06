/** @jest-environment node */

import {
  parseAffiliateMappingClaimOutput,
  parseAffiliateMapperLoopIntervalSeconds,
  runAffiliateIntakeCodexLoop,
} from '../affiliateIntakeCodexLoop';

describe('affiliate intake Codex mapper loop', () => {
  it('waits without launching Codex when the atomic claim is empty', async () => {
    const claim = jest.fn()
      .mockResolvedValueOnce({ claimed: false })
      .mockResolvedValueOnce({
        claimed: true,
        jobId: 'job_1',
        intakeId: 'intake_1',
        sourceKey: 'river-city',
        workerId: 'worker-1',
      });
    const runGoal = jest.fn().mockResolvedValue(undefined);
    const sleep = jest.fn().mockResolvedValue(undefined);

    await expect(runAffiliateIntakeCodexLoop(
      { intervalSeconds: 10, maxCycles: 2 },
      { claim, runGoal, sleep },
    )).resolves.toEqual({ cycles: 2, goalsStarted: 1 });

    expect(sleep).toHaveBeenCalledWith(10_000);
    expect(runGoal).toHaveBeenCalledTimes(1);
    expect(runGoal).toHaveBeenCalledWith(expect.objectContaining({ jobId: 'job_1' }));
  });

  it('parses only the atomic claim result and bounds the retry interval', () => {
    expect(parseAffiliateMappingClaimOutput('{"claimed":false}')).toEqual({ claimed: false });
    expect(parseAffiliateMappingClaimOutput(JSON.stringify({
      claimed: true,
      jobId: 'job_1',
      intakeId: 'intake_1',
      sourceKey: 'source-1',
      workerId: 'worker-1',
      resumed: true,
    }))).toEqual(expect.objectContaining({ claimed: true, resumed: true }));
    expect(parseAffiliateMapperLoopIntervalSeconds('5')).toBe(300);
    expect(parseAffiliateMapperLoopIntervalSeconds('60')).toBe(60);
    expect(() => parseAffiliateMappingClaimOutput('{"claimed":true}')).toThrow('missing jobId');
  });

  it('reconciles pending queue work before treating a failed claim as idle', async () => {
    const claim = jest.fn()
      .mockResolvedValueOnce({ claimed: false })
      .mockResolvedValueOnce({
        claimed: true,
        jobId: 'job_orphan',
        intakeId: 'intake_orphan',
        sourceKey: 'orphan-source',
        workerId: 'worker-1',
      });
    const reconcile = jest.fn().mockResolvedValue({
      claim: {
        claimed: true,
        jobId: 'job_orphan',
        intakeId: 'intake_orphan',
        sourceKey: 'orphan-source',
        workerId: 'worker-1',
      },
      hasPendingWork: false,
    });
    const runGoal = jest.fn().mockResolvedValue(undefined);
    const sleep = jest.fn().mockResolvedValue(undefined);

    await expect(runAffiliateIntakeCodexLoop(
      { intervalSeconds: 10, maxCycles: 1 },
      { claim, reconcile, runGoal, sleep },
    )).resolves.toEqual({ cycles: 1, goalsStarted: 1 });

    expect(reconcile).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
    expect(runGoal).toHaveBeenCalledWith(expect.objectContaining({ jobId: 'job_orphan' }));
  });

  it('keeps retrying while capture or orphan work remains pending', async () => {
    const claim = jest.fn().mockResolvedValue({ claimed: false });
    const reconcile = jest.fn().mockResolvedValue({ claim: null, hasPendingWork: true });
    const runGoal = jest.fn().mockResolvedValue(undefined);
    const sleep = jest.fn().mockResolvedValue(undefined);
    const onIdle = jest.fn();
    const onPendingWork = jest.fn();

    await expect(runAffiliateIntakeCodexLoop(
      { intervalSeconds: 10, maxCycles: 1 },
      { claim, reconcile, runGoal, sleep, onIdle, onPendingWork },
    )).resolves.toEqual({ cycles: 1, goalsStarted: 0 });

    expect(onPendingWork).toHaveBeenCalledWith(10);
    expect(onIdle).not.toHaveBeenCalled();
    expect(sleep).toHaveBeenCalledWith(10_000);
    expect(runGoal).not.toHaveBeenCalled();
  });
});
