import { createHash } from 'crypto';
import { createId } from '@/lib/id';
import { prisma } from '@/lib/prisma';
import {
  deriveAffiliateHtmlArtifacts,
  evaluateAffiliateHtmlQuality,
} from './affiliateHtmlArtifacts';
import {
  affiliateCoverageCampaignProposalSchema,
  affiliateCoverageCompletionSchema,
  type AffiliateCoverageCampaignProposal,
  type AffiliateCoverageCompletion,
} from './coverageAgentContracts';
import { queueAffiliateSourceDiscoveryRun } from './sourceDiscovery';
import { affiliateDiscoveryPolicyKeyForUrl } from './sourceDiscoveryRules';
import { US_CITY_DISCOVERY_QUERY_STRATEGY_VERSION } from './sourceDiscoveryCampaignTemplates';
import { persistAffiliateSourceIntakeArtifact } from './sourceIntakeArtifacts';
import { canonicalizeAffiliateIntakeUrl } from './sourceIntakeUrlSafety';

const DEFAULT_LEASE_MS = 2 * 60 * 60 * 1_000;
export const AFFILIATE_COVERAGE_STRATEGY_VERSION = 1;

type JsonRecord = Record<string, unknown>;

const coverageDatabase = () => ({
  jobs: (prisma as any).affiliateCoverageAgentJobs,
  campaigns: (prisma as any).affiliateSourceDiscoveryCampaigns,
  discoveryRuns: (prisma as any).affiliateSourceDiscoveryRuns,
  discoveryResults: (prisma as any).affiliateSourceDiscoveryResults,
  intakes: (prisma as any).affiliateSourceIntakes,
  pages: (prisma as any).affiliateSourceIntakePages,
  intakeRuns: (prisma as any).affiliateSourceIntakeRuns,
  artifacts: (prisma as any).affiliateSourceIntakeArtifacts,
  mappingJobs: (prisma as any).affiliateSourceMappingJobs,
  policies: (prisma as any).affiliateSourceDomainPolicies,
  sports: (prisma as any).sports,
});

type CoverageDatabase = ReturnType<typeof coverageDatabase>;
type CoverageDependencies = {
  database?: CoverageDatabase;
  now?: () => Date;
  createIdentifier?: () => string;
  queueCampaignRun?: typeof queueAffiliateSourceDiscoveryRun;
  persistArtifact?: typeof persistAffiliateSourceIntakeArtifact;
};

const recordValue = (value: unknown): JsonRecord => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}
);

const stringValue = (value: unknown): string | null => (
  typeof value === 'string' && value.trim() ? value.trim() : null
);

const failedPageCount = (summary: unknown): number => {
  const pages = recordValue(summary).failedPages;
  return Array.isArray(pages) ? pages.length : 0;
};

const hasUsefulPartialFailure = (run: any): boolean => (
  run.status === 'PARTIAL' && failedPageCount(run.summary) > 0
);

const marketSubjectKey = (campaignId: string): string => [
  campaignId,
  `query-v${US_CITY_DISCOVERY_QUERY_STRATEGY_VERSION}`,
  `coverage-v${AFFILIATE_COVERAGE_STRATEGY_VERSION}`,
].join(':');

const jobIsClaimable = (job: any, now: Date): boolean => (
  job.status === 'QUEUED'
  || (job.status === 'CLAIMED' && job.leaseExpiresAt instanceof Date && job.leaseExpiresAt < now)
);

const assertActiveClaim = (job: any, agentId: string, now: Date): void => {
  if (!job || job.status !== 'CLAIMED' || job.workerId !== agentId) {
    throw new Error('Coverage job is not claimed by this agent.');
  }
  if (!(job.leaseExpiresAt instanceof Date) || job.leaseExpiresAt < now) {
    throw new Error('Coverage job lease has expired.');
  }
};

const queueCoverageMappingRepair = async (options: {
  database: CoverageDatabase;
  intakeId: string;
  job: any;
  result: AffiliateCoverageCompletion;
  now: Date;
  createIdentifier: () => string;
}): Promise<string> => {
  const { database, intakeId, job, result, now, createIdentifier } = options;
  const pending = await database.mappingJobs.findFirst({
    where: { intakeId, status: { in: ['QUEUED', 'CLAIMED'] } },
    orderBy: { createdAt: 'desc' },
  });
  if (
    pending?.status === 'CLAIMED'
    && pending.leaseExpiresAt instanceof Date
    && pending.leaseExpiresAt >= now
  ) {
    throw new Error('The mapping repair job is already claimed by a mapper. Retry coverage completion after its lease ends.');
  }
  const repairEntry = {
    queuedAt: now.toISOString(),
    repairReason: result.summary,
    repairReasons: result.reasonCodes.length ? result.reasonCodes : ['COVERAGE_CAPTURE_REPAIR'],
    coverageJobId: job.id,
    priorMappingStatus: pending?.status ?? null,
  };
  let mappingJob;
  if (pending) {
    const envelope = recordValue(pending.resultSummary);
    const history = Array.isArray(envelope.mappingRepairHistory)
      ? envelope.mappingRepairHistory
      : [];
    mappingJob = await database.mappingJobs.update({
      where: { id: pending.id },
      data: {
        status: 'QUEUED',
        claimedAt: null,
        leaseExpiresAt: null,
        workerId: null,
        branch: null,
        commit: null,
        errorMessage: null,
        finishedAt: null,
        resultSummary: {
          ...envelope,
          mappingRepairHistory: [...history, repairEntry],
        },
      },
    });
  } else {
    mappingJob = await database.mappingJobs.create({
      data: {
        id: createIdentifier(),
        intakeId,
        status: 'QUEUED',
        resultSummary: { mappingRepairHistory: [repairEntry] },
      },
    });
  }
  await database.intakes.update({
    where: { id: intakeId },
    data: { status: 'READY_FOR_MAPPING' },
  });
  return mappingJob.id;
};

export const reconcileAffiliateCoverageJobs = async (
  options: { now?: Date } = {},
  dependencies: CoverageDependencies = {},
) => {
  const database = dependencies.database ?? coverageDatabase();
  const now = options.now ?? dependencies.now?.() ?? new Date();
  const createIdentifier = dependencies.createIdentifier ?? createId;
  const campaigns = await database.campaigns.findMany({ orderBy: { createdAt: 'asc' } });
  const templateCampaigns = campaigns.filter((campaign: any) => recordValue(campaign.metadata).template === true);
  let marketJobsCreated = 0;
  for (const campaign of templateCampaigns) {
    const existing = await database.jobs.findUnique({
      where: {
        subjectType_subjectKey: {
          subjectType: 'MARKET_COVERAGE',
          subjectKey: marketSubjectKey(campaign.id),
        },
      },
    });
    if (existing) continue;
    await database.jobs.create({
      data: {
        id: createIdentifier(),
        subjectType: 'MARKET_COVERAGE',
        subjectKey: marketSubjectKey(campaign.id),
        status: 'QUEUED',
        context: {
          campaignId: campaign.id,
          campaignName: campaign.name,
          region: campaign.region,
          queryStrategyVersion: US_CITY_DISCOVERY_QUERY_STRATEGY_VERSION,
          coverageStrategyVersion: AFFILIATE_COVERAGE_STRATEGY_VERSION,
        },
      },
    });
    marketJobsCreated += 1;
  }

  const intakeRuns = await database.intakeRuns.findMany({
    orderBy: [{ intakeId: 'asc' }, { createdAt: 'desc' }],
  });
  const latestByIntake = new Map<string, any>();
  for (const run of intakeRuns) {
    if (!latestByIntake.has(run.intakeId)) latestByIntake.set(run.intakeId, run);
  }
  let failedCaptureJobsCreated = 0;
  for (const run of latestByIntake.values()) {
    if (run.status !== 'FAILED' && !hasUsefulPartialFailure(run)) continue;
    const existing = await database.jobs.findUnique({
      where: {
        subjectType_subjectKey: {
          subjectType: 'FAILED_INTAKE_CAPTURE',
          subjectKey: run.id,
        },
      },
    });
    if (existing) continue;
    await database.jobs.create({
      data: {
        id: createIdentifier(),
        subjectType: 'FAILED_INTAKE_CAPTURE',
        subjectKey: run.id,
        status: 'QUEUED',
        context: {
          intakeId: run.intakeId,
          runId: run.id,
          runStatus: run.status,
          failedPageCount: failedPageCount(run.summary),
          reconciledAt: now.toISOString(),
        },
      },
    });
    failedCaptureJobsCreated += 1;
  }
  return {
    marketJobsCreated,
    failedCaptureJobsCreated,
    totalCreated: marketJobsCreated + failedCaptureJobsCreated,
  };
};

export const summarizeAffiliateCoverageQueue = async (
  options: { now?: Date } = {},
  dependencies: CoverageDependencies = {},
) => {
  const database = dependencies.database ?? coverageDatabase();
  const now = options.now ?? dependencies.now?.() ?? new Date();
  const jobs = await database.jobs.findMany({ orderBy: { createdAt: 'asc' } });
  const statusCounts = jobs.reduce((counts: Record<string, number>, job: any) => ({
    ...counts,
    [job.status]: (counts[job.status] ?? 0) + 1,
  }), {});
  const typeCounts = jobs.reduce((counts: Record<string, number>, job: any) => ({
    ...counts,
    [job.subjectType]: (counts[job.subjectType] ?? 0) + 1,
  }), {});
  return {
    totalJobs: jobs.length,
    claimableJobs: jobs.filter((job: any) => jobIsClaimable(job, now)).length,
    activeLeases: jobs.filter((job: any) => (
      job.status === 'CLAIMED'
      && job.leaseExpiresAt instanceof Date
      && job.leaseExpiresAt >= now
    )).length,
    claimedWithoutLease: jobs.filter((job: any) => (
      job.status === 'CLAIMED' && !(job.leaseExpiresAt instanceof Date)
    )).length,
    statusCounts,
    typeCounts,
  };
};

const marketCoverageContext = async (database: CoverageDatabase, job: any) => {
  const campaignId = stringValue(recordValue(job.context).campaignId);
  if (!campaignId) throw new Error('Coverage market job has no campaign id.');
  const campaign = await database.campaigns.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new Error('Coverage campaign was not found.');
  const [sports, neighboringCampaigns] = await Promise.all([
    database.sports.findMany({
      where: { id: { in: campaign.sportIds } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    database.campaigns.findMany({
      where: { region: campaign.region },
      select: {
        id: true,
        name: true,
        status: true,
        sportIds: true,
        sourceTypeHints: true,
        coverageFingerprint: true,
        metadata: true,
      },
      orderBy: { createdAt: 'asc' },
    }),
  ]);
  const focusedCampaignIds = neighboringCampaigns
    .filter((neighbor: any) => (
      stringValue(recordValue(neighbor.metadata).coverageParentCampaignId) === campaignId
    ))
    .map((neighbor: any) => neighbor.id);
  const assessedCampaignIds = Array.from(new Set([campaignId, ...focusedCampaignIds]));
  const [recentRuns, results] = await Promise.all([
    database.discoveryRuns.findMany({
      where: { campaignId: { in: assessedCampaignIds } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    database.discoveryResults.findMany({
      where: { campaignId: { in: assessedCampaignIds } },
      select: {
        campaignId: true,
        status: true,
        sourceTypeHints: true,
        sportHints: true,
        score: true,
        policyKey: true,
        matchingIntakeId: true,
        matchingSourceId: true,
        matchingOrganizationId: true,
      },
    }),
  ]);
  const statusCounts: Record<string, number> = {};
  const sourceTypeCounts: Record<string, number> = {};
  const sportCounts: Record<string, number> = {};
  const canonicalDomains = new Set<string>();
  for (const result of results) {
    statusCounts[result.status] = (statusCounts[result.status] ?? 0) + 1;
    for (const type of result.sourceTypeHints) sourceTypeCounts[type] = (sourceTypeCounts[type] ?? 0) + 1;
    for (const sport of result.sportHints) sportCounts[sport] = (sportCounts[sport] ?? 0) + 1;
    canonicalDomains.add(result.policyKey);
  }
  return {
    campaign,
    sports,
    assessedCampaignIds,
    recentRuns,
    resultSummary: {
      total: results.length,
      uniquePolicyKeys: canonicalDomains.size,
      statusCounts,
      sourceTypeCounts,
      sportCounts,
      unresolvedLeadCount: results.filter((result: any) => (
        ['NEW', 'REVIEW_REQUIRED'].includes(result.status)
        && !result.matchingIntakeId
        && !result.matchingSourceId
        && !result.matchingOrganizationId
      )).length,
    },
    neighboringCampaigns,
  };
};

const failedCaptureContext = async (database: CoverageDatabase, job: any) => {
  const base = recordValue(job.context);
  const intakeId = stringValue(base.intakeId);
  const runId = stringValue(base.runId) ?? job.subjectKey;
  if (!intakeId) throw new Error('Coverage capture job has no intake id.');
  const [intake, run, pages, artifacts] = await Promise.all([
    database.intakes.findUnique({ where: { id: intakeId } }),
    database.intakeRuns.findUnique({ where: { id: runId } }),
    database.pages.findMany({ where: { intakeId }, orderBy: [{ role: 'asc' }, { createdAt: 'asc' }] }),
    database.artifacts.findMany({
      where: { intakeId, runId },
      select: {
        id: true,
        pageId: true,
        kind: true,
        sourceUrl: true,
        finalUrl: true,
        provider: true,
        httpStatus: true,
        contentHash: true,
        mimeType: true,
        sizeBytes: true,
        metadata: true,
      },
      orderBy: { createdAt: 'asc' },
    }),
  ]);
  if (!intake || !run) throw new Error('Coverage capture intake or run was not found.');
  return { intake, run, pages, artifacts };
};

export const claimNextAffiliateCoverageJob = async (
  options: { agentId: string; now?: Date; leaseMs?: number },
  dependencies: CoverageDependencies = {},
) => {
  const agentId = options.agentId.trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(agentId)) {
    throw new Error('Coverage agent id is invalid.');
  }
  const database = dependencies.database ?? coverageDatabase();
  const now = options.now ?? dependencies.now?.() ?? new Date();
  const leaseMs = Math.max(60_000, Math.min(options.leaseMs ?? DEFAULT_LEASE_MS, 24 * 60 * 60 * 1_000));
  const leaseExpiresAt = new Date(now.getTime() + leaseMs);
  const active = await database.jobs.findFirst({
    where: {
      status: 'CLAIMED',
      workerId: agentId,
      leaseExpiresAt: { gte: now },
    },
    orderBy: { claimedAt: 'asc' },
  });
  if (active) {
    const renewed = await database.jobs.updateMany({
      where: {
        id: active.id,
        status: 'CLAIMED',
        workerId: agentId,
        leaseExpiresAt: { gte: now },
      },
      data: { leaseExpiresAt },
    });
    if (renewed.count === 1) {
      return {
        job: { ...active, leaseExpiresAt },
        resumed: true,
        context: active.subjectType === 'FAILED_INTAKE_CAPTURE'
          ? await failedCaptureContext(database, active)
          : await marketCoverageContext(database, active),
      };
    }
  }
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const job = await database.jobs.findFirst({
      where: {
        OR: [
          { status: 'QUEUED' },
          { status: 'CLAIMED', leaseExpiresAt: { lt: now } },
        ],
      },
      orderBy: [
        { subjectType: 'asc' },
        { createdAt: 'asc' },
      ],
    });
    if (!job) return null;
    const claimed = await database.jobs.updateMany({
      where: {
        id: job.id,
        OR: [
          { status: 'QUEUED' },
          { status: 'CLAIMED', leaseExpiresAt: { lt: now } },
        ],
      },
      data: {
        status: 'CLAIMED',
        claimedAt: now,
        leaseExpiresAt,
        workerId: agentId,
        attemptCount: { increment: 1 },
        errorMessage: null,
      },
    });
    if (claimed.count !== 1) continue;
    const claimedJob = { ...job, status: 'CLAIMED', claimedAt: now, leaseExpiresAt, workerId: agentId };
    return {
      job: claimedJob,
      resumed: false,
      context: job.subjectType === 'FAILED_INTAKE_CAPTURE'
        ? await failedCaptureContext(database, claimedJob)
        : await marketCoverageContext(database, claimedJob),
    };
  }
  return null;
};

const normalizedFingerprint = (proposal: AffiliateCoverageCampaignProposal, parentCampaignId: string): string => (
  createHash('sha256').update(JSON.stringify({
    parentCampaignId,
    region: proposal.region.trim().toLowerCase(),
    location: proposal.location?.trim().toLowerCase() ?? null,
    sportIds: [...new Set(proposal.sportIds)].sort(),
    sourceTypeHints: [...new Set(proposal.sourceTypeHints)].sort(),
    coverageArchetypes: [...new Set(proposal.coverageArchetypes)].sort(),
    queryStrategyVersion: US_CITY_DISCOVERY_QUERY_STRATEGY_VERSION,
  })).digest('hex')
);

export const createAffiliateCoverageCampaign = async (
  input: AffiliateCoverageCampaignProposal,
  dependencies: CoverageDependencies = {},
) => {
  const proposal = affiliateCoverageCampaignProposalSchema.parse(input);
  const database = dependencies.database ?? coverageDatabase();
  const now = dependencies.now?.() ?? new Date();
  const job = await database.jobs.findUnique({ where: { id: proposal.jobId } });
  assertActiveClaim(job, proposal.agentId, now);
  if (job.subjectType !== 'MARKET_COVERAGE') {
    throw new Error('Only a market coverage job can create discovery campaigns.');
  }
  const parentCampaignId = stringValue(recordValue(job.context).campaignId);
  if (!parentCampaignId) throw new Error('Coverage job has no parent campaign.');
  const parent = await database.campaigns.findUnique({ where: { id: parentCampaignId } });
  if (!parent) throw new Error('Parent discovery campaign was not found.');
  const parentMetadata = recordValue(parent.metadata);
  const coveredCities = Array.isArray(parentMetadata.coveredCities) ? parentMetadata.coveredCities : [];
  const allowedRegions = new Set<string>([
    stringValue(parentMetadata.anchorState),
    ...coveredCities.map((entry) => stringValue(recordValue(entry).state)),
    stringValue(parent.location),
    stringValue(parent.region),
  ].filter((value): value is string => Boolean(value)).map((value) => value.toLowerCase()));
  const proposedScope = `${proposal.region} ${proposal.location ?? ''}`.toLowerCase();
  if (!Array.from(allowedRegions).some((value) => proposedScope.includes(value))) {
    throw new Error('Coverage campaign region must remain within the claimed market or state.');
  }
  const sportIds = [...new Set(proposal.sportIds)];
  if (sportIds.some((sportId) => !parent.sportIds.includes(sportId))) {
    throw new Error('Coverage campaign sports must belong to the claimed market campaign.');
  }
  const sportCount = await database.sports.count({ where: { id: { in: sportIds } } });
  if (sportCount !== sportIds.length) throw new Error('One or more coverage campaign sports do not exist.');
  const coverageFingerprint = normalizedFingerprint(proposal, parentCampaignId);
  let campaign = await database.campaigns.findUnique({ where: { coverageFingerprint } });
  let created = false;
  if (!campaign) {
    campaign = await database.campaigns.create({
      data: {
        id: (dependencies.createIdentifier ?? createId)(),
        name: proposal.name,
        region: proposal.region,
        location: proposal.location ?? null,
        sportIds,
        sourceTypeHints: [...new Set(proposal.sourceTypeHints)],
        status: 'ACTIVE',
        autoCreateIntakes: true,
        searchIntervalMinutes: proposal.searchIntervalMinutes,
        nextRunAt: now,
        maxQueriesPerRun: proposal.maxQueriesPerRun,
        maxResultsPerQuery: proposal.maxResultsPerQuery,
        queryCursor: 0,
        coverageFingerprint,
        createdByUserId: `coverage-agent:${proposal.agentId}`,
        metadata: {
          coverageAgent: true,
          coverageParentCampaignId: parentCampaignId,
          coverageJobId: job.id,
          coverageArchetypes: proposal.coverageArchetypes,
          rationale: proposal.rationale,
          queryStrategyVersion: US_CITY_DISCOVERY_QUERY_STRATEGY_VERSION,
        },
      },
    });
    created = true;
  }
  const queuedRun = await (dependencies.queueCampaignRun ?? queueAffiliateSourceDiscoveryRun)(
    campaign.id,
    `coverage-agent:${proposal.agentId}`,
  );
  return { campaign, created, queuedRunId: queuedRun.id, coverageFingerprint };
};

export const storeAffiliateManualBrowserEvidence = async (input: {
  jobId: string;
  agentId: string;
  pageId: string;
  sourceUrl: string;
  finalUrl?: string | null;
  html: Buffer;
  screenshot?: Buffer | null;
  screenshotMimeType?: string | null;
  notes: string;
}, dependencies: CoverageDependencies = {}) => {
  const database = dependencies.database ?? coverageDatabase();
  const now = dependencies.now?.() ?? new Date();
  const job = await database.jobs.findUnique({ where: { id: input.jobId } });
  assertActiveClaim(job, input.agentId.trim(), now);
  if (job.subjectType !== 'FAILED_INTAKE_CAPTURE') {
    throw new Error('Only a failed intake capture job can store manual browser evidence.');
  }
  const context = recordValue(job.context);
  const intakeId = stringValue(context.intakeId);
  if (!intakeId) throw new Error('Coverage job has no intake id.');
  const [intake, page] = await Promise.all([
    database.intakes.findUnique({ where: { id: intakeId } }),
    database.pages.findUnique({ where: { id: input.pageId } }),
  ]);
  if (!intake || !page || page.intakeId !== intakeId) {
    throw new Error('Manual evidence page does not belong to the failed intake.');
  }
  if (intake.complianceStatus !== 'ALLOWED' || page.robotsStatus === 'DISALLOWED') {
    throw new Error('Manual evidence requires an allowed intake policy and no robots prohibition.');
  }
  if (input.html.length === 0) throw new Error('Manual browser HTML is empty.');
  const sourceUrl = canonicalizeAffiliateIntakeUrl(input.sourceUrl);
  const finalUrl = canonicalizeAffiliateIntakeUrl(input.finalUrl ?? input.sourceUrl);
  if (sourceUrl !== canonicalizeAffiliateIntakeUrl(page.canonicalUrl)) {
    throw new Error('Manual evidence source URL must be the claimed failed page.');
  }
  const expectedPolicyKey = affiliateDiscoveryPolicyKeyForUrl(page.canonicalUrl);
  if (
    affiliateDiscoveryPolicyKeyForUrl(sourceUrl) !== expectedPolicyKey
    || affiliateDiscoveryPolicyKeyForUrl(finalUrl) !== expectedPolicyKey
  ) {
    throw new Error('Manual evidence URL must remain on the failed page policy key.');
  }
  const html = input.html.toString('utf8');
  const quality = evaluateAffiliateHtmlQuality(html, finalUrl);
  if (!quality.accepted) {
    throw new Error(`Manual browser HTML quality was rejected: ${quality.reasons.join('; ')}`);
  }
  const derived = deriveAffiliateHtmlArtifacts(html, finalUrl);
  const manualRunId = `coverage_manual_${createHash('sha256').update(job.id).digest('hex').slice(0, 24)}`;
  const priorRun = await database.intakeRuns.findUnique({ where: { id: manualRunId } });
  if (!priorRun) {
    await database.intakeRuns.create({
      data: {
        id: manualRunId,
        intakeId,
        requestedPageIds: [page.id],
        requestedByUserId: `coverage-agent:${input.agentId}`,
        provider: 'MANUAL_BROWSER',
        status: 'RUNNING',
        queuedAt: now,
        startedAt: now,
        claimedAt: now,
        workerId: input.agentId,
        attemptCount: 1,
      },
    });
  }
  const persist = dependencies.persistArtifact ?? persistAffiliateSourceIntakeArtifact;
  const artifactMetadata = {
    coverageJobId: job.id,
    captureMethod: 'MANUAL_BROWSER',
    notes: input.notes.trim(),
    quality,
    extractorVersion: derived.extractorVersion,
  };
  const base = {
    intakeId,
    pageId: page.id,
    runId: manualRunId,
    sourceUrl,
    finalUrl,
    provider: 'MANUAL_BROWSER',
    httpStatus: 200,
    metadata: artifactMetadata,
    now,
  };
  const artifacts = [];
  artifacts.push(await persist({
    ...base,
    kind: 'PROVIDER_SCRAPE_REQUEST_JSON',
    data: Buffer.from(JSON.stringify({ method: 'MANUAL_BROWSER', sourceUrl, notes: input.notes.trim() })),
    mimeType: 'application/json',
  }));
  artifacts.push(await persist({
    ...base,
    kind: 'PROVIDER_SCRAPE_RESPONSE_JSON',
    data: Buffer.from(JSON.stringify({ finalUrl, statusCode: 200, quality })),
    mimeType: 'application/json',
  }));
  artifacts.push(await persist({ ...base, kind: 'PAGE_HTML', data: input.html, mimeType: 'text/html; charset=utf-8' }));
  if (derived.markdown) {
    artifacts.push(await persist({
      ...base,
      kind: 'PAGE_MARKDOWN',
      data: Buffer.from(derived.markdown, 'utf8'),
      mimeType: 'text/markdown; charset=utf-8',
    }));
  }
  artifacts.push(await persist({
    ...base,
    kind: 'PAGE_LINKS',
    data: Buffer.from(JSON.stringify(derived.links)),
    mimeType: 'application/json',
  }));
  artifacts.push(await persist({
    ...base,
    kind: 'PAGE_IMAGES',
    data: Buffer.from(JSON.stringify(derived.images)),
    mimeType: 'application/json',
  }));
  artifacts.push(await persist({
    ...base,
    kind: 'PAGE_BRANDING',
    data: Buffer.from(JSON.stringify(derived.branding)),
    mimeType: 'application/json',
  }));
  if (input.screenshot?.length) {
    artifacts.push(await persist({
      ...base,
      kind: 'PAGE_SCREENSHOT',
      data: input.screenshot,
      mimeType: input.screenshotMimeType?.trim() || 'image/png',
    }));
  }
  await database.intakeRuns.update({
    where: { id: manualRunId },
    data: {
      status: 'SUCCEEDED',
      finishedAt: now,
      capturedPageCount: 1,
      providerJobIds: [],
      errorMessage: null,
      summary: {
        coverageJobId: job.id,
        captureMethod: 'MANUAL_BROWSER',
        sourceUrl,
        finalUrl,
        artifactCount: artifacts.length,
        notes: input.notes.trim(),
      },
    },
  });
  await database.intakes.update({
    where: { id: intakeId },
    data: {
      lastRunId: manualRunId,
      status: intake.affiliateSourceId ? 'REVIEW_REQUIRED' : 'READY_FOR_MAPPING',
    },
  });
  let mappingJob = await database.mappingJobs.findFirst({
    where: { intakeId, status: { in: ['QUEUED', 'CLAIMED', 'REVIEW_REQUIRED', 'APPROVED'] } },
    orderBy: { createdAt: 'desc' },
  });
  if (!intake.affiliateSourceId && !mappingJob) {
    mappingJob = await database.mappingJobs.create({
      data: { id: (dependencies.createIdentifier ?? createId)(), intakeId, status: 'QUEUED' },
    });
  }
  return {
    jobId: job.id,
    intakeId,
    manualRunId,
    artifactCount: artifacts.length,
    mappingJobId: mappingJob?.id ?? null,
  };
};

export const completeAffiliateCoverageJob = async (
  input: AffiliateCoverageCompletion,
  dependencies: CoverageDependencies = {},
) => {
  const result = affiliateCoverageCompletionSchema.parse(input);
  const database = dependencies.database ?? coverageDatabase();
  const now = dependencies.now?.() ?? new Date();
  const job = await database.jobs.findUnique({ where: { id: result.jobId } });
  assertActiveClaim(job, result.agentId, now);
  if (job.subjectType === 'MARKET_COVERAGE') {
    if (result.decision === 'CAMPAIGNS_CREATED' && result.campaignIds.length === 0) {
      throw new Error('CAMPAIGNS_CREATED requires at least one campaign id.');
    }
    if (result.decision === 'CAMPAIGNS_CREATED') {
      const campaigns = await database.campaigns.findMany({
        where: { id: { in: result.campaignIds } },
        select: { id: true, metadata: true },
      });
      if (campaigns.length !== new Set(result.campaignIds).size) {
        throw new Error('One or more created coverage campaigns do not exist.');
      }
      if (campaigns.some((campaign: any) => (
        stringValue(recordValue(campaign.metadata).coverageJobId) !== job.id
      ))) {
        throw new Error('Created campaigns must belong to the claimed coverage job.');
      }
      const terminalRuns = await database.discoveryRuns.findMany({
        where: {
          campaignId: { in: result.campaignIds },
        },
        select: { campaignId: true, status: true },
        orderBy: { createdAt: 'desc' },
      });
      const latestStatusByCampaign = new Map<string, string>();
      for (const run of terminalRuns) {
        if (!latestStatusByCampaign.has(run.campaignId)) {
          latestStatusByCampaign.set(run.campaignId, run.status);
        }
      }
      if (result.campaignIds.some((campaignId) => (
        !['SUCCEEDED', 'PARTIAL', 'FAILED'].includes(latestStatusByCampaign.get(campaignId) ?? '')
      ))) {
        throw new Error('Run each created campaign before returning the market job to the queue.');
      }
    }
    if (result.decision === 'COVERED') {
      const evidence = result.coverageEvidence;
      if (
        !evidence
        || evidence.sourceFamilies.length < 2
        || evidence.completedQueryProfiles.length === 0
        || evidence.recentNewDomainYields.length < 2
        || evidence.unresolvedLeadCount !== 0
      ) {
        throw new Error('COVERED requires two source families, completed query profiles, two recent yields, and zero unresolved leads.');
      }
      const parentCampaignId = stringValue(recordValue(job.context).campaignId);
      if (!parentCampaignId) throw new Error('Coverage job has no parent campaign.');
      const campaignIds = Array.from(new Set([parentCampaignId, ...result.campaignIds]));
      const [currentResults, completedRuns] = await Promise.all([
        database.discoveryResults.findMany({
          where: { campaignId: { in: campaignIds } },
          select: {
            status: true,
            matchingIntakeId: true,
            matchingSourceId: true,
            matchingOrganizationId: true,
          },
        }),
        database.discoveryRuns.findMany({
          where: {
            campaignId: { in: campaignIds },
            status: { in: ['SUCCEEDED', 'PARTIAL'] },
          },
          select: { summary: true },
        }),
      ]);
      const currentUnresolvedLeadCount = currentResults.filter((row: any) => (
        ['NEW', 'REVIEW_REQUIRED'].includes(row.status)
        && !row.matchingIntakeId
        && !row.matchingSourceId
        && !row.matchingOrganizationId
      )).length;
      if (currentUnresolvedLeadCount !== 0) {
        throw new Error(`COVERED cannot pass while ${currentUnresolvedLeadCount} current leads remain unresolved.`);
      }
      const executedProfiles = new Set(completedRuns.flatMap((run: any) => {
        const queries = recordValue(run.summary).queries;
        return Array.isArray(queries)
          ? queries.flatMap((query) => {
              const templateKey = stringValue(recordValue(query).templateKey);
              return templateKey ? [templateKey.replace(/^PROFILE:/, '')] : [];
            })
          : [];
      }));
      const unsupportedProfiles = evidence.completedQueryProfiles.filter((profile) => !executedProfiles.has(profile));
      if (unsupportedProfiles.length) {
        throw new Error(`COVERED cites query profiles with no successful run evidence: ${unsupportedProfiles.join(', ')}.`);
      }
    }
    if (['CAPTURE_RECOVERED', 'MAPPER_REPAIR_REQUIRED'].includes(result.decision)) {
      throw new Error('Market coverage jobs cannot use a capture repair decision.');
    }
  } else {
    if (result.decision === 'CAPTURE_RECOVERED') {
      if (!result.manualRunId) throw new Error('CAPTURE_RECOVERED requires a manual run id.');
      const run = await database.intakeRuns.findUnique({ where: { id: result.manualRunId } });
      if (!run || run.status !== 'SUCCEEDED') throw new Error('Manual recovery run was not completed.');
      const artifactCount = await database.artifacts.count({
        where: { runId: result.manualRunId, kind: { in: ['PAGE_HTML', 'PAGE_MARKDOWN'] } },
      });
      if (artifactCount === 0) throw new Error('Manual recovery run has no HTML or Markdown evidence.');
    }
    if (['CAMPAIGNS_CREATED', 'COVERED'].includes(result.decision)) {
      throw new Error('Failed capture jobs cannot use a market coverage decision.');
    }
  }
  let repairMappingJobId: string | null = null;
  if (result.decision === 'MAPPER_REPAIR_REQUIRED') {
    const intakeId = stringValue(recordValue(job.context).intakeId);
    if (!intakeId) throw new Error('Coverage capture job has no intake id for mapper repair.');
    repairMappingJobId = await queueCoverageMappingRepair({
      database,
      intakeId,
      job,
      result,
      now,
      createIdentifier: dependencies.createIdentifier ?? createId,
    });
  }
  const status = result.decision === 'HUMAN_REVIEW_REQUIRED'
    ? 'HUMAN_REVIEW_REQUIRED'
    : result.decision === 'CAMPAIGNS_CREATED'
      ? 'QUEUED'
      : 'COMPLETED';
  return database.jobs.update({
    where: { id: job.id },
    data: {
      status,
      result: repairMappingJobId ? { ...result, repairMappingJobId } : result,
      errorMessage: status === 'HUMAN_REVIEW_REQUIRED' ? result.summary : null,
      finishedAt: status === 'QUEUED' ? null : now,
      claimedAt: status === 'QUEUED' ? null : job.claimedAt,
      workerId: status === 'QUEUED' ? null : job.workerId,
      leaseExpiresAt: null,
    },
  });
};
