import { z } from 'zod';
import { createId } from '@/lib/id';
import { prisma } from '@/lib/prisma';
import {
  addAffiliateSourceIntakePage,
  createAffiliateSourceIntake,
  queueAffiliateSourceIntakeRun,
  reviewAffiliateSourceIntakePolicy,
} from './sourceIntake';
import {
  affiliateIntakeUrlKey,
  canonicalizeAffiliateIntakeUrl,
  fetchBoundedPublicResource,
} from './sourceIntakeUrlSafety';
import { affiliateDiscoveryPolicyKeyForUrl } from './sourceDiscoveryRules';

const MAX_PROPOSALS_PER_BATCH = 200;
const MAX_DIRECTORY_EXPANSION_DEPTH = 2;

type JsonRecord = Record<string, unknown>;

const nonEmptyString = z.string().trim().min(1);
const nullableNonEmptyString = nonEmptyString.nullable().optional();
const targetKindSchema = nonEmptyString.transform((value) => value.toUpperCase());

export const affiliateSourceUrlProposalSchema = z.object({
  url: nonEmptyString,
  organizationName: nonEmptyString,
  region: nullableNonEmptyString,
  targetKindHints: z.array(targetKindSchema).max(10).default(['CLUB']),
  sportHints: z.array(nonEmptyString).max(20).default([]),
  evidenceUrl: nullableNonEmptyString,
  depth: z.number().int().min(0).max(MAX_DIRECTORY_EXPANSION_DEPTH).default(1),
}).strict();

export const affiliateSourceUrlProposalBatchSchema = z.object({
  schemaVersion: z.literal(1),
  parentJobId: nonEmptyString,
  parentIntakeId: nonEmptyString,
  proposals: z.array(z.unknown()).min(1).max(MAX_PROPOSALS_PER_BATCH),
}).strict();

export type AffiliateSourceUrlProposal = z.infer<typeof affiliateSourceUrlProposalSchema>;
export type AffiliateSourceUrlProposalBatch = z.infer<typeof affiliateSourceUrlProposalBatchSchema>;

export type AffiliateSourceUrlEnqueueAction =
  | 'CREATED_CAPTURE_QUEUED'
  | 'CREATED_REVIEW_REQUIRED'
  | 'CREATED_BLOCKED'
  | 'REUSED_CAPTURE_QUEUED'
  | 'REUSED_ALREADY_CAPTURED'
  | 'REUSED_REVIEW_REQUIRED'
  | 'REUSED_BLOCKED'
  | 'DUPLICATE'
  | 'REJECTED';

export type AffiliateSourceUrlEnqueueOutcome = {
  inputUrl: string | null;
  canonicalUrl: string | null;
  action: AffiliateSourceUrlEnqueueAction;
  intakeId: string | null;
  captureRunId: string | null;
  policyKey: string | null;
  matchingSourceId: string | null;
  matchingOrganizationId: string | null;
  reason: string | null;
};

export type AffiliateSourceUrlEnqueueSummary = {
  schemaVersion: 1;
  parentJobId: string;
  parentIntakeId: string;
  submitted: number;
  created: number;
  reused: number;
  captureQueued: number;
  reviewRequired: number;
  blocked: number;
  duplicate: number;
  rejected: number;
  outcomes: AffiliateSourceUrlEnqueueOutcome[];
};

type EnqueueDependencies = {
  now?: () => Date;
  fetchResource?: typeof fetchBoundedPublicResource;
};

type EnqueueContext = {
  userId: string;
  discoverySource: string;
  metadata?: JsonRecord;
  parentIntakeId?: string | null;
  parentJobId?: string | null;
  parentDepth?: number;
  requestedIntakeId?: string | null;
};

const intakeDb = () => ({
  intakes: (prisma as any).affiliateSourceIntakes,
  pages: (prisma as any).affiliateSourceIntakePages,
  runs: (prisma as any).affiliateSourceIntakeRuns,
  policies: (prisma as any).affiliateSourceDomainPolicies,
  sources: (prisma as any).affiliateScrapeSources,
  organizations: (prisma as any).organizations,
});

const stringValue = (value: unknown): string | null => (
  typeof value === 'string' && value.trim() ? value.trim() : null
);

const sourceKeyPart = (value: string): string => value
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 70);

const exactUrlVariants = (value: string): string[] => {
  const parsed = new URL(value);
  parsed.hash = '';
  const canonical = parsed.toString();
  const variants = new Set([canonical, canonical.replace(/\/$/, '')]);
  if ((parsed.pathname === '/' || !parsed.pathname) && !parsed.search) {
    variants.add(parsed.origin);
    variants.add(`${parsed.origin}/`);
  }
  return Array.from(variants);
};

const inferredPageRole = (url: string): string => {
  const path = new URL(url).pathname.toLowerCase();
  if (/terms|privacy|legal|polic/.test(path)) return 'POLICY';
  if (/rent|book|reserv/.test(path)) return 'RENTAL';
  if (/register|signup|tryout|evaluation/.test(path)) return 'REGISTRATION';
  if (/director|find-a-club|clubs/.test(path)) return 'DIRECTORY';
  if (path === '/' || !path) return 'HOME';
  return 'LISTING';
};

const policyIsCurrentAndAllowed = (policy: any, now: Date): boolean => (
  policy?.status === 'ALLOWED'
  && (!policy.expiresAt || new Date(policy.expiresAt).getTime() > now.getTime())
);

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

export const findAffiliateSourceUrlDuplicate = async (canonicalUrl: string) => {
  const urlKey = affiliateIntakeUrlKey(canonicalUrl);
  const page = await intakeDb().pages.findUnique({ where: { urlKey } });
  if (page) {
    return {
      status: 'DUPLICATE' as const,
      matchingIntakeId: page.intakeId as string,
      reason: 'EXISTING_INTAKE_PAGE',
    };
  }

  const policyKey = affiliateDiscoveryPolicyKeyForUrl(canonicalUrl);
  const urlVariants = policyKey.includes('/')
    ? exactUrlVariants(canonicalUrl)
    : Array.from(new Set([
      ...exactUrlVariants(canonicalUrl),
      ...exactUrlVariants(new URL(canonicalUrl).origin),
    ]));
  const source = await intakeDb().sources.findFirst({
    where: {
      OR: [
        { listUrl: { in: urlVariants } },
        { baseUrl: { in: urlVariants } },
      ],
    },
    select: { id: true },
  });
  if (source) {
    return {
      status: 'DUPLICATE' as const,
      matchingSourceId: source.id as string,
      reason: 'EXISTING_APPROVED_SOURCE',
    };
  }

  const organization = await intakeDb().organizations.findFirst({
    where: { website: { in: urlVariants } },
    select: { id: true },
  });
  return organization
    ? {
      status: 'REVIEW_REQUIRED' as const,
      matchingOrganizationId: organization.id as string,
      reason: 'EXISTING_ORGANIZATION_WEBSITE',
    }
    : null;
};

const findReusableIntake = async (
  canonicalUrl: string,
  policyKey: string,
  region: string | null,
) => {
  if (policyKey.includes('/')) return null;
  const origin = new URL(canonicalUrl).origin;
  return intakeDb().intakes.findFirst({
    where: {
      region,
      baseUrl: { in: exactUrlVariants(origin) },
    },
    orderBy: { createdAt: 'asc' },
  });
};

const queueAllowedIntake = async (intake: any, userId: string) => {
  const active = await intakeDb().runs.findFirst({
    where: { intakeId: intake.id, status: { in: ['QUEUED', 'RUNNING'] } },
  });
  if (active) return { run: active, alreadyCaptured: false };
  if (intake.lastRunId) return { run: null, alreadyCaptured: true };
  const pages = await intakeDb().pages.findMany({
    where: { intakeId: intake.id, status: 'ACTIVE' },
    orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
    take: 10,
    select: { id: true },
  });
  if (!pages.length) return { run: null, alreadyCaptured: false };
  const run = await queueAffiliateSourceIntakeRun(
    intake.id,
    pages.map((page: any) => page.id),
    userId,
  );
  return { run, alreadyCaptured: false };
};

const rejectedOutcome = (input: unknown, error: unknown): AffiliateSourceUrlEnqueueOutcome => ({
  inputUrl: stringValue((input as JsonRecord | null)?.url),
  canonicalUrl: null,
  action: 'REJECTED',
  intakeId: null,
  captureRunId: null,
  policyKey: null,
  matchingSourceId: null,
  matchingOrganizationId: null,
  reason: error instanceof Error ? error.message : 'Unknown URL intake error.',
});

export const enqueueAffiliateSourceUrl = async (
  unparsedProposal: unknown,
  context: EnqueueContext,
  dependencies: EnqueueDependencies = {},
): Promise<AffiliateSourceUrlEnqueueOutcome> => {
  const proposal = affiliateSourceUrlProposalSchema.parse(unparsedProposal);
  const supportedTargetKindHints = Array.from(new Set(proposal.targetKindHints.flatMap((kind) => {
    if (kind === 'CLUB' || kind === 'DIRECTORY') return ['CLUB'];
    if (kind === 'RENTAL') return ['RENTAL'];
    if (['EVENT', 'TRYOUT', 'LEAGUE', 'TOURNAMENT', 'CAMP', 'CLINIC', 'OPEN_PLAY'].includes(kind)) {
      return ['EVENT'];
    }
    return [];
  })));
  if (!supportedTargetKindHints.length) {
    throw new Error('Affiliate source URL proposals must include EVENT, RENTAL, or CLUB; TEAM-only or unknown targets are unsupported.');
  }
  const canonicalUrl = canonicalizeAffiliateIntakeUrl(proposal.url);
  const urlKey = affiliateIntakeUrlKey(canonicalUrl);
  const policyKey = affiliateDiscoveryPolicyKeyForUrl(canonicalUrl);
  const region = stringValue(proposal.region);

  if (context.parentIntakeId) {
    const expectedDepth = (context.parentDepth ?? 0) + 1;
    if (proposal.depth !== expectedDepth) {
      throw new Error(`Directory expansion depth must be ${expectedDepth} for this parent intake.`);
    }
    const parentPage = await intakeDb().pages.findFirst({
      where: { intakeId: context.parentIntakeId, urlKey },
      select: { id: true },
    });
    if (parentPage) throw new Error('Directory expansion cannot enqueue one of its own intake pages.');
  }

  const evidenceUrl = stringValue(proposal.evidenceUrl);
  if (context.parentIntakeId) {
    if (!evidenceUrl) throw new Error('Directory expansion proposals require an evidence URL.');
    const evidenceUrlKey = affiliateIntakeUrlKey(canonicalizeAffiliateIntakeUrl(evidenceUrl));
    const evidencePage = await intakeDb().pages.findFirst({
      where: { intakeId: context.parentIntakeId, urlKey: evidenceUrlKey },
      select: { id: true },
    });
    if (!evidencePage) {
      throw new Error('Directory expansion evidence URL must belong to the parent intake.');
    }
  }

  const exactPage = await intakeDb().pages.findUnique({ where: { urlKey } });
  let intake = exactPage
    ? await intakeDb().intakes.findUnique({ where: { id: exactPage.intakeId } })
    : null;
  let created = false;

  if (intake && (intake.affiliateSourceId || ['APPROVED', 'PROMOTED'].includes(intake.status))) {
    return {
      inputUrl: proposal.url,
      canonicalUrl,
      action: 'DUPLICATE',
      intakeId: intake.id,
      captureRunId: null,
      policyKey,
      matchingSourceId: intake.affiliateSourceId ?? null,
      matchingOrganizationId: intake.organizationId ?? null,
      reason: 'EXISTING_COMPLETED_INTAKE',
    };
  }

  if (!intake) {
    const duplicate = await findAffiliateSourceUrlDuplicate(canonicalUrl);
    if (duplicate && !duplicate.matchingIntakeId) {
      return {
        inputUrl: proposal.url,
        canonicalUrl,
        action: 'DUPLICATE',
        intakeId: null,
        captureRunId: null,
        policyKey,
        matchingSourceId: duplicate.matchingSourceId ?? null,
        matchingOrganizationId: duplicate.matchingOrganizationId ?? null,
        reason: duplicate.reason,
      };
    }
    intake = context.requestedIntakeId
      ? await intakeDb().intakes.findUnique({ where: { id: context.requestedIntakeId } })
      : duplicate?.matchingIntakeId
        ? await intakeDb().intakes.findUnique({ where: { id: duplicate.matchingIntakeId } })
        : await findReusableIntake(canonicalUrl, policyKey, region);
  }

  if (context.requestedIntakeId && !intake) {
    throw new Error('Requested affiliate source intake not found.');
  }

  const pageInput = {
    url: canonicalUrl,
    role: inferredPageRole(canonicalUrl),
    targetKindHints: supportedTargetKindHints,
    discoverySource: context.discoverySource,
    metadata: context.parentIntakeId
      ? {
        ...context.metadata,
        directoryExpansion: {
          parentIntakeId: context.parentIntakeId,
          parentJobId: context.parentJobId ?? null,
          evidenceUrl,
          depth: proposal.depth,
          sportHints: proposal.sportHints,
        },
      }
      : { ...context.metadata },
  };

  if (intake) {
    if (!exactPage) await addAffiliateSourceIntakePage(intake.id, pageInput);
  } else {
    const proposedName = proposal.organizationName.trim();
    const sourceKey = [sourceKeyPart(region ?? 'unscoped'), sourceKeyPart(proposedName), sourceKeyPart(policyKey)]
      .filter(Boolean)
      .join('-')
      .slice(0, 100);
    intake = await createAffiliateSourceIntake({
      name: proposedName,
      sourceKey,
      region,
      baseUrl: new URL(canonicalUrl).origin,
      targetKindHints: supportedTargetKindHints,
      notes: context.parentIntakeId
        ? `Discovered from stored affiliate directory intake ${context.parentIntakeId}.`
        : 'Discovered by affiliate source campaign.',
      pages: [pageInput],
    }, context.userId);
    created = true;
  }

  const now = dependencies.now?.() ?? new Date();
  let policy = await intakeDb().policies.findUnique({ where: { policyKey } });
  if (!policy) {
    const fetchResource = dependencies.fetchResource ?? fetchBoundedPublicResource;
    const evidence = await preflightPolicyEvidence(canonicalUrl, fetchResource);
    policy = await intakeDb().policies.create({
      data: {
        id: createId(),
        policyKey,
        status: 'NEEDS_REVIEW',
        robotsSummary: stringValue(evidence.robotsError)
          ?? `robots.txt HTTP ${String(evidence.robotsStatusCode ?? 'unknown')}`,
        evidence,
      },
    });
  }

  if (policy.status === 'BLOCKED') {
    await reviewAffiliateSourceIntakePolicy(intake.id, {
      complianceStatus: 'BLOCKED',
      termsUrl: policy.termsUrl,
      notes: policy.restrictionNotes,
    }, policy.reviewedByUserId ?? context.userId);
    return {
      inputUrl: proposal.url,
      canonicalUrl,
      action: created ? 'CREATED_BLOCKED' : 'REUSED_BLOCKED',
      intakeId: intake.id,
      captureRunId: null,
      policyKey,
      matchingSourceId: null,
      matchingOrganizationId: intake.organizationId ?? null,
      reason: 'DOMAIN_POLICY_BLOCKED',
    };
  }

  if (!policyIsCurrentAndAllowed(policy, now)) {
    return {
      inputUrl: proposal.url,
      canonicalUrl,
      action: created ? 'CREATED_REVIEW_REQUIRED' : 'REUSED_REVIEW_REQUIRED',
      intakeId: intake.id,
      captureRunId: null,
      policyKey,
      matchingSourceId: null,
      matchingOrganizationId: intake.organizationId ?? null,
      reason: policy.status === 'ALLOWED' ? 'DOMAIN_POLICY_EXPIRED' : 'DOMAIN_POLICY_REVIEW_REQUIRED',
    };
  }

  await reviewAffiliateSourceIntakePolicy(intake.id, {
    complianceStatus: 'ALLOWED',
    termsUrl: policy.termsUrl,
    notes: policy.restrictionNotes,
  }, policy.reviewedByUserId ?? context.userId);
  const capture = await queueAllowedIntake(intake, context.userId);
  if (!capture.run && !capture.alreadyCaptured) {
    throw new Error('Allowed affiliate source intake has no active page to capture.');
  }
  return {
    inputUrl: proposal.url,
    canonicalUrl,
    action: capture.alreadyCaptured
      ? 'REUSED_ALREADY_CAPTURED'
      : created ? 'CREATED_CAPTURE_QUEUED' : 'REUSED_CAPTURE_QUEUED',
    intakeId: intake.id,
    captureRunId: capture.run?.id ?? null,
    policyKey,
    matchingSourceId: null,
    matchingOrganizationId: intake.organizationId ?? null,
    reason: capture.alreadyCaptured ? 'INTAKE_ALREADY_CAPTURED' : null,
  };
};

export const enqueueAffiliateSourceUrlProposals = async (
  unparsedBatch: unknown,
  userId: string,
  dependencies: EnqueueDependencies = {},
): Promise<AffiliateSourceUrlEnqueueSummary> => {
  const batch = affiliateSourceUrlProposalBatchSchema.parse(unparsedBatch);
  const parentIntake = await intakeDb().intakes.findUnique({ where: { id: batch.parentIntakeId } });
  if (!parentIntake) throw new Error('Parent affiliate source intake not found.');
  const parentPages = await intakeDb().pages.findMany({
    where: { intakeId: batch.parentIntakeId },
    select: { metadata: true },
  });
  const parentDepth = parentPages.reduce((maximum: number, page: any) => {
    const metadata = page?.metadata && typeof page.metadata === 'object' && !Array.isArray(page.metadata)
      ? page.metadata as JsonRecord
      : {};
    const expansion = metadata.directoryExpansion
      && typeof metadata.directoryExpansion === 'object'
      && !Array.isArray(metadata.directoryExpansion)
      ? metadata.directoryExpansion as JsonRecord
      : {};
    const depth = typeof expansion.depth === 'number' && Number.isInteger(expansion.depth)
      ? expansion.depth
      : 0;
    return Math.max(maximum, depth);
  }, 0);

  const outcomes: AffiliateSourceUrlEnqueueOutcome[] = [];
  for (const unparsedProposal of batch.proposals) {
    try {
      const candidate = unparsedProposal && typeof unparsedProposal === 'object' && !Array.isArray(unparsedProposal)
        ? { region: parentIntake.region ?? null, ...unparsedProposal as JsonRecord }
        : unparsedProposal;
      outcomes.push(await enqueueAffiliateSourceUrl(candidate, {
        userId,
        discoverySource: 'CODEX_DIRECTORY_EXPANSION',
        parentIntakeId: batch.parentIntakeId,
        parentJobId: batch.parentJobId,
        parentDepth,
      }, dependencies));
    } catch (error) {
      outcomes.push(rejectedOutcome(unparsedProposal, error));
    }
  }

  return {
    schemaVersion: 1,
    parentJobId: batch.parentJobId,
    parentIntakeId: batch.parentIntakeId,
    submitted: batch.proposals.length,
    created: outcomes.filter((outcome) => outcome.action.startsWith('CREATED_')).length,
    reused: outcomes.filter((outcome) => outcome.action.startsWith('REUSED_')).length,
    captureQueued: outcomes.filter((outcome) => outcome.captureRunId !== null).length,
    reviewRequired: outcomes.filter((outcome) => outcome.action.endsWith('REVIEW_REQUIRED')).length,
    blocked: outcomes.filter((outcome) => outcome.action.endsWith('BLOCKED')).length,
    duplicate: outcomes.filter((outcome) => outcome.action === 'DUPLICATE').length,
    rejected: outcomes.filter((outcome) => outcome.action === 'REJECTED').length,
    outcomes,
  };
};
