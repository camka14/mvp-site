import { prisma } from '@/lib/prisma';
import { affiliateDiscoveryPolicyKeyForUrl } from './sourceDiscoveryRules';
import {
  fetchBoundedPublicResource,
  type BoundedPublicResource,
} from './sourceIntakeUrlSafety';
import { findAffiliateIntakeIdsForPolicyKey } from './sourcePolicyIntakes';

const MAX_POLICY_BYTES = 512 * 1024;
const MAX_STORED_TEXT = 50_000;
const POLICY_TIMEOUT_MS = 15_000;

type JsonRecord = Record<string, unknown>;

const recordValue = (value: unknown): JsonRecord => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}
);

const stringValue = (value: unknown): string | null => (
  typeof value === 'string' && value.trim() ? value.trim() : null
);

const stringArray = (value: unknown): string[] => (
  Array.isArray(value)
    ? value.map(stringValue).filter((item): item is string => Boolean(item))
    : []
);

const policyKeyMatches = (url: string, policyKey: string): boolean => {
  try {
    return affiliateDiscoveryPolicyKeyForUrl(url) === policyKey;
  } catch {
    return false;
  }
};

const policyResourceMatches = (url: string, origin: string, policyKey: string): boolean => {
  try {
    return new URL(url).origin === origin || policyKeyMatches(url, policyKey);
  } catch {
    return false;
  }
};

const resourceSummary = (requestedUrl: string, response: BoundedPublicResource) => ({
  requestedUrl,
  finalUrl: response.finalUrl,
  statusCode: response.statusCode,
  contentType: response.contentType,
  bodyText: response.body.toString('utf8').slice(0, MAX_STORED_TEXT),
  truncated: response.body.length > MAX_STORED_TEXT,
});

export type AffiliateApprovalPolicyEvidenceDependencies = {
  db?: any;
  fetchResource?: typeof fetchBoundedPublicResource;
  now?: () => Date;
};

export const refreshAffiliateApprovalPolicyEvidence = async (
  policyKey: string,
  dependencies: AffiliateApprovalPolicyEvidenceDependencies = {},
) => {
  const db = dependencies.db ?? prisma;
  const policy = await (db as any).affiliateSourceDomainPolicies.findUnique({
    where: { policyKey },
  });
  if (!policy) throw new Error('Affiliate source domain policy not found.');

  const intakeIds = await findAffiliateIntakeIdsForPolicyKey(db as any, policyKey);
  const [intakes, pages] = await Promise.all([
    (db as any).affiliateSourceIntakes.findMany({
      where: { id: { in: intakeIds } },
      select: { id: true, baseUrl: true },
      orderBy: { id: 'asc' },
    }),
    (db as any).affiliateSourceIntakePages.findMany({
      where: { intakeId: { in: intakeIds } },
      select: { id: true, intakeId: true, canonicalUrl: true },
      orderBy: { id: 'asc' },
    }),
  ]);
  const sourceUrls = [
    ...pages.map((page: any) => stringValue(page.canonicalUrl)),
    ...intakes.map((intake: any) => stringValue(intake.baseUrl)),
  ].filter((url): url is string => Boolean(url) && policyKeyMatches(url, policyKey));
  if (!sourceUrls.length) {
    throw new Error('No intake URL matches the affiliate domain policy.');
  }

  const origin = new URL(sourceUrls[0]).origin;
  const priorEvidence = recordValue(policy.evidence);
  const candidateUrls = Array.from(new Set([
    new URL('/robots.txt', origin).toString(),
    stringValue(policy.termsUrl),
    ...stringArray(priorEvidence.likelyTermsUrls),
    new URL('/terms', origin).toString(),
    new URL('/terms-of-service', origin).toString(),
    new URL('/privacy', origin).toString(),
  ].filter((url): url is string => (
    typeof url === 'string' && policyResourceMatches(url, origin, policyKey)
  ))));
  const fetchResource = dependencies.fetchResource ?? fetchBoundedPublicResource;
  const resources: Array<JsonRecord> = [];
  for (const requestedUrl of candidateUrls) {
    try {
      const response = await fetchResource(requestedUrl, {
        maxBytes: MAX_POLICY_BYTES,
        timeoutMs: POLICY_TIMEOUT_MS,
      });
      resources.push(resourceSummary(requestedUrl, response));
    } catch (error) {
      resources.push({
        requestedUrl,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  const capturedAt = (dependencies.now?.() ?? new Date()).toISOString();
  const approvalEvidence = {
    schemaVersion: 1,
    capturedAt,
    policyKey,
    sourceUrl: sourceUrls[0],
    intakeIds,
    resources,
  };
  const updated = await (db as any).affiliateSourceDomainPolicies.update({
    where: { policyKey },
    data: {
      evidence: {
        ...priorEvidence,
        approvalEvidence,
      },
    },
  });
  return { policy: updated, approvalEvidence };
};
