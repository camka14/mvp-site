/** @jest-environment node */

let idCounter = 0;
let approvalRows: any[] = [];
let policyRows: any[] = [];
let mappingRows: any[] = [];
let intakeRows: any[] = [];
let pageRows: any[] = [];

const compoundApproval = (where: any) => {
  const compound = where.subjectType_subjectKey;
  return approvalRows.find((row) => (
    compound
      ? row.subjectType === compound.subjectType && row.subjectKey === compound.subjectKey
      : row.id === where.id
  )) ?? null;
};

const prismaMock = {
  $transaction: jest.fn(async (callback: (transaction: any) => Promise<any>) => callback(prismaMock)),
  affiliateApprovalJobs: {
    findUnique: jest.fn(async ({ where }: any) => compoundApproval(where)),
    findMany: jest.fn(async () => approvalRows),
    findFirst: jest.fn(async ({ where }: any) => approvalRows.find((row) => {
      if (where.id && row.id !== where.id) return false;
      return row.status === 'QUEUED'
        || (row.status === 'CLAIMED' && row.leaseExpiresAt && row.leaseExpiresAt < where.OR[1].leaseExpiresAt.lt);
    }) ?? null),
    create: jest.fn(async ({ data }: any) => {
      const row = { ...data, createdAt: new Date(), leaseExpiresAt: null };
      approvalRows.push(row);
      return row;
    }),
    updateMany: jest.fn(async ({ where, data }: any) => {
      const row = approvalRows.find((candidate) => candidate.id === where.id);
      if (!row) return { count: 0 };
      const eligible = row.status === 'QUEUED'
        || (row.status === 'CLAIMED' && row.leaseExpiresAt && row.leaseExpiresAt < where.OR[1].leaseExpiresAt.lt);
      if (!eligible) return { count: 0 };
      Object.assign(row, data, {
        attemptCount: (row.attemptCount ?? 0) + (data.attemptCount?.increment ?? 0),
      });
      return { count: 1 };
    }),
    update: jest.fn(async ({ where, data }: any) => {
      const row = approvalRows.find((candidate) => candidate.id === where.id);
      if (!row) throw new Error('Approval not found');
      Object.assign(row, data);
      return row;
    }),
  },
  affiliateSourceDomainPolicies: {
    findMany: jest.fn(async () => policyRows.filter((row) => row.status === 'NEEDS_REVIEW')),
    findUnique: jest.fn(async ({ where }: any) => (
      policyRows.find((row) => row.policyKey === where.policyKey) ?? null
    )),
  },
  affiliateSourceMappingJobs: {
    findMany: jest.fn(async () => mappingRows.filter((row) => row.status === 'REVIEW_REQUIRED')),
    findUnique: jest.fn(async ({ where }: any) => (
      mappingRows.find((row) => row.id === where.id) ?? null
    )),
    update: jest.fn(async ({ where, data }: any) => {
      const row = mappingRows.find((candidate) => candidate.id === where.id);
      Object.assign(row, data);
      return row;
    }),
  },
  affiliateSourceIntakes: {
    findMany: jest.fn(async () => intakeRows),
    update: jest.fn(async ({ where, data }: any) => {
      const row = intakeRows.find((candidate) => candidate.id === where.id);
      Object.assign(row, data);
      return row;
    }),
  },
  affiliateSourceIntakePages: {
    findMany: jest.fn(async () => pageRows),
  },
};

const applyDomainPolicyMock = jest.fn();
jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/id', () => ({ createId: () => `approval_${++idCounter}` }));
jest.mock('../sourceDiscovery', () => ({
  applyAffiliateSourceDomainPolicy: (...args: any[]) => applyDomainPolicyMock(...args),
}));

import {
  claimNextAffiliateApproval,
  completeAffiliateApproval,
  reconcileAffiliateApprovalQueue,
  summarizeAffiliateApprovalQueue,
} from '../approvalQueue';

const HASH = 'a'.repeat(64);
const ingestionResult = (workerId = 'codex-luna-vm-1') => ({
  schemaVersion: 1,
  jobId: 'mapping_1',
  intakeId: 'intake_1',
  sourceKey: 'river-city',
  workerId,
  status: 'REVIEW_REQUIRED',
  branch: 'codex/affiliate-river-city',
  commit: 'b'.repeat(40),
  generatedPaths: ['scripts/setup-river-city-affiliate-source.ts'],
  logoDisposition: 'OFFICIAL_ASSET',
  candidateCount: 2,
  reviewScrapes: [
    { runId: 'run_1', candidateCount: 2, normalizedCandidateSha256: HASH, passed: true },
    { runId: 'run_2', candidateCount: 2, normalizedCandidateSha256: HASH, passed: true },
  ],
  validation: { testsPassed: true, diffCheckPassed: true, duplicateSafe: true, warnings: [] },
  errorMessage: null,
});

const mappingApprovalResult = (reviewerId = 'codex-luna-approval-vm-1') => ({
  schemaVersion: 1,
  approvalJobId: 'approval_1',
  subjectType: 'MAPPING_PACKAGE',
  subjectKey: 'mapping_1',
  reviewerId,
  decision: 'APPROVE',
  confidence: 0.95,
  rationale: 'All independent package and live safety checks passed.',
  evidenceReferences: [{ kind: 'MAPPING_JOB', identifier: 'mapping_1', finding: 'Validated.' }],
  checks: {
    robotsReviewed: false,
    termsReviewed: false,
    storedEvidenceSufficient: true,
    identityIndependent: true,
    packageValidationPassed: true,
    descriptionQualityVerified: true,
    officialLogoVerified: true,
    logoAbsenceAccepted: false,
    duplicateSafetyVerified: true,
  },
  blockingIssues: [],
});

const domainApprovalResult = (decision: 'ALLOW' | 'DEFER') => ({
  schemaVersion: 1,
  approvalJobId: 'approval_1',
  subjectType: 'DOMAIN_POLICY',
  subjectKey: 'example.test',
  reviewerId: 'codex-luna-approval-vm-1',
  decision,
  confidence: 0.9,
  rationale: decision === 'ALLOW'
    ? 'Stored policy evidence supports bounded public capture.'
    : 'The stored terms do not address automated capture.',
  evidenceReferences: [{ kind: 'DOMAIN_POLICY_RESOURCE', identifier: 'example.test', finding: 'Reviewed.' }],
  checks: {
    robotsReviewed: true,
    termsReviewed: true,
    storedEvidenceSufficient: decision === 'ALLOW',
    identityIndependent: true,
    packageValidationPassed: false,
    descriptionQualityVerified: false,
    officialLogoVerified: false,
    logoAbsenceAccepted: false,
    duplicateSafetyVerified: false,
  },
  blockingIssues: decision === 'ALLOW' ? [] : ['Policy evidence is ambiguous.'],
});

describe('affiliate approval queue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    idCounter = 0;
    approvalRows = [];
    policyRows = [{
      policyKey: 'example.test',
      status: 'NEEDS_REVIEW',
      termsUrl: null,
      robotsSummary: 'robots checked',
      evidence: {},
      createdAt: new Date('2026-07-31T10:00:00Z'),
    }];
    mappingRows = [{
      id: 'mapping_1',
      intakeId: 'intake_1',
      status: 'REVIEW_REQUIRED',
      resultSummary: { result: ingestionResult() },
      createdAt: new Date('2026-07-31T10:01:00Z'),
    }];
    intakeRows = [{ id: 'intake_1', baseUrl: 'https://club.example.test', status: 'CAPTURED' }];
    pageRows = [{ id: 'page_1', intakeId: 'intake_1', canonicalUrl: 'https://club.example.test/events' }];
  });

  it('reconciles each policy and mapping subject exactly once', async () => {
    await expect(reconcileAffiliateApprovalQueue()).resolves.toEqual({
      domainPolicies: 1,
      mappingPackages: 1,
      created: 2,
    });
    await expect(reconcileAffiliateApprovalQueue()).resolves.toEqual({
      domainPolicies: 1,
      mappingPackages: 1,
      created: 0,
    });
    expect(approvalRows).toHaveLength(2);
  });

  it('recovers an expired claim through an atomic conditional update', async () => {
    approvalRows = [{
      id: 'approval_1',
      subjectType: 'DOMAIN_POLICY',
      subjectKey: 'example.test',
      status: 'CLAIMED',
      leaseExpiresAt: new Date('2026-07-31T10:00:00Z'),
      attemptCount: 1,
      createdAt: new Date('2026-07-31T09:00:00Z'),
    }];
    const claim = await claimNextAffiliateApproval({
      reviewerId: 'codex-luna-approval-vm-1',
      now: new Date('2026-07-31T12:00:00Z'),
    });

    expect(claim?.approvalJob).toEqual(expect.objectContaining({
      status: 'CLAIMED',
      reviewerId: 'codex-luna-approval-vm-1',
      attemptCount: 2,
    }));
    expect(claim?.subject).toEqual(expect.objectContaining({
      intakeIds: ['intake_1'],
      decisionStandard: {
        version: 'explicit-prohibition-only-v1',
        defaultDecision: 'ALLOW',
        blockOnlyWhen: expect.stringContaining('explicit prohibition'),
        missingResourceDecision: 'ALLOW',
        deferOnlyWhen: expect.stringContaining('conflicts'),
      },
    }));
  });

  it('does not report a malformed claimed row as exhausted', () => {
    const queue = summarizeAffiliateApprovalQueue([{
      id: 'approval_1',
      subjectType: 'DOMAIN_POLICY',
      subjectKey: 'example.test',
      status: 'CLAIMED',
      leaseExpiresAt: null,
    }], new Date('2026-07-31T12:00:00Z'));
    expect(queue.complete).toBe(false);
    expect(queue.claimedWithoutLease).toBe(1);
  });

  it('does not report an actively claimed row as complete', () => {
    const queue = summarizeAffiliateApprovalQueue([{
      id: 'approval_1',
      subjectType: 'DOMAIN_POLICY',
      subjectKey: 'example.test',
      status: 'CLAIMED',
      leaseExpiresAt: new Date('2026-07-31T13:00:00Z'),
    }], new Date('2026-07-31T12:00:00Z'));
    expect(queue.complete).toBe(false);
    expect(queue.activeLeases).toBe(1);
    expect(queue.claimableJobs).toBe(0);
  });

  it('applies an allowed domain through the intake policy boundary', async () => {
    approvalRows = [{
      id: 'approval_1',
      subjectType: 'DOMAIN_POLICY',
      subjectKey: 'example.test',
      status: 'CLAIMED',
      reviewerId: 'codex-luna-approval-vm-1',
    }];
    const completed = await completeAffiliateApproval(domainApprovalResult('ALLOW'), {
      applyDomainPolicy: applyDomainPolicyMock,
    });

    expect(applyDomainPolicyMock).toHaveBeenCalledWith(
      'example.test',
      expect.objectContaining({
        status: 'ALLOWED',
        evidence: expect.objectContaining({ approvalJobId: 'approval_1' }),
      }),
      'codex-luna-approval-vm-1',
    );
    expect(completed.status).toBe('APPROVED');
  });

  it('defers an ambiguous domain without applying any subject side effect', async () => {
    approvalRows = [{
      id: 'approval_1',
      subjectType: 'DOMAIN_POLICY',
      subjectKey: 'example.test',
      status: 'CLAIMED',
      reviewerId: 'codex-luna-approval-vm-1',
    }];
    const completed = await completeAffiliateApproval(domainApprovalResult('DEFER'), {
      applyDomainPolicy: applyDomainPolicyMock,
    });

    expect(applyDomainPolicyMock).not.toHaveBeenCalled();
    expect(policyRows[0].status).toBe('NEEDS_REVIEW');
    expect(completed.status).toBe('DEFERRED');
  });

  it('rejects self-review even when every model-reported check is true', async () => {
    approvalRows = [{
      id: 'approval_1',
      subjectType: 'MAPPING_PACKAGE',
      subjectKey: 'mapping_1',
      status: 'CLAIMED',
      reviewerId: 'codex-luna-vm-1',
    }];
    await expect(completeAffiliateApproval(
      mappingApprovalResult('codex-luna-vm-1'),
      { applyMappingPackage: jest.fn() },
    )).rejects.toThrow('cannot be approved or reviewed by their producer identity');
  });

  it('applies an independently reviewed mapping package through the guarded callback', async () => {
    approvalRows = [{
      id: 'approval_1',
      subjectType: 'MAPPING_PACKAGE',
      subjectKey: 'mapping_1',
      status: 'CLAIMED',
      reviewerId: 'codex-luna-approval-vm-1',
    }];
    const applyMappingPackage = jest.fn(async () => {
      mappingRows[0].status = 'APPROVED';
    });
    const completed = await completeAffiliateApproval(
      mappingApprovalResult(),
      { applyMappingPackage },
    );

    expect(applyMappingPackage).toHaveBeenCalledWith(
      'mapping_1',
      'codex-luna-approval-vm-1',
      expect.objectContaining({ decision: 'APPROVE' }),
    );
    expect(completed.status).toBe('APPROVED');
  });

  it('applies an independently reviewed manual-logo package when logo absence is explicit', async () => {
    approvalRows = [{
      id: 'approval_1',
      subjectType: 'MAPPING_PACKAGE',
      subjectKey: 'mapping_1',
      status: 'CLAIMED',
      reviewerId: 'codex-luna-approval-vm-1',
    }];
    mappingRows[0].resultSummary = {
      result: { ...ingestionResult(), logoDisposition: 'MANUAL_REVIEW' },
    };
    const applyMappingPackage = jest.fn(async () => {
      mappingRows[0].status = 'APPROVED';
    });
    const result = {
      ...mappingApprovalResult(),
      checks: {
        ...mappingApprovalResult().checks,
        officialLogoVerified: false,
        logoAbsenceAccepted: true,
      },
    };

    await expect(completeAffiliateApproval(result, { applyMappingPackage })).resolves.toEqual(
      expect.objectContaining({ status: 'APPROVED' }),
    );
    expect(applyMappingPackage).toHaveBeenCalledWith(
      'mapping_1',
      'codex-luna-approval-vm-1',
      expect.objectContaining({ checks: expect.objectContaining({ logoAbsenceAccepted: true }) }),
    );
  });

  it('does not silently approve a manual-logo package without the explicit absence check', async () => {
    approvalRows = [{
      id: 'approval_1',
      subjectType: 'MAPPING_PACKAGE',
      subjectKey: 'mapping_1',
      status: 'CLAIMED',
      reviewerId: 'codex-luna-approval-vm-1',
    }];
    mappingRows[0].resultSummary = {
      result: { ...ingestionResult(), logoDisposition: 'MANUAL_REVIEW' },
    };

    await expect(completeAffiliateApproval(
      mappingApprovalResult(),
      { applyMappingPackage: jest.fn() },
    )).rejects.toThrow('explicit accepted logo absence');
  });

  it('automatically returns a producer-repair rejection to the same mapping job', async () => {
    approvalRows = [{
      id: 'approval_1',
      subjectType: 'MAPPING_PACKAGE',
      subjectKey: 'mapping_1',
      status: 'CLAIMED',
      reviewerId: 'codex-luna-approval-vm-1',
    }];
    const applyMappingPackage = jest.fn();
    const completed = await completeAffiliateApproval({
      ...mappingApprovalResult(),
      decision: 'REJECT',
      rationale: 'The logo evidence does not identify an official asset.',
      blockingIssues: ['Official logo evidence is invalid.'],
      mappingDisposition: {
        nextAction: 'PRODUCER_REPAIR',
        reasonCodes: ['OFFICIAL_LOGO_REPAIR_REQUIRED'],
      },
    }, { applyMappingPackage });

    expect(applyMappingPackage).not.toHaveBeenCalled();
    expect(mappingRows[0].status).toBe('QUEUED');
    expect(mappingRows[0].resultSummary.mappingRepairHistory).toEqual([
      expect.objectContaining({
        repairReason: 'OFFICIAL_LOGO_REPAIR_REQUIRED',
        repairReasons: ['OFFICIAL_LOGO_REPAIR_REQUIRED'],
        blockingIssues: ['Official logo evidence is invalid.'],
      }),
    ]);
    expect(intakeRows[0].status).toBe('READY_FOR_MAPPING');
    expect(completed.status).toBe('REJECTED');
  });

  it('marks a deferred evidence gap as terminal human review', async () => {
    approvalRows = [{
      id: 'approval_1',
      subjectType: 'MAPPING_PACKAGE',
      subjectKey: 'mapping_1',
      status: 'CLAIMED',
      reviewerId: 'codex-luna-approval-vm-1',
    }];

    const completed = await completeAffiliateApproval({
      ...mappingApprovalResult(),
      decision: 'DEFER',
      rationale: 'No stored artifact verifies an official organization mark.',
      blockingIssues: ['A human must supply or verify official logo evidence.'],
      mappingDisposition: {
        nextAction: 'HUMAN_REVIEW_REQUIRED',
        reasonCodes: ['NO_VERIFIABLE_OFFICIAL_LOGO'],
      },
    });

    expect(mappingRows[0]).toEqual(expect.objectContaining({
      status: 'HUMAN_REVIEW_REQUIRED',
      errorMessage: 'A human must supply or verify official logo evidence.',
      resultSummary: expect.objectContaining({
        humanReviewRequired: expect.objectContaining({
          reasonCodes: ['NO_VERIFIABLE_OFFICIAL_LOGO'],
        }),
      }),
    }));
    expect(intakeRows[0].status).toBe('REVIEW_REQUIRED');
    expect(completed.status).toBe('DEFERRED');
  });

  it('stops automatic repair after three recorded repair passes', async () => {
    approvalRows = [{
      id: 'approval_1',
      subjectType: 'MAPPING_PACKAGE',
      subjectKey: 'mapping_1',
      status: 'CLAIMED',
      reviewerId: 'codex-luna-approval-vm-1',
    }];
    mappingRows[0].resultSummary = {
      result: ingestionResult(),
      mappingRepairHistory: [{}, {}, {}],
    };

    await completeAffiliateApproval({
      ...mappingApprovalResult(),
      decision: 'REJECT',
      rationale: 'The event location defect remains after producer repair.',
      blockingIssues: ['An accepted event still has no usable location.'],
      mappingDisposition: {
        nextAction: 'PRODUCER_REPAIR',
        reasonCodes: ['EVENT_LOCATION_INVALID'],
      },
    });

    expect(mappingRows[0].status).toBe('HUMAN_REVIEW_REQUIRED');
    expect(mappingRows[0].resultSummary.mappingRepairHistory).toHaveLength(3);
    expect(mappingRows[0].resultSummary.humanReviewRequired).toEqual(expect.objectContaining({
      requestedNextAction: 'PRODUCER_REPAIR',
      reasonCodes: ['EVENT_LOCATION_INVALID', 'RETRY_LIMIT_EXCEEDED'],
    }));
  });

  it('starts a fresh bounded repair cycle for an operator-armed full review', async () => {
    approvalRows = [{
      id: 'approval_1',
      subjectType: 'MAPPING_PACKAGE',
      subjectKey: 'mapping_1',
      status: 'CLAIMED',
      reviewerId: 'codex-luna-approval-vm-1',
    }];
    mappingRows[0].resultSummary = {
      result: ingestionResult(),
      mappingRepairHistory: [{}, {}, {}],
      mappingFullReviewHistory: [{
        cohortKey: 'description-quality-v1',
        repairHistoryStartIndex: 3,
      }],
    };

    await completeAffiliateApproval({
      ...mappingApprovalResult(),
      decision: 'REJECT',
      rationale: 'The event description repeats the title and narrates its listing source.',
      blockingIssues: ['Rewrite the event description from first-party activity details.'],
      mappingDisposition: {
        nextAction: 'PRODUCER_REPAIR',
        reasonCodes: ['EVENT_DESCRIPTION_INVALID'],
      },
    });

    expect(mappingRows[0].status).toBe('QUEUED');
    expect(mappingRows[0].resultSummary.mappingRepairHistory).toHaveLength(4);
    expect(mappingRows[0].resultSummary.humanReviewRequired).toBeUndefined();
  });
});
