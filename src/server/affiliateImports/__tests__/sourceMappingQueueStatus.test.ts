/** @jest-environment node */

import { summarizeAffiliateMappingQueue } from '../sourceMappingQueueStatus';

describe('affiliate mapping queue status', () => {
  const now = new Date('2026-07-30T20:00:00.000Z');

  it('separates claimable work, active leases, terminal jobs, and ready orphan intakes', () => {
    const status = summarizeAffiliateMappingQueue({
      intakes: [
        { id: 'queued-intake', status: 'READY_FOR_MAPPING', complianceStatus: 'ALLOWED' },
        { id: 'expired-intake', status: 'MAPPING_IN_PROGRESS', complianceStatus: 'ALLOWED' },
        { id: 'active-intake', status: 'MAPPING_IN_PROGRESS', complianceStatus: 'ALLOWED' },
        { id: 'orphan-ready', status: 'READY_FOR_MAPPING', complianceStatus: 'ALLOWED' },
        { id: 'review-intake', status: 'REVIEW_REQUIRED', complianceStatus: 'NEEDS_REVIEW' },
        { id: 'failed-intake', status: 'FAILED', complianceStatus: 'ALLOWED' },
      ],
      captureRuns: [],
      jobs: [
        { id: 'queued', intakeId: 'queued-intake', status: 'QUEUED', leaseExpiresAt: null },
        {
          id: 'expired',
          intakeId: 'expired-intake',
          status: 'CLAIMED',
          leaseExpiresAt: new Date('2026-07-30T19:59:59.000Z'),
        },
        {
          id: 'active',
          intakeId: 'active-intake',
          status: 'CLAIMED',
          leaseExpiresAt: new Date('2026-07-30T20:00:00.000Z'),
        },
        {
          id: 'review',
          intakeId: 'review-intake',
          status: 'REVIEW_REQUIRED',
          leaseExpiresAt: null,
        },
        { id: 'failed', intakeId: 'failed-intake', status: 'FAILED', leaseExpiresAt: null },
      ],
    }, now);

    expect(status).toEqual(expect.objectContaining({
      complete: false,
      claimableJobs: 2,
      queuedJobs: 1,
      expiredLeases: 1,
      activeLeases: 1,
      eligibleReadyIntakesWithoutJob: 1,
      readyIntakeIdsWithoutJob: ['orphan-ready'],
      reviewRequiredJobs: 1,
      failedJobs: 1,
    }));
    expect(status.intakeStatusCounts).toEqual({
      FAILED: 1,
      MAPPING_IN_PROGRESS: 2,
      READY_FOR_MAPPING: 2,
      REVIEW_REQUIRED: 1,
    });
  });

  it('reports exhaustion even when historical failed and reviewed work remains', () => {
    const status = summarizeAffiliateMappingQueue({
      intakes: [
        { id: 'review-intake', status: 'REVIEW_REQUIRED', complianceStatus: 'NEEDS_REVIEW' },
        { id: 'failed-intake', status: 'FAILED', complianceStatus: 'ALLOWED' },
      ],
      captureRuns: [],
      jobs: [
        {
          id: 'review',
          intakeId: 'review-intake',
          status: 'REVIEW_REQUIRED',
          leaseExpiresAt: null,
        },
        { id: 'failed', intakeId: 'failed-intake', status: 'FAILED', leaseExpiresAt: null },
      ],
    }, now);

    expect(status.complete).toBe(true);
    expect(status.claimableJobs).toBe(0);
    expect(status.eligibleReadyIntakesWithoutJob).toBe(0);
    expect(status.reviewRequiredJobs).toBe(1);
    expect(status.failedJobs).toBe(1);
  });

  it('surfaces malformed claimed jobs without pretending they are claimable', () => {
    const status = summarizeAffiliateMappingQueue({
      intakes: [{ id: 'stuck-intake', status: 'MAPPING_IN_PROGRESS', complianceStatus: 'ALLOWED' }],
      jobs: [{
        id: 'stuck',
        intakeId: 'stuck-intake',
        status: 'CLAIMED',
        leaseExpiresAt: null,
      }],
      captureRuns: [],
    }, now);

    expect(status.claimedWithoutLease).toBe(1);
    expect(status.claimableJobs).toBe(0);
    expect(status.complete).toBe(false);
  });

  it('waits for allowed capture work but ignores historical or policy-blocked runs', () => {
    const active = summarizeAffiliateMappingQueue({
      intakes: [
        { id: 'allowed', status: 'READY', complianceStatus: 'ALLOWED' },
        { id: 'blocked', status: 'BLOCKED', complianceStatus: 'BLOCKED' },
      ],
      jobs: [{
        id: 'expanded',
        intakeId: 'blocked',
        status: 'EXPANDED',
        leaseExpiresAt: null,
      }],
      captureRuns: [
        { id: 'queued', intakeId: 'allowed', status: 'QUEUED' },
        { id: 'blocked-running', intakeId: 'blocked', status: 'RUNNING' },
        { id: 'historical', intakeId: 'allowed', status: 'SUCCEEDED' },
      ],
    }, now);

    expect(active).toEqual(expect.objectContaining({
      complete: false,
      queuedCaptureRuns: 1,
      runningCaptureRuns: 0,
      activeCaptureRuns: 1,
      expandedJobs: 1,
    }));

    expect(summarizeAffiliateMappingQueue({
      intakes: [{ id: 'allowed', status: 'READY', complianceStatus: 'ALLOWED' }],
      jobs: [],
      captureRuns: [{ id: 'historical', intakeId: 'allowed', status: 'SUCCEEDED' }],
    }, now).complete).toBe(true);
  });
});
