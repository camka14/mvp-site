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
  metadata: {
    coveredCities: [
      { city: 'Portland', state: 'Oregon' },
      { city: 'Gresham', state: 'Oregon' },
    ],
  },
};

const prismaMock = {
  affiliateSourceDiscoveryCampaigns: {
    findUnique: jest.fn(async () => campaign),
    findMany: jest.fn(async () => []),
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
    create: jest.fn(async ({ data }) => {
      const run = { ...data };
      queuedRuns.push(run);
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
    findMany: jest.fn(async () => []),
  },
  affiliateSourceIntakePages: {
    findUnique: jest.fn(async () => null),
    findMany: jest.fn(async () => []),
  },
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
const isEmailEnabledMock = jest.fn();
const sendEmailMock = jest.fn();
const mockPgClient = {
  connect: jest.fn(async () => undefined),
  query: jest.fn(async (sql: string) => ({
    rows: sql.includes('pg_try_advisory_lock') ? [{ locked: true }] : [],
  })),
  end: jest.fn(async () => undefined),
};

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/id', () => ({ createId: () => `generated_${++idCounter}` }));
jest.mock('@/lib/prismaConfig', () => ({ resolvePrismaPgPoolConfig: () => ({}) }));
jest.mock('pg', () => ({ Client: jest.fn(() => mockPgClient) }));
jest.mock('@/server/email', () => ({
  isEmailEnabled: () => isEmailEnabledMock(),
  sendEmail: (...args: unknown[]) => sendEmailMock(...args),
}));
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
  queueDueAffiliateSourceDiscoveryRuns,
  runAffiliateIntakeAutomation,
} from '@/server/affiliateImports/sourceDiscovery';

describe('affiliate source discovery orchestration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    idCounter = 0;
    currentResult = null;
    currentPolicy = null;
    mockPgClient.query.mockImplementation(async (sql: string) => ({
      rows: sql.includes('pg_try_advisory_lock') ? [{ locked: true }] : [],
    }));
    campaign.maxQueriesPerRun = 1;
    campaign.queryCursor = 0;
    campaign.sourceTypeHints = ['CLUB'];
    prismaMock.affiliateSourceDiscoveryCampaigns.findMany.mockResolvedValue([]);
    prismaMock.affiliateSourceIntakes.findMany.mockResolvedValue([]);
    prismaMock.affiliateSourceIntakePages.findMany.mockResolvedValue([]);
    isEmailEnabledMock.mockReturnValue(true);
    sendEmailMock.mockResolvedValue(undefined);
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
    expect(firecrawlClient.searchSources).toHaveBeenCalledWith(
      expect.stringContaining('Portland, Oregon'),
      expect.objectContaining({ location: 'Portland, Oregon' }),
    );
    expect(prismaMock.affiliateSourceDiscoveryResults.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        campaignId: campaign.id,
        policyKey: 'example.test',
      }),
    }));
    expect(prismaMock.affiliateSourceIntakes.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        region: campaign.region,
        baseUrl: expect.objectContaining({ in: expect.any(Array) }),
      }),
    }));
    expect(prismaMock.organizations.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        website: expect.objectContaining({ in: expect.any(Array) }),
      },
    }));
  });

  it('does not auto-create an intake for an intermediary even when its keyword score is high', async () => {
    const searchClient = {
      searchSources: jest.fn(async () => ({
        request: {},
        response: {},
        rows: [{
          url: 'https://www.yelp.com/search?find_desc=Soccer+League&find_loc=Portland%2C+OR',
          title: 'Portland Oregon Soccer League Events Registration 2026',
          description: 'Find sports clubs, schedules, registration, and events.',
          category: 'web',
        }],
        providerJobId: null,
      })),
    };

    await processNextAffiliateSourceDiscoveryRun({ runId: 'run_1' }, { searchClient });

    expect(currentResult).toMatchObject({
      status: 'REVIEW_REQUIRED',
      matchingIntakeId: null,
    });
    expect(currentResult.reasonCodes).toContain('INTERMEDIARY_SOURCE');
    expect(createIntakeMock).not.toHaveBeenCalled();
    expect(queuedRuns[0].summary).toEqual(expect.objectContaining({
      outcomes: expect.objectContaining({
        newReview: 1,
        autoIntakeCreated: 0,
      }),
    }));
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

  it('allows and queues a directory child intake without a discovery-result link', async () => {
    prismaMock.affiliateSourceIntakes.findMany.mockResolvedValue([
      { id: 'directory_child_1', baseUrl: 'https://club.example.test' },
    ]);
    prismaMock.affiliateSourceIntakePages.findMany.mockImplementation(async ({ where }: any) => (
      where?.intakeId === 'directory_child_1'
        ? [{ id: 'page_child_1' }]
        : [{ intakeId: 'directory_child_1', canonicalUrl: 'https://club.example.test/events' }]
    ));

    const result = await applyAffiliateSourceDomainPolicy('example.test', {
      status: 'ALLOWED',
      termsUrl: 'https://club.example.test/terms',
      robotsSummary: 'Public listing pages are crawlable.',
    }, 'codex-luna-approval-vm-1');

    expect(result.intakeIds).toEqual(['directory_child_1']);
    expect(reviewPolicyMock).toHaveBeenCalledWith(
      'directory_child_1',
      expect.objectContaining({ complianceStatus: 'ALLOWED' }),
      'codex-luna-approval-vm-1',
    );
    expect(queueIntakeMock).toHaveBeenCalledWith(
      'directory_child_1',
      ['page_child_1'],
      'codex-luna-approval-vm-1',
    );
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

  it('queues only the highest-priority due location', async () => {
    queuedRuns.splice(0, queuedRuns.length);
    prismaMock.affiliateSourceDiscoveryCampaigns.findMany.mockResolvedValue([
      { ...campaign, id: 'campaign_2', name: 'Los Angeles', metadata: { priorityRank: 2 } },
      { ...campaign, id: 'campaign_1', name: 'New York', metadata: { priorityRank: 1 } },
    ]);

    await expect(queueDueAffiliateSourceDiscoveryRuns(new Date('2026-07-21T12:00:00Z'))).resolves.toBe(1);
    expect(queuedRuns).toHaveLength(1);
    expect(queuedRuns[0].campaignId).toBe('campaign_1');
  });

  it('continues an incomplete due campaign within the same automation run', async () => {
    queuedRuns.splice(0, queuedRuns.length);
    prismaMock.affiliateSourceDiscoveryCampaigns.findMany.mockResolvedValue([campaign]);
    const firecrawlClient = {
      searchSources: jest.fn(async () => ({
        request: {},
        response: {},
        rows: [],
        providerJobId: null,
      })),
      mapSourceUrls: jest.fn(),
      scrapeSourcePage: jest.fn(),
    };
    const now = new Date('2026-07-21T12:00:00Z');

    const result = await runAffiliateIntakeAutomation(
      { discoveryLimit: 3, intakeLimit: 1, sendSummary: false },
      { firecrawlClient, now: () => now },
    );

    expect(result.queuedCampaigns).toBe(3);
    expect(result.discoveryRuns).toHaveLength(3);
    expect(firecrawlClient.searchSources).toHaveBeenCalledTimes(3);
  });

  it('does not email from the frequent intake worker unless explicitly requested', async () => {
    queuedRuns.splice(0, queuedRuns.length);
    prismaMock.affiliateSourceDiscoveryCampaigns.findMany.mockResolvedValue([campaign]);
    const firecrawlClient = {
      searchSources: jest.fn(async () => ({
        request: {},
        response: {},
        rows: [],
        providerJobId: null,
      })),
      mapSourceUrls: jest.fn(),
      scrapeSourcePage: jest.fn(),
    };

    const result = await runAffiliateIntakeAutomation(
      { discoveryLimit: 1, intakeLimit: 1 },
      { firecrawlClient, now: () => new Date('2026-07-21T12:00:00Z') },
    );

    expect(result.discoveryRuns).toHaveLength(1);
    expect(result.emailSent).toBe(false);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('makes an incomplete location query cycle immediately due again', async () => {
    campaign.maxQueriesPerRun = 2;
    campaign.sourceTypeHints = ['CLUB', 'TRYOUT'];
    const now = new Date('2026-07-21T12:00:00Z');
    const firecrawlClient = {
      searchSources: jest.fn(async () => ({ request: {}, response: {}, rows: [], providerJobId: null })),
      mapSourceUrls: jest.fn(),
      scrapeSourcePage: jest.fn(),
    };

    await processNextAffiliateSourceDiscoveryRun(
      { runId: 'run_1' },
      { firecrawlClient, now: () => now },
    );

    expect(prismaMock.affiliateSourceDiscoveryCampaigns.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ queryCursor: 2, nextRunAt: now }),
    }));
  });

  it('retains the strongest evaluation when one URL appears in multiple queries in the same run', async () => {
    campaign.autoCreateIntakes = false;
    campaign.maxQueriesPerRun = 2;
    campaign.sourceTypeHints = ['RENTAL'];
    campaign.sportIds = ['sport_grass_soccer', 'sport_hockey'];
    campaign.metadata = {
      coveredCities: [{ city: 'Portland', state: 'Oregon' }],
    };
    prismaMock.sports.findMany.mockResolvedValueOnce([
      { id: 'sport_grass_soccer', name: 'Grass Soccer' },
      { id: 'sport_hockey', name: 'Hockey' },
    ]);
    const searchClient = {
      searchSources: jest.fn(async () => ({
        request: {},
        response: {},
        rows: [{
          url: 'https://rentals.example.test/portland/reservations/soccer-fields',
          title: 'Soccer Fields For Rent In Portland, Oregon',
          description: 'Reserve an outdoor soccer field online.',
          category: 'web',
        }],
        providerJobId: null,
      })),
    };

    await processNextAffiliateSourceDiscoveryRun({ runId: 'run_1' }, { searchClient });

    expect(searchClient.searchSources).toHaveBeenCalledTimes(2);
    expect(currentResult).toMatchObject({
      status: 'NEW',
      score: expect.any(Number),
      sourceTypeHints: expect.arrayContaining(['RENTAL']),
      sportHints: expect.arrayContaining(['sport_grass_soccer']),
      latestQuery: expect.stringContaining('outdoor soccer'),
      seenCount: 2,
    });
    expect(currentResult.score).toBeGreaterThanOrEqual(75);
    expect(currentResult.reasonCodes).toEqual(expect.arrayContaining([
      'SELECTED_SPORT',
      'PROFILE_ALIGNED',
      'AUTO_PROMOTION_ELIGIBLE',
    ]));
  });
});
