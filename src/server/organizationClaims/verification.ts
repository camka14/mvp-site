import { randomBytes } from 'node:crypto';
import { resolveTxt } from 'node:dns/promises';
import {
  fetchBoundedPublicResource,
  type BoundedPublicResource,
} from '@/server/affiliateImports/sourceIntakeUrlSafety';
import { organizationDomainPolicyForUrl } from './domainPolicy';

const HTML_VERIFICATION_META_NAME = 'bracketiq-site-verification';
const MAX_HTML_VERIFICATION_BYTES = 1024 * 1024;
const VERIFICATION_TIMEOUT_MS = 10_000;
const MAX_VERIFICATION_REDIRECTS = 3;

export type OrganizationSiteVerificationResult = {
  verified: boolean;
  checkedAt: Date;
  failureReason: string | null;
  metadata: Record<string, string | number | boolean | null>;
};

type DnsResolver = (hostname: string) => Promise<string[][]>;
type ResourceFetcher = (
  value: string,
  options?: Parameters<typeof fetchBoundedPublicResource>[1],
) => Promise<BoundedPublicResource>;

const boundedFailureReason = (error: unknown): string => {
  const message = error instanceof Error ? error.message : 'Verification failed.';
  return message.trim().slice(0, 500) || 'Verification failed.';
};

const normalizeAttributeName = (value: string): string => value.trim().toLowerCase();

const readHtmlAttributes = (tag: string): Map<string, string> => {
  const attributes = new Map<string, string>();
  const pattern = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  for (const match of tag.matchAll(pattern)) {
    attributes.set(
      normalizeAttributeName(match[1]),
      match[2] ?? match[3] ?? match[4] ?? '',
    );
  }
  return attributes;
};

export const htmlContainsOrganizationVerificationMeta = (
  html: string,
  expectedValue: string,
): boolean => {
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attributes = readHtmlAttributes(match[0]);
    if (
      normalizeAttributeName(attributes.get('name') ?? '') === HTML_VERIFICATION_META_NAME
      && attributes.get('content') === expectedValue
    ) {
      return true;
    }
  }
  return false;
};

export const createOrganizationSiteChallengeValue = (): string => (
  `bracketiq_${randomBytes(32).toString('base64url')}`
);

export const getOrganizationDnsChallengeHostname = (registrableDomain: string): string => (
  `_bracketiq-challenge.${registrableDomain}`
);

export const checkOrganizationDnsChallenge = async ({
  registrableDomain,
  expectedValue,
  resolver = resolveTxt,
  now = new Date(),
}: {
  registrableDomain: string;
  expectedValue: string;
  resolver?: DnsResolver;
  now?: Date;
}): Promise<OrganizationSiteVerificationResult> => {
  const hostname = getOrganizationDnsChallengeHostname(registrableDomain);
  try {
    const records = await resolver(hostname);
    const values = records.map((chunks) => chunks.join(''));
    const verified = values.includes(expectedValue);
    return {
      verified,
      checkedAt: now,
      failureReason: verified ? null : 'The expected DNS TXT value was not found.',
      metadata: {
        hostname,
        recordCount: values.length,
      },
    };
  } catch (error) {
    return {
      verified: false,
      checkedAt: now,
      failureReason: boundedFailureReason(error),
      metadata: { hostname, recordCount: 0 },
    };
  }
};

export const checkOrganizationHtmlChallenge = async ({
  canonicalUrl,
  expectedValue,
  fetchResource = fetchBoundedPublicResource,
  now = new Date(),
}: {
  canonicalUrl: string;
  expectedValue: string;
  fetchResource?: ResourceFetcher;
  now?: Date;
}): Promise<OrganizationSiteVerificationResult> => {
  const policy = organizationDomainPolicyForUrl(canonicalUrl);
  if (policy.isSharedPlatform) {
    return {
      verified: false,
      checkedAt: now,
      failureReason: 'Shared website platforms require manual review.',
      metadata: { registrableDomain: policy.registrableDomain },
    };
  }

  try {
    const homepageUrl = new URL('/', policy.canonicalUrl).toString();
    const response = await fetchResource(homepageUrl, {
      timeoutMs: VERIFICATION_TIMEOUT_MS,
      maxBytes: MAX_HTML_VERIFICATION_BYTES,
      maxRedirects: MAX_VERIFICATION_REDIRECTS,
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'BracketIQ-Organization-Verification/1.0',
      },
      validateRedirect: (_from, to) => {
        const redirectPolicy = organizationDomainPolicyForUrl(to.toString());
        if (redirectPolicy.registrableDomain !== policy.registrableDomain) {
          throw new Error('Website verification cannot follow a redirect to another domain.');
        }
      },
    });
    const finalPolicy = organizationDomainPolicyForUrl(response.finalUrl);
    if (finalPolicy.registrableDomain !== policy.registrableDomain) {
      throw new Error('Website verification finished on another domain.');
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new Error(`Website verification returned HTTP ${response.statusCode}.`);
    }
    const contentType = response.contentType?.toLowerCase() ?? '';
    if (contentType && !contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
      throw new Error('Website verification did not return an HTML page.');
    }
    const verified = htmlContainsOrganizationVerificationMeta(
      response.body.toString('utf8'),
      expectedValue,
    );
    return {
      verified,
      checkedAt: now,
      failureReason: verified ? null : 'The expected verification meta tag was not found.',
      metadata: {
        finalUrl: response.finalUrl,
        statusCode: response.statusCode,
        contentType: response.contentType,
        responseBytes: response.body.byteLength,
      },
    };
  } catch (error) {
    return {
      verified: false,
      checkedAt: now,
      failureReason: boundedFailureReason(error),
      metadata: {
        registrableDomain: policy.registrableDomain,
      },
    };
  }
};

export const ORGANIZATION_HTML_VERIFICATION_META_NAME = HTML_VERIFICATION_META_NAME;
