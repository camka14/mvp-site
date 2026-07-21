import { createHash } from 'crypto';
import { parse as parseDomain } from 'tldts';
import {
  type AffiliateSourceDiscoveryCampaignForRules,
  type AffiliateSourceDiscoveryEvaluation,
  type AffiliateSourceDiscoveryEvaluationInput,
  type AffiliateSourceDiscoveryQuery,
} from './sourceDiscoveryTypes';
import { canonicalizeAffiliateIntakeUrl } from './sourceIntakeUrlSafety';

export const AFFILIATE_DISCOVERY_AUTO_INTAKE_SCORE = 75;
export const AFFILIATE_DISCOVERY_REVIEW_SCORE = 45;

const TYPE_TERMS: Record<string, string[]> = {
  CLUB: ['club', 'academy', 'competitive program'],
  TRYOUT: ['tryouts', 'evaluations'],
  EVENT: ['events', 'registration'],
  LEAGUE: ['league', 'league registration'],
  TOURNAMENT: ['tournament', 'tournaments'],
  CAMP: ['sports camp', 'camps'],
  CLINIC: ['sports clinic', 'clinics'],
  OPEN_PLAY: ['open play', 'open gym', 'pickup'],
  RENTAL: ['field rental', 'court rental', 'facility reservation'],
  DIRECTORY: ['club directory', 'sports directory'],
};

const QUERY_PROFILES = [
  {
    templateKey: 'clubs-programs',
    sourceTypes: ['CLUB'],
    queryTerms: 'clubs academies competitive programs',
  },
  {
    templateKey: 'tryouts-evaluations',
    sourceTypes: ['TRYOUT'],
    queryTerms: 'tryouts evaluations',
  },
  {
    templateKey: 'leagues-tournaments-events',
    sourceTypes: ['EVENT', 'LEAGUE', 'TOURNAMENT'],
    queryTerms: 'leagues tournaments events registration',
  },
  {
    templateKey: 'camps-clinics-open-play',
    sourceTypes: ['CAMP', 'CLINIC', 'OPEN_PLAY'],
    queryTerms: 'camps clinics open play pickup',
  },
  {
    templateKey: 'facilities-rentals',
    sourceTypes: ['RENTAL'],
    queryTerms: 'field court facility rentals reservations',
  },
] as const;

const US_DISCOVERY_SPORT_TERMS: Record<string, string> = {
  Football: 'American football',
  'Grass Soccer': 'outdoor soccer',
  'Indoor Soccer': 'indoor soccer',
};

const discoverySportTerm = (sportName: string): string => (
  US_DISCOVERY_SPORT_TERMS[sportName] ?? sportName
);

const SHARED_TENANT_HOSTS = new Set([
  'leagueapps.com',
  'sportsengine.com',
  'sportsengineprelive.com',
  'teamsnapsites.com',
  'bluesombrero.com',
  'quickscores.com',
  'facilitron.com',
]);

const SOCIAL_HOSTS = new Set([
  'facebook.com', 'instagram.com', 'linkedin.com', 'tiktok.com', 'x.com',
  'twitter.com', 'youtube.com', 'youtu.be', 'pinterest.com',
]);

const SEARCH_HOSTS = new Set(['google.com', 'bing.com', 'duckduckgo.com', 'search.yahoo.com']);
const NON_SOURCE_HOSTS = new Set([
  'github.com', 'gitlab.com', 'bitbucket.org',
  'edgar-online.com', 'sec.gov',
]);
const UNSUPPORTED_EXTENSIONS = /\.(?:pdf|docx?|xlsx?|pptx?|zip|rar|7z|dmg|exe)(?:$|\?)/i;

const normalizedTokens = (value: string): string[] => value
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()
  .split(/\s+/)
  .filter((token) => token.length >= 2);

const containsPhrase = (haystack: string, needle: string): boolean => (
  haystack.includes(needle.toLowerCase())
);

const addReason = (
  codes: string[],
  reasons: string[],
  code: string,
  reason: string,
): void => {
  if (codes.includes(code)) return;
  codes.push(code);
  reasons.push(reason);
};

export const affiliateDiscoveryPolicyKeyForUrl = (value: string): string => {
  const url = new URL(value);
  const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
  const parsed = parseDomain(hostname, { allowPrivateDomains: true });
  const registrable = parsed.domain ?? hostname;
  if (!SHARED_TENANT_HOSTS.has(registrable)) return registrable;
  if (hostname !== registrable) return hostname;
  const tenantPath = url.pathname.split('/').filter(Boolean)[0];
  return tenantPath ? `${registrable}/${tenantPath.toLowerCase()}` : registrable;
};

export const affiliateDiscoveryUrlKey = (canonicalUrl: string): string => createHash('sha256')
  .update(canonicalUrl)
  .digest('hex');

export const generateAffiliateSourceDiscoveryQueries = (
  campaign: AffiliateSourceDiscoveryCampaignForRules,
  sports: Array<{ id: string; name: string }>,
  cursor = 0,
): { queries: AffiliateSourceDiscoveryQuery[]; nextCursor: number } => {
  const combinations: AffiliateSourceDiscoveryQuery[] = [];
  const queryRegion = campaign.location?.trim() || campaign.region.trim();
  const types = Array.from(new Set(campaign.sourceTypeHints.map((value) => value.toUpperCase())));
  const typeSet = new Set(types);
  QUERY_PROFILES.forEach((profile) => {
    const sourceType = profile.sourceTypes.find((type) => typeSet.has(type));
    if (!sourceType) return;
    sports.forEach((sport) => combinations.push({
        query: `${queryRegion} ${discoverySportTerm(sport.name)} ${profile.queryTerms} official`,
        sportId: sport.id,
        sportName: sport.name,
        sourceType,
        templateKey: `PROFILE:${profile.templateKey}`,
    }));
  });
  const broadDirectoryQuery: AffiliateSourceDiscoveryQuery = {
    query: `${queryRegion} sports clubs leagues tournaments rentals directory`,
    sportId: null,
    sportName: null,
    sourceType: 'DIRECTORY',
    templateKey: 'broad-directory',
  };
  if (!combinations.length) return { queries: [broadDirectoryQuery], nextCursor: 0 };
  const start = Math.max(0, cursor) % combinations.length;
  const totalLimit = Math.min(campaign.maxQueriesPerRun, combinations.length + 1);
  const sportQueryLimit = totalLimit > 1
    ? Math.min(totalLimit - 1, combinations.length - start)
    : 0;
  const queries = Array.from(
    { length: sportQueryLimit },
    (_, index) => combinations[start + index],
  );
  queries.push(broadDirectoryQuery);
  const nextCursor = start + sportQueryLimit >= combinations.length
    ? 0
    : start + sportQueryLimit;
  return { queries, nextCursor };
};

const invalidUrlReason = (value: string): { code: string; reason: string } | null => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { code: 'INVALID_URL', reason: 'The provider returned an invalid URL.' };
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    return { code: 'UNSAFE_URL', reason: 'The URL does not use a supported public HTTP scheme.' };
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (!host || host === 'localhost' || host.endsWith('.local') || /^\d+(?:\.\d+){3}$/.test(host)) {
    return { code: 'NON_PUBLIC_URL', reason: 'The URL is not a public hostname.' };
  }
  if (SOCIAL_HOSTS.has(host) || Array.from(SOCIAL_HOSTS).some((domain) => host.endsWith(`.${domain}`))) {
    return { code: 'SOCIAL_ONLY', reason: 'Social profiles are not supported as canonical affiliate sources.' };
  }
  if (SEARCH_HOSTS.has(host) || Array.from(SEARCH_HOSTS).some((domain) => host.endsWith(`.${domain}`))) {
    return { code: 'SEARCH_RESULT_PAGE', reason: 'Search result pages are not source websites.' };
  }
  if (NON_SOURCE_HOSTS.has(host) || Array.from(NON_SOURCE_HOSTS).some((domain) => host.endsWith(`.${domain}`))) {
    return { code: 'NON_SOURCE_HOST', reason: 'Code repositories and public filing archives are not sports source websites.' };
  }
  if (/apps\.apple\.com$|play\.google\.com$/.test(host)) {
    return { code: 'APP_STORE', reason: 'App store pages are not source websites.' };
  }
  if (UNSUPPORTED_EXTENSIONS.test(url.pathname)) {
    return { code: 'UNSUPPORTED_FILE', reason: 'Standalone documents are retained only through a parent website intake.' };
  }
  return null;
};

export const evaluateAffiliateSourceDiscoveryResult = (
  input: AffiliateSourceDiscoveryEvaluationInput,
): AffiliateSourceDiscoveryEvaluation => {
  const reasonCodes: string[] = [];
  const reasons: string[] = [];
  const invalid = invalidUrlReason(input.url);
  if (invalid) {
    return {
      canonicalUrl: null,
      policyKey: null,
      score: 0,
      status: 'REJECTED',
      sourceTypeHints: [],
      sportHints: [],
      reasonCodes: [invalid.code],
      reasons: [invalid.reason],
    };
  }

  const canonicalUrl = canonicalizeAffiliateIntakeUrl(input.url);
  const policyKey = affiliateDiscoveryPolicyKeyForUrl(canonicalUrl);
  const url = new URL(canonicalUrl);
  const text = `${input.title ?? ''} ${input.description ?? ''} ${url.hostname} ${url.pathname}`.toLowerCase();
  const regionTokens = normalizedTokens(input.campaignRegion).filter((token) => !['area', 'metro', 'metropolitan', 'region'].includes(token));
  const currentYear = input.currentYear ?? new Date().getFullYear();
  let score = 20;

  if (containsPhrase(text, input.campaignRegion)) {
    score += 25;
    addReason(reasonCodes, reasons, 'EXACT_REGION', 'The result contains the campaign region.');
  } else {
    const matchingRegionTokens = regionTokens.filter((token) => text.includes(token));
    if (matchingRegionTokens.length) {
      score += Math.min(18, matchingRegionTokens.length * 6);
      addReason(reasonCodes, reasons, 'REGION_TOKENS', 'The result contains campaign city or state terms.');
    }
  }

  const sportHints = input.selectedSports
    .filter((sport) => containsPhrase(text, sport.name))
    .map((sport) => sport.id);
  if (sportHints.length) {
    score += 18;
    addReason(reasonCodes, reasons, 'SELECTED_SPORT', 'The result contains a selected sport.');
  }

  const sourceTypeHints = Object.entries(TYPE_TERMS)
    .filter(([, terms]) => terms.some((term) => containsPhrase(text, term)))
    .map(([type]) => type);
  if (sourceTypeHints.length) {
    score += 15;
    addReason(reasonCodes, reasons, 'OPPORTUNITY_TYPE', 'The result contains a supported sports opportunity type.');
  }
  if (!sportHints.length && !sourceTypeHints.length) {
    score -= 35;
    addReason(reasonCodes, reasons, 'NO_SPORTS_SIGNAL', 'The result does not contain a selected sport or supported opportunity type.');
  }
  if (/register|registration|book|reserve|tryout|schedule|events?/.test(text)) {
    score += 10;
    addReason(reasonCodes, reasons, 'PUBLIC_ACTION', 'The result appears to expose a public action or inventory page.');
  }
  if (/club|academy|association|league|sports|athletics|recreation/.test(text)) {
    score += 8;
    addReason(reasonCodes, reasons, 'ORGANIZATION_LANGUAGE', 'The result appears to be a sports organization.');
  }
  if (text.includes(String(currentYear)) || text.includes(String(currentYear + 1))) {
    score += 6;
    addReason(reasonCodes, reasons, 'CURRENT_YEAR', 'The result references the current or next year.');
  }
  if (/news|press release|blog|article|recap/.test(text)) {
    score -= 20;
    addReason(reasonCodes, reasons, 'EDITORIAL_PAGE', 'The result appears to be editorial content rather than inventory.');
  }
  const oldYears = text.match(/20\d{2}/g)?.map(Number).filter((year) => year < currentYear) ?? [];
  if (oldYears.length && !text.includes(String(currentYear)) && !text.includes(String(currentYear + 1))) {
    score -= 25;
    addReason(reasonCodes, reasons, 'STALE_YEAR', 'The result references only past years.');
  }
  if (/sign in|log in|members only/.test(text)) {
    score -= 12;
    addReason(reasonCodes, reasons, 'AUTH_REQUIRED', 'The result may require authentication.');
  }
  score = Math.max(0, Math.min(100, score));
  const status = score >= AFFILIATE_DISCOVERY_AUTO_INTAKE_SCORE
    ? 'NEW'
    : score >= AFFILIATE_DISCOVERY_REVIEW_SCORE
      ? 'REVIEW_REQUIRED'
      : 'REJECTED';
  if (status === 'REJECTED') addReason(reasonCodes, reasons, 'LOW_CONFIDENCE', 'The result did not meet the review threshold.');

  return {
    canonicalUrl,
    policyKey,
    score,
    status,
    sourceTypeHints,
    sportHints,
    reasonCodes,
    reasons,
  };
};
