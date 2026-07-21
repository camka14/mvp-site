/** @jest-environment node */

const prismaMock = {
  affiliateScrapeSources: {
    findMany: jest.fn(),
    update: jest.fn(),
  },
  affiliateScrapeRuns: {
    findFirst: jest.fn(),
  },
  affiliateImportCandidates: {
    count: jest.fn(),
  },
};

const mockPgClient = {
  connect: jest.fn(),
  query: jest.fn(),
  end: jest.fn(),
};
const mockPgClientConstructor = jest.fn(() => mockPgClient);

const runAffiliateSourceScrapeMock = jest.fn();
const isEmailEnabledMock = jest.fn();
const sendEmailMock = jest.fn();
const lightweightFetchMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/prismaConfig', () => ({
  resolvePrismaPgPoolConfig: () => ({
    connectionString: 'postgresql://test:test@localhost:5432/test',
    connectionTimeoutMillis: 1000,
    max: 3,
  }),
}));
jest.mock('pg', () => ({ Client: mockPgClientConstructor }));
jest.mock('@/server/affiliateImports/service', () => ({
  runAffiliateSourceScrape: (...args: any[]) => runAffiliateSourceScrapeMock(...args),
}));
jest.mock('@/server/email', () => ({
  isEmailEnabled: () => isEmailEnabledMock(),
  sendEmail: (...args: any[]) => sendEmailMock(...args),
}));

import {
  isAffiliateSourceDue,
  runDueAffiliateScrapes,
} from '@/server/affiliateImports/scheduledScrapes';

describe('scheduled affiliate scrapes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.AFFILIATE_SCRAPE_SUMMARY_EMAIL_TO;
    delete process.env.ADMIN_NOTIFICATION_EMAIL_TO;
    delete process.env.NEXT_PUBLIC_APP_URL;
    mockPgClient.connect.mockResolvedValue(undefined);
    mockPgClient.query.mockImplementation(async (sql: string) => ({
      rows: sql.includes('pg_try_advisory_lock')
        ? [{ locked: true }]
        : [{ unlocked: true }],
    }));
    mockPgClient.end.mockResolvedValue(undefined);
    prismaMock.affiliateScrapeSources.findMany.mockResolvedValue([]);
    prismaMock.affiliateScrapeSources.update.mockResolvedValue({});
    prismaMock.affiliateScrapeRuns.findFirst.mockResolvedValue(null);
    prismaMock.affiliateImportCandidates.count.mockResolvedValue(0);
    runAffiliateSourceScrapeMock.mockResolvedValue({
      run: {
        id: 'run_1',
        logs: {
          createdCandidateCount: 1,
          updatedCandidateCount: 2,
          rejectedCount: 3,
        },
      },
      candidates: [
        { id: 'candidate_1', status: 'DISCOVERED' },
        { id: 'candidate_2', status: 'PUBLISHED' },
      ],
    });
    isEmailEnabledMock.mockReturnValue(true);
    sendEmailMock.mockResolvedValue(undefined);
    lightweightFetchMock.mockResolvedValue(new Response('<html><body>Baseline page</body></html>', {
      status: 200,
      headers: { etag: '"baseline"' },
    }));
  });

  it('detects due sources from the latest run start time and configured interval', () => {
    const now = new Date('2026-07-04T12:00:00.000Z');

    expect(isAffiliateSourceDue({ scrapeIntervalMinutes: 1440 }, null, now)).toBe(true);
    expect(isAffiliateSourceDue(
      { scrapeIntervalMinutes: 1440 },
      { startedAt: new Date('2026-07-03T13:00:00.000Z') },
      now,
    )).toBe(false);
    expect(isAffiliateSourceDue(
      { scrapeIntervalMinutes: 1440 },
      { startedAt: new Date('2026-07-03T11:59:00.000Z') },
      now,
    )).toBe(true);
  });

  it('uses only successful runs when deciding whether a source is due', async () => {
    prismaMock.affiliateScrapeSources.findMany.mockResolvedValue([
      {
        id: 'source_retry',
        name: 'Retry Source',
        sourceKey: 'retry-source',
        listUrl: 'https://retry.example.test/events',
        targetKind: 'EVENT',
        scrapeIntervalMinutes: 1440,
        metadata: {},
      },
    ]);
    prismaMock.affiliateScrapeRuns.findFirst.mockResolvedValue(null);

    const result = await runDueAffiliateScrapes({
      now: new Date('2026-07-04T12:00:00.000Z'),
      dryRun: true,
    });

    expect(prismaMock.affiliateScrapeRuns.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { sourceId: 'source_retry', status: 'SUCCEEDED' },
    }));
    expect(result.dueSourceCount).toBe(1);
  });

  it('runs only due sources, continues after one source fails, and emails a summary', async () => {
    const now = new Date('2026-07-04T12:00:00.000Z');
    prismaMock.affiliateScrapeSources.findMany.mockResolvedValue([
      {
        id: 'source_daily',
        name: 'Daily Source',
        sourceKey: 'daily-source',
        listUrl: 'https://daily.example.test/events',
        targetKind: 'EVENT',
        scrapeIntervalMinutes: 1440,
        metadata: {},
      },
      {
        id: 'source_weekly',
        name: 'Weekly Source',
        sourceKey: 'weekly-source',
        listUrl: 'https://weekly.example.test/events',
        targetKind: 'EVENT',
        scrapeIntervalMinutes: 10080,
        metadata: {},
      },
      {
        id: 'source_failure',
        name: 'Failing Source',
        sourceKey: 'failing-source',
        listUrl: 'https://failing.example.test/events',
        targetKind: 'EVENT',
        scrapeIntervalMinutes: 1440,
        metadata: {},
      },
    ]);
    prismaMock.affiliateScrapeRuns.findFirst.mockImplementation(async ({ where }) => {
      if (where.sourceId === 'source_weekly') {
        return { id: 'recent_weekly', sourceId: where.sourceId, startedAt: new Date('2026-07-03T12:00:00.000Z') };
      }
      return { id: `old_${where.sourceId}`, sourceId: where.sourceId, startedAt: new Date('2026-07-02T12:00:00.000Z') };
    });
    prismaMock.affiliateImportCandidates.count.mockResolvedValue(5);
    runAffiliateSourceScrapeMock.mockImplementation(async (sourceId: string) => {
      if (sourceId === 'source_failure') {
        throw new Error('ScrapingDog timeout');
      }
      return {
        run: {
          id: 'run_daily',
          logs: {
            createdCandidateCount: 2,
            updatedCandidateCount: 1,
            rejectedCount: 0,
          },
        },
        candidates: [{ id: 'candidate_1', status: 'DISCOVERED' }],
      };
    });

    const result = await runDueAffiliateScrapes({ now, fetchImpl: lightweightFetchMock });

    expect(result.lockAcquired).toBe(true);
    expect(result.dueSourceCount).toBe(2);
    expect(result.lightweightSourceCount).toBe(1);
    expect(result.lightweightResults).toEqual([
      expect.objectContaining({ sourceId: 'source_weekly', status: 'BASELINED' }),
    ]);
    expect(runAffiliateSourceScrapeMock).toHaveBeenCalledTimes(2);
    expect(runAffiliateSourceScrapeMock).toHaveBeenNthCalledWith(1, 'source_daily', {
      requestedByUserId: null,
      importMode: 'AUTOMATIC',
    });
    expect(runAffiliateSourceScrapeMock).toHaveBeenNthCalledWith(2, 'source_failure', {
      requestedByUserId: null,
      importMode: 'AUTOMATIC',
    });
    expect(sendEmailMock).toHaveBeenCalledWith(expect.objectContaining({
      to: 'samuel.r@razumly.com',
      subject: expect.stringContaining('5 pending approval'),
      text: expect.stringContaining('Failing Source: failed (ScrapingDog timeout)'),
    }));
    expect(mockPgClientConstructor).toHaveBeenCalledTimes(1);
    expect(mockPgClient.query).toHaveBeenNthCalledWith(
      1,
      'SELECT pg_try_advisory_lock($1) AS locked',
      [4201042026],
    );
    expect(mockPgClient.query).toHaveBeenLastCalledWith(
      'SELECT pg_advisory_unlock($1) AS unlocked',
      [4201042026],
    );
    expect(mockPgClient.end).toHaveBeenCalledTimes(1);
  });

  it('checks non-daily sources lightly and reports detected changes without a full scrape', async () => {
    const now = new Date('2026-07-04T12:00:00.000Z');
    prismaMock.affiliateScrapeSources.findMany.mockResolvedValue([
      {
        id: 'source_weekly',
        name: 'Weekly Source',
        sourceKey: 'weekly-source',
        listUrl: 'https://weekly.example.test/events',
        targetKind: 'EVENT',
        scrapeIntervalMinutes: 10080,
        metadata: {
          dailyLightweightCheck: {
            fingerprint: 'previous-fingerprint',
            etag: '"previous"',
          },
        },
      },
    ]);
    prismaMock.affiliateScrapeRuns.findFirst.mockResolvedValue({
      id: 'recent_weekly',
      sourceId: 'source_weekly',
      startedAt: new Date('2026-07-03T12:00:00.000Z'),
    });
    lightweightFetchMock.mockResolvedValue(new Response('<html><body>Updated page</body></html>', {
      status: 200,
      headers: { etag: '"updated"' },
    }));

    const result = await runDueAffiliateScrapes({ now, fetchImpl: lightweightFetchMock });

    expect(result.dueSourceCount).toBe(0);
    expect(result.lightweightSourceCount).toBe(1);
    expect(result.lightweightResults).toEqual([
      expect.objectContaining({ sourceId: 'source_weekly', status: 'CHANGED', httpStatus: 200 }),
    ]);
    expect(runAffiliateSourceScrapeMock).not.toHaveBeenCalled();
    expect(lightweightFetchMock).toHaveBeenCalledWith(
      new URL('https://weekly.example.test/events'),
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ 'If-None-Match': '"previous"' }),
      }),
    );
    expect(prismaMock.affiliateScrapeSources.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'source_weekly' },
      data: {
        metadata: expect.objectContaining({
          dailyLightweightCheck: expect.objectContaining({ status: 'CHANGED' }),
        }),
      },
    }));
    expect(sendEmailMock).toHaveBeenCalledWith(expect.objectContaining({
      to: 'samuel.r@razumly.com',
      subject: expect.stringContaining('1 source changes'),
      text: expect.stringContaining('Weekly Source: changed'),
    }));
  });

  it('sends the daily completion email even when no full scrape or lightweight check is due', async () => {
    const result = await runDueAffiliateScrapes({
      now: new Date('2026-07-04T12:00:00.000Z'),
      fetchImpl: lightweightFetchMock,
    });

    expect(result.dueSourceCount).toBe(0);
    expect(result.lightweightSourceCount).toBe(0);
    expect(sendEmailMock).toHaveBeenCalledWith(expect.objectContaining({
      subject: expect.stringContaining('0 source changes'),
      text: expect.stringContaining('No full scrapes were due.'),
    }));
  });

  it('isolates a lightweight check failure and includes it in the daily summary', async () => {
    prismaMock.affiliateScrapeSources.findMany.mockResolvedValue([
      {
        id: 'source_monthly',
        name: 'Monthly Source',
        sourceKey: 'monthly-source',
        listUrl: 'https://monthly.example.test/programs',
        targetKind: 'EVENT',
        scrapeIntervalMinutes: 43200,
        metadata: {},
      },
    ]);
    prismaMock.affiliateScrapeRuns.findFirst.mockResolvedValue({
      id: 'recent_monthly',
      sourceId: 'source_monthly',
      startedAt: new Date('2026-07-03T12:00:00.000Z'),
    });
    lightweightFetchMock.mockRejectedValue(new Error('Connection reset'));

    const result = await runDueAffiliateScrapes({
      now: new Date('2026-07-04T12:00:00.000Z'),
      fetchImpl: lightweightFetchMock,
    });

    expect(result.lightweightResults).toEqual([
      expect.objectContaining({
        sourceId: 'source_monthly',
        status: 'FAILED',
        errorMessage: 'Connection reset',
      }),
    ]);
    expect(sendEmailMock).toHaveBeenCalledWith(expect.objectContaining({
      subject: expect.stringContaining('1 failed'),
      text: expect.stringContaining('Monthly Source: check failed (Connection reset)'),
    }));
  });

  it('skips work when another scheduler owns the advisory lock', async () => {
    mockPgClient.query.mockResolvedValueOnce({ rows: [{ locked: false }] });

    const result = await runDueAffiliateScrapes({
      now: new Date('2026-07-04T12:00:00.000Z'),
    });

    expect(result.lockAcquired).toBe(false);
    expect(prismaMock.affiliateScrapeSources.findMany).not.toHaveBeenCalled();
    expect(runAffiliateSourceScrapeMock).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(mockPgClient.end).toHaveBeenCalledTimes(1);
    expect(mockPgClient.query).not.toHaveBeenCalledWith(
      'SELECT pg_advisory_unlock($1) AS unlocked',
      expect.anything(),
    );
  });

  it('releases the advisory lock on the same dedicated connection when loading work fails', async () => {
    prismaMock.affiliateScrapeSources.findMany.mockRejectedValueOnce(new Error('database unavailable'));

    await expect(runDueAffiliateScrapes({
      now: new Date('2026-07-04T12:00:00.000Z'),
    })).rejects.toThrow('database unavailable');

    expect(mockPgClientConstructor).toHaveBeenCalledTimes(1);
    expect(mockPgClient.query).toHaveBeenNthCalledWith(
      1,
      'SELECT pg_try_advisory_lock($1) AS locked',
      [4201042026],
    );
    expect(mockPgClient.query).toHaveBeenNthCalledWith(
      2,
      'SELECT pg_advisory_unlock($1) AS unlocked',
      [4201042026],
    );
    expect(mockPgClient.end).toHaveBeenCalledTimes(1);
  });

  it('dry-runs due sources without scraping or sending email', async () => {
    prismaMock.affiliateScrapeSources.findMany.mockResolvedValue([
      {
        id: 'source_daily',
        name: 'Daily Source',
        sourceKey: 'daily-source',
        listUrl: 'https://daily.example.test/events',
        targetKind: 'EVENT',
        scrapeIntervalMinutes: 1440,
        metadata: {},
      },
    ]);

    const result = await runDueAffiliateScrapes({
      now: new Date('2026-07-04T12:00:00.000Z'),
      dryRun: true,
    });

    expect(result.results).toEqual([
      expect.objectContaining({ sourceId: 'source_daily', status: 'SKIPPED', reason: 'dry run' }),
    ]);
    expect(runAffiliateSourceScrapeMock).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});
