import { createHash } from 'crypto';
import { createId } from '@/lib/id';
import { prisma } from '@/lib/prisma';
import {
  type AffiliateFirecrawlClient,
  createFirecrawlAffiliateClient,
  type FirecrawlCaptureResult,
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

const MAX_CAPTURE_PAGES = 10;
const MAX_DISCOVERED_URLS = 50;
const MAX_LOGO_CANDIDATES_PER_PAGE = 5;
const ROBOTS_MAX_BYTES = 512 * 1024;

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
]);

type JsonRecord = Record<string, unknown>;
type IntakePageInput = {
  url: string;
  role?: string | null;
  targetKindHints?: string[] | null;
};

export type AffiliateSourceIntakeCreateInput = {
  name: string;
  sourceKey?: string | null;
  region?: string | null;
  baseUrl?: string | null;
  targetKindHints?: string[] | null;
  notes?: string | null;
  pages: IntakePageInput[];
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
  firecrawlClient?: AffiliateFirecrawlClient;
  fetchResource?: typeof fetchBoundedPublicResource;
  workerId?: string;
  now?: () => Date;
};

type IntakeRunSummary = {
  warnings: string[];
  blockedPages: Array<{ pageId: string; url: string; rule: string | null }>;
  failedPages: Array<{ pageId: string; url: string; error: string }>;
  capturedPages: Array<{ pageId: string; url: string; finalUrl: string }>;
  discoveredUrls: number;
  storedBytes: number;
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
  input: IntakePageInput,
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
    discoverySource,
    status: 'ACTIVE',
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

export const addAffiliateSourceIntakePage = async (intakeId: string, input: IntakePageInput) => {
  const intake = await intakePrisma().intakes.findUnique({ where: { id: intakeId } });
  if (!intake) throw new Error('Affiliate source intake not found.');
  return upsertIntakePage(intakeId, input);
};

export const reviewAffiliateSourceIntakePolicy = async (
  intakeId: string,
  review: AffiliateSourcePolicyReview,
  userId: string,
) => {
  const { intakes } = intakePrisma();
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
  return intakes.update({
    where: { id: intakeId },
    data: {
      complianceStatus,
      status,
      complianceReviewedByUserId: userId,
      complianceReviewedAt: new Date(),
      complianceTermsUrl: stringValue(review.termsUrl),
      complianceNotes: stringValue(review.notes),
    },
  });
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
  const { intakes, pages, runs, artifacts } = intakePrisma();
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
  return { intake, pages: pageRows, runs: runRows, selectedRunId, artifacts: artifactRows };
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
  return runs.create({
    data: {
      id: createId(),
      intakeId,
      requestedPageIds: pageIds,
      requestedByUserId: userId,
      provider: 'FIRECRAWL',
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
  links: Array<{ url: string; title?: string | null; description?: string | null }>,
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
      }, 'FIRECRAWL_MAP');
      stored += 1;
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : `Failed to store discovered URL: ${link.url}`);
    }
  }
  return { stored, warnings };
};

const candidateLogoUrls = (capture: FirecrawlCaptureResult): Array<{ url: string; reason: string }> => {
  const branding = recordValue(capture.normalized.branding);
  const brandingImages = recordValue(branding.images);
  const metadata = capture.normalized.metadata;
  const candidates = [
    { url: stringValue(branding.logo), reason: 'Firecrawl branding logo' },
    { url: stringValue(brandingImages.logo), reason: 'Firecrawl branding image logo' },
    { url: stringValue(brandingImages.ogImage), reason: 'Firecrawl branding Open Graph image' },
    { url: stringValue(metadata.ogImage), reason: 'Page Open Graph image' },
    { url: stringValue(brandingImages.favicon), reason: 'Firecrawl branding favicon' },
    { url: stringValue(metadata.favicon), reason: 'Page favicon' },
    ...capture.normalized.images
      .filter((url) => /logo|brand|crest|mark/i.test(url))
      .map((url) => ({ url, reason: 'Page image URL contains a logo or brand label' })),
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
  const rental = score(/rent(al)?|reserve a (field|court|gym)|book a (field|court|gym)|facility reservation/, 'Page contains rental or reservation language.');
  const events = score(/event|league|tournament|tryout|open gym|camp|clinic|schedule/, 'Page contains event or program language.');
  const club = score(/academy|soccer club|volleyball club|basketball club|our teams|competitive program/, 'Page contains club or academy language.');
  const marketplace = score(/marketplace|search providers|browse venues|multiple organizers/, 'Page appears to aggregate third-party inventory.');
  const noInventory = score(/no events|nothing scheduled|check back|coming soon|loading\.\.\./, 'Page does not expose current inventory.');
  const scores: Array<[AffiliateSourceClassification['type'], number]> = [
    ['AUTH_REQUIRED', auth * 4],
    ['DIRECTORY', directory * 3],
    ['MARKETPLACE', marketplace * 3],
    ['RENTAL', rental * 2],
    ['EVENT_CATALOG', events * 2],
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

const processCapturePage = async (
  intake: any,
  run: any,
  page: any,
  client: AffiliateFirecrawlClient,
  fetchResource: typeof fetchBoundedPublicResource,
  state: IntakeRunSummary,
): Promise<{ capture: FirecrawlCaptureResult | null; providerJobId: string | null }> => {
  const robotsUrl = robotsUrlFor(page.url);
  let robots: BoundedPublicResource;
  try {
    robots = await fetchResource(robotsUrl, { maxBytes: ROBOTS_MAX_BYTES, timeoutMs: 15_000 });
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
    return { capture: null, providerJobId: null };
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
    return { capture: null, providerJobId: null };
  }

  try {
    const capture = await client.scrapeSourcePage(page.url);
    const baseArtifact = {
      intakeId: intake.id,
      pageId: page.id,
      runId: run.id,
      sourceUrl: page.url,
      finalUrl: capture.normalized.finalUrl,
      provider: 'FIRECRAWL',
      httpStatus: capture.normalized.statusCode,
    };
    await persistCaptureArtifact({
      ...baseArtifact,
      kind: 'PROVIDER_SCRAPE_REQUEST_JSON',
      data: jsonBuffer(capture.request),
      mimeType: 'application/json',
    }, state);
    await persistCaptureArtifact({
      ...baseArtifact,
      kind: 'PROVIDER_SCRAPE_RESPONSE_JSON',
      data: jsonBuffer(capture.response),
      mimeType: 'application/json',
    }, state);
    if (capture.normalized.markdown) {
      await persistCaptureArtifact({
        ...baseArtifact,
        kind: 'PAGE_MARKDOWN',
        data: Buffer.from(capture.normalized.markdown, 'utf8'),
        mimeType: 'text/markdown; charset=utf-8',
      }, state);
    }
    if (capture.normalized.rawHtml) {
      await persistCaptureArtifact({
        ...baseArtifact,
        kind: 'PAGE_HTML',
        data: Buffer.from(capture.normalized.rawHtml, 'utf8'),
        mimeType: 'text/html; charset=utf-8',
      }, state);
    }
    await persistCaptureArtifact({
      ...baseArtifact,
      kind: 'PAGE_LINKS',
      data: jsonBuffer(capture.normalized.links),
      mimeType: 'application/json',
    }, state);
    await persistCaptureArtifact({
      ...baseArtifact,
      kind: 'PAGE_IMAGES',
      data: jsonBuffer(capture.normalized.images),
      mimeType: 'application/json',
    }, state);
    if (capture.normalized.branding) {
      await persistCaptureArtifact({
        ...baseArtifact,
        kind: 'PAGE_BRANDING',
        data: jsonBuffer(capture.normalized.branding),
        mimeType: 'application/json',
      }, state);
    }
    if (capture.normalized.screenshotUrl) {
      try {
        const screenshot = await fetchResource(capture.normalized.screenshotUrl, { maxBytes: 3 * 1024 * 1024 });
        await persistCaptureArtifact({
          ...baseArtifact,
          kind: 'PAGE_SCREENSHOT',
          data: screenshot.body,
          sourceUrl: capture.normalized.screenshotUrl,
          finalUrl: screenshot.finalUrl,
          provider: 'FIRECRAWL',
          httpStatus: screenshot.statusCode,
          mimeType: screenshot.contentType ?? 'image/png',
        }, state);
      } catch (error) {
        state.warnings.push(`Screenshot download failed for ${page.url}: ${error instanceof Error ? error.message : 'unknown error'}`);
      }
    }
    for (const candidate of candidateLogoUrls(capture)) {
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
          provider: 'FIRECRAWL',
          httpStatus: logo.statusCode,
          mimeType: logo.contentType,
          metadata: { reason: candidate.reason },
        }, state);
      } catch (error) {
        state.warnings.push(`Logo candidate download failed for ${candidate.url}: ${error instanceof Error ? error.message : 'unknown error'}`);
      }
    }
    state.capturedPages.push({ pageId: page.id, url: page.url, finalUrl: capture.normalized.finalUrl });
    return { capture, providerJobId: capture.providerJobId };
  } catch (error) {
    state.failedPages.push({
      pageId: page.id,
      url: page.url,
      error: error instanceof Error ? error.message : 'Unknown Firecrawl error',
    });
    return { capture: null, providerJobId: null };
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
  const { intakes, pages, runs } = intakePrisma();
  const intake = await intakes.findUnique({ where: { id: run.intakeId } });
  if (!intake) {
    await runs.update({ where: { id: run.id }, data: { status: 'FAILED', finishedAt: now, errorMessage: 'Affiliate source intake not found.' } });
    return { runId: run.id, status: 'FAILED', errorMessage: 'Affiliate source intake not found.' };
  }
  if (intake.complianceStatus !== 'ALLOWED') {
    await runs.update({ where: { id: run.id }, data: { status: 'BLOCKED', finishedAt: now, errorMessage: 'Source policy is not allowed.' } });
    return { runId: run.id, status: 'BLOCKED', errorMessage: 'Source policy is not allowed.' };
  }

  const selectedPages = await pages.findMany({
    where: { id: { in: run.requestedPageIds }, intakeId: intake.id, status: 'ACTIVE' },
    orderBy: { createdAt: 'asc' },
  });
  if (!selectedPages.length) {
    await runs.update({ where: { id: run.id }, data: { status: 'FAILED', finishedAt: now, errorMessage: 'No active intake pages were selected.' } });
    return { runId: run.id, status: 'FAILED', errorMessage: 'No active intake pages were selected.' };
  }

  const client = dependencies.firecrawlClient ?? createFirecrawlAffiliateClient();
  const fetchResource = dependencies.fetchResource ?? fetchBoundedPublicResource;
  const summary: IntakeRunSummary = {
    warnings: [],
    blockedPages: [],
    failedPages: [],
    capturedPages: [],
    discoveredUrls: 0,
    storedBytes: 0,
    classification: { type: 'UNKNOWN', confidence: 0, reasons: [] },
  };
  const providerJobIds: string[] = [];
  const captures: FirecrawlCaptureResult[] = [];

  try {
    const discoveryPage = selectedPages[0];
    const firstPage = await processCapturePage(intake, run, discoveryPage, client, fetchResource, summary);
    if (firstPage.capture) {
      captures.push(firstPage.capture);
      if (firstPage.providerJobId) providerJobIds.push(firstPage.providerJobId);
      try {
        const mapped = await client.mapSourceUrls(discoveryPage.url, { limit: MAX_DISCOVERED_URLS });
        if (mapped.providerJobId) providerJobIds.push(mapped.providerJobId);
        await persistCaptureArtifact({
          intakeId: intake.id,
          pageId: discoveryPage.id,
          runId: run.id,
          kind: 'PROVIDER_MAP_REQUEST_JSON',
          data: jsonBuffer(mapped.request),
          sourceUrl: discoveryPage.url,
          provider: 'FIRECRAWL',
          mimeType: 'application/json',
        }, summary);
        await persistCaptureArtifact({
          intakeId: intake.id,
          pageId: discoveryPage.id,
          runId: run.id,
          kind: 'PROVIDER_MAP_RESPONSE_JSON',
          data: jsonBuffer(mapped.response),
          sourceUrl: discoveryPage.url,
          provider: 'FIRECRAWL',
          mimeType: 'application/json',
        }, summary);
        await persistCaptureArtifact({
          intakeId: intake.id,
          pageId: discoveryPage.id,
          runId: run.id,
          kind: 'DISCOVERED_URLS',
          data: jsonBuffer(mapped.links),
          sourceUrl: discoveryPage.url,
          provider: 'FIRECRAWL',
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
      const processed = await processCapturePage(intake, run, page, client, fetchResource, summary);
      if (processed.capture) captures.push(processed.capture);
      if (processed.providerJobId) providerJobIds.push(processed.providerJobId);
    }

    const evidence = captures.map((capture) => capture.normalized.markdown ?? '').join('\n');
    const urls = captures.flatMap((capture) => capture.normalized.links);
    summary.classification = classifyAffiliateSourceEvidence(evidence, urls);
    const status = summary.capturedPages.length === 0 && summary.blockedPages.length > 0 && summary.failedPages.length === 0
      ? 'BLOCKED'
      : summary.capturedPages.length === 0
        ? 'FAILED'
        : summary.failedPages.length || summary.blockedPages.length || summary.warnings.length
          ? 'PARTIAL'
          : 'SUCCEEDED';
    const finishedAt = dependencies.now?.() ?? new Date();
    const updatedRun = await runs.update({
      where: { id: run.id },
      data: {
        status,
        finishedAt,
        providerJobIds: Array.from(new Set(providerJobIds)),
        discoveredUrlCount: summary.discoveredUrls,
        capturedPageCount: summary.capturedPages.length,
        errorMessage: status === 'FAILED' ? summary.failedPages[0]?.error ?? 'No pages were captured.' : null,
        summary,
      },
    });
    await intakes.update({
      where: { id: intake.id },
      data: {
        lastRunId: run.id,
        status: status === 'BLOCKED' ? 'BLOCKED' : status === 'FAILED' ? 'FAILED' : 'REVIEW_REQUIRED',
        suggestedClassification: summary.classification,
      },
    });
    return { run: updatedRun, summary };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown intake processing error';
    const finishedAt = dependencies.now?.() ?? new Date();
    const failedRun = await runs.update({
      where: { id: run.id },
      data: { status: 'FAILED', finishedAt, errorMessage: message, summary },
    });
    await intakes.update({ where: { id: intake.id }, data: { lastRunId: run.id, status: 'FAILED' } });
    return { run: failedRun, summary };
  }
};

export { readAffiliateSourceIntakeArtifact };
