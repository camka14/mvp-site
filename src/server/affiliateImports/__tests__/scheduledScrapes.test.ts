/** @jest-environment node */

const prismaMock = {
  $queryRawUnsafe: jest.fn(),
  affiliateScrapeSources: {
    findMany: jest.fn(),
  },
  affiliateScrapeRuns: {
    findFirst: jest.fn(),
  },
  affiliateImportCandidates: {
    count: jest.fn(),
  },
};

const runAffiliateSourceScrapeMock = jest.fn();
const isEmailEnabledMock = jest.fn();
const sendEmailMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
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
    prismaMock.$queryRawUnsafe.mockResolvedValue([{ locked: true }]);
    prismaMock.affiliateScrapeSources.findMany.mockResolvedValue([]);
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

  it('runs only due sources, continues after one source fails, and emails a summary', async () => {
    const now = new Date('2026-07-04T12:00:00.000Z');
    prismaMock.affiliateScrapeSources.findMany.mockResolvedValue([
      {
        id: 'source_daily',
        name: 'Daily Source',
        sourceKey: 'daily-source',
        targetKind: 'EVENT',
        scrapeIntervalMinutes: 1440,
      },
      {
        id: 'source_weekly',
        name: 'Weekly Source',
        sourceKey: 'weekly-source',
        targetKind: 'EVENT',
        scrapeIntervalMinutes: 10080,
      },
      {
        id: 'source_failure',
        name: 'Failing Source',
        sourceKey: 'failing-source',
        targetKind: 'EVENT',
        scrapeIntervalMinutes: 1440,
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

    const result = await runDueAffiliateScrapes({ now });

    expect(result.lockAcquired).toBe(true);
    expect(result.dueSourceCount).toBe(2);
    expect(runAffiliateSourceScrapeMock).toHaveBeenCalledTimes(2);
    expect(runAffiliateSourceScrapeMock).toHaveBeenNthCalledWith(1, 'source_daily', {
      requestedByUserId: null,
    });
    expect(runAffiliateSourceScrapeMock).toHaveBeenNthCalledWith(2, 'source_failure', {
      requestedByUserId: null,
    });
    expect(sendEmailMock).toHaveBeenCalledWith(expect.objectContaining({
      to: 'samuel.r@razumly.com',
      subject: expect.stringContaining('5 pending approval'),
      text: expect.stringContaining('Failing Source: failed (ScrapingDog timeout)'),
    }));
  });

  it('skips work when another scheduler owns the advisory lock', async () => {
    prismaMock.$queryRawUnsafe.mockResolvedValueOnce([{ locked: false }]);

    const result = await runDueAffiliateScrapes({
      now: new Date('2026-07-04T12:00:00.000Z'),
    });

    expect(result.lockAcquired).toBe(false);
    expect(prismaMock.affiliateScrapeSources.findMany).not.toHaveBeenCalled();
    expect(runAffiliateSourceScrapeMock).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('dry-runs due sources without scraping or sending email', async () => {
    prismaMock.affiliateScrapeSources.findMany.mockResolvedValue([
      {
        id: 'source_daily',
        name: 'Daily Source',
        sourceKey: 'daily-source',
        targetKind: 'EVENT',
        scrapeIntervalMinutes: 1440,
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
