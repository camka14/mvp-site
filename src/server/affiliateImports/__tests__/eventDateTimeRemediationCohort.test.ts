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
    {
      id: 'mapping_club_old_event',
      sourceId: 'source_club',
      createdAt: new Date('2026-06-20T00:00:00.000Z'),
      version: 0,
      isActive: false,
      mapping: { kind: 'EVENT', manualCandidates: [] },
    },
  ];
  const intakes: any[] = [
    {
      id: 'intake_event',
      sourceKey: 'event-source',
      affiliateSourceId: 'source_event',
      status: 'PROMOTED',
      complianceStatus: 'ALLOWED',
      targetKindHints: [],
      lastRunId: 'capture_event',
    },
    {
      id: 'intake_no_evidence',
      sourceKey: 'event-without-evidence',
      affiliateSourceId: 'source_no_evidence',
      status: 'PROMOTED',
      complianceStatus: 'ALLOWED',
      targetKindHints: [],
      lastRunId: null,
    },
    {
      id: 'intake_club',
      sourceKey: 'club-source',
      affiliateSourceId: 'source_club',
      status: 'PROMOTED',
      complianceStatus: 'ALLOWED',
      targetKindHints: [],
      lastRunId: 'capture_club',
    },
    {
      id: 'intake_club_old_event',
      sourceKey: 'club-source',
      affiliateSourceId: 'source_club',
      status: 'PROMOTED',
      targetKindHints: ['EVENT'],
      lastRunId: null,
    },
  ];
  const mappingJobs: any[] = [
    {
      id: 'job_event',
      intakeId: 'intake_event',
      sourceId: 'source_event',
      mappingId: 'mapping_event',
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
      sourceId: 'source_no_evidence',
      mappingId: 'mapping_no_evidence',
      status: 'APPROVED',
      createdAt: new Date('2026-07-21T00:00:00.000Z'),
      claimedAt: null,
      leaseExpiresAt: null,
      resultSummary: {},
    },
    {
      id: 'job_club',
      intakeId: 'intake_club',
      sourceId: 'source_club',
      mappingId: 'mapping_club',
      status: 'APPROVED',
      createdAt: new Date('2026-07-21T00:00:00.000Z'),
      claimedAt: null,
      leaseExpiresAt: null,
      resultSummary: {},
    },
    {
      id: 'job_club_old_event',
      intakeId: 'intake_club_old_event',
      status: 'FAILED',
      createdAt: new Date('2026-06-21T00:00:00.000Z'),
      claimedAt: null,
      leaseExpiresAt: null,
      resultSummary: {
        customExtractorRegistry: { targetKind: 'EVENT' },
      },
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
      runId: 'scrape_event',
      mappingId: 'mapping_event',
      listingKind: 'EVENT',
      dateDisplayMode: 'SCHEDULED',
      startsAt: new Date(),
      status: 'DISCOVERED',
    },
    {
      sourceId: 'source_event',
      runId: 'scrape_event',
      mappingId: 'mapping_event',
      listingKind: 'EVENT',
      dateDisplayMode: 'DATE_ONLY',
      startsAt: new Date(),
      status: 'DISCOVERED',
    },
    {
      sourceId: 'source_event',
      runId: 'scrape_event',
      mappingId: 'mapping_event',
      listingKind: 'EVENT',
      dateDisplayMode: 'NO_FIXED_DATE',
      startsAt: new Date(),
      status: 'DISCOVERED',
    },
    {
      sourceId: 'source_event',
      runId: 'scrape_event',
      mappingId: 'mapping_event',
      listingKind: 'EVENT',
      dateDisplayMode: 'ONGOING',
      startsAt: new Date(),
      status: 'DISCOVERED',
    },
    {
      sourceId: 'source_event',
      runId: 'scrape_old_event',
      mappingId: 'mapping_event_old',
      listingKind: 'EVENT',
      dateDisplayMode: 'SCHEDULED',
      startsAt: new Date(),
      status: 'PUBLISHED',
    },
  ];
  const scrapeRuns: any[] = [
    {
      id: 'scrape_event',
      sourceId: 'source_event',
      mappingId: 'mapping_event',
      status: 'SUCCEEDED',
      createdAt: new Date('2026-07-25T00:00:00.000Z'),
      finishedAt: new Date('2026-07-25T01:00:00.000Z'),
    },
    {
      id: 'scrape_old_event',
      sourceId: 'source_event',
      mappingId: 'mapping_event_old',
      status: 'SUCCEEDED',
      createdAt: new Date('2026-06-25T00:00:00.000Z'),
      finishedAt: new Date('2026-06-25T01:00:00.000Z'),
    },
    {
      id: 'scrape_no_evidence',
      sourceId: 'source_no_evidence',
      mappingId: 'mapping_no_evidence',
      status: 'SUCCEEDED',
      createdAt: new Date('2026-07-25T00:00:00.000Z'),
      finishedAt: new Date('2026-07-25T01:00:00.000Z'),
    },
  ];
  const captureRuns: any[] = [
    {
      id: 'capture_event',
      intakeId: 'intake_event',
      status: 'SUCCEEDED',
      createdAt: new Date('2026-07-25T00:00:00.000Z'),
      finishedAt: new Date('2026-07-25T01:00:00.000Z'),
    },
    {
      id: 'capture_no_evidence',
      intakeId: 'intake_no_evidence',
      status: 'FAILED',
      createdAt: new Date('2026-07-25T00:00:00.000Z'),
      finishedAt: new Date('2026-07-25T01:00:00.000Z'),
    },
    {
      id: 'capture_club',
      intakeId: 'intake_club',
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
      runId: 'capture_event',
      kind: 'PAGE_HTML',
      fileId: 'file_event',
    },
    {
      id: 'artifact_failed_policy',
      intakeId: 'intake_no_evidence',
      runId: 'capture_no_evidence',
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
      complianceStatus: 'ALLOWED',
      targetKindHints: [],
      lastRunId: 'capture_custom',
    });
    mappingJobs.push({
      id: 'job_custom',
      intakeId: 'intake_custom',
      sourceId: 'source_custom',
      mappingId: 'mapping_custom',
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
    scrapeRuns.push({
      id: 'scrape_custom',
      sourceId: 'source_custom',
      mappingId: 'mapping_custom',
      status: 'SUCCEEDED',
      createdAt: new Date('2026-07-25T00:00:00.000Z'),
      finishedAt: new Date('2026-07-25T01:00:00.000Z'),
    });
    captureRuns.push({
      id: 'capture_custom',
      intakeId: 'intake_custom',
      status: 'SUCCEEDED',
      createdAt: new Date('2026-07-25T00:00:00.000Z'),
      finishedAt: new Date('2026-07-25T01:00:00.000Z'),
    });
    artifacts.push({
      id: 'artifact_custom',
      intakeId: 'intake_custom',
      runId: 'capture_custom',
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
    affiliateScrapeRuns: { findMany: jest.fn(async () => scrapeRuns) },
    affiliateSourceIntakeRuns: { findMany: jest.fn(async () => captureRuns) },
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
        && (!where.status || row.status === where.status)
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
    scrapeRuns,
    captureRuns,
    candidates,
    artifacts,
    files,
    setFailApprovalUpdate: (value: boolean) => { failApprovalUpdate = value; },
  };
};

const queueLoader = (queue: AffiliateEventDateTimeRemediationQueueState = clearQueue) => (
  jest.fn(async () => queue)
);

const previewInventory = async (state: ReturnType<typeof makeClient>) => (
  previewAffiliateEventDateTimeRemediationCohort({
    cohortKey: 'event-datetime-v1',
    mappingCutoff: CUTOFF,
    now: NOW,
  }, { client: state.client, loadQueueState: queueLoader() })
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
    const clubPackage = result.packages.find((row) => row.sourceId === 'source_club');
    expect(clubPackage?.exclusionReasons).toContain('NOT_EVENT_PRODUCING');
    expect(clubPackage?.targetSignals).toEqual([]);
  });

  it('does not treat arbitrary metadata as a custom extractor registry entry', async () => {
    const state = makeClient({ includeCustomExtractor: true });
    const result = await previewAffiliateEventDateTimeRemediationCohort({
      cohortKey: 'event-datetime-v1',
      mappingCutoff: CUTOFF,
      now: NOW,
    }, { client: state.client, loadQueueState: queueLoader() });

    expect(result.eligibleCount).toBe(1);
    expect(result.packages.find((row) => row.sourceId === 'source_custom')).toEqual(expect.objectContaining({
      eligible: false,
      targetSignals: [],
      exclusionReasons: expect.arrayContaining(['NOT_EVENT_PRODUCING']),
    }));
  });

  it('selects the latest approved package for one mapping and marks older jobs superseded', async () => {
    const state = makeClient();
    state.mappingJobs.push({
      id: 'job_event_new',
      intakeId: 'intake_event',
      sourceId: 'source_event',
      mappingId: 'mapping_event',
      status: 'APPROVED',
      createdAt: new Date('2026-07-30T00:00:00.000Z'),
      claimedAt: null,
      leaseExpiresAt: null,
      resultSummary: {},
      errorMessage: null,
      finishedAt: new Date('2026-07-31T00:00:00.000Z'),
    });
    state.approvals.push({
      id: 'approval_event_new',
      subjectType: 'MAPPING_PACKAGE',
      subjectKey: 'job_event_new',
      status: 'APPROVED',
      leaseExpiresAt: null,
      decision: { decision: 'APPROVE' },
    });

    const result = await previewInventory(state);
    expect(result.packages.find((row) => row.mappingJobId === 'job_event')).toEqual(expect.objectContaining({
      eligible: false,
      exclusionReasons: expect.arrayContaining(['SUPERSEDED_APPROVED_PACKAGE']),
    }));
    expect(result.packages.find((row) => row.mappingJobId === 'job_event_new')).toEqual(expect.objectContaining({
      eligible: true,
    }));
    expect(result.candidateCount).toBe(4);
    expect(result.eventCandidateCount).toBe(4);
  });

  it('reports an active event mapping without an approved mapping job as an orphan gap', async () => {
    const state = makeClient();
    state.sources.push({
      id: 'source_event_orphan',
      sourceKey: 'event-orphan-source',
      status: 'ACTIVE',
      targetKind: 'CLUB',
    });
    state.mappings.push({
      id: 'mapping_event_orphan',
      sourceId: 'source_event_orphan',
      createdAt: new Date('2026-07-23T00:00:00.000Z'),
      version: 1,
      isActive: true,
      mapping: { kind: 'EVENT' },
    });

    const result = await previewInventory(state);
    expect(result.packages.find((row) => row.mappingId === 'mapping_event_orphan')).toEqual(expect.objectContaining({
      coverageKind: 'ORPHAN_MAPPING',
      mappingJobId: null,
      eligible: false,
      exclusionReasons: expect.arrayContaining(['MISSING_APPROVED_MAPPING_JOB', 'MISSING_INTAKE']),
    }));
  });

  it('uses orphan candidates and retained evidence when evaluating the coverage gap', async () => {
    const state = makeClient();
    state.mappings.push({
      id: 'mapping_no_evidence_orphan',
      sourceId: 'source_no_evidence',
      createdAt: new Date('2026-07-23T00:00:00.000Z'),
      version: 1,
      isActive: true,
      mapping: { kind: 'EVENT' },
    });
    state.scrapeRuns.push({
      id: 'scrape_no_evidence_orphan',
      sourceId: 'source_no_evidence',
      mappingId: 'mapping_no_evidence_orphan',
      status: 'SUCCEEDED',
      createdAt: new Date('2026-07-26T00:00:00.000Z'),
      finishedAt: new Date('2026-07-26T01:00:00.000Z'),
    });
    state.candidates.push({
      id: 'candidate_no_evidence_orphan',
      sourceId: 'source_no_evidence',
      runId: 'scrape_no_evidence_orphan',
      mappingId: 'mapping_no_evidence_orphan',
      listingKind: 'EVENT',
      dateDisplayMode: 'SCHEDULED',
      startsAt: new Date('2026-08-02T20:00:00.000Z'),
      status: 'DISCOVERED',
    });

    const result = await previewInventory(state);
    expect(result.packages.find((row) => row.mappingId === 'mapping_no_evidence_orphan')).toEqual(expect.objectContaining({
      coverageKind: 'ORPHAN_MAPPING',
      candidateCount: 1,
      eventCandidateCount: 1,
      storedEvidence: expect.objectContaining({
        candidateRunId: 'scrape_no_evidence_orphan',
        pageHtmlCount: 0,
        pageMarkdownCount: 0,
      }),
      exclusionReasons: expect.arrayContaining([
        'MISSING_APPROVED_MAPPING_JOB',
        'MISSING_SUCCESSFUL_PAGE_EVIDENCE',
      ]),
    }));
  });

  it('preserves event signals from all matching intakes while reporting ambiguity', async () => {
    const state = makeClient();
    state.sources.push({
      id: 'source_ambiguous_intakes',
      sourceKey: 'ambiguous-intake-source',
      status: 'ACTIVE',
      targetKind: 'CLUB',
    });
    state.mappings.push({
      id: 'mapping_ambiguous_intakes',
      sourceId: 'source_ambiguous_intakes',
      createdAt: new Date('2026-07-23T00:00:00.000Z'),
      version: 1,
      isActive: true,
      mapping: { kind: 'CLUB' },
    });
    state.intakes.push(
      {
        id: 'intake_ambiguous_one',
        sourceKey: 'ambiguous-intake-source',
        affiliateSourceId: 'source_ambiguous_intakes',
        status: 'PROMOTED',
        complianceStatus: 'ALLOWED',
        targetKindHints: ['EVENT'],
        lastRunId: null,
      },
      {
        id: 'intake_ambiguous_two',
        sourceKey: 'ambiguous-intake-source',
        affiliateSourceId: 'source_ambiguous_intakes',
        status: 'PROMOTED',
        complianceStatus: 'ALLOWED',
        targetKindHints: ['EVENT'],
        lastRunId: null,
      },
    );

    const result = await previewInventory(state);
    expect(result.packages.find((row) => row.mappingId === 'mapping_ambiguous_intakes')).toEqual(expect.objectContaining({
      coverageKind: 'ORPHAN_MAPPING',
      targetSignals: expect.arrayContaining(['INTAKE_TARGET_KIND_HINT']),
      exclusionReasons: expect.arrayContaining(['AMBIGUOUS_INTAKE_ASSOCIATION']),
    }));
  });

  it('does not associate a legacy job with a mapping created after the job', async () => {
    const state = makeClient();
    state.mappings.push({
      id: 'mapping_event_legacy',
      sourceId: 'source_event',
      createdAt: new Date('2026-07-22T00:00:00.000Z'),
      version: 1,
      isActive: false,
      mapping: { kind: 'EVENT' },
    });
    delete state.mappingJobs[0].sourceId;
    delete state.mappingJobs[0].mappingId;

    const result = await previewInventory(state);
    expect(result.packages.find((row) => row.mappingJobId === 'job_event')).toEqual(expect.objectContaining({
      eligible: false,
      mappingId: null,
      exclusionReasons: expect.arrayContaining(['AMBIGUOUS_MAPPING_JOB_ASSOCIATION']),
    }));
  });

  it('does not fall back to sourceKey when an explicit legacy source ID is unresolved', async () => {
    const state = makeClient();
    delete state.mappingJobs[0].sourceId;
    delete state.mappingJobs[0].mappingId;
    const intake = state.intakes.find((row: any) => row.id === 'intake_event');
    intake.affiliateSourceId = 'source_recreated_elsewhere';

    const result = await previewInventory(state);
    expect(result.packages.find((row) => row.mappingJobId === 'job_event')).toEqual(expect.objectContaining({
      sourceId: null,
      mappingId: null,
      exclusionReasons: expect.arrayContaining(['MISSING_SOURCE_ASSOCIATION']),
    }));
  });

  it('binds inventory identity to the selected scrape run and candidate fingerprint', async () => {
    const state = makeClient();
    const before = await previewInventory(state);
    state.scrapeRuns.push({
      id: 'scrape_event_new',
      sourceId: 'source_event',
      mappingId: 'mapping_event',
      status: 'SUCCEEDED',
      createdAt: new Date('2026-07-26T00:00:00.000Z'),
      finishedAt: new Date('2026-07-26T01:00:00.000Z'),
    });
    state.candidates.push({
      id: 'candidate_event_new',
      sourceId: 'source_event',
      runId: 'scrape_event_new',
      mappingId: 'mapping_event',
      listingKind: 'EVENT',
      dateDisplayMode: 'SCHEDULED',
      startsAt: new Date('2026-08-01T20:00:00.000Z'),
      status: 'DISCOVERED',
    });

    const after = await previewInventory(state);
    const eventPackage = after.packages.find((row) => row.mappingJobId === 'job_event');
    expect(eventPackage?.storedEvidence.candidateRunId).toBe('scrape_event_new');
    expect(eventPackage?.storedEvidence.candidateFingerprint).not.toBe(
      before.packages.find((row) => row.mappingJobId === 'job_event')?.storedEvidence.candidateFingerprint,
    );
    expect(after.inventoryHash).not.toBe(before.inventoryHash);
  });

  it('fingerprints the datetime fields that remediation can change', async () => {
    const state = makeClient();
    const before = await previewInventory(state);
    Object.assign(state.candidates[0], {
      endsAt: new Date('2026-08-01T22:00:00.000Z'),
      timeZone: 'America/Los_Angeles',
      scheduleText: 'Every Saturday at 3 PM',
      updatedAt: new Date('2026-07-30T00:00:00.000Z'),
    });

    const after = await previewInventory(state);
    expect(after.inventoryHash).not.toBe(before.inventoryHash);
    expect(after.packages.find((row) => row.mappingJobId === 'job_event')?.storedEvidence.candidateFingerprint)
      .not.toBe(before.packages.find((row) => row.mappingJobId === 'job_event')?.storedEvidence.candidateFingerprint);
  });

  it('binds apply to evidence-run identity through the inventory hash', async () => {
    const state = makeClient();
    const preview = await previewInventory(state);
    state.captureRuns.push({
      id: 'capture_event_new',
      intakeId: 'intake_event',
      status: 'SUCCEEDED',
      createdAt: new Date('2026-07-29T00:00:00.000Z'),
      finishedAt: new Date('2026-07-29T01:00:00.000Z'),
    });
    state.intakes[0].lastRunId = 'capture_event_new';
    state.artifacts.push({
      id: 'artifact_event_new',
      intakeId: 'intake_event',
      runId: 'capture_event_new',
      kind: 'PAGE_HTML',
      fileId: 'file_event_new',
    });
    state.files.push({ id: 'file_event_new' });

    await expect(applyAffiliateEventDateTimeRemediationCohort({
      cohortKey: 'event-datetime-v1',
      mappingCutoff: CUTOFF,
      expectedEligibleCount: 1,
      expectedExcludedCount: 2,
      expectedEligibleMappingJobIds: ['job_event'],
      expectedInventoryHash: preview.inventoryHash,
      operatorIdentity: 'operator@example.test',
      now: NOW,
    }, { client: state.client, loadQueueState: queueLoader() })).rejects.toThrow('inventory changed');
  });

  it('aborts apply when the selected scrape candidates change after preview', async () => {
    const state = makeClient();
    const preview = await previewInventory(state);
    state.candidates.push({
      id: 'candidate_event_changed',
      sourceId: 'source_event',
      runId: 'scrape_event',
      mappingId: 'mapping_event',
      listingKind: 'EVENT',
      dateDisplayMode: 'SCHEDULED',
      startsAt: new Date('2026-08-02T20:00:00.000Z'),
      status: 'DISCOVERED',
    });

    await expect(applyAffiliateEventDateTimeRemediationCohort({
      cohortKey: 'event-datetime-v1',
      mappingCutoff: CUTOFF,
      expectedEligibleCount: 1,
      expectedExcludedCount: 2,
      expectedEligibleMappingJobIds: ['job_event'],
      expectedInventoryHash: preview.inventoryHash,
      operatorIdentity: 'operator@example.test',
      now: NOW,
    }, { client: state.client, loadQueueState: queueLoader() })).rejects.toThrow('inventory changed');
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
      expectedInventoryHash: '0'.repeat(64),
      operatorIdentity: 'operator@example.test',
      now: NOW,
    }, { client: state.client, loadQueueState: queueLoader() })).rejects.toThrow('counts changed');
    expect(state.controls).toHaveLength(0);
    expect(state.mappingJobs[0].status).toBe('APPROVED');
  });

  it('aborts apply when the previewed eligible mapping job IDs changed', async () => {
    const state = makeClient();
    const preview = await previewInventory(state);
    await expect(applyAffiliateEventDateTimeRemediationCohort({
      cohortKey: 'event-datetime-v1',
      mappingCutoff: CUTOFF,
      expectedEligibleCount: 1,
      expectedExcludedCount: 2,
      expectedEligibleMappingJobIds: ['job_other'],
      expectedInventoryHash: preview.inventoryHash,
      operatorIdentity: 'operator@example.test',
      now: NOW,
    }, { client: state.client, loadQueueState: queueLoader() })).rejects.toThrow('mapping job IDs changed');
    expect(state.controls).toHaveLength(0);
    expect(state.mappingJobs[0].status).toBe('APPROVED');
  });

  it('enqueues the approved producer package once and preserves repair history', async () => {
    const state = makeClient();
    const preview = await previewInventory(state);
    const result = await applyAffiliateEventDateTimeRemediationCohort({
      cohortKey: 'event-datetime-v1',
      mappingCutoff: CUTOFF,
      expectedEligibleCount: 1,
      expectedExcludedCount: 2,
      expectedEligibleMappingJobIds: ['job_event'],
      expectedInventoryHash: preview.inventoryHash,
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
      expectedInventoryHash: '0'.repeat(64),
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
    const preview = await previewInventory(state);

    await expect(applyAffiliateEventDateTimeRemediationCohort({
      cohortKey: 'event-datetime-v1',
      mappingCutoff: CUTOFF,
      expectedEligibleCount: 1,
      expectedExcludedCount: 2,
      expectedEligibleMappingJobIds: ['job_event'],
      expectedInventoryHash: preview.inventoryHash,
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
