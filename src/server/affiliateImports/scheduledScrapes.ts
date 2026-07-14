import { createHash } from 'crypto';
import { prisma } from '@/lib/prisma';
import { isEmailEnabled, sendEmail } from '@/server/email';
import { runAffiliateSourceScrape } from './service';

const DEFAULT_SUMMARY_RECIPIENT = 'samuel.r@razumly.com';
const DEFAULT_ADMIN_URL = 'https://bracket-iq.com/admin';
const MIN_INTERVAL_MINUTES = 60;
const DAILY_INTERVAL_MINUTES = 1440;
const DEFAULT_LIGHTWEIGHT_CHECK_TIMEOUT_MS = 10_000;
const MAX_LIGHTWEIGHT_BODY_BYTES = 512 * 1024;
const LIGHTWEIGHT_CHECK_CONCURRENCY = 4;
const LIGHTWEIGHT_METADATA_KEY = 'dailyLightweightCheck';
const SCHEDULER_LOCK_ID = 4201042026;

type AffiliateSourceScheduleRow = {
  id: string;
  name: string;
  sourceKey: string;
  listUrl: string;
  targetKind?: string | null;
  scrapeIntervalMinutes?: number | null;
  metadata?: unknown;
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

export type LightweightSourceCheckResult = {
  sourceId: string;
  sourceName: string;
  sourceKey: string;
  status: 'BASELINED' | 'UNCHANGED' | 'CHANGED' | 'FAILED';
  checkedAt: Date;
  httpStatus?: number;
  errorMessage?: string;
};

export type RunDueAffiliateScrapesResult = {
  startedAt: Date;
  finishedAt: Date;
  dueSourceCount: number;
  lightweightSourceCount: number;
  results: ScheduledScrapeResultRow[];
  lightweightResults: LightweightSourceCheckResult[];
  emailSent: boolean;
  lockAcquired: boolean;
  dryRun: boolean;
};

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

type RunDueAffiliateScrapesOptions = {
  now?: Date;
  dryRun?: boolean;
  sendSummary?: boolean;
  limit?: number;
  fetchImpl?: FetchLike;
};

type LightweightCheckMetadata = {
  checkedAt?: string;
  status?: LightweightSourceCheckResult['status'];
  fingerprint?: string;
  etag?: string;
  lastModified?: string;
  lastChangedAt?: string;
  httpStatus?: number;
  errorMessage?: string;
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

const readRecord = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

const readString = (value: unknown): string | undefined => (
  typeof value === 'string' && value.trim() ? value.trim() : undefined
);

const lightweightCheckTimeoutMs = (): number => {
  const configured = Number.parseInt(process.env.AFFILIATE_LIGHTWEIGHT_CHECK_TIMEOUT_MS ?? '', 10);
  return Number.isInteger(configured) && configured >= 1_000 && configured <= 60_000
    ? configured
    : DEFAULT_LIGHTWEIGHT_CHECK_TIMEOUT_MS;
};

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

const loadScheduledSources = async (
  now: Date,
  limit?: number,
): Promise<{
  dueSources: AffiliateSourceScheduleRow[];
  lightweightSources: AffiliateSourceScheduleRow[];
}> => {
  const sources: AffiliateSourceScheduleRow[] = await (prisma as any).affiliateScrapeSources.findMany({
    where: sourceWhere,
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      sourceKey: true,
      listUrl: true,
      targetKind: true,
      scrapeIntervalMinutes: true,
      metadata: true,
    },
  });
  const dueSources: AffiliateSourceScheduleRow[] = [];
  const lightweightSources: AffiliateSourceScheduleRow[] = [];
  for (const source of sources) {
    const latestRun = await latestRunForSource(source.id);
    if (isAffiliateSourceDue(source, latestRun, now)) {
      if (!limit || dueSources.length < limit) {
        dueSources.push(source);
      }
      continue;
    }
    if (normalizeIntervalMinutes(source.scrapeIntervalMinutes) > DAILY_INTERVAL_MINUTES) {
      lightweightSources.push(source);
    }
  }
  return { dueSources, lightweightSources };
};

const normalizeLightweightBody = (body: string): string => body
  .replace(/<!--[\s\S]*?-->/g, ' ')
  .replace(/\s(?:nonce|data-nonce|csrf-token)=(['"])[\s\S]*?\1/gi, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const fingerprintLightweightBody = (body: string): string => createHash('sha256')
  .update(normalizeLightweightBody(body))
  .digest('hex');

const readBoundedResponseText = async (response: Response): Promise<string> => {
  if (!response.body?.getReader) {
    return (await response.text()).slice(0, MAX_LIGHTWEIGHT_BODY_BYTES);
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteCount = 0;
  while (byteCount < MAX_LIGHTWEIGHT_BODY_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value?.length) continue;
    const remaining = MAX_LIGHTWEIGHT_BODY_BYTES - byteCount;
    const chunk = value.length > remaining ? value.slice(0, remaining) : value;
    chunks.push(chunk);
    byteCount += chunk.length;
    if (value.length > remaining) {
      await reader.cancel();
      break;
    }
  }
  const combined = new Uint8Array(byteCount);
  let offset = 0;
  chunks.forEach((chunk) => {
    combined.set(chunk, offset);
    offset += chunk.length;
  });
  return new TextDecoder().decode(combined);
};

const lightweightStateForSource = (source: AffiliateSourceScheduleRow): LightweightCheckMetadata => {
  const metadata = readRecord(source.metadata);
  return readRecord(metadata[LIGHTWEIGHT_METADATA_KEY]) as LightweightCheckMetadata;
};

const storeLightweightState = async (
  source: AffiliateSourceScheduleRow,
  state: LightweightCheckMetadata,
): Promise<void> => {
  const persistedState = Object.fromEntries(
    Object.entries(state).filter(([, value]) => value !== undefined),
  );
  const metadata = {
    ...readRecord(source.metadata),
    [LIGHTWEIGHT_METADATA_KEY]: persistedState,
  };
  await (prisma as any).affiliateScrapeSources.update({
    where: { id: source.id },
    data: { metadata },
  });
  source.metadata = metadata;
};

const lightweightResult = (
  source: AffiliateSourceScheduleRow,
  checkedAt: Date,
  status: LightweightSourceCheckResult['status'],
  details: Pick<LightweightSourceCheckResult, 'httpStatus' | 'errorMessage'> = {},
): LightweightSourceCheckResult => ({
  sourceId: source.id,
  sourceName: source.name,
  sourceKey: source.sourceKey,
  status,
  checkedAt,
  ...details,
});

const checkSourceForLightweightChanges = async (
  source: AffiliateSourceScheduleRow,
  checkedAt: Date,
  fetchImpl: FetchLike,
): Promise<LightweightSourceCheckResult> => {
  const previous = lightweightStateForSource(source);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), lightweightCheckTimeoutMs());
  try {
    const url = new URL(source.listUrl);
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error(`Unsupported source protocol: ${url.protocol}`);
    }
    const headers: Record<string, string> = {
      Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.5',
      Range: `bytes=0-${MAX_LIGHTWEIGHT_BODY_BYTES - 1}`,
      'User-Agent': 'BracketIQAffiliateMonitor/1.0 (+https://bracket-iq.com)',
    };
    const etag = readString(previous.etag);
    const lastModified = readString(previous.lastModified);
    if (etag) headers['If-None-Match'] = etag;
    if (lastModified) headers['If-Modified-Since'] = lastModified;

    const response = await fetchImpl(url, {
      method: 'GET',
      headers,
      redirect: 'follow',
      signal: controller.signal,
    });
    if (response.status === 304) {
      await storeLightweightState(source, {
        ...previous,
        checkedAt: checkedAt.toISOString(),
        status: 'UNCHANGED',
        httpStatus: response.status,
        errorMessage: undefined,
      });
      return lightweightResult(source, checkedAt, 'UNCHANGED', { httpStatus: response.status });
    }
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const body = await readBoundedResponseText(response);
    const fingerprint = fingerprintLightweightBody(body);
    const status: LightweightSourceCheckResult['status'] = previous.fingerprint
      ? previous.fingerprint === fingerprint ? 'UNCHANGED' : 'CHANGED'
      : 'BASELINED';
    await storeLightweightState(source, {
      checkedAt: checkedAt.toISOString(),
      status,
      fingerprint,
      etag: readString(response.headers.get('etag')),
      lastModified: readString(response.headers.get('last-modified')),
      lastChangedAt: status === 'CHANGED'
        ? checkedAt.toISOString()
        : readString(previous.lastChangedAt),
      httpStatus: response.status,
      errorMessage: undefined,
    });
    return lightweightResult(source, checkedAt, status, { httpStatus: response.status });
  } catch (error) {
    const errorMessage = error instanceof Error
      ? error.name === 'AbortError' ? 'Lightweight check timed out' : error.message
      : 'Unknown lightweight check failure';
    try {
      await storeLightweightState(source, {
        ...previous,
        checkedAt: checkedAt.toISOString(),
        status: 'FAILED',
        errorMessage,
      });
    } catch {
      // The result still reports the original source check failure when metadata persistence also fails.
    }
    return lightweightResult(source, checkedAt, 'FAILED', { errorMessage });
  } finally {
    clearTimeout(timeout);
  }
};

const sourceOrigin = (source: AffiliateSourceScheduleRow): string => {
  try {
    return new URL(source.listUrl).origin;
  } catch {
    return `invalid:${source.id}`;
  }
};

const runLightweightChecks = async (
  sources: AffiliateSourceScheduleRow[],
  checkedAt: Date,
  fetchImpl: FetchLike,
): Promise<LightweightSourceCheckResult[]> => {
  const groups = new Map<string, AffiliateSourceScheduleRow[]>();
  sources.forEach((source) => {
    const origin = sourceOrigin(source);
    groups.set(origin, [...(groups.get(origin) ?? []), source]);
  });
  const sourceGroups = Array.from(groups.values());
  const results: LightweightSourceCheckResult[] = [];
  let nextGroupIndex = 0;
  const worker = async () => {
    while (nextGroupIndex < sourceGroups.length) {
      const group = sourceGroups[nextGroupIndex];
      nextGroupIndex += 1;
      for (const source of group) {
        results.push(await checkSourceForLightweightChanges(source, checkedAt, fetchImpl));
      }
    }
  };
  await Promise.all(Array.from(
    { length: Math.min(LIGHTWEIGHT_CHECK_CONCURRENCY, sourceGroups.length) },
    () => worker(),
  ));
  return results.sort((left, right) => left.sourceName.localeCompare(right.sourceName));
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

const lightweightResultLine = (result: LightweightSourceCheckResult): string => {
  if (result.status === 'FAILED') {
    return `- ${result.sourceName}: check failed (${result.errorMessage ?? 'Unknown failure'})`;
  }
  return `- ${result.sourceName}: ${result.status.toLowerCase()}`;
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
  const changed = result.lightweightResults.filter((row) => row.status === 'CHANGED').length;
  const unchanged = result.lightweightResults.filter((row) => row.status === 'UNCHANGED').length;
  const baselined = result.lightweightResults.filter((row) => row.status === 'BASELINED').length;
  const checkFailed = result.lightweightResults.filter((row) => row.status === 'FAILED').length;
  const noteworthyChecks = result.lightweightResults.filter((row) => (
    row.status === 'CHANGED' || row.status === 'FAILED'
  ));

  return [
    'BracketIQ daily affiliate scrape summary',
    '',
    `Started: ${result.startedAt.toISOString()}`,
    `Finished: ${result.finishedAt.toISOString()}`,
    `Full scrapes due: ${result.dueSourceCount}`,
    `Full scrapes succeeded: ${succeeded}`,
    `Full scrapes failed: ${failed}`,
    `Full scrapes skipped: ${skipped}`,
    `New candidates: ${created}`,
    `Updated candidates: ${updated}`,
    `Rejected rows: ${rejected}`,
    `Pending approval: ${pendingApproval}`,
    `Lightweight checks: ${result.lightweightSourceCount}`,
    `Sources changed: ${changed}`,
    `Sources unchanged: ${unchanged}`,
    `Sources baselined: ${baselined}`,
    `Lightweight check failures: ${checkFailed}`,
    '',
    'Full scrape results:',
    ...(result.results.length ? result.results.map(resultLine) : ['- No full scrapes were due.']),
    '',
    'Lightweight changes and failures:',
    ...(noteworthyChecks.length
      ? noteworthyChecks.map(lightweightResultLine)
      : ['- No source changes or lightweight check failures detected.']),
    '',
    `Review candidates: ${adminUrl()}`,
  ].join('\n');
};

const sendSummaryEmail = async (result: RunDueAffiliateScrapesResult): Promise<boolean> => {
  if (!isEmailEnabled()) {
    return false;
  }
  const failed = result.results.filter((row) => row.status === 'FAILED').length;
  const checkFailed = result.lightweightResults.filter((row) => row.status === 'FAILED').length;
  const changed = result.lightweightResults.filter((row) => row.status === 'CHANGED').length;
  const pendingApproval = result.results.reduce((total, row) => (
    row.status === 'SUCCEEDED' ? total + row.pendingApprovalCandidateCount : total
  ), 0);
  await sendEmail({
    to: summaryRecipient(),
    subject: [
      '[BracketIQ] Daily affiliate scrapes:',
      `${changed} source changes,`,
      `${pendingApproval} pending approval,`,
      `${failed + checkFailed} failed`,
    ].join(' '),
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
      lightweightSourceCount: 0,
      results: [],
      lightweightResults: [],
      emailSent: false,
      lockAcquired: false,
      dryRun: options.dryRun === true,
    };
  }

  try {
    const { dueSources, lightweightSources } = await loadScheduledSources(startedAt, options.limit);
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

    const lightweightResults = options.dryRun
      ? []
      : await runLightweightChecks(
        lightweightSources,
        startedAt,
        options.fetchImpl ?? globalThis.fetch.bind(globalThis),
      );

    const finishedAt = new Date();
    const result: RunDueAffiliateScrapesResult = {
      startedAt,
      finishedAt,
      dueSourceCount: dueSources.length,
      lightweightSourceCount: lightweightSources.length,
      results,
      lightweightResults,
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
