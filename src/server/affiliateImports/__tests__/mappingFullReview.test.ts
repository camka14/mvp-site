/** @jest-environment node */

import type { AffiliateApprovalQueueStatus } from '../approvalQueue';
import {
  advanceAffiliateMappingFullReviewCohort,
  AFFILIATE_MAPPING_FULL_REVIEW_ENQUEUED_STATUS,
  AFFILIATE_MAPPING_FULL_REVIEW_WAITING_STATUS,
} from '../mappingFullReview';
import type { AffiliateMappingQueueStatus } from '../sourceMappingQueueStatus';

const approvalStatus = (complete: boolean): AffiliateApprovalQueueStatus => ({
  schemaVersion: 1,
  evaluatedAt: '2026-08-02T03:00:00.000Z',
  complete,
  claimableJobs: complete ? 0 : 1,
  queuedJobs: complete ? 0 : 1,
  expiredLeases: 0,
  activeLeases: 0,
  claimedWithoutLease: 0,
  statusCounts: {},
  subjectTypeCounts: {},
});

const mappingStatus = (overrides: Partial<AffiliateMappingQueueStatus> = {}): AffiliateMappingQueueStatus => ({
  schemaVersion: 2,
  evaluatedAt: '2026-08-02T03:00:00.000Z',
  complete: true,
  claimableJobs: 0,
  queuedJobs: 0,
  expiredLeases: 0,
  activeLeases: 0,
  claimedWithoutLease: 0,
  eligibleReadyIntakesWithoutJob: 0,
  readyIntakeIdsWithoutJob: [],
  reviewRequiredJobs: 0,
  humanReviewRequiredJobs: 0,
  failedJobs: 0,
  expandedJobs: 0,
  queuedCaptureRuns: 0,
  runningCaptureRuns: 0,
  activeCaptureRuns: 0,
  intakeStatusCounts: {},
  jobStatusCounts: {},
  ...overrides,
});

const testClient = () => {
  const controls: any[] = [];
  const mappings: any[] = [{
    id: 'mapping_1',
    status: 'APPROVED',
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    resultSummary: { mappingRepairHistory: [{ repairReason: 'OLD_DEFECT' }] },
  }];
  const approvals: any[] = [{
    id: 'approval_1',
    subjectType: 'MAPPING_PACKAGE',
    subjectKey: 'mapping_1',
    status: 'APPROVED',
    decision: { decision: 'APPROVE' },
  }];
  const allApprovals = () => [...controls, ...approvals];
  const findApproval = (where: any) => {
    if (where.id) return allApprovals().find((row) => row.id === where.id) ?? null;
    const compound = where.subjectType_subjectKey;
    return allApprovals().find((row) => (
      row.subjectType === compound.subjectType && row.subjectKey === compound.subjectKey
    )) ?? null;
  };
  const client: any = {
    $transaction: jest.fn(async (callback: (transaction: any) => Promise<unknown>) => callback(client)),
    affiliateApprovalJobs: {
      findUnique: jest.fn(async ({ where }: any) => findApproval(where)),
      create: jest.fn(async ({ data }: any) => {
        const row = { ...data, finishedAt: null };
        controls.push(row);
        return row;
      }),
      findMany: jest.fn(async ({ where }: any) => allApprovals().filter((row) => (
        row.subjectType === where.subjectType && where.subjectKey.in.includes(row.subjectKey)
      ))),
      update: jest.fn(async ({ where, data }: any) => {
        const row = findApproval(where);
        Object.assign(row, data);
        return row;
      }),
    },
    affiliateSourceMappingJobs: {
      findMany: jest.fn(async ({ where }: any) => mappings.filter((row) => (
        row.status === where.status && row.createdAt <= where.createdAt.lte
      ))),
      update: jest.fn(async ({ where, data }: any) => {
        const row = mappings.find((candidate) => candidate.id === where.id);
        Object.assign(row, data);
        return row;
      }),
    },
  };
  return { client, controls, mappings, approvals };
};

describe('affiliate mapping full-review cohort', () => {
  it('arms once, waits behind current approvals, then enqueues approved mappings once', async () => {
    const state = testClient();
    const loadMappingStatus = jest.fn(async () => mappingStatus());
    const now = new Date('2026-08-02T03:30:00.000Z');

    const waiting = await advanceAffiliateMappingFullReviewCohort({
      cohortKey: 'description-quality-v1',
      approvalQueue: approvalStatus(false),
      now,
    }, { client: state.client, loadMappingStatus });
    expect(waiting).toEqual(expect.objectContaining({
      state: 'WAITING',
      blockers: ['APPROVAL_QUEUE_ACTIVE'],
    }));
    expect(state.controls[0].status).toBe(AFFILIATE_MAPPING_FULL_REVIEW_WAITING_STATUS);
    expect(state.mappings[0].status).toBe('APPROVED');

    const enqueued = await advanceAffiliateMappingFullReviewCohort({
      cohortKey: 'description-quality-v1',
      approvalQueue: approvalStatus(true),
      now: new Date('2026-08-02T04:00:00.000Z'),
    }, { client: state.client, loadMappingStatus });
    expect(enqueued).toEqual(expect.objectContaining({ state: 'ENQUEUED', enqueuedMappingCount: 1 }));
    expect(state.controls[0].status).toBe(AFFILIATE_MAPPING_FULL_REVIEW_ENQUEUED_STATUS);
    expect(state.mappings[0]).toEqual(expect.objectContaining({
      status: 'REVIEW_REQUIRED',
      resultSummary: expect.objectContaining({
        mappingFullReviewHistory: [expect.objectContaining({
          cohortKey: 'description-quality-v1',
          repairHistoryStartIndex: 1,
        })],
      }),
    }));
    expect(state.approvals[0]).toEqual(expect.objectContaining({ status: 'QUEUED', decision: null }));

    const repeated = await advanceAffiliateMappingFullReviewCohort({
      cohortKey: 'description-quality-v1',
      approvalQueue: approvalStatus(true),
    }, { client: state.client, loadMappingStatus });
    expect(repeated).toEqual(expect.objectContaining({
      state: 'ALREADY_ENQUEUED',
      enqueuedMappingCount: 1,
    }));
  });

  it('waits for active producer leases and pending first-pass mapping reviews', async () => {
    const state = testClient();
    const result = await advanceAffiliateMappingFullReviewCohort({
      cohortKey: 'description-quality-v1',
      approvalQueue: approvalStatus(true),
    }, {
      client: state.client,
      loadMappingStatus: async () => mappingStatus({ activeLeases: 1, reviewRequiredJobs: 2 }),
    });
    expect(result).toEqual(expect.objectContaining({
      state: 'WAITING',
      blockers: ['ACTIVE_MAPPING_LEASE', 'MAPPING_REVIEWS_PENDING'],
    }));
    expect(state.mappings[0].status).toBe('APPROVED');
  });

  it('creates queued review work for approved historical mappings with no approval row', async () => {
    const state = testClient();
    state.mappings.push({
      id: 'mapping_without_approval',
      status: 'APPROVED',
      createdAt: new Date('2026-08-01T01:00:00.000Z'),
      resultSummary: {},
    });

    const result = await advanceAffiliateMappingFullReviewCohort({
      cohortKey: 'description-quality-v1',
      approvalQueue: approvalStatus(true),
      now: new Date('2026-08-02T04:00:00.000Z'),
    }, { client: state.client, loadMappingStatus: async () => mappingStatus() });

    expect(result).toEqual(expect.objectContaining({
      state: 'ENQUEUED',
      enqueuedMappingCount: 2,
    }));
    const createdApproval = state.controls.find((row) => (
      row.subjectType === 'MAPPING_PACKAGE'
      && row.subjectKey === 'mapping_without_approval'
    ));
    expect(createdApproval).toEqual(expect.objectContaining({ status: 'QUEUED' }));
    expect(state.mappings[1]).toEqual(expect.objectContaining({
      status: 'REVIEW_REQUIRED',
      resultSummary: expect.objectContaining({
        mappingFullReviewHistory: [expect.objectContaining({
          priorApprovalJobId: createdApproval.id,
          priorApprovalStatus: 'MISSING',
          priorDecision: null,
          approvalRowCreatedForCohort: true,
        })],
      }),
    }));
  });
});
