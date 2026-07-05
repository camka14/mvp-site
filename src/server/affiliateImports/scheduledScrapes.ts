import { prisma } from '@/lib/prisma';
import { isEmailEnabled, sendEmail } from '@/server/email';
import { runAffiliateSourceScrape } from './service';

const DEFAULT_SUMMARY_RECIPIENT = 'samuel.r@razumly.com';
const DEFAULT_ADMIN_URL = 'https://bracket-iq.com/admin';
const MIN_INTERVAL_MINUTES = 60;
const SCHEDULER_LOCK_ID = 4201042026;

type AffiliateSourceScheduleRow = {
  id: string;
  name: string;
  sourceKey: string;
  targetKind?: string | null;
  scrapeIntervalMinutes?: number | null;
};

type AffiliateRunScheduleRow = {
  id: string;
  sourceId: string;
  status?: string | null;
  startedAt: Date | string;
};

type ScrapeRunLogSummary = {
  createdCandidateCount?: number;
  updatedCandidateCount?: number;
  rejectedCount?: number;
  rejectionSummary?: Record<string, number>;
};

type ScheduledScrapeSuccess = {
  sourceId: string;
  sourceName: string;
  sourceKey: string;
  status: 'SUCCEEDED';
  runId: string;
  createdCandidateCount: number;
  updatedCandidateCount: number;
  rejectedCount: number;
  touchedApprovalCandidateCount: number;
  pendingApprovalCandidateCount: number;
};

type ScheduledScrapeFailure = {
  sourceId: string;
  sourceName: string;
  sourceKey: string;
  status: 'FAILED';
  errorMessage: string;
};

type ScheduledScrapeSkipped = {
  sourceId: string;
  sourceName: string;
  sourceKey: string;
  status: 'SKIPPED';
  reason: string;
};

export type ScheduledScrapeResultRow =
  | ScheduledScrapeSuccess
  | ScheduledScrapeFailure
  | ScheduledScrapeSkipped;

export type RunDueAffiliateScrapesResult = {
  startedAt: Date;
  finishedAt: Date;
  dueSourceCount: number;
  results: ScheduledScrapeResultRow[];
  emailSent: boolean;
  lockAcquired: boolean;
  dryRun: boolean;
};

type RunDueAffiliateScrapesOptions = {
  now?: Date;
  dryRun?: boolean;
  sendSummary?: boolean;
  limit?: number;
};

const sourceWhere = {
  status: 'ACTIVE',
  autoScrapeEnabled: true,
  activeMappingId: { not: null },
};

const normalizeIntervalMinutes = (value: number | null | undefined): number => (
  typeof value === 'number' && Number.isInteger(value) && value >= MIN_INTERVAL_MINUTES ? value : 1440
);

const toDate = (value: Date | string | null | undefined): Date | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const readNumber = (value: unknown): number => (
  typeof value === 'number' && Number.isFinite(value) ? value : 0
);

const readLogs = (value: unknown): ScrapeRunLogSummary => (
  value && typeof value === 'object' ? value as ScrapeRunLogSummary : {}
);

const summaryRecipient = (): string => (
  process.env.AFFILIATE_SCRAPE_SUMMARY_EMAIL_TO?.trim()
  || process.env.ADMIN_NOTIFICATION_EMAIL_TO?.trim()
  || DEFAULT_SUMMARY_RECIPIENT
);

const adminUrl = (): string => {
  const base = (
    process.env.NEXT_PUBLIC_APP_URL?.trim()
    || process.env.APP_BASE_URL?.trim()
    || DEFAULT_ADMIN_URL.replace(/\/admin$/, '')
  ).replace(/\/$/, '');
  return `${base}/admin`;
};

export const isAffiliateSourceDue = (
  source: Pick<AffiliateSourceScheduleRow, 'scrapeIntervalMinutes'>,
  latestRun: Pick<AffiliateRunScheduleRow, 'startedAt'> | null | undefined,
  now: Date,
): boolean => {
  const intervalMs = normalizeIntervalMinutes(source.scrapeIntervalMinutes) * 60 * 1000;
  const latestStartedAt = toDate(latestRun?.startedAt);
  if (!latestStartedAt) return true;
  return now.getTime() - latestStartedAt.getTime() >= intervalMs;
};

const acquireSchedulerLock = async (): Promise<boolean> => {
  const rows = await (prisma as any).$queryRawUnsafe(
    `SELECT pg_try_advisory_lock(${SCHEDULER_LOCK_ID}) AS locked`,
  );
  return Array.isArray(rows) && rows.some((row) => row?.locked === true);
};

const releaseSchedulerLock = async (): Promise<void> => {
  await (prisma as any).$queryRawUnsafe(
    `SELECT pg_advisory_unlock(${SCHEDULER_LOCK_ID}) AS unlocked`,
  );
};

const latestRunForSource = async (sourceId: string): Promise<AffiliateRunScheduleRow | null> => (
  (prisma as any).affiliateScrapeRuns.findFirst({
    where: { sourceId },
    orderBy: { startedAt: 'desc' },
    select: {
      id: true,
      sourceId: true,
      status: true,
      startedAt: true,
    },
  })
);

const pendingApprovalCountForSource = async (sourceId: string): Promise<number> => (
  (prisma as any).affiliateImportCandidates.count({
    where: {
      sourceId,
      NOT: { status: 'PUBLISHED' },
    },
  })
);

const loadDueSources = async (
  now: Date,
  limit?: number,
): Promise<AffiliateSourceScheduleRow[]> => {
  const sources: AffiliateSourceScheduleRow[] = await (prisma as any).affiliateScrapeSources.findMany({
    where: sourceWhere,
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      sourceKey: true,
      targetKind: true,
      scrapeIntervalMinutes: true,
    },
  });
  const dueSources: AffiliateSourceScheduleRow[] = [];
  for (const source of sources) {
    const latestRun = await latestRunForSource(source.id);
    if (isAffiliateSourceDue(source, latestRun, now)) {
      dueSources.push(source);
      if (limit && dueSources.length >= limit) break;
    }
  }
  return dueSources;
};

const summarizeRunResult = async (
  source: AffiliateSourceScheduleRow,
  scrapeResult: Awaited<ReturnType<typeof runAffiliateSourceScrape>>,
): Promise<ScheduledScrapeSuccess> => {
  const logs = readLogs((scrapeResult.run as any).logs);
  const pendingApprovalCandidateCount = await pendingApprovalCountForSource(source.id);
  const touchedApprovalCandidateCount = scrapeResult.candidates.filter((candidate) => (
    String((candidate as any).status ?? '').toUpperCase() !== 'PUBLISHED'
  )).length;
  return {
    sourceId: source.id,
    sourceName: source.name,
    sourceKey: source.sourceKey,
    status: 'SUCCEEDED',
    runId: (scrapeResult.run as any).id,
    createdCandidateCount: readNumber(logs.createdCandidateCount),
    updatedCandidateCount: readNumber(logs.updatedCandidateCount),
    rejectedCount: readNumber(logs.rejectedCount),
    touchedApprovalCandidateCount,
    pendingApprovalCandidateCount,
  };
};

const resultLine = (result: ScheduledScrapeResultRow): string => {
  if (result.status === 'SUCCEEDED') {
    return [
      `- ${result.sourceName}: succeeded`,
      `${result.createdCandidateCount} created`,
      `${result.updatedCandidateCount} updated`,
      `${result.rejectedCount} rejected`,
      `${result.pendingApprovalCandidateCount} pending approval`,
    ].join(', ');
  }
  if (result.status === 'SKIPPED') {
    return `- ${result.sourceName}: skipped (${result.reason})`;
  }
  return `- ${result.sourceName}: failed (${result.errorMessage})`;
};

const buildSummaryText = (result: RunDueAffiliateScrapesResult): string => {
  const succeeded = result.results.filter((row) => row.status === 'SUCCEEDED').length;
  const failed = result.results.filter((row) => row.status === 'FAILED').length;
  const skipped = result.results.filter((row) => row.status === 'SKIPPED').length;
  const pendingApproval = result.results.reduce((total, row) => (
    row.status === 'SUCCEEDED' ? total + row.pendingApprovalCandidateCount : total
  ), 0);
  const created = result.results.reduce((total, row) => (
    row.status === 'SUCCEEDED' ? total + row.createdCandidateCount : total
  ), 0);
  const updated = result.results.reduce((total, row) => (
    row.status === 'SUCCEEDED' ? total + row.updatedCandidateCount : total
  ), 0);
  const rejected = result.results.reduce((total, row) => (
    row.status === 'SUCCEEDED' ? total + row.rejectedCount : total
  ), 0);

  return [
    'BracketIQ affiliate scrape summary',
    '',
    `Started: ${result.startedAt.toISOString()}`,
    `Finished: ${result.finishedAt.toISOString()}`,
    `Due sources: ${result.dueSourceCount}`,
    `Succeeded: ${succeeded}`,
    `Failed: ${failed}`,
    `Skipped: ${skipped}`,
    `New candidates: ${created}`,
    `Updated candidates: ${updated}`,
    `Rejected rows: ${rejected}`,
    `Pending approval: ${pendingApproval}`,
    '',
    'Sources:',
    ...result.results.map(resultLine),
    '',
    `Review candidates: ${adminUrl()}`,
  ].join('\n');
};

const sendSummaryEmail = async (result: RunDueAffiliateScrapesResult): Promise<boolean> => {
  if (!result.results.length || !isEmailEnabled()) {
    return false;
  }
  const failed = result.results.filter((row) => row.status === 'FAILED').length;
  const pendingApproval = result.results.reduce((total, row) => (
    row.status === 'SUCCEEDED' ? total + row.pendingApprovalCandidateCount : total
  ), 0);
  await sendEmail({
    to: summaryRecipient(),
    subject: `[BracketIQ] Affiliate scrapes: ${pendingApproval} pending approval, ${failed} failed`,
    text: buildSummaryText(result),
  });
  return true;
};

export const runDueAffiliateScrapes = async (
  options: RunDueAffiliateScrapesOptions = {},
): Promise<RunDueAffiliateScrapesResult> => {
  const startedAt = options.now ?? new Date();
  const lockAcquired = await acquireSchedulerLock();
  if (!lockAcquired) {
    const finishedAt = new Date();
    return {
      startedAt,
      finishedAt,
      dueSourceCount: 0,
      results: [],
      emailSent: false,
      lockAcquired: false,
      dryRun: options.dryRun === true,
    };
  }

  try {
    const dueSources = await loadDueSources(startedAt, options.limit);
    const results: ScheduledScrapeResultRow[] = [];
    for (const source of dueSources) {
      if (options.dryRun) {
        results.push({
          sourceId: source.id,
          sourceName: source.name,
          sourceKey: source.sourceKey,
          status: 'SKIPPED',
          reason: 'dry run',
        });
        continue;
      }
      try {
        const scrapeResult = await runAffiliateSourceScrape(source.id, {
          requestedByUserId: null,
        });
        results.push(await summarizeRunResult(source, scrapeResult));
      } catch (error) {
        results.push({
          sourceId: source.id,
          sourceName: source.name,
          sourceKey: source.sourceKey,
          status: 'FAILED',
          errorMessage: error instanceof Error ? error.message : 'Unknown scrape failure',
        });
      }
    }

    const finishedAt = new Date();
    const result: RunDueAffiliateScrapesResult = {
      startedAt,
      finishedAt,
      dueSourceCount: dueSources.length,
      results,
      emailSent: false,
      lockAcquired: true,
      dryRun: options.dryRun === true,
    };
    if (options.sendSummary !== false && !options.dryRun) {
      result.emailSent = await sendSummaryEmail(result);
    }
    return result;
  } finally {
    await releaseSchedulerLock();
  }
};
