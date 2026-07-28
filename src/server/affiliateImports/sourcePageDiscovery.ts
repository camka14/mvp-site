import { JSDOM } from 'jsdom';
import {
  canonicalizeAffiliateIntakeUrl,
  type BoundedPublicResource,
} from './sourceIntakeUrlSafety';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 50;
const MAX_SITEMAP_DOCUMENTS = 5;
const MAX_SITEMAP_BYTES = 5 * 1024 * 1024;
const MAX_DISCOVERY_CANDIDATES = 500;
const DISCOVERY_NOISE_PATTERN = /(?:^|\/)(?:products?|collections?|cart|checkout|account|search|blogs?|policies|assets?|cdn-cgi)(?:\/|$)|\/pages\/(?:test|sizing-chart|how-[^/]*-works)(?:\/|$)|(?:privacy|terms|refund|waiver|background-check|newsletter|contact|faqs?)(?:\/|$)|\/agents\.md$|\.(?:avif|gif|jpe?g|png|svg|webp|pdf|zip)$/i;
const SOURCE_TOKEN_STOP_WORDS = new Set([
  'about',
  'aspx',
  'default',
  'detail',
  'home',
  'html',
  'index',
  'location',
  'locations',
  'new',
  'page',
  'pages',
  'program',
  'registration',
  'san',
  'sports',
  'www',
]);

export type AffiliateDiscoveredPage = {
  url: string;
  title?: string | null;
  description?: string | null;
  discoveryMethod: 'ROBOTS_SITEMAP' | 'DEFAULT_SITEMAP' | 'SITEMAP_INDEX' | 'CAPTURED_LINK';
};

export type AffiliateSourcePageDiscoveryResult = {
  request: Record<string, unknown>;
  response: Record<string, unknown>;
  links: AffiliateDiscoveredPage[];
  warnings: string[];
  providerJobId: null;
};

export type AffiliateSourcePageDiscoveryInput = {
  sourceUrl: string;
  robotsText: string;
  capturedLinks: string[];
  fetchResource: (
    url: string,
    options?: { maxBytes?: number; timeoutMs?: number },
  ) => Promise<BoundedPublicResource>;
  limit?: number;
};

const boundedLimit = (value: number | undefined): number => {
  if (!Number.isInteger(value) || !value) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, value));
};

const sitemapDirectives = (robotsText: string, baseUrl: string): string[] => {
  const urls = robotsText.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^\s*sitemap\s*:\s*(\S+)\s*$/i);
    if (!match) return [];
    try {
      return [new URL(match[1], baseUrl).toString()];
    } catch {
      return [];
    }
  });
  return Array.from(new Set(urls));
};

const parseSitemap = (xml: string, url: string): {
  pageUrls: string[];
  childSitemaps: string[];
} => {
  const document = new JSDOM(xml, {
    url,
    contentType: 'text/xml',
  }).window.document;
  if (document.querySelector('parsererror')) {
    throw new Error('Sitemap XML could not be parsed.');
  }
  const root = document.documentElement.localName.toLowerCase();
  const values = Array.from(document.querySelectorAll('loc'))
    .map((element) => element.textContent?.trim())
    .filter((value): value is string => Boolean(value));
  return root === 'sitemapindex'
    ? { pageUrls: [], childSitemaps: values }
    : { pageUrls: values, childSitemaps: [] };
};

const safeSameOriginUrl = (value: string, origin: string): string | null => {
  try {
    const url = new URL(value);
    if (url.origin !== origin || (url.protocol !== 'http:' && url.protocol !== 'https:')) return null;
    return canonicalizeAffiliateIntakeUrl(url.toString());
  } catch {
    return null;
  }
};

const sourcePathTokens = (sourceUrl: URL): string[] => (
  sourceUrl.pathname
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && !SOURCE_TOKEN_STOP_WORDS.has(token))
);

const discoveryScore = (
  candidateUrl: string,
  method: AffiliateDiscoveredPage['discoveryMethod'],
  sourceUrl: URL,
): number => {
  const candidate = new URL(candidateUrl);
  const path = candidate.pathname.toLowerCase();
  let score = method === 'CAPTURED_LINK' ? 200 : 20;
  if (/tryout|register|registration|signup|sign-up/.test(path)) score += 80;
  if (/event|league|tournament|schedule/.test(path)) score += 70;
  if (/rent|rental|book|booking|reserv/.test(path)) score += 60;
  if (/program|camp|clinic|club|location|academy/.test(path)) score += 40;
  if (path === '/' || path === '') score += 20;
  for (const token of sourcePathTokens(sourceUrl)) {
    if (path.includes(token)) score += 10;
  }
  score -= Math.max(0, path.split('/').filter(Boolean).length - 3) * 2;
  return score;
};

const contextualSourceTokens = (
  sourceUrl: URL,
  candidates: Array<AffiliateDiscoveredPage & { score: number }>,
): string[] => {
  const sourceTokens = sourcePathTokens(sourceUrl);
  if (!sourceTokens.length || !candidates.length) return [];
  return sourceTokens.filter((token) => {
    const matchingCandidates = candidates.filter((candidate) => (
      new URL(candidate.url).pathname.toLowerCase().includes(token)
    )).length;
    return matchingCandidates > 0 && matchingCandidates / candidates.length <= 0.5;
  });
};

export const discoverAffiliateSourcePages = async (
  input: AffiliateSourcePageDiscoveryInput,
): Promise<AffiliateSourcePageDiscoveryResult> => {
  const source = new URL(input.sourceUrl);
  const limit = boundedLimit(input.limit);
  const declaredSitemaps = sitemapDirectives(input.robotsText, input.sourceUrl)
    .filter((value) => {
      try {
        return new URL(value).origin === source.origin;
      } catch {
        return false;
      }
    });
  const sitemapQueue: Array<{
    url: string;
    method: 'ROBOTS_SITEMAP' | 'DEFAULT_SITEMAP' | 'SITEMAP_INDEX';
  }> = declaredSitemaps.length
    ? declaredSitemaps.map((url) => ({ url, method: 'ROBOTS_SITEMAP' as const }))
    : [{ url: new URL('/sitemap.xml', source.origin).toString(), method: 'DEFAULT_SITEMAP' as const }];
  const seenSitemaps = new Set<string>();
  const candidates = new Map<string, AffiliateDiscoveredPage & { score: number }>();
  const warnings: string[] = [];
  const sitemapResponses: Array<Record<string, unknown>> = [];
  let filteredCandidateCount = 0;
  const canonicalSourceUrl = canonicalizeAffiliateIntakeUrl(input.sourceUrl);

  const addPage = (value: string, method: AffiliateDiscoveredPage['discoveryMethod']): void => {
    const normalized = safeSameOriginUrl(value, source.origin);
    if (!normalized) return;
    if (DISCOVERY_NOISE_PATTERN.test(new URL(normalized).pathname)) {
      filteredCandidateCount += 1;
      return;
    }
    const score = discoveryScore(normalized, method, source);
    const existing = candidates.get(normalized);
    if (existing && existing.score >= score) return;
    if (!existing && candidates.size >= MAX_DISCOVERY_CANDIDATES) return;
    candidates.set(normalized, { url: normalized, discoveryMethod: method, score });
  };

  while (sitemapQueue.length && seenSitemaps.size < MAX_SITEMAP_DOCUMENTS) {
    const entry = sitemapQueue.shift();
    if (!entry || seenSitemaps.has(entry.url)) continue;
    seenSitemaps.add(entry.url);
    try {
      const response = await input.fetchResource(entry.url, { maxBytes: MAX_SITEMAP_BYTES });
      sitemapResponses.push({
        url: entry.url,
        finalUrl: response.finalUrl,
        statusCode: response.statusCode,
        byteCount: response.body.length,
      });
      if (response.statusCode < 200 || response.statusCode >= 300) {
        warnings.push(`Sitemap ${entry.url} returned HTTP ${response.statusCode}.`);
        continue;
      }
      const parsed = parseSitemap(response.body.toString('utf8'), response.finalUrl);
      parsed.pageUrls.forEach((url) => addPage(url, entry.method));
      parsed.childSitemaps.forEach((url) => {
        const normalized = safeSameOriginUrl(url, source.origin);
        if (normalized && !seenSitemaps.has(normalized) && sitemapQueue.length < MAX_SITEMAP_DOCUMENTS) {
          sitemapQueue.push({ url: normalized, method: 'SITEMAP_INDEX' });
        }
      });
    } catch (error) {
      warnings.push(`Sitemap ${entry.url} failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }

  input.capturedLinks.forEach((url) => addPage(url, 'CAPTURED_LINK'));
  const candidateRows = Array.from(candidates.values());
  const contextTokens = contextualSourceTokens(source, candidateRows);
  const links = candidateRows
    .map((candidate) => {
      const path = new URL(candidate.url).pathname.toLowerCase();
      const contextMatches = contextTokens.filter((token) => path.includes(token)).length;
      return {
        ...candidate,
        contextMatches,
        score: candidate.score + contextMatches * 100,
      };
    })
    .filter((candidate) => (
      candidate.url !== canonicalSourceUrl
      && candidate.score > 0
      && (
        contextTokens.length === 0
        || candidate.discoveryMethod === 'CAPTURED_LINK'
        || candidate.contextMatches > 0
      )
    ))
    .sort((left, right) => right.score - left.score || left.url.localeCompare(right.url))
    .slice(0, limit)
    .map((candidate) => ({
      url: candidate.url,
      discoveryMethod: candidate.discoveryMethod,
    }));

  return {
    request: {
      sourceUrl: input.sourceUrl,
      declaredSitemaps,
      defaultSitemapUsed: declaredSitemaps.length === 0,
      limit,
      maxSitemapDocuments: MAX_SITEMAP_DOCUMENTS,
      maxCandidates: MAX_DISCOVERY_CANDIDATES,
      contextTokens,
    },
    response: {
      sitemapResponses,
      candidateCount: candidates.size,
      filteredCandidateCount,
      counts: links.reduce<Record<string, number>>((counts, link) => ({
        ...counts,
        [link.discoveryMethod]: (counts[link.discoveryMethod] ?? 0) + 1,
      }), {}),
      warnings,
    },
    links,
    warnings,
    providerJobId: null,
  };
};
