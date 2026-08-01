/** @jest-environment node */

import { createHash } from 'node:crypto';

let idCounter = 0;
let intakes: any[] = [];
let pages: any[] = [];
let runs: any[] = [];
let policies: any[] = [];
let sources: any[] = [];
let organizations: any[] = [];

const urlKey = (value: string): string => createHash('sha256')
  .update(new URL(value).toString())
  .digest('hex');

const prismaMock = {
  affiliateSourceIntakes: {
    findUnique: jest.fn(async ({ where }) => intakes.find((row) => row.id === where.id) ?? null),
    findFirst: jest.fn(async ({ where }) => intakes.find((row) => (
      row.region === where.region && where.baseUrl.in.includes(row.baseUrl)
    )) ?? null),
  },
  affiliateSourceIntakePages: {
    findUnique: jest.fn(async ({ where }) => pages.find((row) => row.urlKey === where.urlKey) ?? null),
    findFirst: jest.fn(async ({ where }) => pages.find((row) => (
      row.intakeId === where.intakeId && (!where.urlKey || row.urlKey === where.urlKey)
    )) ?? null),
    findMany: jest.fn(async ({ where }) => pages.filter((row) => (
      row.intakeId === where.intakeId && (!where.status || row.status === where.status)
    )).slice(0, 10)),
  },
  affiliateSourceIntakeRuns: {
    findFirst: jest.fn(async ({ where }) => runs.find((row) => (
      row.intakeId === where.intakeId && where.status.in.includes(row.status)
    )) ?? null),
  },
  affiliateSourceDomainPolicies: {
    findUnique: jest.fn(async ({ where }) => policies.find((row) => row.policyKey === where.policyKey) ?? null),
    create: jest.fn(async ({ data }) => {
      const row = { ...data };
      policies.push(row);
      return row;
    }),
  },
  affiliateScrapeSources: {
    findFirst: jest.fn(async ({ where }) => sources.find((row) => (
      where.OR.some((clause: any) => clause.listUrl?.in.includes(row.listUrl)
        || clause.baseUrl?.in.includes(row.baseUrl))
    )) ?? null),
  },
  organizations: {
    findFirst: jest.fn(async ({ where }) => organizations.find((row) => (
      where.website.in.includes(row.website)
    )) ?? null),
  },
};

const createIntakeMock = jest.fn(async (input: any, userId: string) => {
  const intake = {
    id: `intake_${++idCounter}`,
    sourceKey: input.sourceKey,
    name: input.name,
    region: input.region,
    baseUrl: input.baseUrl,
    status: 'REVIEW_REQUIRED',
    complianceStatus: 'UNREVIEWED',
    affiliateSourceId: null,
    organizationId: null,
    lastRunId: null,
    createdByUserId: userId,
  };
  intakes.push(intake);
  for (const inputPage of input.pages) {
    const canonicalUrl = new URL(inputPage.url).toString();
    pages.push({
      id: `page_${++idCounter}`,
      intakeId: intake.id,
      canonicalUrl,
      urlKey: urlKey(canonicalUrl),
      status: 'ACTIVE',
      ...inputPage,
    });
  }
  return intake;
});

const addPageMock = jest.fn(async (intakeId: string, input: any) => {
  const canonicalUrl = new URL(input.url).toString();
  const page = {
    id: `page_${++idCounter}`,
    intakeId,
    canonicalUrl,
    urlKey: urlKey(canonicalUrl),
    status: 'ACTIVE',
    ...input,
  };
  pages.push(page);
  return page;
});

const reviewPolicyMock = jest.fn(async (intakeId: string, review: any) => {
  const intake = intakes.find((row) => row.id === intakeId);
  Object.assign(intake, {
    complianceStatus: review.complianceStatus,
    status: review.complianceStatus === 'ALLOWED' ? 'READY' : 'BLOCKED',
  });
  return intake;
});

const queueRunMock = jest.fn(async (intakeId: string, requestedPageIds: string[], userId: string) => {
  const run = {
    id: `run_${++idCounter}`,
    intakeId,
    requestedPageIds,
    requestedByUserId: userId,
    status: 'QUEUED',
  };
  runs.push(run);
  return run;
});

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/id', () => ({ createId: () => `generated_${++idCounter}` }));
jest.mock('@/server/affiliateImports/sourceIntake', () => ({
  createAffiliateSourceIntake: (...args: any[]) => createIntakeMock(...args),
  addAffiliateSourceIntakePage: (...args: any[]) => addPageMock(...args),
  reviewAffiliateSourceIntakePolicy: (...args: any[]) => reviewPolicyMock(...args),
  queueAffiliateSourceIntakeRun: (...args: any[]) => queueRunMock(...args),
}));

import { enqueueAffiliateSourceUrlProposals } from '../sourceUrlIntake';

const batch = (proposals: unknown[]) => ({
  schemaVersion: 1 as const,
  parentJobId: 'job_parent',
  parentIntakeId: 'intake_parent',
  proposals,
});

const proposal = (overrides: Record<string, unknown> = {}) => ({
  url: 'https://club-one.org/',
  organizationName: 'Club One',
  targetKindHints: ['CLUB'],
  sportHints: ['Soccer'],
  evidenceUrl: 'https://directory.example/clubs',
  depth: 1,
  ...overrides,
});

describe('affiliate source URL intake', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    idCounter = 0;
    intakes = [{
      id: 'intake_parent',
      sourceKey: 'directory',
      name: 'Directory',
      region: 'Portland, Oregon',
      baseUrl: 'https://directory.example',
      status: 'MAPPING_IN_PROGRESS',
      complianceStatus: 'ALLOWED',
      affiliateSourceId: null,
      organizationId: null,
      lastRunId: 'parent_capture',
    }];
    pages = [{
      id: 'page_parent',
      intakeId: 'intake_parent',
      canonicalUrl: 'https://directory.example/clubs',
      urlKey: urlKey('https://directory.example/clubs'),
      status: 'ACTIVE',
    }];
    runs = [];
    policies = [];
    sources = [];
    organizations = [];
  });

  it('creates and immediately queues a child intake only for a current allowed policy', async () => {
    policies.push({
      policyKey: 'club-one.org',
      status: 'ALLOWED',
      expiresAt: new Date('2027-01-01T00:00:00Z'),
      reviewedByUserId: 'admin_1',
    });

    const result = await enqueueAffiliateSourceUrlProposals(
      batch([proposal()]),
      'admin_1',
      { now: () => new Date('2026-07-31T12:00:00Z') },
    );

    expect(result).toEqual(expect.objectContaining({
      submitted: 1,
      created: 1,
      captureQueued: 1,
      reviewRequired: 0,
      rejected: 0,
    }));
    expect(result.outcomes[0]).toEqual(expect.objectContaining({
      action: 'CREATED_CAPTURE_QUEUED',
      policyKey: 'club-one.org',
      captureRunId: expect.any(String),
    }));
    expect(createIntakeMock).toHaveBeenCalledTimes(1);
    expect(queueRunMock).toHaveBeenCalledTimes(1);
    expect(pages.at(-1)?.metadata).toEqual(expect.objectContaining({
      directoryExpansion: expect.objectContaining({
        parentIntakeId: 'intake_parent',
        parentJobId: 'job_parent',
        evidenceUrl: 'https://directory.example/clubs',
        depth: 1,
      }),
    }));

    const repeated = await enqueueAffiliateSourceUrlProposals(
      batch([proposal()]),
      'admin_1',
      { now: () => new Date('2026-07-31T12:00:00Z') },
    );
    expect(repeated.outcomes[0]).toEqual(expect.objectContaining({
      action: 'REUSED_CAPTURE_QUEUED',
      captureRunId: result.outcomes[0].captureRunId,
    }));
    expect(createIntakeMock).toHaveBeenCalledTimes(1);
    expect(queueRunMock).toHaveBeenCalledTimes(1);
  });

  it('creates review-required and blocked child intakes without capture', async () => {
    policies.push({ policyKey: 'blocked-club.org', status: 'BLOCKED', reviewedByUserId: 'admin_1' });
    const fetchResource = jest.fn(async () => ({
      statusCode: 200,
      body: Buffer.from('User-agent: *\nDisallow:'),
    }));

    const result = await enqueueAffiliateSourceUrlProposals(batch([
      proposal(),
      proposal({ url: 'https://blocked-club.org/', organizationName: 'Blocked Club' }),
    ]), 'admin_1', { fetchResource });

    expect(result).toEqual(expect.objectContaining({
      created: 2,
      captureQueued: 0,
      reviewRequired: 1,
      blocked: 1,
    }));
    expect(result.outcomes.map((outcome) => outcome.action)).toEqual([
      'CREATED_REVIEW_REQUIRED',
      'CREATED_BLOCKED',
    ]);
    expect(fetchResource).toHaveBeenCalledTimes(1);
    expect(queueRunMock).not.toHaveBeenCalled();
  });

  it('reports approved-source duplicates without creating another intake', async () => {
    sources.push({ id: 'source_existing', baseUrl: 'https://club-one.org/', listUrl: null });

    const result = await enqueueAffiliateSourceUrlProposals(batch([proposal()]), 'admin_1');

    expect(result).toEqual(expect.objectContaining({ duplicate: 1, created: 0 }));
    expect(result.outcomes[0]).toEqual(expect.objectContaining({
      action: 'DUPLICATE',
      matchingSourceId: 'source_existing',
      reason: 'EXISTING_APPROVED_SOURCE',
    }));
    expect(createIntakeMock).not.toHaveBeenCalled();
  });

  it('rejects self-links, unsupported kinds, excessive depth, and unstored evidence per row', async () => {
    const result = await enqueueAffiliateSourceUrlProposals(batch([
      proposal({
        url: 'https://directory.example/clubs',
        organizationName: 'Parent Directory',
      }),
      proposal({ targetKindHints: ['TEAM'] }),
      proposal({ depth: 3 }),
      proposal({ evidenceUrl: 'https://directory.example/not-stored' }),
    ]), 'admin_1');

    expect(result).toEqual(expect.objectContaining({ submitted: 4, rejected: 4 }));
    expect(result.outcomes.map((outcome) => outcome.reason)).toEqual([
      expect.stringContaining('own intake pages'),
      expect.stringContaining('TEAM-only or unknown targets'),
      expect.stringContaining('<=2'),
      expect.stringContaining('must belong to the parent intake'),
    ]);
    expect(createIntakeMock).not.toHaveBeenCalled();
  });

  it('derives the next expansion depth from parent provenance instead of trusting the agent', async () => {
    pages[0].metadata = {
      directoryExpansion: {
        parentIntakeId: 'intake_grandparent',
        parentJobId: 'job_grandparent',
        depth: 1,
      },
    };
    const fetchResource = jest.fn(async () => ({
      statusCode: 200,
      body: Buffer.from('User-agent: *\nDisallow:'),
    }));

    const result = await enqueueAffiliateSourceUrlProposals(batch([
      proposal({ depth: 1 }),
      proposal({ url: 'https://club-two.org/', organizationName: 'Club Two', depth: 2 }),
    ]), 'admin_1', { fetchResource });

    expect(result).toEqual(expect.objectContaining({ submitted: 2, created: 1, rejected: 1 }));
    expect(result.outcomes[0].reason).toContain('depth must be 2');
    expect(result.outcomes[1].action).toBe('CREATED_REVIEW_REQUIRED');
  });
});
