/** @jest-environment node */

const prismaMock = {
  affiliateSourceIntakes: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  affiliateSourceIntakePages: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  affiliateSourceIntakeRuns: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    updateMany: jest.fn(),
    update: jest.fn(),
  },
  affiliateSourceIntakeArtifacts: {},
  affiliateSourceDomainPolicies: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
  },
  affiliateSourceDiscoveryResults: {
    updateMany: jest.fn(),
  },
  affiliateSourceMappingJobs: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
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
  findStaleAffiliateSourceIntakeRuns,
  processNextAffiliateSourceIntakeRun,
  queueAffiliateSourceIntakeRun,
  recoverStaleAffiliateSourceIntakeRuns,
  reviewAffiliateSourceIntakePolicy,
} from '@/server/affiliateImports/sourceIntake';

describe('affiliate source intake service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    persistArtifactMock.mockResolvedValue({ id: 'artifact_1' });
    prismaMock.affiliateSourceIntakes.update.mockImplementation(async ({ data }) => data);
    prismaMock.affiliateSourceIntakePages.update.mockImplementation(async ({ data }) => data);
    prismaMock.affiliateSourceIntakePages.findUnique.mockResolvedValue(null);
    prismaMock.affiliateSourceIntakePages.findFirst.mockResolvedValue(null);
    prismaMock.affiliateSourceIntakePages.create.mockImplementation(async ({ data }) => data);
    prismaMock.affiliateSourceIntakeRuns.update.mockImplementation(async ({ data }) => data);
    (prismaMock.affiliateSourceIntakeArtifacts as any).count = jest.fn().mockResolvedValue(2);
    prismaMock.affiliateSourceMappingJobs.findFirst.mockResolvedValue(null);
    prismaMock.affiliateSourceMappingJobs.create.mockResolvedValue({ id: 'mapping_job_1' });
    prismaMock.affiliateSourceDomainPolicies.findUnique.mockResolvedValue(null);
    prismaMock.affiliateSourceDomainPolicies.upsert.mockResolvedValue({});
    prismaMock.affiliateSourceDiscoveryResults.updateMany.mockResolvedValue({ count: 0 });
  });

  it('can record an allowed policy review without auto-queueing unrelated intake pages', async () => {
    prismaMock.affiliateSourceIntakes.findUnique.mockResolvedValue({
      id: 'intake_1',
      baseUrl: 'https://example.com',
      complianceStatus: 'UNREVIEWED',
    });
    prismaMock.affiliateSourceIntakes.update.mockResolvedValue({
      id: 'intake_1',
      complianceStatus: 'ALLOWED',
    });

    await reviewAffiliateSourceIntakePolicy(
      'intake_1',
      {
        complianceStatus: 'ALLOWED',
        notes: 'Approved existing mapping; robots will be checked during capture.',
      },
      'admin_1',
      { queueCaptureOnAllow: false },
    );

    expect(prismaMock.affiliateSourceDomainPolicies.upsert).toHaveBeenCalled();
    expect(prismaMock.affiliateSourceIntakeRuns.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.affiliateSourceIntakeRuns.create).not.toHaveBeenCalled();
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
    expect(fetchResource).toHaveBeenCalledWith(
      'https://example.com/robots.txt',
      expect.objectContaining({ maxBytes: 4 * 1024 * 1024 }),
    );
    expect(result).toEqual(expect.objectContaining({
      summary: expect.objectContaining({
        blockedPages: [expect.objectContaining({ pageId: 'page_1' })],
      }),
    }));
    expect(prismaMock.affiliateSourceIntakeRuns.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'run_1', status: 'RUNNING', workerId: 'worker_1' }),
      data: expect.objectContaining({ status: 'BLOCKED' }),
    }));
  });

  it('preserves an abandoned capture attempt and queues one fresh replacement', async () => {
    const now = new Date('2026-08-02T01:30:00.000Z');
    const staleRun = {
      id: 'stale_run_1',
      intakeId: 'intake_1',
      requestedPageIds: ['page_1'],
      requestedByUserId: 'admin_1',
      provider: 'SCRAPINGDOG',
      status: 'RUNNING',
      startedAt: new Date('2026-08-02T00:00:00.000Z'),
      claimedAt: new Date('2026-08-02T00:00:00.000Z'),
      workerId: 'dead_worker',
      attemptCount: 1,
      summary: { prior: true },
    };
    prismaMock.affiliateSourceIntakeRuns.findMany.mockResolvedValue([staleRun]);
    prismaMock.affiliateSourceIntakeRuns.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.affiliateSourceIntakeRuns.findFirst.mockResolvedValue(null);
    prismaMock.affiliateSourceIntakeRuns.create.mockImplementation(async ({ data }) => data);

    const preview = await findStaleAffiliateSourceIntakeRuns({ now, maxAgeMs: 30 * 60 * 1000 });
    const recovered = await recoverStaleAffiliateSourceIntakeRuns({
      runIds: [staleRun.id],
      now,
      maxAgeMs: 30 * 60 * 1000,
    });

    expect(preview).toEqual([staleRun]);
    expect(prismaMock.affiliateSourceIntakeRuns.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: staleRun.id,
        status: 'RUNNING',
        workerId: staleRun.workerId,
      }),
      data: expect.objectContaining({
        status: 'FAILED',
        errorMessage: expect.stringContaining('replacement run generated_id was queued'),
      }),
    }));
    expect(prismaMock.affiliateSourceIntakeRuns.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: 'generated_id',
        intakeId: staleRun.intakeId,
        requestedPageIds: staleRun.requestedPageIds,
        status: 'QUEUED',
      }),
    });
    expect(recovered).toEqual([{
      staleRunId: staleRun.id,
      replacementRunId: 'generated_id',
      intakeId: staleRun.intakeId,
    }]);
  });

  it('does not let a late worker overwrite a run after its lease was recovered', async () => {
    const run = {
      id: 'run_lost',
      intakeId: 'intake_1',
      requestedPageIds: ['page_1'],
      provider: 'SCRAPINGDOG',
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
    prismaMock.affiliateSourceIntakeRuns.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    prismaMock.affiliateSourceIntakeRuns.findUnique.mockResolvedValue({ ...run, status: 'RUNNING' });
    prismaMock.affiliateSourceIntakes.findUnique.mockResolvedValue({
      id: 'intake_1',
      complianceStatus: 'ALLOWED',
    });
    prismaMock.affiliateSourceIntakePages.findMany.mockResolvedValue([page]);
    const fetchResource = jest.fn().mockResolvedValue({
      finalUrl: 'https://example.com/robots.txt',
      statusCode: 200,
      contentType: 'text/plain',
      body: Buffer.from('User-agent: *\nDisallow: /private/\n'),
    });

    const result = await processNextAffiliateSourceIntakeRun(
      { runId: run.id, workerId: 'late_worker' },
      {
        captureClient: {
          provider: 'SCRAPINGDOG',
          captureSourcePage: jest.fn(),
          captureScreenshot: jest.fn(),
        },
        fallbackCaptureClient: null,
        fetchResource,
      },
    );

    expect(result).toEqual(expect.objectContaining({
      runId: run.id,
      status: 'LEASE_LOST',
      leaseLost: true,
    }));
    expect(prismaMock.affiliateSourceIntakes.update).not.toHaveBeenCalled();
  });

  it('records an authentication-gated registration action without invoking a scraper', async () => {
    const run = {
      id: 'run_access',
      intakeId: 'intake_1',
      requestedPageIds: ['page_registration'],
      provider: 'SCRAPINGDOG',
      status: 'QUEUED',
    };
    const page = {
      id: 'page_registration',
      intakeId: 'intake_1',
      url: 'https://example.com/events/register',
      role: 'REGISTRATION',
      status: 'ACTIVE',
      createdAt: new Date(),
    };
    prismaMock.affiliateSourceIntakeRuns.findFirst.mockResolvedValue(run);
    prismaMock.affiliateSourceIntakeRuns.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.affiliateSourceIntakeRuns.findUnique.mockResolvedValue({ ...run, status: 'RUNNING' });
    prismaMock.affiliateSourceIntakes.findUnique.mockResolvedValue({
      id: 'intake_1',
      complianceStatus: 'ALLOWED',
      affiliateSourceId: 'source_1',
    });
    prismaMock.affiliateSourceIntakePages.findMany.mockResolvedValue([page]);
    const captureClient = {
      provider: 'SCRAPINGDOG' as const,
      captureSourcePage: jest.fn(),
      captureScreenshot: jest.fn(),
    };
    const fetchResource = jest.fn()
      .mockResolvedValueOnce({
        finalUrl: 'https://example.com/robots.txt',
        statusCode: 200,
        contentType: 'text/plain',
        body: Buffer.from('User-agent: *\nDisallow:\n'),
      })
      .mockResolvedValueOnce({
        finalUrl: page.url,
        statusCode: 401,
        contentType: 'text/html',
        body: Buffer.from('Sign in required'),
      });

    const result = await processNextAffiliateSourceIntakeRun(
      { runId: run.id, workerId: 'worker_1' },
      {
        captureClient,
        fallbackCaptureClient: null,
        screenshotMode: 'none',
        fetchResource,
      },
    );

    expect(captureClient.captureSourcePage).not.toHaveBeenCalled();
    expect(persistArtifactMock).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'PAGE_ACCESS_STATUS',
      provider: 'DIRECT',
      httpStatus: 401,
    }));
    expect(result).toEqual(expect.objectContaining({
      run: expect.objectContaining({ status: 'SUCCEEDED' }),
      summary: expect.objectContaining({
        restrictedPages: [expect.objectContaining({
          pageId: page.id,
          statusCode: 401,
        })],
        classification: expect.objectContaining({ type: 'AUTH_REQUIRED' }),
      }),
    }));
  });

  it('stores ScrapingDog HTML and locally derived artifacts before queuing mapping', async () => {
    const run = {
      id: 'run_1',
      intakeId: 'intake_1',
      requestedPageIds: ['page_1'],
      provider: 'SCRAPINGDOG',
      status: 'QUEUED',
    };
    const page = {
      id: 'page_1',
      intakeId: 'intake_1',
      url: 'https://example.com/events',
      status: 'ACTIVE',
      createdAt: new Date(),
    };
    prismaMock.affiliateSourceIntakeRuns.findFirst.mockResolvedValue(run);
    prismaMock.affiliateSourceIntakeRuns.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.affiliateSourceIntakeRuns.findUnique.mockResolvedValue({ ...run, status: 'RUNNING' });
    prismaMock.affiliateSourceIntakes.findUnique.mockResolvedValue({
      id: 'intake_1',
      complianceStatus: 'ALLOWED',
      affiliateSourceId: null,
    });
    prismaMock.affiliateSourceIntakePages.findMany.mockResolvedValue([page]);
    const captureClient = {
      provider: 'SCRAPINGDOG' as const,
      captureSourcePage: jest.fn().mockResolvedValue({
        provider: 'SCRAPINGDOG',
        request: { provider: 'SCRAPINGDOG', endpoint: '/scrape' },
        response: { statusCode: 200 },
        requestedUrl: page.url,
        finalUrl: page.url,
        providerStatusCode: 200,
        targetStatusCode: null,
        rawHtml: '<html><head><title>Summer League</title></head><body><main><h1>Summer Soccer League</h1><p>Registration opens July 1 for $75.</p><a href="/register">Register</a></main></body></html>',
        renderMode: 'STATIC',
        elapsedMs: 125,
        estimatedCredits: 1,
        warnings: [],
        providerJobId: 'scrapingdog_1',
      }),
      captureScreenshot: jest.fn(),
    };
    const fetchResource = jest.fn().mockResolvedValue({
      url: 'https://example.com/robots.txt',
      finalUrl: 'https://example.com/robots.txt',
      statusCode: 200,
      contentType: 'text/plain',
      body: Buffer.from('User-agent: *\nDisallow:\n'),
    });
    const discoverPages = jest.fn().mockResolvedValue({
      request: { sourceUrl: page.url },
      response: { counts: { CAPTURED_LINK: 1 } },
      links: [],
      warnings: [],
      providerJobId: null,
    });

    const result = await processNextAffiliateSourceIntakeRun(
      { runId: 'run_1', workerId: 'worker_1' },
      {
        captureClient,
        fallbackCaptureClient: null,
        screenshotMode: 'none',
        fetchResource,
        discoverPages,
      },
    );

    expect(captureClient.captureSourcePage).toHaveBeenCalledWith(page.url);
    expect(captureClient.captureScreenshot).not.toHaveBeenCalled();
    expect(discoverPages).toHaveBeenCalledWith(expect.objectContaining({
      sourceUrl: page.url,
      capturedLinks: ['https://example.com/register'],
    }));
    expect(persistArtifactMock).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'PAGE_HTML',
      provider: 'SCRAPINGDOG',
    }));
    expect(persistArtifactMock).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'PAGE_MARKDOWN',
      provider: 'SCRAPINGDOG',
    }));
    expect(result?.run.status).toBe('SUCCEEDED');
    expect(result?.summary.estimatedCredits).toBe(1);
    expect(prismaMock.affiliateSourceMappingJobs.create).toHaveBeenCalledWith({
      data: { id: 'generated_id', intakeId: 'intake_1', status: 'QUEUED' },
    });
  });

  it('uses an explicitly configured fallback when ScrapingDog capture quality is rejected', async () => {
    const run = {
      id: 'run_1',
      intakeId: 'intake_1',
      requestedPageIds: ['page_1'],
      provider: 'SCRAPINGDOG',
      status: 'QUEUED',
    };
    const page = {
      id: 'page_1',
      intakeId: 'intake_1',
      url: 'https://example.com/events',
      status: 'ACTIVE',
      createdAt: new Date(),
    };
    prismaMock.affiliateSourceIntakeRuns.findFirst.mockResolvedValue(run);
    prismaMock.affiliateSourceIntakeRuns.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.affiliateSourceIntakeRuns.findUnique.mockResolvedValue({ ...run, status: 'RUNNING' });
    prismaMock.affiliateSourceIntakes.findUnique.mockResolvedValue({
      id: 'intake_1',
      complianceStatus: 'ALLOWED',
      affiliateSourceId: null,
    });
    prismaMock.affiliateSourceIntakePages.findMany.mockResolvedValue([page]);
    const captureClient = {
      provider: 'SCRAPINGDOG' as const,
      captureSourcePage: jest.fn().mockResolvedValue({
        provider: 'SCRAPINGDOG',
        request: { provider: 'SCRAPINGDOG', endpoint: '/scrape' },
        response: { statusCode: 200 },
        requestedUrl: page.url,
        finalUrl: page.url,
        providerStatusCode: 200,
        targetStatusCode: null,
        rawHtml: '<html><body><div id="app">Loading...</div></body></html>',
        renderMode: 'JAVASCRIPT',
        elapsedMs: 300,
        estimatedCredits: 5,
        warnings: [],
        providerJobId: 'scrapingdog_1',
      }),
      captureScreenshot: jest.fn(),
    };
    const fallbackCaptureClient = {
      provider: 'FIRECRAWL' as const,
      captureSourcePage: jest.fn().mockResolvedValue({
        provider: 'FIRECRAWL',
        request: { provider: 'FIRECRAWL', endpoint: '/scrape' },
        response: { statusCode: 200 },
        requestedUrl: page.url,
        finalUrl: page.url,
        providerStatusCode: 200,
        targetStatusCode: 200,
        rawHtml: '<html><body><main><h1>Fall Volleyball League</h1><p>Registration is open for the September season. Teams play eight matches at the official facility.</p><a href="/register">Register</a></main></body></html>',
        renderMode: 'JAVASCRIPT',
        elapsedMs: 500,
        estimatedCredits: null,
        warnings: [],
        providerJobId: 'firecrawl_1',
      }),
      captureScreenshot: jest.fn(),
    };
    const fetchResource = jest.fn().mockResolvedValue({
      url: 'https://example.com/robots.txt',
      finalUrl: 'https://example.com/robots.txt',
      statusCode: 200,
      contentType: 'text/plain',
      body: Buffer.from('User-agent: *\nDisallow:\n'),
    });
    const discoverPages = jest.fn().mockResolvedValue({
      request: { sourceUrl: page.url },
      response: { counts: { CAPTURED_LINK: 1 } },
      links: [],
      warnings: [],
      providerJobId: null,
    });

    const result = await processNextAffiliateSourceIntakeRun(
      { runId: 'run_1', workerId: 'worker_1' },
      {
        captureClient,
        fallbackCaptureClient,
        screenshotMode: 'none',
        fetchResource,
        discoverPages,
      },
    );

    expect(fallbackCaptureClient.captureSourcePage).toHaveBeenCalledWith(page.url);
    expect(result?.summary.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining('capture quality was rejected'),
    ]));
    expect(persistArtifactMock).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'PAGE_HTML',
      provider: 'FIRECRAWL',
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

  it('classifies league and tournament catalogs ahead of incidental rental copy', () => {
    expect(classifyAffiliateSourceEvidence(
      'Youth football league and tournament registration. Equipment rentals may be available.',
      ['https://example.com/leagues'],
    )).toEqual(expect.objectContaining({
      type: 'EVENT_CATALOG',
    }));
  });
});
