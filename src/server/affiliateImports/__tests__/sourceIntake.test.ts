/** @jest-environment node */

const prismaMock = {
  affiliateSourceIntakes: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  affiliateSourceIntakePages: {
    findMany: jest.fn(),
    update: jest.fn(),
  },
  affiliateSourceIntakeRuns: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    updateMany: jest.fn(),
    update: jest.fn(),
  },
  affiliateSourceIntakeArtifacts: {},
};

const persistArtifactMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/id', () => ({ createId: () => 'generated_id' }));
jest.mock('@/server/affiliateImports/sourceIntakeArtifacts', () => ({
  INTAKE_RUN_ARTIFACT_LIMIT_BYTES: 20 * 1024 * 1024,
  persistAffiliateSourceIntakeArtifact: (...args: unknown[]) => persistArtifactMock(...args),
  readAffiliateSourceIntakeArtifact: jest.fn(),
}));

import {
  classifyAffiliateSourceEvidence,
  processNextAffiliateSourceIntakeRun,
  queueAffiliateSourceIntakeRun,
} from '@/server/affiliateImports/sourceIntake';

describe('affiliate source intake service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    persistArtifactMock.mockResolvedValue({ id: 'artifact_1' });
    prismaMock.affiliateSourceIntakes.update.mockImplementation(async ({ data }) => data);
    prismaMock.affiliateSourceIntakePages.update.mockImplementation(async ({ data }) => data);
    prismaMock.affiliateSourceIntakeRuns.update.mockImplementation(async ({ data }) => data);
  });

  it('does not queue an inspection until policy review allows the source', async () => {
    prismaMock.affiliateSourceIntakes.findUnique.mockResolvedValue({
      id: 'intake_1',
      complianceStatus: 'UNREVIEWED',
    });

    await expect(queueAffiliateSourceIntakeRun('intake_1', ['page_1'], 'admin_1'))
      .rejects.toThrow('policy must be reviewed and allowed');
    expect(prismaMock.affiliateSourceIntakeRuns.create).not.toHaveBeenCalled();
  });

  it('does not call Firecrawl when robots disallows the selected page', async () => {
    const run = {
      id: 'run_1',
      intakeId: 'intake_1',
      requestedPageIds: ['page_1'],
      status: 'QUEUED',
    };
    const page = {
      id: 'page_1',
      intakeId: 'intake_1',
      url: 'https://example.com/private/events',
      status: 'ACTIVE',
      createdAt: new Date(),
    };
    prismaMock.affiliateSourceIntakeRuns.findFirst.mockResolvedValue(run);
    prismaMock.affiliateSourceIntakeRuns.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.affiliateSourceIntakeRuns.findUnique.mockResolvedValue({ ...run, status: 'RUNNING' });
    prismaMock.affiliateSourceIntakes.findUnique.mockResolvedValue({
      id: 'intake_1',
      complianceStatus: 'ALLOWED',
    });
    prismaMock.affiliateSourceIntakePages.findMany.mockResolvedValue([page]);
    const firecrawlClient = {
      mapSourceUrls: jest.fn(),
      scrapeSourcePage: jest.fn(),
    };
    const fetchResource = jest.fn().mockResolvedValue({
      url: 'https://example.com/robots.txt',
      finalUrl: 'https://example.com/robots.txt',
      statusCode: 200,
      contentType: 'text/plain',
      body: Buffer.from('User-agent: *\nDisallow: /private/\n'),
    });

    const result = await processNextAffiliateSourceIntakeRun(
      { runId: 'run_1', workerId: 'worker_1' },
      { firecrawlClient, fetchResource },
    );

    expect(firecrawlClient.scrapeSourcePage).not.toHaveBeenCalled();
    expect(firecrawlClient.mapSourceUrls).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({
      summary: expect.objectContaining({
        blockedPages: [expect.objectContaining({ pageId: 'page_1' })],
      }),
    }));
    expect(prismaMock.affiliateSourceIntakeRuns.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'BLOCKED' }),
    }));
  });

  it('keeps source classification advisory and evidence-based', () => {
    expect(classifyAffiliateSourceEvidence(
      'Competitive soccer academy tryouts and club teams',
      ['https://example.com/tryouts'],
    )).toEqual(expect.objectContaining({
      type: 'EVENT_CATALOG',
      confidence: expect.any(Number),
    }));
  });
});
