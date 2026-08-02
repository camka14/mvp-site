/** @jest-environment node */

const prismaMock = {
  affiliateApprovalJobs: { findUnique: jest.fn() },
  affiliateSourceMappingJobs: { findUnique: jest.fn() },
  affiliateSourceIntakes: { findUnique: jest.fn(), update: jest.fn() },
  affiliateSourceIntakePages: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  affiliateSourceIntakeRuns: { create: jest.fn(), update: jest.fn() },
};

let generatedId = 0;
jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/id', () => ({ createId: () => `generated_${++generatedId}` }));

import {
  captureAffiliateApprovalLogoEvidence,
  collectAffiliatePageImageReferences,
} from '@/server/affiliateImports/approvalLogoEvidence';

const reviewResult = {
  schemaVersion: 1 as const,
  jobId: 'mapping_1',
  intakeId: 'intake_1',
  sourceKey: 'example-club',
  workerId: 'producer_1',
  status: 'REVIEW_REQUIRED' as const,
  branch: 'codex/example-club',
  commit: 'a'.repeat(40),
  generatedPaths: ['scripts/setup-example-club-affiliate-source.ts'],
  logoDisposition: 'MANUAL_REVIEW' as const,
  candidateCount: 1,
  reviewScrapes: [
    { runId: 'scrape_1', candidateCount: 1, normalizedCandidateSha256: 'b'.repeat(64), passed: true },
    { runId: 'scrape_2', candidateCount: 1, normalizedCandidateSha256: 'b'.repeat(64), passed: true },
  ],
  validation: {
    testsPassed: true,
    diffCheckPassed: true,
    duplicateSafe: true,
    warnings: [],
  },
  errorMessage: null,
};

const logoSvg = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#123456"/></svg>',
  'utf8',
);

describe('affiliate approval supplemental logo evidence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    generatedId = 0;
    prismaMock.affiliateApprovalJobs.findUnique.mockResolvedValue({
      id: 'approval_1',
      subjectType: 'MAPPING_PACKAGE',
      subjectKey: 'mapping_1',
      status: 'CLAIMED',
      reviewerId: 'reviewer_1',
    });
    prismaMock.affiliateSourceMappingJobs.findUnique.mockResolvedValue({
      id: 'mapping_1',
      intakeId: 'intake_1',
      resultSummary: { result: reviewResult },
    });
    prismaMock.affiliateSourceIntakes.findUnique.mockResolvedValue({
      id: 'intake_1',
      baseUrl: 'https://example.com',
      lastRunId: 'prior_run',
    });
    prismaMock.affiliateSourceIntakes.update.mockImplementation(async ({ data }) => data);
    prismaMock.affiliateSourceIntakePages.findMany.mockResolvedValue([{
      id: 'page_1',
      intakeId: 'intake_1',
      url: 'https://example.com',
      canonicalUrl: 'https://example.com/',
    }]);
    prismaMock.affiliateSourceIntakePages.findUnique.mockResolvedValue({
      id: 'page_1',
      intakeId: 'intake_1',
      url: 'https://example.com',
    });
    prismaMock.affiliateSourceIntakePages.update.mockImplementation(async ({ data }) => data);
    prismaMock.affiliateSourceIntakeRuns.create.mockImplementation(async ({ data }) => data);
    prismaMock.affiliateSourceIntakeRuns.update.mockImplementation(async ({ data }) => data);
  });

  it('resolves image, srcset, and CSS logo references against the official page', () => {
    const references = collectAffiliatePageImageReferences(`
      <img src="/logo.svg" srcset="/logo-small.svg 1x, /logo-large.svg 2x">
      <div style="background-image: url('/crest.png')"></div>
    `, 'https://example.com/about');

    expect([...references]).toEqual(expect.arrayContaining([
      'https://example.com/logo.svg',
      'https://example.com/logo-large.svg',
      'https://example.com/crest.png',
    ]));
  });

  it('stores a reviewer-verified official logo without assigning or normalizing it', async () => {
    const captureClient = {
      provider: 'SCRAPINGDOG' as const,
      captureSourcePage: jest.fn().mockResolvedValue({
        provider: 'SCRAPINGDOG',
        request: { endpoint: '/scrape' },
        response: { statusCode: 200 },
        requestedUrl: 'https://example.com/',
        finalUrl: 'https://example.com/',
        providerStatusCode: 200,
        targetStatusCode: 200,
        rawHtml: '<html><body><header><img src="https://cdn.example.net/official-logo.svg" alt="Example Club logo"></header><main><h1>Example Club</h1></main></body></html>',
        renderMode: 'STATIC' as const,
        elapsedMs: 10,
        estimatedCredits: 1,
        warnings: [],
        providerJobId: 'provider_1',
      }),
      captureScreenshot: jest.fn(),
    };
    const fetchResource = jest.fn()
      .mockResolvedValueOnce({
        body: Buffer.from('User-agent: *\nDisallow:\n'),
        finalUrl: 'https://example.com/robots.txt',
        statusCode: 200,
        contentType: 'text/plain',
        headers: {},
      })
      .mockResolvedValueOnce({
        body: logoSvg,
        finalUrl: 'https://cdn.example.net/official-logo.svg',
        statusCode: 200,
        contentType: 'image/svg+xml',
        headers: {},
      });
    const persistArtifact = jest.fn(async (input) => ({
      id: input.kind === 'LOGO_CANDIDATE' ? 'logo_artifact_1' : `artifact_${input.kind}`,
    })) as any;

    const result = await captureAffiliateApprovalLogoEvidence({
      approvalJobId: 'approval_1',
      mappingJobId: 'mapping_1',
      reviewerId: 'reviewer_1',
      pageUrl: 'https://example.com/',
      logoUrl: 'https://cdn.example.net/official-logo.svg',
    }, {
      captureClient,
      fetchResource,
      assertSafeUrl: jest.fn().mockResolvedValue({}),
      persistArtifact,
      now: () => new Date('2026-08-02T01:30:00.000Z'),
    });

    expect(result).toEqual(expect.objectContaining({
      intakeId: 'intake_1',
      logoArtifactId: 'logo_artifact_1',
      producerAction: 'REJECT_WITH_OFFICIAL_LOGO_REPAIR_REQUIRED',
    }));
    expect(persistArtifact).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'LOGO_CANDIDATE',
      sourceUrl: 'https://cdn.example.net/official-logo.svg',
      provider: 'APPROVAL_REVIEW',
      metadata: expect.objectContaining({
        approvalJobId: 'approval_1',
        mappingJobId: 'mapping_1',
        evidencePageUrl: 'https://example.com/',
      }),
    }));
    expect(prismaMock.affiliateSourceIntakes.update).toHaveBeenCalledWith({
      where: { id: 'intake_1' },
      data: { lastRunId: result.runId },
    });
  });

  it('refuses an image URL that the official page did not reference', async () => {
    const captureClient = {
      provider: 'SCRAPINGDOG' as const,
      captureSourcePage: jest.fn().mockResolvedValue({
        provider: 'SCRAPINGDOG',
        request: {},
        response: {},
        requestedUrl: 'https://example.com/',
        finalUrl: 'https://example.com/',
        providerStatusCode: 200,
        targetStatusCode: 200,
        rawHtml: '<html><body><main><h1>Example Club</h1><p>Official programs and registration.</p></main></body></html>',
        renderMode: 'STATIC' as const,
        elapsedMs: 10,
        estimatedCredits: 1,
        warnings: [],
      }),
      captureScreenshot: jest.fn(),
    };
    const fetchResource = jest.fn().mockResolvedValue({
      body: Buffer.from('User-agent: *\nDisallow:\n'),
      finalUrl: 'https://example.com/robots.txt',
      statusCode: 200,
      contentType: 'text/plain',
      headers: {},
    });

    await expect(captureAffiliateApprovalLogoEvidence({
      approvalJobId: 'approval_1',
      mappingJobId: 'mapping_1',
      reviewerId: 'reviewer_1',
      pageUrl: 'https://example.com/',
      logoUrl: 'https://unrelated.example.net/logo.svg',
    }, {
      captureClient,
      fetchResource,
      assertSafeUrl: jest.fn().mockResolvedValue({}),
      persistArtifact: jest.fn().mockResolvedValue({ id: 'artifact_1' }),
      now: () => new Date('2026-08-02T01:30:00.000Z'),
    })).rejects.toThrow('not referenced by the freshly captured official page');

    expect(fetchResource).toHaveBeenCalledTimes(1);
    expect(prismaMock.affiliateSourceIntakeRuns.update).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'FAILED' }),
    }));
  });
});
