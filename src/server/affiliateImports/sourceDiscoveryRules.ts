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
  CLUB: ['club', 'academy', 'competitive program', 'travel program'],
  TRYOUT: ['tryout', 'tryouts', 'evaluation', 'evaluations'],
  EVENT: ['event', 'events', 'registration'],
  LEAGUE: ['league', 'leagues', 'league registration'],
  TOURNAMENT: ['tournament', 'tournaments'],
  CAMP: ['sports camp', 'camp', 'camps'],
  CLINIC: ['sports clinic', 'clinic', 'clinics', 'training'],
  OPEN_PLAY: ['open play', 'open gym', 'pickup', 'drop in', 'drop-in'],
  RENTAL: [
    'field rental', 'court rental', 'facility rental', 'facility reservation',
    'rent a field', 'rent a court', 'book a field', 'book a court',
    'field for rent', 'fields for rent', 'court for rent', 'courts for rent',
    'gym rental', 'gymnasium rental', 'athletic field reservation',
    'reservation search',
  ],
  DIRECTORY: ['club directory', 'sports directory', 'find a club'],
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

const INTERMEDIARY_HOSTS = new Set([
  'active.com',
  'baseballconnected.com',
  'causeiq.com',
  'eventbrite.com',
  'exposureevents.com',
  'fieldlevel.com',
  'giggster.com',
  'goodrun.app',
  'gotsoccer.com',
  'imleagues.com',
  'meetup.com',
  'mytennislessons.com',
  'myguidechicago.com',
  'peerspace.com',
  'pickleballtournaments.com',
  'playpass.com',
  'playnsports.com',
  'reddit.com',
  'softballconnected.com',
  'teachme.to',
  'teamgenius.com',
  'tenniscircuits.com',
  'ticketmaster.com',
  'tapatalk.com',
  'ussportscamps.com',
  'usetopscore.com',
  'utrsports.net',
  'wikipedia.org',
  'yelp.com',
]);

const SEARCH_HOSTS = new Set(['google.com', 'bing.com', 'duckduckgo.com', 'search.yahoo.com']);
const NON_SOURCE_HOSTS = new Set([
  'github.com', 'gitlab.com', 'bitbucket.org',
  'edgar-online.com', 'sec.gov',
]);
const UNSUPPORTED_EXTENSIONS = /\.(?:pdf|docx?|xlsx?|pptx?|zip|rar|7z|dmg|exe)(?:$|\?)/i;
const CLOSED_OR_ENDED_PATTERN = /\b(?:registration\s+(?:is\s+)?closed|registration\s+ended|event\s+is\s+over|event\s+over|sold\s+out|no\s+longer\s+accepting)\b/i;
const EDITORIAL_PATTERN = /\b(?:news|press[\s-]+releases?|blog|article|recap|guide|top 10|best of)\b/i;
const NON_PARTICIPATION_PATTERN = /\b(?:box office|broadcast live|buy tickets?|concert|tickets? (?:available|on sale)|watch live)\b/i;
const PUBLIC_ACTION_PATTERN = /\b(?:register|registration|book|booking|reserve|reservation|tryout|sign[\s-]?up|join)\b/i;
const ORGANIZATION_PATTERN = /\b(?:club|academy|association|league|sports|athletics|recreation|facility|center|centre|park district)\b/i;

const STATE_ABBREVIATIONS: Record<string, string> = {
  Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA',
  Colorado: 'CO', Connecticut: 'CT', Delaware: 'DE', Florida: 'FL', Georgia: 'GA',
  Hawaii: 'HI', Idaho: 'ID', Illinois: 'IL', Indiana: 'IN', Iowa: 'IA',
  Kansas: 'KS', Kentucky: 'KY', Louisiana: 'LA', Maine: 'ME', Maryland: 'MD',
  Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN', Mississippi: 'MS', Missouri: 'MO',
  Montana: 'MT', Nebraska: 'NE', Nevada: 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ',
  'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND', Ohio: 'OH',
  Oklahoma: 'OK', Oregon: 'OR', Pennsylvania: 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
  'South Dakota': 'SD', Tennessee: 'TN', Texas: 'TX', Utah: 'UT', Vermont: 'VT',
  Virginia: 'VA', Washington: 'WA', 'West Virginia': 'WV', Wisconsin: 'WI', Wyoming: 'WY',
  'District of Columbia': 'DC',
};

type CampaignTarget = {
  city: string;
  state: string;
};

const recordValue = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

const stringValue = (value: unknown): string | null => (
  typeof value === 'string' && value.trim() ? value.trim() : null
);

const normalizedTokens = (value: string): string[] => value
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()
  .split(/\s+/)
  .filter((token) => token.length >= 2);

const escapedPattern = (value: string): string => value
  .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  .replace(/\s+/g, '[\\s_-]+');

const containsTerm = (haystack: string, needle: string): boolean => (
  new RegExp(`(?:^|[^a-z0-9])${escapedPattern(needle.toLowerCase())}(?:$|[^a-z0-9])`, 'i').test(haystack)
);

const hostMatches = (host: string, candidates: Set<string>): boolean => (
  candidates.has(host) || Array.from(candidates).some((domain) => host.endsWith(`.${domain}`))
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

const campaignTargets = (campaign: AffiliateSourceDiscoveryCampaignForRules): CampaignTarget[] => {
  const metadata = recordValue(campaign.metadata);
  const coveredCities = Array.isArray(metadata.coveredCities) ? metadata.coveredCities : [];
  const targets = coveredCities.flatMap((entry) => {
    const row = recordValue(entry);
    const city = stringValue(row.city);
    const state = stringValue(row.state);
    return city && state ? [{ city, state }] : [];
  });
  if (!targets.length) {
    const location = stringValue(campaign.location) ?? campaign.region;
    const [cityPart, statePart] = location.split(',').map((part) => part.trim());
    const city = cityPart?.replace(/\s+metropolitan\s+area$/i, '').trim();
    const state = statePart?.replace(/\s+metropolitan\s+area$/i, '').trim();
    if (city && state) targets.push({ city, state });
  }
  const seen = new Set<string>();
  return targets.filter((target) => {
    const key = `${target.city.toLowerCase()}|${target.state.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const affiliateDiscoveryPolicyKeyForUrl = (value: string): string => {
  const url = new URL(value);
  const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
  const parsed = parseDomain(hostname, { allowPrivateDomains: true });
  const registrable = parsed.domain ?? hostname;
  if (registrable === 'bluesombrero.com' && hostname === 'clubs.bluesombrero.com') {
    const tabId = url.searchParams.get('tabid');
    if (tabId) return `${hostname}/tabid:${tabId.toLowerCase()}`;
  }
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
  const types = new Set(campaign.sourceTypeHints.map((value) => value.toUpperCase()));
  const targets = campaignTargets(campaign);
  QUERY_PROFILES.forEach((profile) => {
    const sourceType = profile.sourceTypes.find((type) => types.has(type));
    if (!sourceType) return;
    targets.forEach((target) => {
      const targetLocation = `${target.city}, ${target.state}`;
      sports.forEach((sport) => combinations.push({
        query: `${targetLocation} ${discoverySportTerm(sport.name)} ${profile.queryTerms} official`,
        sportId: sport.id,
        sportName: sport.name,
        sourceType,
        profileSourceTypes: [...profile.sourceTypes],
        templateKey: `PROFILE:${profile.templateKey}`,
        targetCity: target.city,
        targetState: target.state,
      }));
    });
  });
  const directoryLocation = stringValue(campaign.location) ?? campaign.region;
  const sequence: AffiliateSourceDiscoveryQuery[] = [
    ...combinations,
    {
      query: `${directoryLocation} sports clubs leagues tournaments rentals directory`,
      sportId: null,
      sportName: null,
      sourceType: 'DIRECTORY',
      profileSourceTypes: ['DIRECTORY'],
      templateKey: 'broad-directory',
      targetCity: targets[0]?.city ?? null,
      targetState: targets[0]?.state ?? null,
    },
  ];
  const start = Math.max(0, cursor) % sequence.length;
  const queries = sequence.slice(start, start + Math.min(campaign.maxQueriesPerRun, sequence.length));
  const nextCursor = start + queries.length >= sequence.length ? 0 : start + queries.length;
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
  if (hostMatches(host, SOCIAL_HOSTS)) {
    return { code: 'SOCIAL_ONLY', reason: 'Social profiles are not supported as canonical affiliate sources.' };
  }
  if (hostMatches(host, SEARCH_HOSTS)) {
    return { code: 'SEARCH_RESULT_PAGE', reason: 'Search result pages are not source websites.' };
  }
  if (hostMatches(host, NON_SOURCE_HOSTS)) {
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

const sportMatches = (sportName: string, text: string): boolean => {
  const name = sportName.toLowerCase();
  if (name === 'grass soccer') {
    return containsTerm(text, 'soccer')
      && !/\b(?:indoor soccer|futsal|arena soccer|beach soccer|sand soccer)\b/i.test(text);
  }
  if (name === 'indoor soccer') return /\b(?:indoor soccer|futsal|arena soccer)\b/i.test(text);
  if (name === 'beach soccer') return /\b(?:beach soccer|sand soccer)\b/i.test(text);
  if (name === 'indoor volleyball') {
    return containsTerm(text, 'volleyball')
      && !/\b(?:beach volleyball|sand volleyball|grass volleyball|outdoor volleyball)\b/i.test(text);
  }
  if (name === 'grass volleyball') return /\b(?:grass volleyball|outdoor volleyball)\b/i.test(text);
  if (name === 'beach volleyball') return /\b(?:beach volleyball|sand volleyball)\b/i.test(text);
  if (name === 'football') {
    return /\b(?:american football|flag football|tackle football|gridiron|nfl flag|youth football)\b/i.test(text);
  }
  if (name === 'ultimate frisbee') return /\b(?:ultimate frisbee|ultimate disc|club ultimate|youth ultimate)\b/i.test(text);
  return containsTerm(text, sportName);
};

const sourceTypeHintsForText = (text: string): string[] => {
  const hints = new Set(Object.entries(TYPE_TERMS)
    .filter(([, terms]) => terms.some((term) => containsTerm(text, term)))
    .map(([type]) => type));
  if (/(?:^|\/)(?:rentals?|reservations?|book(?:ing)?)(?:\/|$)/i.test(text)) {
    hints.add('RENTAL');
  }
  return Array.from(hints);
};

const profileSourceTypes = (query: AffiliateSourceDiscoveryQuery): string[] => {
  if (query.profileSourceTypes?.length) return query.profileSourceTypes;
  const profile = QUERY_PROFILES.find((entry) => entry.sourceTypes.includes(query.sourceType as never));
  return profile ? [...profile.sourceTypes] : [query.sourceType];
};

const profileActionAligned = (
  profileTypes: string[],
  text: string,
  sourceTypeHints: string[],
): boolean => {
  if (profileTypes.includes('CLUB')) return true;
  if (profileTypes.includes('DIRECTORY')) return false;
  if (profileTypes.includes('RENTAL')) {
    return /\b(?:rent|rental|book|booking|reserve|reservation)\b/i.test(text);
  }
  if (profileTypes.includes('TRYOUT')) {
    return /\b(?:tryout|evaluation|register|registration|sign[\s-]?up)\b/i.test(text);
  }
  return sourceTypeHints.some((type) => profileTypes.includes(type))
    && PUBLIC_ACTION_PATTERN.test(text);
};

const monthNumber: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
};

const extractedDates = (text: string, currentYear: number): Date[] => {
  const dates: Date[] = [];
  const addDate = (year: number, month: number, day: number) => {
    const date = new Date(Date.UTC(year, month, day));
    if (
      date.getUTCFullYear() === year
      && date.getUTCMonth() === month
      && date.getUTCDate() === day
    ) dates.push(date);
  };
  for (const match of text.matchAll(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/g)) {
    addDate(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }
  for (const match of text.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/g)) {
    addDate(Number(match[3]), Number(match[1]) - 1, Number(match[2]));
  }
  const monthPattern = new RegExp(
    `\\b(${Object.keys(monthNumber).join('|')})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(20\\d{2}))?\\b`,
    'gi',
  );
  for (const match of text.matchAll(monthPattern)) {
    const explicitYear = match[3] ? Number(match[3]) : null;
    const year = explicitYear ?? (containsTerm(text, String(currentYear)) ? currentYear : null);
    if (year) addDate(year, monthNumber[match[1].toLowerCase()], Number(match[2]));
  }
  return Array.from(new Map(dates.map((date) => [date.getTime(), date])).values());
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
      classification: 'UNSUPPORTED',
      autoPromotionEligible: false,
      sourceTypeHints: [],
      sportHints: [],
      reasonCodes: [invalid.code],
      reasons: [invalid.reason],
    };
  }

  const canonicalUrl = canonicalizeAffiliateIntakeUrl(input.url);
  const policyKey = affiliateDiscoveryPolicyKeyForUrl(canonicalUrl);
  const url = new URL(canonicalUrl);
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const text = `${input.title ?? ''} ${input.description ?? ''} ${host} ${url.pathname}`.toLowerCase();
  const currentYear = input.currentYear ?? input.now?.getUTCFullYear() ?? new Date().getUTCFullYear();
  const now = input.now ?? new Date();
  const targetCity = input.query.targetCity;
  const targetState = input.query.targetState;
  const localityExact = Boolean(targetCity && containsTerm(text, targetCity));
  const stateAbbreviation = targetState ? STATE_ABBREVIATIONS[targetState] : null;
  const stateOnly = !localityExact && Boolean(
    (targetState && containsTerm(text, targetState))
    || (stateAbbreviation && containsTerm(text, stateAbbreviation)),
  );

  let score = 15;
  if (localityExact) {
    score += 24;
    addReason(reasonCodes, reasons, 'LOCALITY_EXACT', 'The result contains the city targeted by this query.');
  } else if (stateOnly) {
    score += 4;
    addReason(reasonCodes, reasons, 'STATE_ONLY', 'The result contains the state but not the target city.');
  } else {
    addReason(reasonCodes, reasons, 'NO_LOCALITY_EVIDENCE', 'The result does not contain the city targeted by this query.');
  }

  const sportHints = input.selectedSports
    .filter((sport) => sportMatches(sport.name, text))
    .map((sport) => sport.id);
  const querySportAligned = !input.query.sportId || sportHints.includes(input.query.sportId);
  if (querySportAligned && input.query.sportId) {
    score += 20;
    addReason(reasonCodes, reasons, 'SELECTED_SPORT', 'The result matches the sport targeted by this query.');
  } else if (sportHints.length) {
    score += 6;
    addReason(reasonCodes, reasons, 'OTHER_SPORT', 'The result contains a selected sport other than the query sport.');
  } else if (input.query.sportId) {
    score -= 18;
    addReason(reasonCodes, reasons, 'SPORT_MISMATCH', 'The result does not match the sport targeted by this query.');
  }

  const sourceTypeHints = sourceTypeHintsForText(text);
  const expectedProfileTypes = profileSourceTypes(input.query);
  const profileAligned = expectedProfileTypes.some((type) => sourceTypeHints.includes(type));
  if (profileAligned) {
    score += 18;
    addReason(reasonCodes, reasons, 'PROFILE_ALIGNED', 'The result matches the opportunity profile targeted by this query.');
    addReason(reasonCodes, reasons, 'OPPORTUNITY_TYPE', 'The result contains a supported sports opportunity type.');
  } else if (sourceTypeHints.length) {
    score -= 8;
    addReason(reasonCodes, reasons, 'PROFILE_MISMATCH', 'The result does not match the opportunity profile targeted by this query.');
  } else {
    score -= 12;
    addReason(reasonCodes, reasons, 'NO_OPPORTUNITY_TYPE', 'The result does not contain a supported opportunity type.');
  }

  const publicAction = PUBLIC_ACTION_PATTERN.test(text);
  if (publicAction) {
    score += 10;
    addReason(reasonCodes, reasons, 'PUBLIC_ACTION', 'The result appears to expose a public action or inventory page.');
  }
  const organizationLanguage = ORGANIZATION_PATTERN.test(text);
  if (organizationLanguage) {
    score += 8;
    addReason(reasonCodes, reasons, 'ORGANIZATION_LANGUAGE', 'The result appears to be a sports organization.');
  }
  if (!sportHints.length && !sourceTypeHints.length) {
    score -= 20;
    addReason(reasonCodes, reasons, 'NO_SPORTS_SIGNAL', 'The result does not contain a selected sport or supported opportunity type.');
  }

  const intermediaryHost = hostMatches(host, INTERMEDIARY_HOSTS);
  const editorial = EDITORIAL_PATTERN.test(text);
  const nonParticipation = NON_PARTICIPATION_PATTERN.test(text);
  const classification = intermediaryHost || editorial || nonParticipation
    ? 'INTERMEDIARY'
    : 'DIRECT_SOURCE';
  if (intermediaryHost) {
    score -= 20;
    addReason(reasonCodes, reasons, 'INTERMEDIARY_SOURCE', 'The page is a directory, marketplace, community, or aggregation lead rather than a canonical source.');
  }
  if (editorial) {
    score -= 20;
    addReason(reasonCodes, reasons, 'EDITORIAL_PAGE', 'The result appears to be editorial content rather than direct inventory.');
  }
  if (nonParticipation) {
    score -= 20;
    addReason(reasonCodes, reasons, 'NON_PARTICIPATION_PAGE', 'The result appears to promote viewing or tickets rather than joining the sports activity.');
  }

  const dates = extractedDates(text, currentYear);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const pastDate = dates.length > 0 && dates.every((date) => date.getTime() < today);
  const futureDate = dates.some((date) => date.getTime() >= today);
  if (futureDate) {
    score += 6;
    addReason(reasonCodes, reasons, 'CURRENT_OR_FUTURE_DATE', 'The result contains a current or future date.');
  }
  if (pastDate) {
    score -= 40;
    addReason(reasonCodes, reasons, 'PAST_DATE', 'Every detected opportunity date is in the past.');
  }
  const closedOrEnded = CLOSED_OR_ENDED_PATTERN.test(text);
  if (closedOrEnded) {
    score -= 40;
    addReason(reasonCodes, reasons, 'CLOSED_OR_ENDED', 'The result says registration or the opportunity has ended.');
  }
  const oneTimeProfile = expectedProfileTypes.some((type) => (
    ['TRYOUT', 'EVENT', 'LEAGUE', 'TOURNAMENT', 'CAMP', 'CLINIC', 'OPEN_PLAY'].includes(type)
  ));
  const years = text.match(/\b20\d{2}\b/g)?.map(Number) ?? [];
  const staleYear = oneTimeProfile
    && years.length > 0
    && years.every((year) => year < currentYear)
    && !futureDate;
  if (staleYear) {
    score -= 30;
    addReason(reasonCodes, reasons, 'STALE_YEAR', 'The one-time opportunity references only past years.');
  }

  const authRequired = /\b(?:sign in|log in|members only)\b/i.test(text);
  if (authRequired) {
    score -= 12;
    addReason(reasonCodes, reasons, 'AUTH_REQUIRED', 'The result may require authentication.');
  }

  const actionAligned = profileActionAligned(expectedProfileTypes, text, sourceTypeHints);
  if (!actionAligned && !expectedProfileTypes.includes('CLUB')) {
    addReason(reasonCodes, reasons, 'ACTION_MISMATCH', 'The page lacks the action required by the query profile.');
  }

  score = Math.max(0, Math.min(100, score));
  if (classification === 'INTERMEDIARY') score = Math.min(score, 59);
  if (pastDate || closedOrEnded || staleYear) score = Math.min(score, AFFILIATE_DISCOVERY_REVIEW_SCORE - 1);

  const autoPromotionEligible = classification === 'DIRECT_SOURCE'
    && input.query.sourceType !== 'DIRECTORY'
    && localityExact
    && querySportAligned
    && profileAligned
    && actionAligned
    && !pastDate
    && !closedOrEnded
    && !staleYear
    && !authRequired;
  if (autoPromotionEligible) {
    addReason(reasonCodes, reasons, 'AUTO_PROMOTION_ELIGIBLE', 'The result has direct local sport and profile evidence.');
  } else {
    addReason(reasonCodes, reasons, 'MANUAL_REVIEW_ONLY', 'The result does not satisfy every automatic-promotion gate.');
  }

  const usefulManualLead = classification === 'INTERMEDIARY'
    || (classification === 'DIRECT_SOURCE' && querySportAligned && (profileAligned || organizationLanguage || publicAction));
  const status = pastDate || closedOrEnded || staleYear
    ? 'REJECTED'
    : autoPromotionEligible && score >= AFFILIATE_DISCOVERY_AUTO_INTAKE_SCORE
      ? 'NEW'
      : score >= AFFILIATE_DISCOVERY_REVIEW_SCORE || usefulManualLead
        ? 'REVIEW_REQUIRED'
        : 'REJECTED';
  if (status === 'REJECTED') {
    addReason(reasonCodes, reasons, 'LOW_CONFIDENCE', 'The result did not meet the review threshold or failed a required safety gate.');
  }

  return {
    canonicalUrl,
    policyKey,
    score,
    status,
    classification,
    autoPromotionEligible,
    sourceTypeHints,
    sportHints,
    reasonCodes,
    reasons,
  };
};
