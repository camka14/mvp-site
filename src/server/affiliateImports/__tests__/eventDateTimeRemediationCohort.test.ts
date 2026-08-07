/** @jest-environment node */

import {
  AFFILIATE_EVENT_DATETIME_REMEDIATION_ENQUEUED_STATUS,
  applyAffiliateEventDateTimeRemediationCohort,
  previewAffiliateEventDateTimeRemediationCohort,
} from '../eventDateTimeRemediationCohort';
import type { AffiliateEventDateTimeRemediationQueueState } from '../eventDateTimeRemediationCohort';

const NOW = new Date('2026-08-06T20:00:00.000Z');
const CUTOFF = new Date('2026-08-01T00:00:00.000Z');

const clearQueue: AffiliateEventDateTimeRemediationQueueState = {
  mappingQueue: {
    schemaVersion: 2,
    evaluatedAt: NOW.toISOString(),
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
  },
  approvalQueue: {
    schemaVersion: 1,
    evaluatedAt: NOW.toISOString(),
    complete: true,
    claimableJobs: 0,
    queuedJobs: 0,
    expiredLeases: 0,
    activeLeases: 0,
    claimedWithoutLease: 0,
    statusCounts: {},
    subjectTypeCounts: {},
  },
  blockers: [],
};

const makeClient = (options: { includeCustomExtractor?: boolean } = {}) => {
  const sources: any[] = [
    {
      id: 'source_event',
      sourceKey: 'event-source',
      status: 'ACTIVE',
      targetKind: 'CLUB',
      activeMappingId: 'mapping_event',
    },
    {
      id: 'source_no_evidence',
      sourceKey: 'event-without-evidence',
      status: 'ACTIVE',
      targetKind: 'CLUB',
      activeMappingId: 'mapping_no_evidence',
    },
    {
      id: 'source_club',
      sourceKey: 'club-source',
      status: 'ACTIVE',
      targetKind: 'CLUB',
      activeMappingId: 'mapping_club',
    },
  ];
  const mappings: any[] = [
    {
      id: 'mapping_event',
      sourceId: 'source_event',
      createdAt: new Date('2026-07-20T00:00:00.000Z'),
      version: 2,
      isActive: true,
      mapping: { kind: 'EVENT', manualCandidates: [] },
    },
    {
      id: 'mapping_no_evidence',
      sourceId: 'source_no_evidence',
      createdAt: new Date('2026-07-20T00:00:00.000Z'),
      version: 1,
      isActive: true,
      mapping: { kind: 'EVENT', manualCandidates: [] },
    },
    {
      id: 'mapping_club',
      sourceId: 'source_club',
      createdAt: new Date('2026-07-20T00:00:00.000Z'),
      version: 1,
      isActive: true,
      mapping: { kind: 'CLUB', manualCandidates: [] },
    },
  ];
  const intakes: any[] = [
    {
      id: 'intake_event',
      sourceKey: 'event-source',
      affiliateSourceId: 'source_event',
      status: 'PROMOTED',
      targetKindHints: [],
      lastRunId: 'run_event',
    },
    {
      id: 'intake_no_evidence',
      sourceKey: 'event-without-evidence',
      affiliateSourceId: 'source_no_evidence',
      status: 'PROMOTED',
      targetKindHints: [],
      lastRunId: null,
    },
    {
      id: 'intake_club',
      sourceKey: 'club-source',
      affiliateSourceId: 'source_club',
      status: 'PROMOTED',
      targetKindHints: [],
      lastRunId: 'run_club',
    },
  ];
  const mappingJobs: any[] = [
    {
      id: 'job_event',
      intakeId: 'intake_event',
      status: 'APPROVED',
      createdAt: new Date('2026-07-21T00:00:00.000Z'),
      claimedAt: null,
      leaseExpiresAt: null,
      workerId: null,
      branch: 'producer/old',
      commit: 'old-commit',
      resultSummary: { mappingRepairHistory: [{ repairReason: 'OLD_REPAIR' }] },
      errorMessage: null,
      finishedAt: new Date('2026-07-22T00:00:00.000Z'),
    },
    {
      id: 'job_no_evidence',
      intakeId: 'intake_no_evidence',
      status: 'APPROVED',
      createdAt: new Date('2026-07-21T00:00:00.000Z'),
      claimedAt: null,
      leaseExpiresAt: null,
      resultSummary: {},
    },
    {
      id: 'job_club',
      intakeId: 'intake_club',
      status: 'APPROVED',
      createdAt: new Date('2026-07-21T00:00:00.000Z'),
      claimedAt: null,
      leaseExpiresAt: null,
      resultSummary: {},
    },
  ];
  const approvals: any[] = [
    {
      id: 'approval_event',
      subjectType: 'MAPPING_PACKAGE',
      subjectKey: 'job_event',
      status: 'APPROVED',
      claimedAt: null,
      leaseExpiresAt: null,
      decision: { decision: 'APPROVE' },
    },
    {
      id: 'approval_no_evidence',
      subjectType: 'MAPPING_PACKAGE',
      subjectKey: 'job_no_evidence',
      status: 'APPROVED',
      claimedAt: null,
      leaseExpiresAt: null,
      decision: { decision: 'APPROVE' },
    },
    {
      id: 'approval_club',
      subjectType: 'MAPPING_PACKAGE',
      subjectKey: 'job_club',
      status: 'APPROVED',
      claimedAt: null,
      leaseExpiresAt: null,
      decision: { decision: 'APPROVE' },
    },
  ];
  const candidates: any[] = [
    {
      sourceId: 'source_event',
      runId: 'run_event',
      mappingId: 'mapping_event',
      listingKind: 'EVENT',
      dateDisplayMode: 'SCHEDULED',
      startsAt: new Date(),
      status: 'DISCOVERED',
    },
    {
      sourceId: 'source_event',
      runId: 'run_event',
      mappingId: 'mapping_event',
      listingKind: 'EVENT',
      dateDisplayMode: 'DATE_ONLY',
      startsAt: new Date(),
      status: 'DISCOVERED',
    },
    {
      sourceId: 'source_event',
      runId: 'run_event',
      mappingId: 'mapping_event',
      listingKind: 'EVENT',
      dateDisplayMode: 'NO_FIXED_DATE',
      startsAt: new Date(),
      status: 'DISCOVERED',
    },
    {
      sourceId: 'source_event',
      runId: 'run_event',
      mappingId: 'mapping_event',
      listingKind: 'EVENT',
      dateDisplayMode: 'ONGOING',
      startsAt: new Date(),
      status: 'DISCOVERED',
    },
    {
      sourceId: 'source_event',
      runId: 'run_old_event',
      mappingId: 'mapping_event_old',
      listingKind: 'EVENT',
      dateDisplayMode: 'SCHEDULED',
      startsAt: new Date(),
      status: 'PUBLISHED',
    },
  ];
  const runs: any[] = [
    {
      id: 'run_event',
      sourceId: 'source_event',
      mappingId: 'mapping_event',
      intakeId: 'intake_event',
      status: 'SUCCEEDED',
      createdAt: new Date('2026-07-25T00:00:00.000Z'),
      finishedAt: new Date('2026-07-25T01:00:00.000Z'),
    },
    {
      id: 'run_old_event',
      sourceId: 'source_event',
      mappingId: 'mapping_event_old',
      intakeId: 'intake_event',
      status: 'SUCCEEDED',
      createdAt: new Date('2026-06-25T00:00:00.000Z'),
      finishedAt: new Date('2026-06-25T01:00:00.000Z'),
    },
    {
      id: 'run_no_evidence',
      sourceId: 'source_no_evidence',
      mappingId: 'mapping_no_evidence',
      intakeId: 'intake_no_evidence',
      status: 'FAILED',
      createdAt: new Date('2026-07-25T00:00:00.000Z'),
      finishedAt: new Date('2026-07-25T01:00:00.000Z'),
    },
  ];
  const pages: any[] = [
    { id: 'page_event', intakeId: 'intake_event' },
    { id: 'page_failed', intakeId: 'intake_no_evidence' },
  ];
  const artifacts: any[] = [
    {
      id: 'artifact_event',
      intakeId: 'intake_event',
      runId: 'run_event',
      kind: 'PAGE_HTML',
      fileId: 'file_event',
    },
    {
      id: 'artifact_failed_policy',
      intakeId: 'intake_no_evidence',
      runId: 'run_no_evidence',
      kind: 'POLICY_NOTE',
      fileId: 'file_policy',
    },
  ];
  const files: any[] = [{ id: 'file_event' }, { id: 'file_policy' }];
  if (options.includeCustomExtractor) {
    sources.push({
      id: 'source_custom',
      sourceKey: 'custom-event-source',
      status: 'ACTIVE',
      targetKind: 'CLUB',
      activeMappingId: 'mapping_custom',
      metadata: {
        customExtractorRegistry: {
          path: 'src/server/affiliateImports/customEventExtractor.ts',
          targetKind: 'EVENT',
        },
      },
    });
    mappings.push({
      id: 'mapping_custom',
      sourceId: 'source_custom',
      createdAt: new Date('2026-07-20T00:00:00.000Z'),
      version: 1,
      isActive: true,
      mapping: { kind: 'CLUB' },
    });
    intakes.push({
      id: 'intake_custom',
      sourceKey: 'custom-event-source',
      affiliateSourceId: 'source_custom',
      status: 'PROMOTED',
      targetKindHints: [],
      lastRunId: 'run_custom',
    });
    mappingJobs.push({
      id: 'job_custom',
      intakeId: 'intake_custom',
      status: 'APPROVED',
      createdAt: new Date('2026-07-21T00:00:00.000Z'),
      claimedAt: null,
      leaseExpiresAt: null,
      resultSummary: {},
    });
    approvals.push({
      id: 'approval_custom',
      subjectType: 'MAPPING_PACKAGE',
      subjectKey: 'job_custom',
      status: 'APPROVED',
      claimedAt: null,
      leaseExpiresAt: null,
      decision: { decision: 'APPROVE' },
    });
    runs.push({
      id: 'run_custom',
      sourceId: 'source_custom',
      mappingId: 'mapping_custom',
      intakeId: 'intake_custom',
      status: 'SUCCEEDED',
      createdAt: new Date('2026-07-25T00:00:00.000Z'),
      finishedAt: new Date('2026-07-25T01:00:00.000Z'),
    });
    artifacts.push({
      id: 'artifact_custom',
      intakeId: 'intake_custom',
      runId: 'run_custom',
      kind: 'PAGE_MARKDOWN',
      fileId: 'file_custom',
    });
    files.push({ id: 'file_custom' });
  }
  const controls: any[] = [];
  let failApprovalUpdate = false;
  const allApprovals = () => [...approvals, ...controls];
  const findApproval = (where: any) => {
    if (where.id) return allApprovals().find((row) => row.id === where.id) ?? null;
    const compound = where.subjectType_subjectKey;
    return allApprovals().find((row) => (
      row.subjectType === compound.subjectType && row.subjectKey === compound.subjectKey
    )) ?? null;
  };
  const matches = (row: any, where: any = {}) => Object.entries(where).every(([key, value]) => {
    if (value && typeof value === 'object' && 'in' in value) return value.in.includes(row[key]);
    return row[key] === value;
  });
  const client: any = {
    $transaction: jest.fn(async (callback: (transaction: any) => Promise<unknown>) => {
      const snapshots = {
        mappingJobs: structuredClone(mappingJobs),
        intakes: structuredClone(intakes),
        approvals: structuredClone(approvals),
        controls: structuredClone(controls),
      };
      try {
        return await callback(client);
      } catch (error) {
        mappingJobs.splice(0, mappingJobs.length, ...snapshots.mappingJobs);
        intakes.splice(0, intakes.length, ...snapshots.intakes);
        approvals.splice(0, approvals.length, ...snapshots.approvals);
        controls.splice(0, controls.length, ...snapshots.controls);
        throw error;
      }
    }),
    affiliateScrapeSources: { findMany: jest.fn(async () => sources) },
    affiliateScrapeMappings: { findMany: jest.fn(async () => mappings) },
    affiliateScrapeRuns: { findMany: jest.fn(async () => runs) },
    affiliateSourceIntakes: {
      findMany: jest.fn(async () => intakes),
      findUnique: jest.fn(async ({ where }: any) => intakes.find((row) => row.id === where.id) ?? null),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const row = intakes.find((candidate) => matches(candidate, where));
        if (!row) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      }),
    },
    affiliateSourceMappingJobs: {
      findMany: jest.fn(async ({ where }: any = {}) => mappingJobs.filter((row) => (
        (!where.createdAt || row.createdAt <= where.createdAt.lte)
      ))),
      findUnique: jest.fn(async ({ where }: any) => mappingJobs.find((row) => row.id === where.id) ?? null),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const row = mappingJobs.find((candidate) => matches(candidate, where));
        if (!row) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      }),
    },
    affiliateApprovalJobs: {
      findMany: jest.fn(async ({ where }: any = {}) => allApprovals().filter((row) => (
        !where.subjectType || row.subjectType === where.subjectType
      ))),
      findUnique: jest.fn(async ({ where }: any) => findApproval(where)),
      create: jest.fn(async ({ data }: any) => {
        const row = { ...data };
        controls.push(row);
        return row;
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        if (failApprovalUpdate) throw new Error('simulated approval update failure');
        const row = allApprovals().find((candidate) => matches(candidate, where));
        if (!row) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const row = findApproval(where);
        if (!row) throw new Error('approval not found');
        Object.assign(row, data);
        return row;
      }),
    },
    affiliateImportCandidates: { findMany: jest.fn(async () => candidates) },
    affiliateSourceIntakePages: { findMany: jest.fn(async () => pages) },
    affiliateSourceIntakeArtifacts: { findMany: jest.fn(async () => artifacts) },
    file: { findMany: jest.fn(async () => files) },
  };
  return {
    client,
    sources,
    mappings,
    intakes,
    mappingJobs,
    approvals,
    controls,
    runs,
    files,
    setFailApprovalUpdate: (value: boolean) => { failApprovalUpdate = value; },
  };
};

const queueLoader = (queue: AffiliateEventDateTimeRemediationQueueState = clearQueue) => (
  jest.fn(async () => queue)
);

describe('affiliate event datetime remediation cohort', () => {
  it('inventories event-producing mappings beyond source targetKind and counts every display mode', async () => {
    const state = makeClient();
    const result = await previewAffiliateEventDateTimeRemediationCohort({
      cohortKey: 'event-datetime-v1',
      mappingCutoff: CUTOFF,
      now: NOW,
    }, { client: state.client, loadQueueState: queueLoader() });

    expect(result).toEqual(expect.objectContaining({ eligibleCount: 1, excludedCount: 2 }));
    expect(result.modeCounts).toEqual(expect.objectContaining({
      SCHEDULED: 1,
      DATE_ONLY: 1,
      NO_FIXED_DATE: 1,
      ONGOING: 1,
    }));
    expect(result.packages.find((row) => row.sourceId === 'source_event')).toEqual(expect.objectContaining({
      eligible: true,
      targetSignals: expect.arrayContaining(['ACTIVE_MAPPING_KIND']),
      evergreenCandidateCount: 2,
    }));
    expect(result.packages.find((row) => row.sourceId === 'source_no_evidence')?.exclusionReasons)
      .toContain('MISSING_SUCCESSFUL_PAGE_EVIDENCE');
    expect(result.packages.find((row) => row.sourceId === 'source_club')?.exclusionReasons)
      .toContain('NOT_EVENT_PRODUCING');
  });

  it('includes an event-capable custom extractor registry signal', async () => {
    const state = makeClient({ includeCustomExtractor: true });
    const result = await previewAffiliateEventDateTimeRemediationCohort({
      cohortKey: 'event-datetime-v1',
      mappingCutoff: CUTOFF,
      now: NOW,
    }, { client: state.client, loadQueueState: queueLoader() });

    expect(result.eligibleCount).toBe(2);
    expect(result.packages.find((row) => row.sourceId === 'source_custom')).toEqual(expect.objectContaining({
      eligible: true,
      targetSignals: expect.arrayContaining(['CUSTOM_EXTRACTOR_REGISTRY']),
    }));
  });

  it('reports queue blockers without writing during preview', async () => {
    const state = makeClient();
    const queue = queueLoader({
      ...clearQueue,
      blockers: ['MAPPING_CLAIMABLE_JOBS', 'APPROVAL_ACTIVE_LEASES'],
    });
    const result = await previewAffiliateEventDateTimeRemediationCohort({
      cohortKey: 'event-datetime-v1',
      mappingCutoff: CUTOFF,
      now: NOW,
    }, { client: state.client, loadQueueState: queue });

    expect(result.queue.blockers).toEqual(['MAPPING_CLAIMABLE_JOBS', 'APPROVAL_ACTIVE_LEASES']);
    expect(state.controls).toHaveLength(0);
    expect(state.client.$transaction).not.toHaveBeenCalled();
  });

  it('aborts apply when the reviewed counts changed', async () => {
    const state = makeClient();
    await expect(applyAffiliateEventDateTimeRemediationCohort({
      cohortKey: 'event-datetime-v1',
      mappingCutoff: CUTOFF,
      expectedEligibleCount: 2,
      expectedExcludedCount: 1,
      expectedEligibleMappingJobIds: ['job_other'],
      operatorIdentity: 'operator@example.test',
      now: NOW,
    }, { client: state.client, loadQueueState: queueLoader() })).rejects.toThrow('counts changed');
    expect(state.controls).toHaveLength(0);
    expect(state.mappingJobs[0].status).toBe('APPROVED');
  });

  it('aborts apply when the previewed eligible mapping job IDs changed', async () => {
    const state = makeClient();
    await expect(applyAffiliateEventDateTimeRemediationCohort({
      cohortKey: 'event-datetime-v1',
      mappingCutoff: CUTOFF,
      expectedEligibleCount: 1,
      expectedExcludedCount: 2,
      expectedEligibleMappingJobIds: ['job_other'],
      operatorIdentity: 'operator@example.test',
      now: NOW,
    }, { client: state.client, loadQueueState: queueLoader() })).rejects.toThrow('mapping job IDs changed');
    expect(state.controls).toHaveLength(0);
    expect(state.mappingJobs[0].status).toBe('APPROVED');
  });

  it('enqueues the approved producer package once and preserves repair history', async () => {
    const state = makeClient();
    const result = await applyAffiliateEventDateTimeRemediationCohort({
      cohortKey: 'event-datetime-v1',
      mappingCutoff: CUTOFF,
      expectedEligibleCount: 1,
      expectedExcludedCount: 2,
      expectedEligibleMappingJobIds: ['job_event'],
      operatorIdentity: 'operator@example.test',
      now: NOW,
    }, { client: state.client, loadQueueState: queueLoader() });

    expect(result).toEqual(expect.objectContaining({ state: 'ENQUEUED', eligibleCount: 1 }));
    expect(state.mappingJobs[0]).toEqual(expect.objectContaining({
      status: 'QUEUED',
      branch: null,
      commit: null,
      errorMessage: null,
      finishedAt: null,
      resultSummary: expect.objectContaining({
        mappingFullReviewHistory: [expect.objectContaining({
          cohortKey: 'event-datetime-v1',
          repairHistoryStartIndex: 1,
        })],
        mappingRepairHistory: [
          { repairReason: 'OLD_REPAIR' },
          expect.objectContaining({ repairReason: 'EVENT_DATETIME_REVIEW_REQUIRED' }),
        ],
      }),
    }));
    expect(state.intakes[0].status).toBe('READY_FOR_MAPPING');
    expect(state.approvals[0]).toEqual(expect.objectContaining({
      status: 'DEFERRED',
      decision: expect.objectContaining({
        decision: 'DEFER',
        nextAction: 'PRODUCER_REPAIR',
      }),
    }));
    expect(state.controls[0]).toEqual(expect.objectContaining({
      status: AFFILIATE_EVENT_DATETIME_REMEDIATION_ENQUEUED_STATUS,
      decision: expect.objectContaining({
        targetKind: 'EVENT',
        finalEnqueueCount: 1,
      }),
    }));

    const repeated = await applyAffiliateEventDateTimeRemediationCohort({
      cohortKey: 'event-datetime-v1',
      mappingCutoff: CUTOFF,
      expectedEligibleCount: 999,
      expectedExcludedCount: 999,
      expectedEligibleMappingJobIds: ['job_other'],
      operatorIdentity: 'another-operator@example.test',
      now: new Date('2026-08-07T20:00:00.000Z'),
    }, { client: state.client, loadQueueState: queueLoader() });
    expect(repeated.state).toBe('ALREADY_ENQUEUED');
    expect(state.controls).toHaveLength(1);
    expect(state.client.affiliateSourceMappingJobs.updateMany).toHaveBeenCalledTimes(1);
  });

  it('rolls back all cohort writes when a later row update fails', async () => {
    const state = makeClient();
    state.setFailApprovalUpdate(true);

    await expect(applyAffiliateEventDateTimeRemediationCohort({
      cohortKey: 'event-datetime-v1',
      mappingCutoff: CUTOFF,
      expectedEligibleCount: 1,
      expectedExcludedCount: 2,
      expectedEligibleMappingJobIds: ['job_event'],
      operatorIdentity: 'operator@example.test',
      now: NOW,
    }, { client: state.client, loadQueueState: queueLoader() })).rejects.toThrow(
      'simulated approval update failure',
    );

    expect(state.mappingJobs[0].status).toBe('APPROVED');
    expect(state.intakes[0].status).toBe('PROMOTED');
    expect(state.approvals[0].status).toBe('APPROVED');
    expect(state.controls).toHaveLength(0);
  });
});
