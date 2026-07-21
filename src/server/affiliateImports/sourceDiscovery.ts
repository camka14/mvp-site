import { Client } from 'pg';
import { createId } from '@/lib/id';
import { prisma } from '@/lib/prisma';
import { resolvePrismaPgPoolConfig } from '@/lib/prismaConfig';
import { isEmailEnabled, sendEmail } from '@/server/email';
import {
  createFirecrawlAffiliateClient,
  type AffiliateFirecrawlClient,
} from './firecrawlClient';
import {
  addAffiliateSourceIntakePage,
  createAffiliateSourceIntake,
  processNextAffiliateSourceIntakeRun,
  queueAffiliateSourceIntakeRun,
  reviewAffiliateSourceIntakePolicy,
} from './sourceIntake';
import {
  affiliateIntakeUrlKey,
  fetchBoundedPublicResource,
} from './sourceIntakeUrlSafety';
import {
  AFFILIATE_DISCOVERY_AUTO_INTAKE_SCORE,
  affiliateDiscoveryUrlKey,
  evaluateAffiliateSourceDiscoveryResult,
  generateAffiliateSourceDiscoveryQueries,
} from './sourceDiscoveryRules';
import {
  affiliateSourceDiscoveryCampaignSchema,
  affiliateSourceDomainPolicyReviewSchema,
  type AffiliateSourceDiscoveryCampaignInput,
  type AffiliateSourceDomainPolicyReview,
} from './sourceDiscoveryTypes';

const DISCOVERY_LOCK_ID = 4201072126;
const DEFAULT_SUMMARY_RECIPIENT = 'samuel.r@razumly.com';
const DEFAULT_ADMIN_URL = 'https://bracket-iq.com/admin';
const MAX_AUTOMATION_DISCOVERY_RUNS = 5;
const MAX_AUTOMATION_INTAKE_RUNS = 10;
const POLICY_EXPIRY_DAYS = 180;

type JsonRecord = Record<string, unknown>;
type DiscoveryDependencies = {
  firecrawlClient?: AffiliateFirecrawlClient;
  now?: () => Date;
  fetchResource?: typeof fetchBoundedPublicResource;
  workerId?: string;
};

const db = () => ({
  campaigns: (prisma as any).affiliateSourceDiscoveryCampaigns,
  runs: (prisma as any).affiliateSourceDiscoveryRuns,
  results: (prisma as any).affiliateSourceDiscoveryResults,
  policies: (prisma as any).affiliateSourceDomainPolicies,
  intakes: (prisma as any).affiliateSourceIntakes,
  pages: (prisma as any).affiliateSourceIntakePages,
  intakeRuns: (prisma as any).affiliateSourceIntakeRuns,
  sources: (prisma as any).affiliateScrapeSources,
  organizations: (prisma as any).organizations,
  sports: (prisma as any).sports,
});

const stringValue = (value: unknown): string | null => (
  typeof value === 'string' && value.trim() ? value.trim() : null
);

const recordValue = (value: unknown): JsonRecord => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}
);

const sourceKeyPart = (value: string): string => value
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 70);

const nextRunAt = (from: Date, intervalMinutes: number): Date => (
  new Date(from.getTime() + intervalMinutes * 60_000)
);

const policyIsCurrentAndAllowed = (policy: any, now: Date): boolean => (
  policy?.status === 'ALLOWED'
  && (!policy.expiresAt || new Date(policy.expiresAt).getTime() > now.getTime())
);

const inferredPageRole = (url: string): string => {
  const path = new URL(url).pathname.toLowerCase();
  if (/terms|privacy|legal|polic/.test(path)) return 'POLICY';
  if (/rent|book|reserv/.test(path)) return 'RENTAL';
  if (/register|signup|tryout|evaluation/.test(path)) return 'REGISTRATION';
  if (/director|find-a-club|clubs/.test(path)) return 'DIRECTORY';
  if (path === '/' || !path) return 'HOME';
  return 'LISTING';
};

const policyExpiry = (now: Date): Date => new Date(now.getTime() + POLICY_EXPIRY_DAYS * 86_400_000);

export const createAffiliateSourceDiscoveryCampaign = async (
  input: AffiliateSourceDiscoveryCampaignInput,
  userId: string,
) => {
  const parsed = affiliateSourceDiscoveryCampaignSchema.parse(input);
  const uniqueSportIds = Array.from(new Set(parsed.sportIds));
  const existingSports = await db().sports.findMany({
    where: { id: { in: uniqueSportIds } },
    select: { id: true },
  });
  if (existingSports.length !== uniqueSportIds.length) {
    throw new Error('One or more selected sports do not exist.');
  }
  return db().campaigns.create({
    data: {
      id: createId(),
      ...parsed,
      sportIds: uniqueSportIds,
      sourceTypeHints: Array.from(new Set(parsed.sourceTypeHints)),
      createdByUserId: userId,
      nextRunAt: parsed.status === 'ACTIVE' ? new Date() : null,
    },
  });
};

export const updateAffiliateSourceDiscoveryCampaign = async (
  campaignId: string,
  input: AffiliateSourceDiscoveryCampaignInput,
) => {
  const parsed = affiliateSourceDiscoveryCampaignSchema.parse(input);
  const existing = await db().campaigns.findUnique({ where: { id: campaignId } });
  if (!existing) throw new Error('Affiliate source discovery campaign not found.');
  const sports = await db().sports.count({ where: { id: { in: Array.from(new Set(parsed.sportIds)) } } });
  if (sports !== new Set(parsed.sportIds).size) throw new Error('One or more selected sports do not exist.');
  return db().campaigns.update({
    where: { id: campaignId },
    data: {
      ...parsed,
      sportIds: Array.from(new Set(parsed.sportIds)),
      sourceTypeHints: Array.from(new Set(parsed.sourceTypeHints)),
      nextRunAt: parsed.status === 'ACTIVE'
        ? existing.nextRunAt ?? new Date()
        : null,
    },
  });
};

export const listAffiliateSourceDiscoveryCampaigns = async () => {
  const { campaigns, results, runs } = db();
  const rows = await campaigns.findMany({ orderBy: { name: 'asc' } });
  rows.sort((left: any, right: any) => {
    const leftRank = Number(left.metadata?.priorityRank ?? Number.MAX_SAFE_INTEGER);
    const rightRank = Number(right.metadata?.priorityRank ?? Number.MAX_SAFE_INTEGER);
    return leftRank - rightRank || left.name.localeCompare(right.name);
  });
  if (!rows.length) return [];
  const campaignIds = rows.map((row: any) => row.id);
  const [resultRows, latestRuns] = await Promise.all([
    results.findMany({
      where: { campaignId: { in: campaignIds } },
      select: { campaignId: true, status: true },
    }),
    runs.findMany({ where: { campaignId: { in: campaignIds } }, orderBy: { createdAt: 'desc' } }),
  ]);
  return rows.map((campaign: any) => {
    const statusCounts = resultRows
      .filter((row: any) => row.campaignId === campaign.id)
      .reduce((counts: Record<string, number>, row: any) => ({
        ...counts,
        [row.status]: (counts[row.status] ?? 0) + 1,
      }), {} as Record<string, number>);
    return {
      ...campaign,
      statusCounts,
      latestRun: latestRuns.find((run: any) => run.campaignId === campaign.id) ?? null,
    };
  });
};

export const queueAffiliateSourceDiscoveryRun = async (
  campaignId: string,
  userId?: string | null,
) => {
  const campaign = await db().campaigns.findUnique({ where: { id: campaignId } });
  if (!campaign || campaign.status === 'ARCHIVED') {
    throw new Error('Affiliate source discovery campaign not found or archived.');
  }
  const active = await db().runs.findFirst({
    where: { campaignId, status: { in: ['QUEUED', 'RUNNING'] } },
    orderBy: { queuedAt: 'asc' },
  });
  if (active) return active;
  return db().runs.create({
    data: {
      id: createId(),
      campaignId,
      requestedByUserId: userId ?? null,
      status: 'QUEUED',
      queuedAt: new Date(),
    },
  });
};

const claimDiscoveryRun = async (runId: string | undefined, workerId: string, now: Date) => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const queued = runId
      ? await db().runs.findFirst({ where: { id: runId, status: 'QUEUED' } })
      : await db().runs.findFirst({ where: { status: 'QUEUED' }, orderBy: { queuedAt: 'asc' } });
    if (!queued) return null;
    const updated = await db().runs.updateMany({
      where: { id: queued.id, status: 'QUEUED' },
      data: {
        status: 'RUNNING',
        startedAt: now,
        claimedAt: now,
        workerId,
        attemptCount: { increment: 1 },
        errorMessage: null,
      },
    });
    if (updated.count === 1) return db().runs.findUnique({ where: { id: queued.id } });
    if (runId) return null;
  }
  return null;
};

const duplicateMatchForUrl = async (canonicalUrl: string, policyKey: string) => {
  const urlKey = affiliateIntakeUrlKey(canonicalUrl);
  const page = await db().pages.findUnique({ where: { urlKey } });
  if (page) return { status: 'DUPLICATE', matchingIntakeId: page.intakeId, reason: 'EXISTING_INTAKE_PAGE' };

  const source = await db().sources.findFirst({
    where: {
      OR: [
        { listUrl: canonicalUrl },
        { listUrl: canonicalUrl.replace(/\/$/, '') },
        { baseUrl: canonicalUrl },
        { baseUrl: canonicalUrl.replace(/\/$/, '') },
      ],
    },
    select: { id: true },
  });
  if (source) return { status: 'DUPLICATE', matchingSourceId: source.id, reason: 'EXISTING_APPROVED_SOURCE' };

  const organization = await db().organizations.findFirst({
    where: {
      OR: [
        { website: canonicalUrl },
        { website: canonicalUrl.replace(/\/$/, '') },
        { website: { contains: policyKey, mode: 'insensitive' } },
      ],
    },
    select: { id: true },
  });
  return organization
    ? { status: 'REVIEW_REQUIRED', matchingOrganizationId: organization.id, reason: 'EXISTING_ORGANIZATION_WEBSITE' }
    : null;
};

const findSiteIntake = async (policyKey: string, canonicalUrl: string) => {
  const linked = await db().results.findFirst({
    where: { policyKey, matchingIntakeId: { not: null } },
    orderBy: { score: 'desc' },
    select: { matchingIntakeId: true },
  });
  if (linked?.matchingIntakeId) {
    return db().intakes.findUnique({ where: { id: linked.matchingIntakeId } });
  }
  if (policyKey.includes('/')) return null;
  const origin = new URL(canonicalUrl).origin;
  return db().intakes.findFirst({
    where: {
      OR: [
        { baseUrl: origin },
        { baseUrl: origin.replace(/\/$/, '') },
        { baseUrl: { contains: policyKey, mode: 'insensitive' } },
      ],
    },
    orderBy: { createdAt: 'asc' },
  });
};

const preflightPolicyEvidence = async (
  canonicalUrl: string,
  fetchResource: typeof fetchBoundedPublicResource,
): Promise<JsonRecord> => {
  const origin = new URL(canonicalUrl).origin;
  const robotsUrl = new URL('/robots.txt', origin).toString();
  const likelyTermsUrls = [
    new URL('/terms', origin).toString(),
    new URL('/terms-of-service', origin).toString(),
    new URL('/privacy', origin).toString(),
  ];
  try {
    const robots = await fetchResource(robotsUrl, { maxBytes: 512 * 1024, timeoutMs: 15_000 });
    return {
      robotsUrl,
      robotsStatusCode: robots.statusCode,
      robotsText: robots.body.toString('utf8').slice(0, 20_000),
      likelyTermsUrls,
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      robotsUrl,
      robotsError: error instanceof Error ? error.message : 'Robots preflight failed.',
      likelyTermsUrls,
      checkedAt: new Date().toISOString(),
    };
  }
};

const queueAllowedIntake = async (intakeId: string, userId: string): Promise<void> => {
  const active = await db().intakeRuns.findFirst({
    where: { intakeId, status: { in: ['QUEUED', 'RUNNING'] } },
  });
  if (active) return;
  const pages = await db().pages.findMany({
    where: { intakeId, status: 'ACTIVE' },
    orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
    take: 10,
    select: { id: true },
  });
  if (pages.length) await queueAffiliateSourceIntakeRun(intakeId, pages.map((page: any) => page.id), userId);
};

const promoteDiscoveryResult = async (
  resultId: string,
  userId: string,
  dependencies: Pick<DiscoveryDependencies, 'fetchResource' | 'now'> = {},
  requestedIntakeId?: string | null,
) => {
  const now = dependencies.now?.() ?? new Date();
  const result = await db().results.findUnique({ where: { id: resultId } });
  if (!result) throw new Error('Affiliate source discovery result not found.');
  if (!['NEW', 'REVIEW_REQUIRED'].includes(result.status)) {
    if (result.matchingIntakeId) return db().intakes.findUnique({ where: { id: result.matchingIntakeId } });
    throw new Error(`Discovery result cannot create an intake from status ${result.status}.`);
  }
  const campaign = await db().campaigns.findUnique({ where: { id: result.campaignId } });
  if (!campaign) throw new Error('Affiliate source discovery campaign not found.');

  let intake = requestedIntakeId
    ? await db().intakes.findUnique({ where: { id: requestedIntakeId } })
    : result.matchingIntakeId
      ? await db().intakes.findUnique({ where: { id: result.matchingIntakeId } })
      : await findSiteIntake(result.policyKey, result.canonicalUrl);
  if (requestedIntakeId && !intake) {
    throw new Error('Requested affiliate source intake not found.');
  }
  const pageInput = {
    url: result.canonicalUrl,
    role: inferredPageRole(result.canonicalUrl),
    targetKindHints: result.sourceTypeHints,
    discoverySource: 'FIRECRAWL_SEARCH',
    metadata: {
      campaignId: result.campaignId,
      discoveryRunId: result.latestRunId,
      query: result.latestQuery,
      rank: result.latestRank,
      score: result.score,
      reasonCodes: result.reasonCodes,
    },
  };
  if (intake) {
    await addAffiliateSourceIntakePage(intake.id, pageInput);
  } else {
    const host = new URL(result.canonicalUrl).hostname.replace(/^www\./, '');
    const proposedName = stringValue(result.title)?.replace(/\s+[|–—-]\s+.*$/, '').trim() || host;
    const sourceKey = [sourceKeyPart(campaign.region), sourceKeyPart(proposedName), sourceKeyPart(result.policyKey)]
      .filter(Boolean)
      .join('-')
      .slice(0, 100);
    intake = await createAffiliateSourceIntake({
      name: proposedName,
      sourceKey,
      region: campaign.region,
      baseUrl: new URL(result.canonicalUrl).origin,
      targetKindHints: result.sourceTypeHints,
      notes: `Discovered by campaign ${campaign.name}.`,
      pages: [pageInput],
    }, userId);
  }

  const fetchResource = dependencies.fetchResource ?? fetchBoundedPublicResource;
  let policy = await db().policies.findUnique({ where: { policyKey: result.policyKey } });
  if (!policy) {
    const evidence = await preflightPolicyEvidence(result.canonicalUrl, fetchResource);
    policy = await db().policies.create({
      data: {
        id: createId(),
        policyKey: result.policyKey,
        status: 'NEEDS_REVIEW',
        robotsSummary: stringValue(evidence.robotsError) ?? `robots.txt HTTP ${String(evidence.robotsStatusCode ?? 'unknown')}`,
        evidence,
      },
    });
  }

  let resultStatus = 'INTAKE_CREATED';
  if (policy.status === 'BLOCKED') {
    await reviewAffiliateSourceIntakePolicy(intake.id, {
      complianceStatus: 'BLOCKED',
      termsUrl: policy.termsUrl,
      notes: policy.restrictionNotes,
    }, policy.reviewedByUserId ?? userId);
    resultStatus = 'BLOCKED';
  } else if (policyIsCurrentAndAllowed(policy, now)) {
    await reviewAffiliateSourceIntakePolicy(intake.id, {
      complianceStatus: 'ALLOWED',
      termsUrl: policy.termsUrl,
      notes: policy.restrictionNotes,
    }, policy.reviewedByUserId ?? userId);
    await queueAllowedIntake(intake.id, userId);
  } else {
    resultStatus = 'REVIEW_REQUIRED';
  }
  await db().results.update({
    where: { id: result.id },
    data: { status: resultStatus, matchingIntakeId: intake.id },
  });
  return intake;
};

export const promoteAffiliateSourceDiscoveryResult = async (resultId: string, userId: string) => (
  promoteDiscoveryResult(resultId, userId)
);

export const addAffiliateSourceDiscoveryResultToIntake = async (
  resultId: string,
  intakeId: string,
  userId: string,
) => promoteDiscoveryResult(resultId, userId, {}, intakeId);

export const applyAffiliateSourceDomainPolicy = async (
  policyKey: string,
  input: AffiliateSourceDomainPolicyReview,
  userId: string,
) => {
  const review = affiliateSourceDomainPolicyReviewSchema.parse(input);
  const now = new Date();
  const previousPolicy = await db().policies.findUnique({ where: { policyKey } });
  const previousEvidence = recordValue(previousPolicy?.evidence);
  const reviewHistory = Array.isArray(previousEvidence.reviewHistory)
    ? previousEvidence.reviewHistory
    : [];
  const evidence = {
    ...previousEvidence,
    ...recordValue(review.evidence),
    reviewHistory: [
      ...reviewHistory,
      {
        reviewedAt: now.toISOString(),
        reviewedByUserId: userId,
        previousStatus: previousPolicy?.status ?? null,
        status: review.status,
        termsUrl: review.termsUrl ?? null,
        robotsSummary: review.robotsSummary ?? null,
        restrictionNotes: review.restrictionNotes ?? null,
      },
    ].slice(-20),
  };
  const policy = await db().policies.upsert({
    where: { policyKey },
    create: {
      id: createId(),
      policyKey,
      ...review,
      expiresAt: review.status === 'ALLOWED' ? review.expiresAt ?? policyExpiry(now) : review.expiresAt,
      reviewedByUserId: userId,
      reviewedAt: now,
      evidence,
    },
    update: {
      ...review,
      expiresAt: review.status === 'ALLOWED' ? review.expiresAt ?? policyExpiry(now) : review.expiresAt,
      reviewedByUserId: userId,
      reviewedAt: now,
      evidence,
    },
  });
  const resultRows = await db().results.findMany({
    where: { policyKey, matchingIntakeId: { not: null } },
    select: { id: true, matchingIntakeId: true },
  });
  const intakeIds = Array.from(new Set(resultRows.map((row: any) => row.matchingIntakeId).filter(Boolean))) as string[];
  for (const intakeId of intakeIds) {
    await reviewAffiliateSourceIntakePolicy(intakeId, {
      complianceStatus: review.status,
      termsUrl: review.termsUrl,
      notes: review.restrictionNotes,
    }, userId);
    if (review.status === 'ALLOWED') await queueAllowedIntake(intakeId, userId);
  }
  const reviewableStatuses = ['NEW', 'INTAKE_CREATED', 'REVIEW_REQUIRED', 'BLOCKED'];
  if (review.status === 'BLOCKED') {
    await db().results.updateMany({
      where: { policyKey, status: { in: reviewableStatuses } },
      data: { status: 'BLOCKED' },
    });
  } else if (review.status === 'NEEDS_REVIEW') {
    await db().results.updateMany({
      where: { policyKey, status: { in: reviewableStatuses } },
      data: { status: 'REVIEW_REQUIRED' },
    });
  } else {
    await db().results.updateMany({
      where: { policyKey, matchingIntakeId: { not: null }, status: { in: reviewableStatuses } },
      data: { status: 'INTAKE_CREATED' },
    });
    await db().results.updateMany({
      where: { policyKey, matchingIntakeId: null, status: { in: reviewableStatuses } },
      data: { status: 'NEW' },
    });
  }
  return { policy, intakeIds, queuedIntakeCount: review.status === 'ALLOWED' ? intakeIds.length : 0 };
};

const persistDiscoveryResult = async (input: {
  campaign: any;
  run: any;
  query: any;
  rank: number;
  row: any;
  evaluation: ReturnType<typeof evaluateAffiliateSourceDiscoveryResult>;
  now: Date;
}) => {
  const { campaign, run, query, rank, row, evaluation, now } = input;
  const originalUrl = stringValue(row.url) ?? 'missing-url';
  const fallbackCanonical = evaluation.canonicalUrl
    ?? `https://invalid-source.invalid/${affiliateDiscoveryUrlKey(originalUrl)}`;
  const urlKey = affiliateDiscoveryUrlKey(fallbackCanonical);
  const duplicate = evaluation.canonicalUrl && evaluation.policyKey
    ? await duplicateMatchForUrl(evaluation.canonicalUrl, evaluation.policyKey)
    : null;
  const siteIntake = !duplicate && evaluation.canonicalUrl && evaluation.policyKey
    ? await findSiteIntake(evaluation.policyKey, evaluation.canonicalUrl)
    : null;
  const status = duplicate?.status ?? evaluation.status;
  const reasonCodes = duplicate
    ? Array.from(new Set([...evaluation.reasonCodes, duplicate.reason]))
    : evaluation.reasonCodes;
  const existing = await db().results.findUnique({
    where: { campaignId_urlKey: { campaignId: campaign.id, urlKey } },
  });
  const common = {
    latestRunId: run.id,
    originalUrl: row.url,
    canonicalUrl: fallbackCanonical,
    policyKey: evaluation.policyKey ?? 'invalid-source.invalid',
    title: stringValue(row.title),
    description: stringValue(row.description),
    latestQuery: query.query,
    latestRank: rank,
    lastSeenAt: now,
    score: evaluation.score,
    sourceTypeHints: evaluation.sourceTypeHints,
    sportHints: evaluation.sportHints,
    status,
    reasonCodes,
    reasonDetails: { reasons: evaluation.reasons },
    matchingIntakeId: duplicate?.matchingIntakeId ?? siteIntake?.id ?? existing?.matchingIntakeId ?? null,
    matchingSourceId: duplicate?.matchingSourceId ?? existing?.matchingSourceId ?? null,
    matchingOrganizationId: duplicate?.matchingOrganizationId ?? existing?.matchingOrganizationId ?? null,
    metadata: { category: row.category ?? null },
  };
  const saved = existing
    ? await db().results.update({
      where: { id: existing.id },
      data: { ...common, seenCount: { increment: 1 } },
    })
    : await db().results.create({
      data: {
        id: createId(),
        campaignId: campaign.id,
        urlKey,
        firstSeenAt: now,
        seenCount: 1,
        ...common,
      },
    });
  return { saved, isNew: !existing, duplicate: Boolean(duplicate) };
};

export const processNextAffiliateSourceDiscoveryRun = async (
  options: { runId?: string; workerId?: string; maxQueries?: number; maxResultsPerQuery?: number } = {},
  dependencies: DiscoveryDependencies = {},
) => {
  const now = dependencies.now?.() ?? new Date();
  const workerId = dependencies.workerId ?? options.workerId ?? `affiliate-discovery-${process.pid}`;
  const run = await claimDiscoveryRun(stringValue(options.runId) ?? undefined, workerId, now);
  if (!run) return null;
  const campaign = await db().campaigns.findUnique({ where: { id: run.campaignId } });
  if (!campaign) {
    return db().runs.update({ where: { id: run.id }, data: { status: 'FAILED', finishedAt: now, errorMessage: 'Campaign not found.' } });
  }
  const sports = await db().sports.findMany({
    where: { id: { in: campaign.sportIds } },
    select: { id: true, name: true },
  });
  const maxQueries = Number.isInteger(options.maxQueries)
    ? Math.max(1, Math.min(50, Number(options.maxQueries)))
    : campaign.maxQueriesPerRun;
  const maxResultsPerQuery = Number.isInteger(options.maxResultsPerQuery)
    ? Math.max(1, Math.min(20, Number(options.maxResultsPerQuery)))
    : campaign.maxResultsPerQuery;
  const generated = generateAffiliateSourceDiscoveryQueries(
    { ...campaign, maxQueriesPerRun: maxQueries },
    sports,
    campaign.queryCursor ?? 0,
  );
  const client = dependencies.firecrawlClient ?? createFirecrawlAffiliateClient();
  const providerJobIds: string[] = [];
  const requestSummaries: JsonRecord[] = [];
  let returnedResultCount = 0;
  let newResultCount = 0;
  let duplicateCount = 0;
  let rejectedCount = 0;
  let createdIntakeCount = 0;
  const errors: string[] = [];

  for (const query of generated.queries) {
    try {
      const search = await client.searchSources(query.query, {
        limit: maxResultsPerQuery,
        location: campaign.location ?? campaign.region,
      });
      returnedResultCount += search.rows.length;
      if (search.providerJobId) providerJobIds.push(search.providerJobId);
      requestSummaries.push({ request: search.request, response: search.response });
      for (const [index, row] of search.rows.entries()) {
        const evaluation = evaluateAffiliateSourceDiscoveryResult({
          ...row,
          query,
          campaignRegion: campaign.region,
          selectedSports: sports,
          currentYear: now.getFullYear(),
        });
        const persisted = await persistDiscoveryResult({
          campaign,
          run,
          query,
          rank: index + 1,
          row,
          evaluation,
          now,
        });
        if (persisted.isNew) newResultCount += 1;
        if (persisted.duplicate) duplicateCount += 1;
        if (persisted.saved.status === 'REJECTED') rejectedCount += 1;
        if (
          campaign.autoCreateIntakes
          && persisted.saved.status === 'NEW'
          && persisted.saved.score >= AFFILIATE_DISCOVERY_AUTO_INTAKE_SCORE
        ) {
          await promoteDiscoveryResult(
            persisted.saved.id,
            run.requestedByUserId ?? 'affiliate-discovery',
            dependencies,
          );
          createdIntakeCount += 1;
        }
      }
    } catch (error) {
      errors.push(`${query.query}: ${error instanceof Error ? error.message : 'Unknown search failure'}`);
    }
  }
  const finishedAt = dependencies.now?.() ?? new Date();
  const status = errors.length === generated.queries.length
    ? 'FAILED'
    : errors.length ? 'PARTIAL' : 'SUCCEEDED';
  const summary = {
    queries: generated.queries,
    executionLimits: { maxQueries, maxResultsPerQuery },
    provider: requestSummaries.slice(0, 50),
    errors,
  };
  const updated = await db().runs.update({
    where: { id: run.id },
    data: {
      status,
      finishedAt,
      generatedQueryCount: generated.queries.length,
      returnedResultCount,
      newResultCount,
      duplicateCount,
      rejectedCount,
      createdIntakeCount,
      providerJobIds: Array.from(new Set(providerJobIds)),
      errorMessage: status === 'FAILED' ? errors[0] ?? 'Discovery failed.' : null,
      summary,
    },
  });
  await db().campaigns.update({
    where: { id: campaign.id },
    data: {
      lastRunAt: finishedAt,
      nextRunAt: campaign.status === 'ACTIVE'
        ? nextRunAt(finishedAt, campaign.searchIntervalMinutes)
        : null,
      queryCursor: status === 'FAILED' ? campaign.queryCursor ?? 0 : generated.nextCursor,
    },
  });
  return { run: updated, summary };
};

export const listAffiliateSourceDiscoveryResults = async (filters: {
  campaignId?: string | null;
  status?: string | null;
  query?: string | null;
  policyKey?: string | null;
  sourceType?: string | null;
  sportHint?: string | null;
  minScore?: number | null;
  maxScore?: number | null;
  page?: number;
  pageSize?: number;
} = {}) => {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.max(1, Math.min(100, filters.pageSize ?? 50));
  const where: JsonRecord = {
    ...(stringValue(filters.campaignId) ? { campaignId: stringValue(filters.campaignId) } : {}),
    ...(stringValue(filters.status) ? { status: stringValue(filters.status)?.toUpperCase() } : {}),
    ...(stringValue(filters.policyKey) ? { policyKey: stringValue(filters.policyKey) } : {}),
    ...(stringValue(filters.sourceType) ? { sourceTypeHints: { has: stringValue(filters.sourceType)?.toUpperCase() } } : {}),
    ...(stringValue(filters.sportHint) ? { sportHints: { has: stringValue(filters.sportHint) } } : {}),
    ...((typeof filters.minScore === 'number' && Number.isFinite(filters.minScore))
      || (typeof filters.maxScore === 'number' && Number.isFinite(filters.maxScore)) ? {
        score: {
          ...(typeof filters.minScore === 'number' && Number.isFinite(filters.minScore) ? { gte: filters.minScore } : {}),
          ...(typeof filters.maxScore === 'number' && Number.isFinite(filters.maxScore) ? { lte: filters.maxScore } : {}),
        },
      } : {}),
    ...(stringValue(filters.query) ? {
      OR: [
        { title: { contains: stringValue(filters.query), mode: 'insensitive' } },
        { description: { contains: stringValue(filters.query), mode: 'insensitive' } },
        { canonicalUrl: { contains: stringValue(filters.query), mode: 'insensitive' } },
      ],
    } : {}),
  };
  const [rows, total] = await Promise.all([
    db().results.findMany({
      where,
      orderBy: [{ score: 'desc' }, { lastSeenAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db().results.count({ where }),
  ]);
  return { rows, total, page, pageSize, hasMore: page * pageSize < total };
};

export const updateAffiliateSourceDiscoveryResult = async (
  resultId: string,
  input: { action: 'REJECT' | 'RETRY_CLASSIFICATION' },
) => {
  const result = await db().results.findUnique({ where: { id: resultId } });
  if (!result) throw new Error('Affiliate source discovery result not found.');
  return db().results.update({
    where: { id: resultId },
    data: input.action === 'REJECT'
      ? { status: 'REJECTED', reasonCodes: Array.from(new Set([...result.reasonCodes, 'ADMIN_REJECTED'])) }
      : { status: 'REVIEW_REQUIRED', reasonCodes: result.reasonCodes.filter((code: string) => code !== 'ADMIN_REJECTED') },
  });
};

export const bulkUpdateAffiliateSourceDiscoveryResults = async (
  resultIds: string[],
  action: 'REJECT' | 'PROMOTE',
  userId: string,
) => {
  const ids = Array.from(new Set(resultIds.map((value) => value.trim()).filter(Boolean))).slice(0, 100);
  if (!ids.length) throw new Error('Select at least one discovery result.');
  const results: Array<{ id: string; status: string; intakeId?: string }> = [];
  for (const id of ids) {
    if (action === 'REJECT') {
      const row = await updateAffiliateSourceDiscoveryResult(id, { action: 'REJECT' });
      results.push({ id, status: row.status });
    } else {
      const intake = await promoteDiscoveryResult(id, userId);
      results.push({ id, status: 'INTAKE_CREATED', intakeId: intake.id });
    }
  }
  return results;
};

export const getAffiliateSourceDiscoveryRunContext = async (runId: string) => {
  const run = await db().runs.findUnique({ where: { id: runId } });
  if (!run) throw new Error('Affiliate source discovery run not found.');
  const [campaign, results] = await Promise.all([
    db().campaigns.findUnique({ where: { id: run.campaignId } }),
    db().results.findMany({ where: { latestRunId: runId }, orderBy: [{ score: 'desc' }, { latestRank: 'asc' }] }),
  ]);
  return { run, campaign, results };
};

export const queueDueAffiliateSourceDiscoveryRuns = async (now = new Date()): Promise<number> => {
  const campaigns = await db().campaigns.findMany({
    where: { status: 'ACTIVE', OR: [{ nextRunAt: null }, { nextRunAt: { lte: now } }] },
    orderBy: [{ nextRunAt: 'asc' }, { name: 'asc' }],
  });
  let queued = 0;
  for (const campaign of campaigns) {
    const prior = await db().runs.findFirst({ where: { campaignId: campaign.id, status: { in: ['QUEUED', 'RUNNING'] } } });
    if (!prior) {
      await queueAffiliateSourceDiscoveryRun(campaign.id, null);
      queued += 1;
    }
  }
  return queued;
};

type AutomationLock = { release: () => Promise<void> };
const acquireAutomationLock = async (): Promise<AutomationLock | null> => {
  const { max: _poolMax, ...config } = resolvePrismaPgPoolConfig();
  const client = new Client(config);
  await client.connect();
  const result = await client.query<{ locked: boolean }>('SELECT pg_try_advisory_lock($1) AS locked', [DISCOVERY_LOCK_ID]);
  if (!result.rows.some((row) => row.locked)) {
    await client.end();
    return null;
  }
  return {
    release: async () => {
      try {
        await client.query('SELECT pg_advisory_unlock($1)', [DISCOVERY_LOCK_ID]);
      } finally {
        await client.end();
      }
    },
  };
};

const automationAdminUrl = (): string => {
  const base = (process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.APP_BASE_URL?.trim() || DEFAULT_ADMIN_URL.replace(/\/admin$/, '')).replace(/\/$/, '');
  return `${base}/admin`;
};

export const runAffiliateIntakeAutomation = async (options: {
  discoveryLimit?: number;
  intakeLimit?: number;
  sendSummary?: boolean;
} = {}, dependencies: DiscoveryDependencies = {}) => {
  const startedAt = dependencies.now?.() ?? new Date();
  const lock = await acquireAutomationLock();
  if (!lock) return { lockAcquired: false, startedAt, finishedAt: new Date(), queuedCampaigns: 0, discoveryRuns: [], intakeRuns: [], emailSent: false };
  try {
    const queuedCampaigns = await queueDueAffiliateSourceDiscoveryRuns(startedAt);
    const discoveryRuns: any[] = [];
    for (let index = 0; index < Math.min(options.discoveryLimit ?? MAX_AUTOMATION_DISCOVERY_RUNS, 25); index += 1) {
      const result = await processNextAffiliateSourceDiscoveryRun({}, dependencies);
      if (!result) break;
      discoveryRuns.push(result);
    }
    const intakeRuns: any[] = [];
    for (let index = 0; index < Math.min(options.intakeLimit ?? MAX_AUTOMATION_INTAKE_RUNS, 50); index += 1) {
      const result = await processNextAffiliateSourceIntakeRun({}, {
        workerId: dependencies.workerId ?? `affiliate-intake-automation-${process.pid}`,
        ...(dependencies.firecrawlClient ? { firecrawlClient: dependencies.firecrawlClient } : {}),
        ...(dependencies.fetchResource ? { fetchResource: dependencies.fetchResource } : {}),
        ...(dependencies.now ? { now: dependencies.now } : {}),
      });
      if (!result) break;
      intakeRuns.push(result);
    }
    const finishedAt = dependencies.now?.() ?? new Date();
    const summary = {
      lockAcquired: true,
      startedAt,
      finishedAt,
      queuedCampaigns,
      discoveryRuns,
      intakeRuns,
      emailSent: false,
    };
    const needsEmail = queuedCampaigns > 0
      || discoveryRuns.length > 0
      || intakeRuns.length > 0
      || discoveryRuns.some((entry) => ['FAILED', 'PARTIAL'].includes(entry.run?.status))
      || intakeRuns.some((entry) => ['FAILED', 'PARTIAL', 'BLOCKED'].includes(entry.run?.status ?? entry.status));
    if (options.sendSummary !== false && needsEmail && isEmailEnabled()) {
      await sendEmail({
        to: process.env.AFFILIATE_SCRAPE_SUMMARY_EMAIL_TO?.trim() || DEFAULT_SUMMARY_RECIPIENT,
        subject: `[BracketIQ] Affiliate intake automation: ${discoveryRuns.length} discovery, ${intakeRuns.length} capture runs`,
        text: [
          'BracketIQ affiliate intake automation summary',
          `Started: ${startedAt.toISOString()}`,
          `Finished: ${finishedAt.toISOString()}`,
          `Campaigns queued: ${queuedCampaigns}`,
          `Discovery runs processed: ${discoveryRuns.length}`,
          `Intake captures processed: ${intakeRuns.length}`,
          `Review: ${automationAdminUrl()}`,
        ].join('\n'),
      });
      summary.emailSent = true;
    }
    return summary;
  } finally {
    await lock.release();
  }
};

export const dryRunAffiliateSourceDiscoveryCampaign = async (
  campaignId: string,
  options: { maxQueries?: number } = {},
) => {
  const campaign = await db().campaigns.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new Error('Affiliate source discovery campaign not found.');
  const sports = await db().sports.findMany({ where: { id: { in: campaign.sportIds } }, select: { id: true, name: true } });
  const maxQueries = Number.isInteger(options.maxQueries)
    ? Math.max(1, Math.min(50, Number(options.maxQueries)))
    : campaign.maxQueriesPerRun;
  const generated = generateAffiliateSourceDiscoveryQueries(
    { ...campaign, maxQueriesPerRun: maxQueries },
    sports,
    campaign.queryCursor ?? 0,
  );
  return {
    lockAcquired: true,
    providerQueries: 0,
    plannedQueries: generated.queries.length,
    databaseWrites: 0,
    queries: generated.queries,
  };
};
