import { JSDOM } from 'jsdom';
import sharp from 'sharp';
import { createId } from '@/lib/id';
import { prisma } from '@/lib/prisma';
import { deriveAffiliateHtmlArtifacts } from './affiliateHtmlArtifacts';
import type { AffiliateSourceCaptureClient } from './affiliateProviderContracts';
import { createAffiliateSourceCaptureClient } from './affiliateProviderFactory';
import { codexAffiliateIngestionResultSchema } from './codexIngestionResult';
import { persistAffiliateSourceIntakeArtifact } from './sourceIntakeArtifacts';
import { evaluateRobotsPath } from './sourceIntakeRobots';
import {
  affiliateIntakeUrlKey,
  assertSafePublicUrl,
  canonicalizeAffiliateIntakeUrl,
  fetchBoundedPublicResource,
} from './sourceIntakeUrlSafety';
import { affiliateDiscoveryPolicyKeyForUrl } from './sourceDiscoveryRules';

const MAX_LOGO_BYTES = 3 * 1024 * 1024;
const MAX_ROBOTS_BYTES = 4 * 1024 * 1024;

type JsonRecord = Record<string, unknown>;

const recordValue = (value: unknown): JsonRecord => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}
);

const stringValue = (value: unknown): string | null => (
  typeof value === 'string' && value.trim() ? value.trim() : null
);

const jsonBuffer = (value: unknown): Buffer => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');

const db = () => ({
  approvals: (prisma as any).affiliateApprovalJobs,
  mappingJobs: (prisma as any).affiliateSourceMappingJobs,
  intakes: (prisma as any).affiliateSourceIntakes,
  pages: (prisma as any).affiliateSourceIntakePages,
  runs: (prisma as any).affiliateSourceIntakeRuns,
});

const resolvePageReference = (value: string, baseUrl: string): string | null => {
  const trimmed = value.trim().replace(/^['"]|['"]$/g, '');
  if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('javascript:')) return null;
  try {
    const url = new URL(trimmed, baseUrl);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    url.hash = '';
    return canonicalizeAffiliateIntakeUrl(url.toString());
  } catch {
    return null;
  }
};

export const collectAffiliatePageImageReferences = (
  html: string,
  pageUrl: string,
): Set<string> => {
  const references = new Set<string>();
  const add = (value: string | null | undefined) => {
    if (!value) return;
    const resolved = resolvePageReference(value, pageUrl);
    if (resolved) references.add(resolved);
  };
  const document = new JSDOM(html, { url: pageUrl }).window.document;
  document.querySelectorAll<HTMLElement>('*').forEach((element) => {
    ['src', 'href', 'content', 'data-src', 'data-logo', 'poster'].forEach((attribute) => {
      add(element.getAttribute(attribute));
    });
    const srcset = element.getAttribute('srcset') ?? element.getAttribute('data-srcset');
    srcset?.split(',').forEach((candidate) => add(candidate.trim().split(/\s+/)[0]));
    const style = element.getAttribute('style') ?? '';
    for (const match of style.matchAll(/url\(([^)]+)\)/gi)) add(match[1]);
  });
  document.querySelectorAll('style').forEach((style) => {
    for (const match of (style.textContent ?? '').matchAll(/url\(([^)]+)\)/gi)) add(match[1]);
  });
  return references;
};

export type CaptureAffiliateApprovalLogoEvidenceInput = {
  approvalJobId: string;
  mappingJobId: string;
  reviewerId: string;
  pageUrl: string;
  logoUrl: string;
};

export type AffiliateApprovalLogoEvidenceDependencies = {
  captureClient?: AffiliateSourceCaptureClient;
  fetchResource?: typeof fetchBoundedPublicResource;
  assertSafeUrl?: typeof assertSafePublicUrl;
  persistArtifact?: typeof persistAffiliateSourceIntakeArtifact;
  now?: () => Date;
};

export const captureAffiliateApprovalLogoEvidence = async (
  input: CaptureAffiliateApprovalLogoEvidenceInput,
  dependencies: AffiliateApprovalLogoEvidenceDependencies = {},
) => {
  const approvalJobId = input.approvalJobId.trim();
  const mappingJobId = input.mappingJobId.trim();
  const reviewerId = input.reviewerId.trim();
  const pageUrl = canonicalizeAffiliateIntakeUrl(input.pageUrl.trim());
  const logoUrl = canonicalizeAffiliateIntakeUrl(input.logoUrl.trim());
  if (!approvalJobId || !mappingJobId || !reviewerId) {
    throw new Error('Approval job, mapping job, and reviewer id are required.');
  }
  const { approvals, mappingJobs, intakes, pages, runs } = db();
  const [approval, mappingJob] = await Promise.all([
    approvals.findUnique({ where: { id: approvalJobId } }),
    mappingJobs.findUnique({ where: { id: mappingJobId } }),
  ]);
  if (!approval
    || approval.subjectType !== 'MAPPING_PACKAGE'
    || approval.subjectKey !== mappingJobId
    || approval.status !== 'CLAIMED'
    || approval.reviewerId !== reviewerId) {
    throw new Error('The reviewer does not own an active approval claim for this mapping package.');
  }
  if (!mappingJob) throw new Error('Affiliate source mapping job not found.');
  const envelope = recordValue(mappingJob.resultSummary);
  const result = codexAffiliateIngestionResultSchema.parse(envelope.result);
  if (result.jobId !== mappingJob.id || result.intakeId !== mappingJob.intakeId) {
    throw new Error('Mapping result identity does not match its queue row.');
  }
  if (result.workerId === reviewerId) {
    throw new Error('A mapping package producer cannot capture its own approval evidence.');
  }
  if (result.status !== 'REVIEW_REQUIRED' || result.logoDisposition !== 'MANUAL_REVIEW') {
    throw new Error('Supplemental logo capture is limited to review-ready MANUAL_REVIEW packages.');
  }

  const intake = await intakes.findUnique({ where: { id: mappingJob.intakeId } });
  if (!intake) throw new Error('Affiliate source intake not found.');
  const intakePages = await pages.findMany({ where: { intakeId: intake.id } });
  const policyKeys = new Set([
    stringValue(intake.baseUrl),
    ...intakePages.map((page: any) => stringValue(page.canonicalUrl) ?? stringValue(page.url)),
  ].filter((value): value is string => Boolean(value)).map(affiliateDiscoveryPolicyKeyForUrl));
  if (!policyKeys.has(affiliateDiscoveryPolicyKeyForUrl(pageUrl))) {
    throw new Error('Supplemental logo evidence page must belong to the intake official-site policy scope.');
  }

  const assertSafeUrl = dependencies.assertSafeUrl ?? assertSafePublicUrl;
  await Promise.all([assertSafeUrl(pageUrl), assertSafeUrl(logoUrl)]);
  const pageKey = affiliateIntakeUrlKey(pageUrl);
  let page = await pages.findUnique({ where: { urlKey: pageKey } });
  if (page && page.intakeId !== intake.id) {
    throw new Error('Supplemental evidence page belongs to another intake.');
  }
  if (!page) {
    page = await pages.create({
      data: {
        id: createId(),
        intakeId: intake.id,
        url: pageUrl,
        canonicalUrl: pageUrl,
        urlKey: pageKey,
        role: 'LOGO',
        targetKindHints: [],
        status: 'ACTIVE',
        discoverySource: 'APPROVAL_REVIEW',
        metadata: { approvalJobId, mappingJobId, reviewerId },
      },
    });
  }

  const now = dependencies.now?.() ?? new Date();
  const runId = createId();
  const captureClient = dependencies.captureClient ?? createAffiliateSourceCaptureClient('SCRAPINGDOG');
  const fetchResource = dependencies.fetchResource ?? fetchBoundedPublicResource;
  const persistArtifact = dependencies.persistArtifact ?? persistAffiliateSourceIntakeArtifact;
  await runs.create({
    data: {
      id: runId,
      intakeId: intake.id,
      requestedPageIds: [page.id],
      requestedByUserId: null,
      provider: captureClient.provider,
      status: 'RUNNING',
      queuedAt: now,
      startedAt: now,
      claimedAt: now,
      workerId: `approval-logo-${reviewerId}`,
      attemptCount: 1,
      summary: {
        purpose: 'SUPPLEMENTAL_OFFICIAL_LOGO_EVIDENCE',
        approvalJobId,
        mappingJobId,
        reviewerId,
        priorRunId: intake.lastRunId ?? null,
      },
    },
  });

  try {
    const robotsUrl = new URL('/robots.txt', pageUrl).toString();
    const robots = await fetchResource(robotsUrl, { maxBytes: MAX_ROBOTS_BYTES });
    const robotsText = robots.statusCode >= 200 && robots.statusCode < 300
      ? robots.body.toString('utf8')
      : '';
    const robotsDecision = evaluateRobotsPath(robotsText, pageUrl);
    await persistArtifact({
      intakeId: intake.id,
      pageId: page.id,
      runId,
      kind: 'ROBOTS',
      data: robots.body,
      sourceUrl: robotsUrl,
      finalUrl: robots.finalUrl,
      provider: 'DIRECT',
      httpStatus: robots.statusCode,
      mimeType: robots.contentType ?? 'text/plain',
      metadata: { approvalJobId, mappingJobId, reviewerId },
      now,
    });
    await pages.update({
      where: { id: page.id },
      data: {
        robotsStatus: robotsDecision.status,
        robotsCheckedAt: now,
        robotsNotes: robotsDecision.matchedRule ?? 'No blocking rule matched.',
      },
    });
    if (robotsDecision.status === 'DISALLOWED') {
      throw new Error('Official page robots policy disallows supplemental logo capture.');
    }

    const capture = await captureClient.captureSourcePage(pageUrl);
    if (affiliateDiscoveryPolicyKeyForUrl(capture.finalUrl) !== affiliateDiscoveryPolicyKeyForUrl(pageUrl)) {
      throw new Error('Official page capture redirected outside the intake policy scope.');
    }
    const artifacts = deriveAffiliateHtmlArtifacts(capture.rawHtml, capture.finalUrl || pageUrl);
    const referencedUrls = collectAffiliatePageImageReferences(capture.rawHtml, capture.finalUrl || pageUrl);
    [
      ...artifacts.images,
      ...artifacts.branding.candidates.map((candidate) => candidate.url),
      artifacts.branding.logo,
      artifacts.branding.favicon,
      artifacts.branding.ogImage,
    ].forEach((value) => {
      if (value) referencedUrls.add(canonicalizeAffiliateIntakeUrl(value));
    });
    if (!referencedUrls.has(logoUrl)) {
      throw new Error('The selected logo URL is not referenced by the freshly captured official page.');
    }

    const commonMetadata = {
      purpose: 'SUPPLEMENTAL_OFFICIAL_LOGO_EVIDENCE',
      approvalJobId,
      mappingJobId,
      reviewerId,
      renderMode: capture.renderMode,
      elapsedMs: capture.elapsedMs,
      estimatedCredits: capture.estimatedCredits,
      extractorVersion: artifacts.extractorVersion,
      quality: artifacts.quality,
    };
    const artifactBase = {
      intakeId: intake.id,
      pageId: page.id,
      runId,
      sourceUrl: pageUrl,
      finalUrl: capture.finalUrl,
      provider: capture.provider,
      httpStatus: capture.targetStatusCode ?? capture.providerStatusCode,
      now,
    };
    await persistArtifact({
      ...artifactBase,
      kind: 'PROVIDER_SCRAPE_REQUEST_JSON',
      data: jsonBuffer(capture.request),
      mimeType: 'application/json',
      metadata: commonMetadata,
    });
    await persistArtifact({
      ...artifactBase,
      kind: 'PROVIDER_SCRAPE_RESPONSE_JSON',
      data: jsonBuffer(capture.response),
      mimeType: 'application/json',
      metadata: commonMetadata,
    });
    await persistArtifact({
      ...artifactBase,
      kind: 'PAGE_HTML',
      data: Buffer.from(capture.rawHtml, 'utf8'),
      mimeType: 'text/html; charset=utf-8',
      metadata: commonMetadata,
    });
    await persistArtifact({
      ...artifactBase,
      kind: 'PAGE_MARKDOWN',
      data: Buffer.from(artifacts.markdown, 'utf8'),
      mimeType: 'text/markdown; charset=utf-8',
      metadata: commonMetadata,
    });
    await persistArtifact({
      ...artifactBase,
      kind: 'PAGE_IMAGES',
      data: jsonBuffer([...referencedUrls].sort()),
      mimeType: 'application/json',
      metadata: commonMetadata,
    });
    await persistArtifact({
      ...artifactBase,
      kind: 'PAGE_BRANDING',
      data: jsonBuffer(artifacts.branding),
      mimeType: 'application/json',
      metadata: commonMetadata,
    });

    const logo = await fetchResource(logoUrl, { maxBytes: MAX_LOGO_BYTES });
    if (logo.statusCode < 200 || logo.statusCode >= 300) {
      throw new Error(`Selected official logo returned HTTP ${logo.statusCode}.`);
    }
    if (!logo.contentType?.split(';', 1)[0].trim().toLowerCase().startsWith('image/')) {
      throw new Error('Selected official logo did not return an image content type.');
    }
    const imageMetadata = await sharp(logo.body, {
      animated: false,
      limitInputPixels: 25_000_000,
    }).metadata();
    if (!imageMetadata.format) throw new Error('Selected official logo could not be decoded as an image.');
    if ((imageMetadata.width ?? 0) < 24 || (imageMetadata.height ?? 0) < 24) {
      throw new Error('Selected official logo is too small to preserve as usable evidence.');
    }
    const logoArtifact = await persistArtifact({
      intakeId: intake.id,
      pageId: page.id,
      runId,
      kind: 'LOGO_CANDIDATE',
      data: logo.body,
      sourceUrl: logoUrl,
      finalUrl: logo.finalUrl,
      provider: 'APPROVAL_REVIEW',
      httpStatus: logo.statusCode,
      mimeType: logo.contentType,
      metadata: {
        ...commonMetadata,
        reason: 'Reviewer-verified official page reference',
        evidencePageUrl: pageUrl,
        width: imageMetadata.width ?? null,
        height: imageMetadata.height ?? null,
        format: imageMetadata.format,
      },
      now,
    });
    const finishedAt = dependencies.now?.() ?? new Date();
    await runs.update({
      where: { id: runId },
      data: {
        status: 'SUCCEEDED',
        finishedAt,
        providerJobIds: capture.providerJobId ? [capture.providerJobId] : [],
        capturedPageCount: 1,
        summary: {
          purpose: 'SUPPLEMENTAL_OFFICIAL_LOGO_EVIDENCE',
          approvalJobId,
          mappingJobId,
          reviewerId,
          pageUrl,
          logoUrl,
          logoArtifactId: logoArtifact?.id ?? null,
          priorRunId: intake.lastRunId ?? null,
        },
      },
    });
    await intakes.update({ where: { id: intake.id }, data: { lastRunId: runId } });
    return {
      intakeId: intake.id,
      runId,
      pageId: page.id,
      pageUrl,
      logoUrl,
      logoArtifactId: logoArtifact?.id ?? null,
      producerAction: 'REJECT_WITH_OFFICIAL_LOGO_REPAIR_REQUIRED',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await runs.update({
      where: { id: runId },
      data: {
        status: /robots policy disallows/i.test(message) ? 'BLOCKED' : 'FAILED',
        finishedAt: dependencies.now?.() ?? new Date(),
        errorMessage: message,
      },
    });
    throw error;
  }
};
