/** @jest-environment node */

let idCounter = 0;
let currentResult: any = null;
let currentPolicy: any = null;
const queuedRuns: any[] = [];

const campaign = {
  id: 'campaign_1',
  name: 'Portland soccer sources',
  region: 'Portland, Oregon',
  location: 'Portland, Oregon',
  sportIds: ['sport_soccer'],
  sourceTypeHints: ['CLUB'],
  status: 'ACTIVE',
  autoCreateIntakes: true,
  searchIntervalMinutes: 10080,
  maxQueriesPerRun: 1,
  maxResultsPerQuery: 5,
  queryCursor: 0,
};

const prismaMock = {
  affiliateSourceDiscoveryCampaigns: {
    findUnique: jest.fn(async () => campaign),
    update: jest.fn(async ({ data }) => ({ ...campaign, ...data })),
  },
  affiliateSourceDiscoveryRuns: {
    findFirst: jest.fn(async ({ where }) => queuedRuns.find((run) => (
      run.status === 'QUEUED' && (!where.id || run.id === where.id)
    )) ?? null),
    updateMany: jest.fn(async ({ where, data }) => {
      const run = queuedRuns.find((entry) => entry.id === where.id && entry.status === where.status);
      if (!run) return { count: 0 };
      Object.assign(run, data, { attemptCount: (run.attemptCount ?? 0) + 1 });
      return { count: 1 };
    }),
    findUnique: jest.fn(async ({ where }) => queuedRuns.find((run) => run.id === where.id) ?? null),
    update: jest.fn(async ({ where, data }) => {
      const run = queuedRuns.find((entry) => entry.id === where.id);
      Object.assign(run, data);
      return run;
    }),
  },
  affiliateSourceDiscoveryResults: {
    findUnique: jest.fn(async ({ where }) => {
      if (where.id) return currentResult?.id === where.id ? currentResult : null;
      return currentResult?.campaignId === where.campaignId_urlKey.campaignId
        && currentResult?.urlKey === where.campaignId_urlKey.urlKey ? currentResult : null;
    }),
    findFirst: jest.fn(async ({ where }) => (
      currentResult?.policyKey === where.policyKey
      && currentResult?.matchingIntakeId ? { matchingIntakeId: currentResult.matchingIntakeId } : null
    )),
    create: jest.fn(async ({ data }) => {
      currentResult = { ...data };
      return currentResult;
    }),
    update: jest.fn(async ({ where, data }) => {
      if (currentResult?.id !== where.id) throw new Error('Result not found');
      currentResult = {
        ...currentResult,
        ...data,
        seenCount: data.seenCount?.increment
          ? currentResult.seenCount + data.seenCount.increment
          : data.seenCount ?? currentResult.seenCount,
      };
      return currentResult;
    }),
    findMany: jest.fn(async ({ where }) => (
      currentResult?.policyKey === where.policyKey && currentResult?.matchingIntakeId
        ? [{ id: currentResult.id, matchingIntakeId: currentResult.matchingIntakeId }]
        : []
    )),
    updateMany: jest.fn(async ({ where, data }) => {
      if (currentResult?.policyKey !== where.policyKey) return { count: 0 };
      if (where.status?.in && !where.status.in.includes(currentResult.status)) return { count: 0 };
      if (where.matchingIntakeId === null && currentResult.matchingIntakeId) return { count: 0 };
      if (where.matchingIntakeId?.not === null && !currentResult.matchingIntakeId) return { count: 0 };
      currentResult = { ...currentResult, ...data };
      return { count: 1 };
    }),
  },
  affiliateSourceDomainPolicies: {
    findUnique: jest.fn(async () => currentPolicy),
    create: jest.fn(async ({ data }) => {
      currentPolicy = { ...data };
      return currentPolicy;
    }),
    upsert: jest.fn(async ({ create, update }) => {
      currentPolicy = currentPolicy ? { ...currentPolicy, ...update } : { ...create };
      return currentPolicy;
    }),
  },
  affiliateSourceIntakes: {
    findUnique: jest.fn(async ({ where }) => where.id === 'intake_1' ? { id: 'intake_1' } : null),
    findFirst: jest.fn(async () => null),
  },
  affiliateSourceIntakePages: { findUnique: jest.fn(async () => null) },
  affiliateSourceIntakeRuns: { findFirst: jest.fn(async () => null) },
  affiliateScrapeSources: { findFirst: jest.fn(async () => null) },
  organizations: { findFirst: jest.fn(async () => null) },
  sports: { findMany: jest.fn(async () => [{ id: 'sport_soccer', name: 'Soccer' }]) },
};

const createIntakeMock = jest.fn(async () => ({ id: 'intake_1' }));
const addPageMock = jest.fn(async () => ({}));
const queueIntakeMock = jest.fn();
const reviewPolicyMock = jest.fn();
const processIntakeMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/id', () => ({ createId: () => `generated_${++idCounter}` }));
jest.mock('@/lib/prismaConfig', () => ({ resolvePrismaPgPoolConfig: () => ({}) }));
jest.mock('pg', () => ({ Client: jest.fn() }));
jest.mock('@/server/email', () => ({ isEmailEnabled: () => false, sendEmail: jest.fn() }));
jest.mock('@/server/affiliateImports/sourceIntake', () => ({
  createAffiliateSourceIntake: (...args: any[]) => createIntakeMock(...args),
  addAffiliateSourceIntakePage: (...args: any[]) => addPageMock(...args),
  queueAffiliateSourceIntakeRun: (...args: any[]) => queueIntakeMock(...args),
  reviewAffiliateSourceIntakePolicy: (...args: any[]) => reviewPolicyMock(...args),
  processNextAffiliateSourceIntakeRun: (...args: any[]) => processIntakeMock(...args),
}));

import {
  applyAffiliateSourceDomainPolicy,
  processNextAffiliateSourceDiscoveryRun,
} from '@/server/affiliateImports/sourceDiscovery';

describe('affiliate source discovery orchestration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    idCounter = 0;
    currentResult = null;
    currentPolicy = null;
    queuedRuns.splice(0, queuedRuns.length,
      { id: 'run_1', campaignId: campaign.id, requestedByUserId: 'admin_1', status: 'QUEUED', queuedAt: new Date(), attemptCount: 0 },
      { id: 'run_2', campaignId: campaign.id, requestedByUserId: 'admin_1', status: 'QUEUED', queuedAt: new Date(), attemptCount: 0 },
    );
  });

  it('reuses one discovery result and one intake while unknown policy prevents capture', async () => {
    const firecrawlClient = {
      searchSources: jest.fn(async () => ({
        request: { sources: ['web'], limit: 5 },
        response: { web: [{ url: 'https://portland-soccer.example.test/tryouts' }] },
        rows: [{
          url: 'https://portland-soccer.example.test/tryouts',
          title: 'Portland Oregon Soccer Club Tryouts Registration 2026',
          description: 'Official Portland soccer club registration and tryouts.',
          category: 'web',
        }],
        providerJobId: 'search_1',
      })),
      mapSourceUrls: jest.fn(),
      scrapeSourcePage: jest.fn(),
    };
    const fetchResource = jest.fn(async () => ({
      statusCode: 200,
      body: Buffer.from('User-agent: *\nDisallow:'),
    }));

    await processNextAffiliateSourceDiscoveryRun({ runId: 'run_1' }, { firecrawlClient, fetchResource });
    await processNextAffiliateSourceDiscoveryRun({ runId: 'run_2' }, { firecrawlClient, fetchResource });

    expect(currentResult).toMatchObject({
      seenCount: 2,
      matchingIntakeId: 'intake_1',
      status: 'REVIEW_REQUIRED',
    });
    expect(createIntakeMock).toHaveBeenCalledTimes(1);
    expect(addPageMock).toHaveBeenCalledTimes(1);
    expect(currentPolicy).toMatchObject({ status: 'NEEDS_REVIEW' });
    expect(queueIntakeMock).not.toHaveBeenCalled();
    expect(processIntakeMock).not.toHaveBeenCalled();
    expect(firecrawlClient.scrapeSourcePage).not.toHaveBeenCalled();
  });

  it('blocks a new result before an intake exists', async () => {
    currentResult = {
      id: 'result_1',
      policyKey: 'example.test',
      status: 'NEW',
      matchingIntakeId: null,
    };

    await applyAffiliateSourceDomainPolicy('example.test', {
      status: 'BLOCKED',
      restrictionNotes: 'Public policy prohibits automated access.',
    }, 'admin_1');

    expect(currentResult.status).toBe('BLOCKED');
    expect(currentPolicy).toMatchObject({ status: 'BLOCKED' });
    expect(createIntakeMock).not.toHaveBeenCalled();
    expect(queueIntakeMock).not.toHaveBeenCalled();
  });

  it('does not advance the campaign query cursor when every provider query fails', async () => {
    const firecrawlClient = {
      searchSources: jest.fn(async () => {
        throw new Error('Invalid request body');
      }),
      mapSourceUrls: jest.fn(),
      scrapeSourcePage: jest.fn(),
    };

    const result = await processNextAffiliateSourceDiscoveryRun(
      { runId: 'run_1' },
      { firecrawlClient },
    );

    expect(result?.run.status).toBe('FAILED');
    expect(prismaMock.affiliateSourceDiscoveryCampaigns.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ queryCursor: 0 }),
    }));
  });
});
