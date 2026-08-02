import { createHash } from 'crypto';
import { createId } from '@/lib/id';
import { prisma } from '@/lib/prisma';
import {
  deriveAffiliateHtmlArtifacts,
  evaluateAffiliateHtmlQuality,
  type AffiliateHtmlArtifacts,
} from './affiliateHtmlArtifacts';
import type {
  AffiliateProviderName,
  AffiliateSourceCaptureClient,
  AffiliateSourcePageCapture,
} from './affiliateProviderContracts';
import {
  createAffiliateFallbackCaptureClient,
  createAffiliateSourceCaptureClient,
  resolveAffiliateIntakeProvider,
  resolveAffiliateIntakeScreenshotMode,
  type AffiliateIntakeScreenshotMode,
} from './affiliateProviderFactory';
import {
  type AffiliateFirecrawlClient,
} from './firecrawlClient';
import {
  INTAKE_RUN_ARTIFACT_LIMIT_BYTES,
  persistAffiliateSourceIntakeArtifact,
  readAffiliateSourceIntakeArtifact,
  type AffiliateSourceIntakeArtifactKind,
} from './sourceIntakeArtifacts';
import { evaluateRobotsPath } from './sourceIntakeRobots';
import {
  affiliateIntakeUrlKey,
  assertSafePublicUrl,
  canonicalizeAffiliateIntakeUrl,
  fetchBoundedPublicResource,
  type BoundedPublicResource,
} from './sourceIntakeUrlSafety';
import { affiliateDiscoveryPolicyKeyForUrl } from './sourceDiscoveryRules';
import {
  discoverAffiliateSourcePages,
  type AffiliateDiscoveredPage,
} from './sourcePageDiscovery';

const MAX_CAPTURE_PAGES = 10;
const MAX_DISCOVERED_URLS = 50;
const MAX_LOGO_CANDIDATES_PER_PAGE = 5;
const ROBOTS_MAX_BYTES = 4 * 1024 * 1024;
const DEFAULT_ROBOTS_TIMEOUT_MS = 30_000;
const DEFAULT_STALE_RUN_AGE_MS = 30 * 60 * 1000;

const robotsTimeoutMs = (): number => {
  const configured = Number.parseInt(process.env.AFFILIATE_INTAKE_ROBOTS_TIMEOUT_MS ?? '', 10);
  return Number.isInteger(configured) && configured >= 15_000 && configured <= 60_000
    ? configured
    : DEFAULT_ROBOTS_TIMEOUT_MS;
};

const staleRunAgeMs = (): number => {
  const configuredMinutes = Number.parseInt(
    process.env.AFFILIATE_INTAKE_STALE_RUN_MINUTES ?? '',
    10,
  );
  return Number.isInteger(configuredMinutes) && configuredMinutes >= 20 && configuredMinutes <= 24 * 60
    ? configuredMinutes * 60 * 1000
    : DEFAULT_STALE_RUN_AGE_MS;
};

const VALID_PAGE_ROLES = new Set([
  'HOME',
  'LISTING',
  'DETAIL',
  'REGISTRATION',
  'RENTAL',
  'DIRECTORY',
  'POLICY',
  'LOGO',
]);
const VALID_TARGET_KINDS = new Set(['EVENT', 'RENTAL', 'TEAM', 'CLUB']);
const VALID_COMPLIANCE_STATUSES = new Set(['UNREVIEWED', 'NEEDS_REVIEW', 'ALLOWED', 'BLOCKED']);
const VALID_INTAKE_STATUSES = new Set([
  'DRAFT',
  'REVIEW_REQUIRED',
  'READY',
  'BLOCKED',
  'APPROVED',
  'PROMOTED',
  'FAILED',
  'READY_FOR_MAPPING',
  'MAPPING_IN_PROGRESS',
  'EXPANDED',
]);

type JsonRecord = Record<string, unknown>;
export type AffiliateSourceIntakePageInput = {
  url: string;
  role?: string | null;
  targetKindHints?: string[] | null;
  discoverySource?: string | null;
  metadata?: JsonRecord | null;
};

export type AffiliateSourceIntakeCreateInput = {
  name: string;
  sourceKey?: string | null;
  region?: string | null;
  baseUrl?: string | null;
  targetKindHints?: string[] | null;
  notes?: string | null;
  pages: AffiliateSourceIntakePageInput[];
};

export type AffiliateSourceIntakeImportRow = AffiliateSourceIntakeCreateInput;

export type AffiliateSourceIntakeImportResult = {
  created: number;
  updated: number;
  duplicatePages: number;
  rejected: Array<{ name: string; reason: string }>;
  intakeIds: string[];
};

export type AffiliateSourcePolicyReview = {
  complianceStatus: string;
  termsUrl?: string | null;
  notes?: string | null;
};

export type AffiliateSourceIntakeProcessingDependencies = {
  captureClient?: AffiliateSourceCaptureClient;
  fallbackCaptureClient?: AffiliateSourceCaptureClient | null;
  screenshotMode?: AffiliateIntakeScreenshotMode;
  discoverPages?: typeof discoverAffiliateSourcePages;
  /** Compatibility hook for existing tests and explicitly queued Firecrawl work. */
  firecrawlClient?: AffiliateFirecrawlClient;
  fetchResource?: typeof fetchBoundedPublicResource;
  workerId?: string;
  now?: () => Date;
};

type IntakeRunSummary = {
  warnings: string[];
  blockedPages: Array<{ pageId: string; url: string; rule: string | null }>;
  restrictedPages: Array<{ pageId: string; url: string; statusCode: number }>;
  failedPages: Array<{ pageId: string; url: string; error: string }>;
  capturedPages: Array<{
    pageId: string;
    url: string;
    finalUrl: string;
    provider: AffiliateProviderName;
    renderMode: AffiliateSourcePageCapture['renderMode'];
    estimatedCredits: number | null;
  }>;
  discoveredUrls: number;
  storedBytes: number;
  estimatedCredits: number;
  classification: AffiliateSourceClassification;
};

export type AffiliateSourceClassification = {
  type: 'EVENT_CATALOG' | 'RENTAL' | 'CLUB' | 'DIRECTORY' | 'MARKETPLACE' | 'AUTH_REQUIRED' | 'NO_CURRENT_INVENTORY' | 'UNKNOWN';
  confidence: number;
  reasons: string[];
};

const intakePrisma = () => ({
  intakes: (prisma as any).affiliateSourceIntakes,
  pages: (prisma as any).affiliateSourceIntakePages,
  runs: (prisma as any).affiliateSourceIntakeRuns,
  artifacts: (prisma as any).affiliateSourceIntakeArtifacts,
  policies: (prisma as any).affiliateSourceDomainPolicies,
  discoveryResults: (prisma as any).affiliateSourceDiscoveryResults,
  mappingJobs: (prisma as any).affiliateSourceMappingJobs,
});

const stringValue = (value: unknown): string | null => (
  typeof value === 'string' && value.trim() ? value.trim() : null
);

const recordValue = (value: unknown): JsonRecord => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}
);

const stringArray = (value: unknown): string[] => (
  Array.isArray(value)
    ? value.map(stringValue).filter((entry): entry is string => Boolean(entry))
    : []
);

const normalizedTargetKinds = (value: unknown): string[] => Array.from(new Set(
  stringArray(value)
    .map((entry) => entry.toUpperCase())
    .filter((entry) => VALID_TARGET_KINDS.has(entry)),
));

const normalizedRole = (value: unknown): string => {
  const role = stringValue(value)?.toUpperCase() ?? 'LISTING';
  if (!VALID_PAGE_ROLES.has(role)) throw new Error(`Unsupported intake page role: ${role}`);
  return role;
};

const sourceKeyFor = (value: string): string => value
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 100);

const deriveSourceKey = (input: AffiliateSourceIntakeCreateInput): string => {
  const requested = stringValue(input.sourceKey);
  const key = sourceKeyFor(requested ?? input.name);
  if (!key) throw new Error('Affiliate source intake requires a source key.');
  return key;
};

const jsonBuffer = (value: unknown): Buffer => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');

const upsertIntakePage = async (
  intakeId: string,
  input: AffiliateSourceIntakePageInput,
  discoverySource = 'MANUAL',
) => {
  const { pages } = intakePrisma();
  const url = stringValue(input.url);
  if (!url) throw new Error('Affiliate source intake page URL is required.');
  await assertSafePublicUrl(url);
  const canonicalUrl = canonicalizeAffiliateIntakeUrl(url);
  const urlKey = affiliateIntakeUrlKey(canonicalUrl);
  const existing = await pages.findUnique({ where: { urlKey } });
  if (existing && existing.intakeId !== intakeId) {
    throw new Error(`Source page already belongs to another intake: ${canonicalUrl}`);
  }
  const data = {
    url,
    canonicalUrl,
    urlKey,
    role: normalizedRole(input.role),
    targetKindHints: normalizedTargetKinds(input.targetKindHints),
    discoverySource: stringValue(input.discoverySource) ?? discoverySource,
    status: 'ACTIVE',
    metadata: input.metadata ? recordValue(input.metadata) : existing?.metadata ?? undefined,
  };
  if (existing) {
    return pages.update({ where: { id: existing.id }, data });
  }
  return pages.create({ data: { id: createId(), intakeId, ...data } });
};

export const createAffiliateSourceIntake = async (
  input: AffiliateSourceIntakeCreateInput,
  userId: string,
) => {
  const { intakes } = intakePrisma();
  const name = stringValue(input.name);
  if (!name) throw new Error('Affiliate source intake name is required.');
  if (!input.pages?.length) throw new Error('Affiliate source intake requires at least one page URL.');
  const sourceKey = deriveSourceKey(input);
  const existing = await intakes.findUnique({ where: { sourceKey } });
  if (existing) {
    for (const page of input.pages) await upsertIntakePage(existing.id, page);
    return intakes.update({
      where: { id: existing.id },
      data: {
        name,
        region: stringValue(input.region),
        baseUrl: stringValue(input.baseUrl) ?? existing.baseUrl,
        targetKindHints: normalizedTargetKinds(input.targetKindHints),
        notes: stringValue(input.notes),
      },
    });
  }

  const firstCanonicalUrl = canonicalizeAffiliateIntakeUrl(input.pages[0].url);
  const intake = await intakes.create({
    data: {
      id: createId(),
      name,
      sourceKey,
      region: stringValue(input.region),
      baseUrl: stringValue(input.baseUrl) ?? new URL(firstCanonicalUrl).origin,
      status: 'REVIEW_REQUIRED',
      complianceStatus: 'UNREVIEWED',
      targetKindHints: normalizedTargetKinds(input.targetKindHints),
      notes: stringValue(input.notes),
      createdByUserId: userId,
    },
  });
  try {
    for (const page of input.pages) await upsertIntakePage(intake.id, page);
  } catch (error) {
    await intakes.delete({ where: { id: intake.id } }).catch(() => undefined);
    throw error;
  }
  return intake;
};

export const bulkUpsertAffiliateSourceIntakes = async (
  rows: AffiliateSourceIntakeImportRow[],
  userId: string,
): Promise<AffiliateSourceIntakeImportResult> => {
  const { intakes, pages } = intakePrisma();
  const result: AffiliateSourceIntakeImportResult = {
    created: 0,
    updated: 0,
    duplicatePages: 0,
    rejected: [],
    intakeIds: [],
  };

  for (const row of rows) {
    try {
      const sourceKey = deriveSourceKey(row);
      const before = await intakes.findUnique({ where: { sourceKey } });
      const priorPageCount = before
        ? await pages.count({ where: { intakeId: before.id } })
        : 0;
      const intake = await createAffiliateSourceIntake(row, userId);
      const nextPageCount = await pages.count({ where: { intakeId: intake.id } });
      if (before) result.updated += 1;
      else result.created += 1;
      result.duplicatePages += Math.max(0, row.pages.length - (nextPageCount - priorPageCount));
      result.intakeIds.push(intake.id);
    } catch (error) {
      result.rejected.push({
        name: stringValue(row.name) ?? 'Unnamed source',
        reason: error instanceof Error ? error.message : 'Unknown import error',
      });
    }
  }
  result.intakeIds = Array.from(new Set(result.intakeIds));
  return result;
};

export const addAffiliateSourceIntakePage = async (intakeId: string, input: AffiliateSourceIntakePageInput) => {
  const intake = await intakePrisma().intakes.findUnique({ where: { id: intakeId } });
  if (!intake) throw new Error('Affiliate source intake not found.');
  return upsertIntakePage(intakeId, input);
};

export const reviewAffiliateSourceIntakePolicy = async (
  intakeId: string,
  review: AffiliateSourcePolicyReview,
  userId: string,
  options: { queueCaptureOnAllow?: boolean } = {},
) => {
  const { intakes, pages, runs, policies, discoveryResults } = intakePrisma();
  const complianceStatus = stringValue(review.complianceStatus)?.toUpperCase() ?? '';
  if (!VALID_COMPLIANCE_STATUSES.has(complianceStatus)) {
    throw new Error('Unsupported affiliate source compliance status.');
  }
  const intake = await intakes.findUnique({ where: { id: intakeId } });
  if (!intake) throw new Error('Affiliate source intake not found.');
  const status = complianceStatus === 'ALLOWED'
    ? 'READY'
    : complianceStatus === 'BLOCKED'
      ? 'BLOCKED'
      : 'REVIEW_REQUIRED';
  const reviewedAt = new Date();
  const updated = await intakes.update({
    where: { id: intakeId },
    data: {
      complianceStatus,
      status,
      complianceReviewedByUserId: userId,
      complianceReviewedAt: reviewedAt,
      complianceTermsUrl: stringValue(review.termsUrl),
      complianceNotes: stringValue(review.notes),
    },
  });
  const policyUrl = stringValue(intake.baseUrl)
    ?? (await pages.findFirst({ where: { intakeId }, orderBy: { createdAt: 'asc' }, select: { canonicalUrl: true } }))?.canonicalUrl
    ?? null;
  if (policyUrl) {
    const policyKey = affiliateDiscoveryPolicyKeyForUrl(policyUrl);
    const existingPolicy = await policies.findUnique({ where: { policyKey } });
    const existingEvidence = recordValue(existingPolicy?.evidence);
    const reviewHistory = Array.isArray(existingEvidence.reviewHistory)
      ? existingEvidence.reviewHistory
      : [];
    const evidence = {
      ...existingEvidence,
      reviewHistory: [
        ...reviewHistory,
        {
          reviewedAt: reviewedAt.toISOString(),
          reviewedByUserId: userId,
          previousStatus: existingPolicy?.status ?? null,
          status: complianceStatus === 'UNREVIEWED' ? 'NEEDS_REVIEW' : complianceStatus,
          termsUrl: stringValue(review.termsUrl),
          restrictionNotes: stringValue(review.notes),
        },
      ].slice(-20),
    };
    await policies.upsert({
      where: { policyKey },
      create: {
        id: createId(),
        policyKey,
        status: complianceStatus === 'UNREVIEWED' ? 'NEEDS_REVIEW' : complianceStatus,
        reviewedByUserId: userId,
        reviewedAt,
        expiresAt: complianceStatus === 'ALLOWED'
          ? new Date(reviewedAt.getTime() + 180 * 86_400_000)
          : null,
        termsUrl: stringValue(review.termsUrl),
        restrictionNotes: stringValue(review.notes),
        evidence,
        robotsSummary: existingPolicy?.robotsSummary ?? undefined,
      },
      update: {
        status: complianceStatus === 'UNREVIEWED' ? 'NEEDS_REVIEW' : complianceStatus,
        reviewedByUserId: userId,
        reviewedAt,
        expiresAt: complianceStatus === 'ALLOWED'
          ? new Date(reviewedAt.getTime() + 180 * 86_400_000)
          : null,
        termsUrl: stringValue(review.termsUrl),
        restrictionNotes: stringValue(review.notes),
        evidence,
      },
    });
    await discoveryResults.updateMany({
      where: { policyKey, matchingIntakeId: intakeId },
      data: {
        status: complianceStatus === 'BLOCKED'
          ? 'BLOCKED'
          : complianceStatus === 'ALLOWED' ? 'INTAKE_CREATED' : 'REVIEW_REQUIRED',
      },
    });
  }
  if (complianceStatus === 'ALLOWED' && options.queueCaptureOnAllow !== false) {
    const activeRun = await runs.findFirst({ where: { intakeId, status: { in: ['QUEUED', 'RUNNING'] } } });
    if (!activeRun) {
      const selectedPages = await pages.findMany({
        where: { intakeId, status: 'ACTIVE' },
        orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
        take: MAX_CAPTURE_PAGES,
        select: { id: true },
      });
      if (selectedPages.length) {
        await runs.create({
          data: {
            id: createId(),
            intakeId,
            requestedPageIds: selectedPages.map((page: any) => page.id),
            requestedByUserId: userId,
            provider: resolveAffiliateIntakeProvider(),
            status: 'QUEUED',
            queuedAt: reviewedAt,
          },
        });
      }
    }
  }
  return updated;
};

export const updateAffiliateSourceIntake = async (
  intakeId: string,
  input: { status?: string; notes?: string | null; selectedLogoArtifactId?: string | null },
) => {
  const { intakes, artifacts } = intakePrisma();
  const intake = await intakes.findUnique({ where: { id: intakeId } });
  if (!intake) throw new Error('Affiliate source intake not found.');
  const status = input.status ? input.status.trim().toUpperCase() : undefined;
  if (status && !VALID_INTAKE_STATUSES.has(status)) throw new Error('Unsupported affiliate source intake status.');
  if (input.selectedLogoArtifactId) {
    const logo = await artifacts.findFirst({
      where: { id: input.selectedLogoArtifactId, intakeId, kind: 'LOGO_CANDIDATE' },
    });
    if (!logo) throw new Error('Selected logo artifact does not belong to this intake.');
  }
  return intakes.update({
    where: { id: intakeId },
    data: {
      ...(status ? { status } : {}),
      ...(input.notes !== undefined ? { notes: stringValue(input.notes) } : {}),
      ...(input.selectedLogoArtifactId !== undefined
        ? { selectedLogoArtifactId: stringValue(input.selectedLogoArtifactId) }
        : {}),
    },
  });
};

export const listAffiliateSourceIntakes = async () => {
  const { intakes, pages, runs, artifacts } = intakePrisma();
  const intakeRows = await intakes.findMany({ orderBy: [{ status: 'asc' }, { name: 'asc' }] });
  if (!intakeRows.length) return [];
  const intakeIds = intakeRows.map((row: any) => row.id);
  const [pageRows, runRows, artifactRows] = await Promise.all([
    pages.findMany({ where: { intakeId: { in: intakeIds } }, select: { intakeId: true } }),
    runs.findMany({ where: { intakeId: { in: intakeIds } }, orderBy: { createdAt: 'desc' } }),
    artifacts.findMany({ where: { intakeId: { in: intakeIds } }, select: { intakeId: true, kind: true } }),
  ]);
  return intakeRows.map((intake: any) => ({
    ...intake,
    pageCount: pageRows.filter((page: any) => page.intakeId === intake.id).length,
    artifactCount: artifactRows.filter((artifact: any) => artifact.intakeId === intake.id).length,
    latestRun: runRows.find((run: any) => run.intakeId === intake.id) ?? null,
  }));
};

export const getAffiliateSourceIntakeContext = async (intakeId: string, runId?: string | null) => {
  const { intakes, pages, runs, artifacts, policies, discoveryResults } = intakePrisma();
  const intake = await intakes.findUnique({ where: { id: intakeId } });
  if (!intake) throw new Error('Affiliate source intake not found.');
  const [pageRows, runRows] = await Promise.all([
    pages.findMany({ where: { intakeId }, orderBy: [{ role: 'asc' }, { createdAt: 'asc' }] }),
    runs.findMany({ where: { intakeId }, orderBy: { createdAt: 'desc' }, take: 20 }),
  ]);
  const selectedRunId = stringValue(runId) ?? runRows[0]?.id ?? null;
  const artifactRows = selectedRunId
    ? await artifacts.findMany({ where: { intakeId, runId: selectedRunId }, orderBy: [{ kind: 'asc' }, { createdAt: 'asc' }] })
    : [];
  const policyUrl = stringValue(intake.baseUrl) ?? pageRows[0]?.canonicalUrl ?? null;
  const policyKey = policyUrl ? affiliateDiscoveryPolicyKeyForUrl(policyUrl) : null;
  const [domainPolicy, relatedDiscoveryResults] = policyKey
    ? await Promise.all([
      policies.findUnique({ where: { policyKey } }),
      discoveryResults.findMany({ where: { policyKey }, orderBy: { score: 'desc' }, take: 25 }),
    ])
    : [null, []];
  return {
    intake,
    pages: pageRows,
    runs: runRows,
    selectedRunId,
    artifacts: artifactRows,
    policyKey,
    domainPolicy,
    relatedDiscoveryResults,
  };
};

export const queueAffiliateSourceIntakeRun = async (
  intakeId: string,
  requestedPageIds: string[],
  userId: string,
) => {
  const { intakes, pages, runs } = intakePrisma();
  const intake = await intakes.findUnique({ where: { id: intakeId } });
  if (!intake) throw new Error('Affiliate source intake not found.');
  if (intake.complianceStatus !== 'ALLOWED') {
    throw new Error('Affiliate source policy must be reviewed and allowed before inspection.');
  }
  const pageIds = Array.from(new Set(stringArray(requestedPageIds)));
  if (!pageIds.length) throw new Error('Select at least one source page to inspect.');
  if (pageIds.length > MAX_CAPTURE_PAGES) throw new Error(`At most ${MAX_CAPTURE_PAGES} source pages may be inspected per run.`);
  const selectedPages = await pages.findMany({ where: { id: { in: pageIds }, intakeId, status: 'ACTIVE' } });
  if (selectedPages.length !== pageIds.length) throw new Error('One or more selected pages do not belong to this intake.');
  const activeRun = await runs.findFirst({
    where: { intakeId, status: { in: ['QUEUED', 'RUNNING'] } },
    orderBy: { queuedAt: 'asc' },
  });
  if (activeRun) return activeRun;
  return runs.create({
    data: {
      id: createId(),
      intakeId,
      requestedPageIds: pageIds,
      requestedByUserId: userId,
      provider: resolveAffiliateIntakeProvider(),
      status: 'QUEUED',
      queuedAt: new Date(),
    },
  });
};

const inferDiscoveredPageRole = (url: string): string => {
  const path = new URL(url).pathname.toLowerCase();
  if (/terms|privacy|legal|polic/.test(path)) return 'POLICY';
  if (/rent|book|reserv/.test(path)) return 'RENTAL';
  if (/register|signup|tryout/.test(path)) return 'REGISTRATION';
  if (/director|find-a-club|clubs/.test(path)) return 'DIRECTORY';
  if (/event|league|tournament|program|schedule|camp|clinic/.test(path)) return 'LISTING';
  return 'DETAIL';
};

const persistDiscoveredPages = async (
  intakeId: string,
  sourceUrl: string,
  links: AffiliateDiscoveredPage[],
): Promise<{ stored: number; warnings: string[] }> => {
  const sourceOrigin = new URL(sourceUrl).origin;
  let stored = 0;
  const warnings: string[] = [];
  for (const link of links.slice(0, MAX_DISCOVERED_URLS)) {
    try {
      if (new URL(link.url).origin !== sourceOrigin) continue;
      await upsertIntakePage(intakeId, {
        url: link.url,
        role: inferDiscoveredPageRole(link.url),
      }, link.discoveryMethod);
      stored += 1;
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : `Failed to store discovered URL: ${link.url}`);
    }
  }
  return { stored, warnings };
};

const candidateLogoUrls = (
  capture: AffiliateSourcePageCapture,
  artifacts: AffiliateHtmlArtifacts,
): Array<{ url: string; reason: string }> => {
  const branding = recordValue(capture.providerArtifacts?.branding);
  const brandingImages = recordValue(branding.images);
  const metadata = recordValue(capture.providerArtifacts?.metadata);
  const candidates = [
    ...artifacts.branding.candidates,
    { url: stringValue(branding.logo), reason: `${capture.provider} branding logo` },
    { url: stringValue(brandingImages.logo), reason: `${capture.provider} branding image logo` },
    { url: stringValue(brandingImages.ogImage), reason: `${capture.provider} branding Open Graph image` },
    { url: stringValue(metadata.ogImage), reason: 'Page Open Graph image' },
    { url: stringValue(brandingImages.favicon), reason: `${capture.provider} branding favicon` },
    { url: stringValue(metadata.favicon), reason: 'Page favicon' },
    ...artifacts.images
      .filter((url) => /logo|brand|crest|mark/i.test(url))
      .map((url) => ({ url, reason: 'Page image URL contains a logo or brand label' })),
    ...(capture.providerArtifacts?.images ?? [])
      .filter((url) => /logo|brand|crest|mark/i.test(url))
      .map((url) => ({ url, reason: `${capture.provider} image URL contains a logo or brand label` })),
  ].filter((candidate): candidate is { url: string; reason: string } => Boolean(candidate.url));
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    let protocol: string;
    try {
      protocol = new URL(candidate.url).protocol;
    } catch {
      return false;
    }
    if (protocol !== 'http:' && protocol !== 'https:') return false;
    if (seen.has(candidate.url)) return false;
    seen.add(candidate.url);
    return true;
  }).slice(0, MAX_LOGO_CANDIDATES_PER_PAGE);
};

export const classifyAffiliateSourceEvidence = (
  evidence: string,
  urls: string[] = [],
): AffiliateSourceClassification => {
  const text = `${evidence}\n${urls.join('\n')}`.toLowerCase();
  const reasons: string[] = [];
  const score = (pattern: RegExp, reason: string): number => {
    if (!pattern.test(text)) return 0;
    reasons.push(reason);
    return 1;
  };
  const auth = score(/sign in|log in|required account|members only/, 'Page appears to require authentication.');
  const directory = score(/find a club|club directory|member clubs|directory/, 'Page contains directory language.');
  const strongRental = score(/reserve a (field|court|gym)|book a (field|court|gym)|facility reservation/, 'Page contains a specific rental or reservation action.');
  const rental = strongRental ? 0 : score(/rent(al)?/, 'Page contains rental language.');
  const events = score(/event|league|tournament|tryout|open gym|camp|clinic|schedule/, 'Page contains event or program language.');
  const club = score(/academy|soccer club|volleyball club|basketball club|our teams|competitive program/, 'Page contains club or academy language.');
  const marketplace = score(/marketplace|search providers|browse venues|multiple organizers/, 'Page appears to aggregate third-party inventory.');
  const noInventory = score(/no events|nothing scheduled|check back|coming soon|loading\.\.\./, 'Page does not expose current inventory.');
  const scores: Array<[AffiliateSourceClassification['type'], number]> = [
    ['AUTH_REQUIRED', auth * 4],
    ['DIRECTORY', directory * 3],
    ['MARKETPLACE', marketplace * 3],
    ['RENTAL', strongRental * 4 + rental],
    ['EVENT_CATALOG', events * 3],
    ['CLUB', club * 2],
    ['NO_CURRENT_INVENTORY', noInventory * 2],
  ];
  scores.sort((left, right) => right[1] - left[1]);
  const [type, bestScore] = scores[0];
  if (!bestScore) return { type: 'UNKNOWN', confidence: 0, reasons: ['No classification signals were found.'] };
  return { type, confidence: Math.min(1, 0.45 + bestScore * 0.12), reasons };
};

const claimQueuedRun = async (runId: string | undefined, workerId: string, now: Date) => {
  const { runs } = intakePrisma();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const queued = runId
      ? await runs.findFirst({ where: { id: runId, status: 'QUEUED' } })
      : await runs.findFirst({ where: { status: 'QUEUED' }, orderBy: { queuedAt: 'asc' } });
    if (!queued) return null;
    const claimed = await runs.updateMany({
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
    if (claimed.count === 1) return runs.findUnique({ where: { id: queued.id } });
    if (runId) return null;
  }
  return null;
};

const completeClaimedRun = async (
  run: any,
  workerId: string,
  data: Record<string, unknown>,
) => {
  const { runs } = intakePrisma();
  const completed = await runs.updateMany({
    where: { id: run.id, status: 'RUNNING', workerId },
    data,
  });
  return completed.count === 1 ? { ...run, ...data } : null;
};

export type StaleAffiliateSourceIntakeRun = {
  id: string;
  intakeId: string;
  requestedPageIds: string[];
  requestedByUserId: string | null;
  provider: string;
  claimedAt: Date | null;
  startedAt: Date | null;
  workerId: string | null;
  attemptCount: number;
  summary: unknown;
};

export type RecoveredAffiliateSourceIntakeRun = {
  staleRunId: string;
  replacementRunId: string;
  intakeId: string;
};

export const findStaleAffiliateSourceIntakeRuns = async (options: {
  runIds?: string[];
  now?: Date;
  maxAgeMs?: number;
} = {}): Promise<StaleAffiliateSourceIntakeRun[]> => {
  const now = options.now ?? new Date();
  const maxAgeMs = Math.max(20 * 60 * 1000, options.maxAgeMs ?? staleRunAgeMs());
  const cutoff = new Date(now.getTime() - maxAgeMs);
  const runIds = Array.from(new Set(stringArray(options.runIds)));
  return intakePrisma().runs.findMany({
    where: {
      status: 'RUNNING',
      ...(runIds.length ? { id: { in: runIds } } : {}),
      OR: [
        { claimedAt: { lte: cutoff } },
        { claimedAt: null, startedAt: { lte: cutoff } },
      ],
    },
    orderBy: { startedAt: 'asc' },
  });
};

export const recoverStaleAffiliateSourceIntakeRuns = async (options: {
  runIds?: string[];
  now?: Date;
  maxAgeMs?: number;
} = {}): Promise<RecoveredAffiliateSourceIntakeRun[]> => {
  const now = options.now ?? new Date();
  const maxAgeMs = Math.max(20 * 60 * 1000, options.maxAgeMs ?? staleRunAgeMs());
  const staleRuns = await findStaleAffiliateSourceIntakeRuns({ ...options, now, maxAgeMs });
  const recovered: RecoveredAffiliateSourceIntakeRun[] = [];
  const maxAgeMinutes = Math.round(maxAgeMs / 60_000);
  const { runs } = intakePrisma();

  for (const staleRun of staleRuns) {
    const otherActiveRun = await runs.findFirst({
      where: {
        intakeId: staleRun.intakeId,
        id: { not: staleRun.id },
        status: { in: ['QUEUED', 'RUNNING'] },
      },
      orderBy: { queuedAt: 'asc' },
    });
    const replacementRunId = otherActiveRun?.id ?? createId();
    const recovery = {
      reason: 'STALE_WORKER_LEASE',
      recoveredAt: now.toISOString(),
      maxAgeMinutes,
      staleWorkerId: staleRun.workerId,
      replacementRunId,
    };
    const priorSummary = recordValue(staleRun.summary);
    const marked = await runs.updateMany({
      where: {
        id: staleRun.id,
        status: 'RUNNING',
        workerId: staleRun.workerId,
        claimedAt: staleRun.claimedAt,
      },
      data: {
        status: 'FAILED',
        finishedAt: now,
        errorMessage: otherActiveRun
          ? `Capture worker lease exceeded ${maxAgeMinutes} minutes; active replacement run ${replacementRunId} already exists.`
          : `Capture worker lease exceeded ${maxAgeMinutes} minutes; replacement run ${replacementRunId} was queued.`,
        summary: { ...priorSummary, recovery },
      },
    });
    if (marked.count !== 1) continue;

    if (!otherActiveRun) {
      await runs.create({
        data: {
          id: replacementRunId,
          intakeId: staleRun.intakeId,
          requestedPageIds: staleRun.requestedPageIds,
          requestedByUserId: staleRun.requestedByUserId,
          provider: staleRun.provider,
          status: 'QUEUED',
          queuedAt: now,
          summary: {
            recovery: {
              reason: 'STALE_WORKER_LEASE_REPLACEMENT',
              replacesRunId: staleRun.id,
              recoveredAt: now.toISOString(),
            },
          },
        },
      });
    }
    recovered.push({
      staleRunId: staleRun.id,
      replacementRunId,
      intakeId: staleRun.intakeId,
    });
  }

  return recovered;
};

const robotsUrlFor = (pageUrl: string): string => new URL('/robots.txt', new URL(pageUrl).origin).toString();

const persistCaptureArtifact = async (
  input: Parameters<typeof persistAffiliateSourceIntakeArtifact>[0],
  state: { storedBytes: number; warnings: string[] },
) => {
  if (state.storedBytes + input.data.length > INTAKE_RUN_ARTIFACT_LIMIT_BYTES) {
    state.warnings.push(`Skipped ${input.kind}: run storage limit would be exceeded.`);
    return null;
  }
  const artifact = await persistAffiliateSourceIntakeArtifact(input);
  state.storedBytes += input.data.length;
  return artifact;
};

type IntakeCaptureClient = AffiliateSourceCaptureClient | AffiliateFirecrawlClient;

const isProviderName = (value: unknown): value is AffiliateProviderName => (
  value === 'SCRAPINGDOG' || value === 'FIRECRAWL'
);

const providerForClient = (client: IntakeCaptureClient): AffiliateProviderName => {
  const provider = 'provider' in client ? client.provider : null;
  return isProviderName(provider) ? provider : 'FIRECRAWL';
};

const captureWithClient = async (
  client: IntakeCaptureClient,
  url: string,
): Promise<AffiliateSourcePageCapture> => {
  if ('captureSourcePage' in client) return client.captureSourcePage(url);
  const startedAt = Date.now();
  const legacy = await client.scrapeSourcePage(url);
  return {
    provider: 'FIRECRAWL',
    request: legacy.request,
    response: legacy.response,
    requestedUrl: url,
    finalUrl: legacy.normalized.finalUrl,
    providerStatusCode: 200,
    targetStatusCode: legacy.normalized.statusCode,
    rawHtml: legacy.normalized.rawHtml ?? '',
    renderMode: 'JAVASCRIPT',
    elapsedMs: Date.now() - startedAt,
    estimatedCredits: null,
    warnings: [],
    providerJobId: legacy.providerJobId,
    providerArtifacts: {
      markdown: legacy.normalized.markdown,
      links: legacy.normalized.links,
      images: legacy.normalized.images,
      branding: legacy.normalized.branding,
      screenshotUrl: legacy.normalized.screenshotUrl,
      metadata: legacy.normalized.metadata,
    },
  };
};

const captureWithFallback = async (
  primaryClient: IntakeCaptureClient,
  fallbackClient: AffiliateSourceCaptureClient | null,
  url: string,
  state: IntakeRunSummary,
): Promise<{ capture: AffiliateSourcePageCapture; client: IntakeCaptureClient }> => {
  try {
    const capture = await captureWithClient(primaryClient, url);
    const quality = evaluateAffiliateHtmlQuality(capture.rawHtml, capture.finalUrl || url);
    if (!quality.accepted && fallbackClient) {
      state.warnings.push(
        `${providerForClient(primaryClient)} capture quality was rejected for ${url}; `
        + `${fallbackClient.provider} fallback was attempted: ${quality.reasons.join('; ')}`,
      );
      return {
        capture: await fallbackClient.captureSourcePage(url),
        client: fallbackClient,
      };
    }
    return { capture, client: primaryClient };
  } catch (primaryError) {
    if (!fallbackClient) throw primaryError;
    state.warnings.push(
      `${providerForClient(primaryClient)} capture failed for ${url}; `
      + `${fallbackClient.provider} fallback was attempted: `
      + `${primaryError instanceof Error ? primaryError.message : 'unknown error'}`,
    );
    return {
      capture: await fallbackClient.captureSourcePage(url),
      client: fallbackClient,
    };
  }
};

const processCapturePage = async (
  intake: any,
  run: any,
  page: any,
  primaryClient: IntakeCaptureClient,
  fallbackClient: AffiliateSourceCaptureClient | null,
  fetchResource: typeof fetchBoundedPublicResource,
  state: IntakeRunSummary,
  captureScreenshot: boolean,
): Promise<{
  capture: AffiliateSourcePageCapture | null;
  artifacts: AffiliateHtmlArtifacts | null;
  robotsText: string;
  providerJobId: string | null;
}> => {
  const robotsUrl = robotsUrlFor(page.url);
  let robots: BoundedPublicResource;
  try {
    robots = await fetchResource(robotsUrl, { maxBytes: ROBOTS_MAX_BYTES, timeoutMs: robotsTimeoutMs() });
  } catch (error) {
    await intakePrisma().pages.update({
      where: { id: page.id },
      data: {
        robotsStatus: 'UNCLEAR',
        robotsCheckedAt: new Date(),
        robotsNotes: error instanceof Error ? error.message : 'Failed to retrieve robots.txt.',
      },
    });
    state.failedPages.push({
      pageId: page.id,
      url: page.url,
      error: `Robots check failed: ${error instanceof Error ? error.message : 'unknown error'}`,
    });
    return { capture: null, artifacts: null, robotsText: '', providerJobId: null };
  }

  await persistCaptureArtifact({
    intakeId: intake.id,
    pageId: page.id,
    runId: run.id,
    kind: 'ROBOTS',
    data: robots.body,
    sourceUrl: robotsUrl,
    finalUrl: robots.finalUrl,
    provider: 'DIRECT',
    httpStatus: robots.statusCode,
    mimeType: robots.contentType ?? 'text/plain',
  }, state);
  const robotsText = robots.statusCode >= 200 && robots.statusCode < 300
    ? robots.body.toString('utf8')
    : '';
  const decision = evaluateRobotsPath(robotsText, page.url);
  await intakePrisma().pages.update({
    where: { id: page.id },
    data: {
      robotsStatus: decision.status,
      robotsCheckedAt: new Date(),
      robotsNotes: decision.matchedRule ?? (robotsText ? 'No blocking rule matched.' : `robots.txt returned HTTP ${robots.statusCode}.`),
    },
  });
  if (decision.status === 'DISALLOWED') {
    state.blockedPages.push({ pageId: page.id, url: page.url, rule: decision.matchedRule });
    return { capture: null, artifacts: null, robotsText, providerJobId: null };
  }

  if (page.role === 'REGISTRATION') {
    try {
      const accessResponse = await fetchResource(page.url, {
        maxBytes: 256 * 1024,
        timeoutMs: robotsTimeoutMs(),
      });
      if (accessResponse.statusCode === 401 || accessResponse.statusCode === 403) {
        await persistCaptureArtifact({
          intakeId: intake.id,
          pageId: page.id,
          runId: run.id,
          kind: 'PAGE_ACCESS_STATUS',
          data: jsonBuffer({
            statusCode: accessResponse.statusCode,
            disposition: 'AUTHENTICATION_REQUIRED',
          }),
          sourceUrl: page.url,
          finalUrl: accessResponse.finalUrl,
          provider: 'DIRECT',
          httpStatus: accessResponse.statusCode,
          mimeType: 'application/json',
        }, state);
        state.restrictedPages.push({
          pageId: page.id,
          url: page.url,
          statusCode: accessResponse.statusCode,
        });
        return { capture: null, artifacts: null, robotsText, providerJobId: null };
      }
    } catch {
      // Continue to the configured provider when a bounded direct preflight
      // cannot establish that the public registration action is gated.
    }
  }

  try {
    const captured = await captureWithFallback(primaryClient, fallbackClient, page.url, state);
    const { capture } = captured;
    const artifacts = deriveAffiliateHtmlArtifacts(capture.rawHtml, capture.finalUrl || page.url);
    const provider = capture.provider;
    const artifactMetadata = {
      extractorVersion: artifacts.extractorVersion,
      renderMode: capture.renderMode,
      elapsedMs: capture.elapsedMs,
      estimatedCredits: capture.estimatedCredits,
      attempts: capture.attempts ?? [],
      quality: artifacts.quality,
    };
    const baseArtifact = {
      intakeId: intake.id,
      pageId: page.id,
      runId: run.id,
      sourceUrl: page.url,
      finalUrl: capture.finalUrl,
      provider,
      httpStatus: capture.targetStatusCode ?? capture.providerStatusCode,
    };
    await persistCaptureArtifact({
      ...baseArtifact,
      kind: 'PROVIDER_SCRAPE_REQUEST_JSON',
      data: jsonBuffer(capture.request),
      mimeType: 'application/json',
      metadata: artifactMetadata,
    }, state);
    await persistCaptureArtifact({
      ...baseArtifact,
      kind: 'PROVIDER_SCRAPE_RESPONSE_JSON',
      data: jsonBuffer(capture.response),
      mimeType: 'application/json',
      metadata: artifactMetadata,
    }, state);
    const markdown = artifacts.markdown || capture.providerArtifacts?.markdown || '';
    if (markdown) {
      await persistCaptureArtifact({
        ...baseArtifact,
        kind: 'PAGE_MARKDOWN',
        data: Buffer.from(markdown, 'utf8'),
        mimeType: 'text/markdown; charset=utf-8',
        metadata: artifactMetadata,
      }, state);
    }
    if (capture.rawHtml) {
      await persistCaptureArtifact({
        ...baseArtifact,
        kind: 'PAGE_HTML',
        data: Buffer.from(capture.rawHtml, 'utf8'),
        mimeType: 'text/html; charset=utf-8',
        metadata: artifactMetadata,
      }, state);
    }
    const links = Array.from(new Set([
      ...artifacts.links,
      ...(capture.providerArtifacts?.links ?? []),
    ]));
    const images = Array.from(new Set([
      ...artifacts.images,
      ...(capture.providerArtifacts?.images ?? []),
    ]));
    await persistCaptureArtifact({
      ...baseArtifact,
      kind: 'PAGE_LINKS',
      data: jsonBuffer(links),
      mimeType: 'application/json',
      metadata: artifactMetadata,
    }, state);
    await persistCaptureArtifact({
      ...baseArtifact,
      kind: 'PAGE_IMAGES',
      data: jsonBuffer(images),
      mimeType: 'application/json',
      metadata: artifactMetadata,
    }, state);
    await persistCaptureArtifact({
      ...baseArtifact,
      kind: 'PAGE_BRANDING',
      data: jsonBuffer({
        ...artifacts.branding,
        providerBranding: capture.providerArtifacts?.branding ?? null,
      }),
      mimeType: 'application/json',
      metadata: artifactMetadata,
    }, state);
    if (captureScreenshot && capture.providerArtifacts?.screenshotUrl) {
      try {
        const screenshot = await fetchResource(capture.providerArtifacts.screenshotUrl, { maxBytes: 3 * 1024 * 1024 });
        await persistCaptureArtifact({
          ...baseArtifact,
          kind: 'PAGE_SCREENSHOT',
          data: screenshot.body,
          sourceUrl: capture.providerArtifacts.screenshotUrl,
          finalUrl: screenshot.finalUrl,
          httpStatus: screenshot.statusCode,
          mimeType: screenshot.contentType ?? 'image/png',
          metadata: artifactMetadata,
        }, state);
      } catch (error) {
        state.warnings.push(`Screenshot download failed for ${page.url}: ${error instanceof Error ? error.message : 'unknown error'}`);
      }
    } else if (captureScreenshot && 'captureScreenshot' in captured.client) {
      try {
        const screenshot = await captured.client.captureScreenshot(page.url);
        await persistCaptureArtifact({
          ...baseArtifact,
          kind: 'PAGE_SCREENSHOT',
          data: screenshot.data,
          provider: screenshot.provider,
          httpStatus: screenshot.providerStatusCode,
          mimeType: screenshot.mimeType,
          metadata: {
            ...artifactMetadata,
            request: screenshot.request,
            response: screenshot.response,
            elapsedMs: screenshot.elapsedMs,
            estimatedCredits: screenshot.estimatedCredits,
          },
        }, state);
        state.estimatedCredits += screenshot.estimatedCredits ?? 0;
      } catch (error) {
        state.warnings.push(`Screenshot capture failed for ${page.url}: ${error instanceof Error ? error.message : 'unknown error'}`);
      }
    }
    for (const candidate of candidateLogoUrls(capture, artifacts)) {
      try {
        const logo = await fetchResource(candidate.url, { maxBytes: 3 * 1024 * 1024 });
        if (!logo.contentType?.toLowerCase().startsWith('image/')) {
          state.warnings.push(`Skipped non-image logo candidate: ${candidate.url}`);
          continue;
        }
        await persistCaptureArtifact({
          ...baseArtifact,
          kind: 'LOGO_CANDIDATE',
          data: logo.body,
          sourceUrl: candidate.url,
          finalUrl: logo.finalUrl,
          provider,
          httpStatus: logo.statusCode,
          mimeType: logo.contentType,
          metadata: { ...artifactMetadata, reason: candidate.reason },
        }, state);
      } catch (error) {
        state.warnings.push(`Logo candidate download failed for ${candidate.url}: ${error instanceof Error ? error.message : 'unknown error'}`);
      }
    }
    state.warnings.push(...capture.warnings);
    state.estimatedCredits += capture.estimatedCredits ?? 0;
    state.capturedPages.push({
      pageId: page.id,
      url: page.url,
      finalUrl: capture.finalUrl,
      provider,
      renderMode: capture.renderMode,
      estimatedCredits: capture.estimatedCredits,
    });
    return {
      capture: {
        ...capture,
        providerArtifacts: {
          markdown,
          links,
          images,
          branding: {
            ...artifacts.branding,
            providerBranding: capture.providerArtifacts?.branding ?? null,
          },
          screenshotUrl: capture.providerArtifacts?.screenshotUrl ?? null,
          metadata: {
            ...recordValue(capture.providerArtifacts?.metadata),
            ...artifacts.metadata,
            extractorVersion: artifacts.extractorVersion,
            quality: artifacts.quality,
          },
        },
      },
      artifacts,
      robotsText,
      providerJobId: capture.providerJobId ?? null,
    };
  } catch (error) {
    state.failedPages.push({
      pageId: page.id,
      url: page.url,
      error: error instanceof Error ? error.message : 'Unknown affiliate capture error',
    });
    return { capture: null, artifacts: null, robotsText, providerJobId: null };
  }
};

export const processNextAffiliateSourceIntakeRun = async (
  options: { runId?: string; workerId?: string } = {},
  dependencies: AffiliateSourceIntakeProcessingDependencies = {},
) => {
  const now = dependencies.now?.() ?? new Date();
  const workerId = dependencies.workerId ?? options.workerId ?? `affiliate-intake-${process.pid}`;
  const run = await claimQueuedRun(stringValue(options.runId) ?? undefined, workerId, now);
  if (!run) return null;
  const { intakes, pages, runs, artifacts, mappingJobs } = intakePrisma();
  const intake = await intakes.findUnique({ where: { id: run.intakeId } });
  if (!intake) {
    const updated = await completeClaimedRun(run, workerId, {
      status: 'FAILED',
      finishedAt: now,
      errorMessage: 'Affiliate source intake not found.',
    });
    if (!updated) return { runId: run.id, status: 'LEASE_LOST', leaseLost: true };
    return { runId: run.id, status: 'FAILED', errorMessage: 'Affiliate source intake not found.' };
  }
  if (intake.complianceStatus !== 'ALLOWED') {
    const updated = await completeClaimedRun(run, workerId, {
      status: 'BLOCKED',
      finishedAt: now,
      errorMessage: 'Source policy is not allowed.',
    });
    if (!updated) return { runId: run.id, status: 'LEASE_LOST', leaseLost: true };
    return { runId: run.id, status: 'BLOCKED', errorMessage: 'Source policy is not allowed.' };
  }

  const selectedPages = await pages.findMany({
    where: { id: { in: run.requestedPageIds }, intakeId: intake.id, status: 'ACTIVE' },
    orderBy: { createdAt: 'asc' },
  });
  if (!selectedPages.length) {
    const updated = await completeClaimedRun(run, workerId, {
      status: 'FAILED',
      finishedAt: now,
      errorMessage: 'No active intake pages were selected.',
    });
    if (!updated) return { runId: run.id, status: 'LEASE_LOST', leaseLost: true };
    return { runId: run.id, status: 'FAILED', errorMessage: 'No active intake pages were selected.' };
  }

  const queuedProvider = isProviderName(run.provider)
    ? run.provider
    : resolveAffiliateIntakeProvider();
  const primaryClient: IntakeCaptureClient = dependencies.captureClient
    ?? dependencies.firecrawlClient
    ?? createAffiliateSourceCaptureClient(queuedProvider);
  const fallbackClient = dependencies.fallbackCaptureClient !== undefined
    ? dependencies.fallbackCaptureClient
    : createAffiliateFallbackCaptureClient(providerForClient(primaryClient));
  const screenshotMode = dependencies.screenshotMode ?? resolveAffiliateIntakeScreenshotMode();
  const discoverPages = dependencies.discoverPages ?? discoverAffiliateSourcePages;
  const fetchResource = dependencies.fetchResource ?? fetchBoundedPublicResource;
  const summary: IntakeRunSummary = {
    warnings: [],
    blockedPages: [],
    restrictedPages: [],
    failedPages: [],
    capturedPages: [],
    discoveredUrls: 0,
    storedBytes: 0,
    estimatedCredits: 0,
    classification: { type: 'UNKNOWN', confidence: 0, reasons: [] },
  };
  const providerJobIds: string[] = [];
  const captures: AffiliateSourcePageCapture[] = [];

  try {
    const discoveryPage = selectedPages[0];
    const firstPage = await processCapturePage(
      intake,
      run,
      discoveryPage,
      primaryClient,
      fallbackClient,
      fetchResource,
      summary,
      screenshotMode === 'all' || screenshotMode === 'first',
    );
    if (firstPage.capture) {
      captures.push(firstPage.capture);
      if (firstPage.providerJobId) providerJobIds.push(firstPage.providerJobId);
      try {
        const mapped = await discoverPages({
          sourceUrl: discoveryPage.url,
          robotsText: firstPage.robotsText,
          capturedLinks: firstPage.artifacts?.links ?? [],
          fetchResource,
          limit: MAX_DISCOVERED_URLS,
        });
        if (mapped.providerJobId) providerJobIds.push(mapped.providerJobId);
        await persistCaptureArtifact({
          intakeId: intake.id,
          pageId: discoveryPage.id,
          runId: run.id,
          kind: 'PROVIDER_MAP_REQUEST_JSON',
          data: jsonBuffer(mapped.request),
          sourceUrl: discoveryPage.url,
          provider: 'LOCAL',
          mimeType: 'application/json',
        }, summary);
        await persistCaptureArtifact({
          intakeId: intake.id,
          pageId: discoveryPage.id,
          runId: run.id,
          kind: 'PROVIDER_MAP_RESPONSE_JSON',
          data: jsonBuffer(mapped.response),
          sourceUrl: discoveryPage.url,
          provider: 'LOCAL',
          mimeType: 'application/json',
        }, summary);
        await persistCaptureArtifact({
          intakeId: intake.id,
          pageId: discoveryPage.id,
          runId: run.id,
          kind: 'DISCOVERED_URLS',
          data: jsonBuffer(mapped.links),
          sourceUrl: discoveryPage.url,
          provider: 'LOCAL',
          mimeType: 'application/json',
        }, summary);
        const discovered = await persistDiscoveredPages(intake.id, discoveryPage.url, mapped.links);
        summary.discoveredUrls = discovered.stored;
        summary.warnings.push(...discovered.warnings);
      } catch (error) {
        summary.warnings.push(`URL discovery failed: ${error instanceof Error ? error.message : 'unknown error'}`);
      }
    }

    for (const page of selectedPages.slice(1, MAX_CAPTURE_PAGES)) {
      const processed = await processCapturePage(
        intake,
        run,
        page,
        primaryClient,
        fallbackClient,
        fetchResource,
        summary,
        screenshotMode === 'all',
      );
      if (processed.capture) captures.push(processed.capture);
      if (processed.providerJobId) providerJobIds.push(processed.providerJobId);
    }

    const evidence = captures.map((capture) => capture.providerArtifacts?.markdown ?? '').join('\n');
    const urls = captures.flatMap((capture) => capture.providerArtifacts?.links ?? []);
    summary.classification = summary.capturedPages.length === 0 && summary.restrictedPages.length > 0
      ? {
        type: 'AUTH_REQUIRED',
        confidence: 1,
        reasons: ['Selected registration pages require authentication.'],
      }
      : classifyAffiliateSourceEvidence(evidence, urls);
    const hasRecordedEvidence = summary.capturedPages.length > 0 || summary.restrictedPages.length > 0;
    const status = !hasRecordedEvidence && summary.blockedPages.length > 0 && summary.failedPages.length === 0
      ? 'BLOCKED'
      : !hasRecordedEvidence
        ? 'FAILED'
        : summary.failedPages.length || summary.blockedPages.length || summary.warnings.length
          ? 'PARTIAL'
          : 'SUCCEEDED';
    const finishedAt = dependencies.now?.() ?? new Date();
    const updatedRun = await completeClaimedRun(run, workerId, {
      status,
      finishedAt,
      providerJobIds: Array.from(new Set(providerJobIds)),
      discoveredUrlCount: summary.discoveredUrls,
      capturedPageCount: summary.capturedPages.length,
      errorMessage: status === 'FAILED' ? summary.failedPages[0]?.error ?? 'No pages were captured.' : null,
      summary,
    });
    if (!updatedRun) return { runId: run.id, status: 'LEASE_LOST', leaseLost: true, summary };
    const hasMappingEvidence = ['SUCCEEDED', 'PARTIAL'].includes(status)
      && await artifacts.count({
        where: { intakeId: intake.id, runId: run.id, kind: { in: ['PAGE_HTML', 'PAGE_MARKDOWN'] } },
      }) > 0;
    const nextIntakeStatus = status === 'BLOCKED'
      ? 'BLOCKED'
      : status === 'FAILED'
        ? 'FAILED'
        : hasMappingEvidence && !intake.affiliateSourceId
          ? 'READY_FOR_MAPPING'
          : 'REVIEW_REQUIRED';
    await intakes.update({
      where: { id: intake.id },
      data: {
        lastRunId: run.id,
        status: nextIntakeStatus,
        suggestedClassification: summary.classification,
      },
    });
    if (nextIntakeStatus === 'READY_FOR_MAPPING') {
      const activeJob = await mappingJobs.findFirst({
        where: { intakeId: intake.id, status: { in: ['QUEUED', 'CLAIMED', 'REVIEW_REQUIRED'] } },
      });
      if (!activeJob) {
        await mappingJobs.create({
          data: { id: createId(), intakeId: intake.id, status: 'QUEUED' },
        });
      }
    }
    return { run: updatedRun, summary };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown intake processing error';
    const finishedAt = dependencies.now?.() ?? new Date();
    const failedRun = await completeClaimedRun(run, workerId, {
      status: 'FAILED',
      finishedAt,
      errorMessage: message,
      summary,
    });
    if (!failedRun) return { runId: run.id, status: 'LEASE_LOST', leaseLost: true, summary };
    await intakes.update({ where: { id: intake.id }, data: { lastRunId: run.id, status: 'FAILED' } });
    return { run: failedRun, summary };
  }
};

export { readAffiliateSourceIntakeArtifact };
