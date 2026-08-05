import { createHash } from 'node:crypto';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { getAuthSecret } from '@/lib/authServer';
import { prisma } from '@/lib/prisma';
import { buildPublicOrganizationPath } from '@/lib/publicOrganizationSlug';
import { organizationDomainPolicyForUrl, type OrganizationDomainPolicy } from '@/server/organizationClaims/domainPolicy';

const MATCH_TOKEN_TTL_SECONDS = 10 * 60;
const MATCH_TOKEN_AUDIENCE = 'bracket-iq-organization-match';
const MATCH_TOKEN_ISSUER = 'bracket-iq';
const MATCH_TOKEN_PURPOSE = 'organization_match';
const MAX_MATCHES = 12;
const MAX_CANDIDATES = 100;
const MAX_SOURCES = 500;

const LEGAL_NAME_SUFFIXES = new Set([
  'co',
  'company',
  'corp',
  'corporation',
  'inc',
  'incorporated',
  'llc',
  'llp',
  'ltd',
  'limited',
]);

const WEAK_NAME_TOKENS = new Set([
  'and',
  'association',
  'athletic',
  'athletics',
  'club',
  'community',
  'league',
  'of',
  'sports',
  'the',
]);

export type OrganizationMatchConfidence = 'EXACT' | 'RELATED' | 'POSSIBLE';

export type OrganizationMatchAction =
  | 'CLAIM_PROFILE'
  | 'REQUEST_OWNERSHIP_TRANSFER'
  | 'REPORT_OWNERSHIP_ISSUE'
  | 'OPEN_PROFILE'
  | 'CONTINUE_NEW_ORGANIZATION';

export type OrganizationMatchReasonCode =
  | 'EXACT_OFFICIAL_URL'
  | 'REGISTRABLE_DOMAIN_MATCH'
  | 'VERIFIED_DOMAIN_CONFLICT'
  | 'NORMALIZED_NAME_MATCH'
  | 'SIMILAR_NAME'
  | 'LOCATION_MATCH'
  | 'NEARBY_COORDINATES'
  | 'AFFILIATE_SOURCE_MATCH'
  | 'SHARED_PLATFORM_DOMAIN';

export type FindOrganizationMatchesInput = {
  name?: string | null;
  website?: string | null;
  location?: string | null;
  coordinates?: { lat: number; lng: number } | [number, number] | null;
  acknowledgedMatchIds?: string[];
};

export type OrganizationMatchView = {
  organizationId: string;
  name: string;
  logoUrl: string | null;
  approximateLocation: string | null;
  profileUrl: string;
  claimUrl: string;
  confidence: OrganizationMatchConfidence;
  reasonCodes: OrganizationMatchReasonCode[];
  originType: string;
  ownershipStatus: string;
  claimVerificationLevel: string;
  recommendedAction: OrganizationMatchAction;
  availableActions: OrganizationMatchAction[];
  submittedWebsiteDomain: string | null;
  blocksCreation: boolean;
};

export type OrganizationMatchResult = {
  matches: OrganizationMatchView[];
  matchToken: string;
  expiresInSeconds: number;
  acknowledgedMatchIds: string[];
  canContinue: boolean;
};

type OrganizationMatchViewer = {
  userId: string;
  isAdmin?: boolean;
};

type MatchClient = typeof prisma | any;

type NormalizedMatchInput = {
  name: string;
  location: string;
  coordinateBucket: string | null;
  coordinates: { lat: number; lng: number } | null;
  websitePolicy: OrganizationDomainPolicy | null;
};

type MatchTokenPayload = JwtPayload & {
  purpose: typeof MATCH_TOKEN_PURPOSE;
  userId: string;
  fingerprint: string;
  matchIds: string[];
  acknowledgedMatchIds: string[];
};

type OrganizationRow = {
  id: string;
  name: string;
  location: string | null;
  logoId: string | null;
  website: string | null;
  coordinates: unknown;
  publicSlug: string | null;
  publicPageEnabled: boolean;
  originType: string;
  ownershipStatus: string;
  claimVerificationLevel: string;
};

type DomainRow = {
  organizationId: string;
  url: string;
  host: string;
  registrableDomain: string;
  isPrimary: boolean;
  isSharedPlatform: boolean;
  verifiedAt: Date | null;
};

type AffiliateCandidateRow = {
  publishedOrganizationId: string | null;
  title: string;
  organizerName: string | null;
  city: string | null;
  address: string | null;
  officialActionUrl: string;
  sourceUrl: string;
};

type AffiliateSourceRow = {
  organizationId: string | null;
  name: string;
  baseUrl: string | null;
  listUrl: string;
};

export class OrganizationMatchError extends Error {
  code: string;
  status: number;
  matches: OrganizationMatchView[];

  constructor(
    message: string,
    code: string,
    status = 400,
    matches: OrganizationMatchView[] = [],
  ) {
    super(message);
    this.name = 'OrganizationMatchError';
    this.code = code;
    this.status = status;
    this.matches = matches;
  }
}

export const isOrganizationMatchError = (error: unknown): error is OrganizationMatchError => (
  error instanceof OrganizationMatchError
);

const normalizeText = (value: string | null | undefined): string => (
  (value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
);

const normalizeOrganizationName = (value: string | null | undefined): string => {
  const tokens = normalizeText(value).split(' ').filter(Boolean);
  while (tokens.length > 1 && LEGAL_NAME_SUFFIXES.has(tokens[tokens.length - 1])) {
    tokens.pop();
  }
  return tokens.join(' ');
};

const normalizeLocation = (value: string | null | undefined): string => normalizeText(value);

const normalizeCoordinates = (
  value: FindOrganizationMatchesInput['coordinates'],
): { lat: number; lng: number } | null => {
  if (!value) return null;
  const lat = Array.isArray(value) ? Number(value[1]) : Number(value.lat);
  const lng = Array.isArray(value) ? Number(value[0]) : Number(value.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return null;
  }
  return { lat, lng };
};

const coordinateBucket = (coordinates: { lat: number; lng: number } | null): string | null => (
  coordinates ? `${coordinates.lat.toFixed(2)},${coordinates.lng.toFixed(2)}` : null
);

const normalizeMatchInput = (input: FindOrganizationMatchesInput): NormalizedMatchInput => {
  const name = normalizeOrganizationName(input.name);
  const location = normalizeLocation(input.location);
  const coordinates = normalizeCoordinates(input.coordinates);
  let websitePolicy: OrganizationDomainPolicy | null = null;

  if (input.website?.trim()) {
    try {
      websitePolicy = organizationDomainPolicyForUrl(input.website);
    } catch (error) {
      throw new OrganizationMatchError(
        error instanceof Error ? error.message : 'Organization website must be a valid public URL.',
        'INVALID_ORGANIZATION_WEBSITE',
        400,
      );
    }
  }

  if (!websitePolicy && name.length < 3) {
    throw new OrganizationMatchError(
      'Enter an organization name or website before searching.',
      'ORGANIZATION_MATCH_INPUT_REQUIRED',
      400,
    );
  }

  return {
    name,
    location,
    coordinates,
    coordinateBucket: coordinateBucket(coordinates),
    websitePolicy,
  };
};

const fingerprintForInput = (input: NormalizedMatchInput): string => createHash('sha256')
  .update(JSON.stringify({
    name: input.name,
    canonicalUrl: input.websitePolicy?.canonicalUrl ?? null,
    registrableDomain: input.websitePolicy?.registrableDomain ?? null,
    location: input.location,
    coordinateBucket: input.coordinateBucket,
  }))
  .digest('hex');

const lockFingerprintForInput = (input: NormalizedMatchInput): string => createHash('sha256')
  .update(input.websitePolicy
    ? `domain:${input.websitePolicy.registrableDomain}`
    : `identity:${input.name}|${input.location}|${input.coordinateBucket ?? ''}`)
  .digest('hex');

const normalizedTokens = (value: string): Set<string> => new Set(
  value.split(' ').filter((token) => token.length > 1),
);

const tokenSimilarity = (left: string, right: string): number => {
  if (!left || !right) return 0;
  if (left === right) return 1;
  const leftTokens = normalizedTokens(left);
  const rightTokens = normalizedTokens(right);
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  let intersection = 0;
  leftTokens.forEach((token) => {
    if (rightTokens.has(token)) intersection += 1;
  });
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return union > 0 ? intersection / union : 0;
};

const strongNameMatch = (left: string, right: string): boolean => {
  if (!left || !right) return false;
  if (left === right) return true;
  const similarity = tokenSimilarity(left, right);
  if (similarity >= 0.8) return true;
  const shorter = left.length <= right.length ? left : right;
  const longer = shorter === left ? right : left;
  return shorter.length >= 8 && longer.startsWith(`${shorter} `);
};

const strongLocationMatch = (left: string, right: string): boolean => {
  if (!left || !right) return false;
  return left === right
    || (Math.min(left.length, right.length) >= 5 && (left.includes(right) || right.includes(left)))
    || tokenSimilarity(left, right) >= 0.67;
};

const getSearchToken = (normalizedName: string): string | null => {
  const tokens = normalizedName
    .split(' ')
    .filter((token) => token.length >= 3 && !WEAK_NAME_TOKENS.has(token))
    .sort((left, right) => right.length - left.length);
  return tokens[0] ?? normalizedName.split(' ').find((token) => token.length >= 3) ?? null;
};

const coordinatesFromRow = (value: unknown): { lat: number; lng: number } | null => {
  if (!Array.isArray(value) || value.length < 2) return null;
  const lng = Number(value[0]);
  const lat = Number(value[1]);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
};

const distanceKm = (
  left: { lat: number; lng: number } | null,
  right: { lat: number; lng: number } | null,
): number | null => {
  if (!left || !right) return null;
  const toRadians = (value: number): number => value * (Math.PI / 180);
  const earthRadiusKm = 6371;
  const latDelta = toRadians(right.lat - left.lat);
  const lngDelta = toRadians(right.lng - left.lng);
  const a = Math.sin(latDelta / 2) ** 2
    + Math.cos(toRadians(left.lat))
    * Math.cos(toRadians(right.lat))
    * Math.sin(lngDelta / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const tryDomainPolicy = (value: string | null | undefined): OrganizationDomainPolicy | null => {
  if (!value?.trim()) return null;
  try {
    return organizationDomainPolicyForUrl(value);
  } catch {
    return null;
  }
};

const approximateLocation = (value: string | null): string | null => {
  const normalized = value?.trim();
  if (!normalized) return null;
  const parts = normalized.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length <= 2) return normalized.slice(0, 100);
  return parts.slice(-2).join(', ').slice(0, 100);
};

const availableActionsForOwnership = (
  ownershipStatus: string,
): { recommended: OrganizationMatchAction; available: OrganizationMatchAction[] } => {
  if (ownershipStatus === 'UNCLAIMED') {
    return {
      recommended: 'CLAIM_PROFILE',
      available: ['CLAIM_PROFILE', 'OPEN_PROFILE'],
    };
  }
  if (ownershipStatus === 'CLAIMED') {
    return {
      recommended: 'OPEN_PROFILE',
      available: [
        'OPEN_PROFILE',
        'REQUEST_OWNERSHIP_TRANSFER',
        'REPORT_OWNERSHIP_ISSUE',
      ],
    };
  }
  if (ownershipStatus === 'REVIEW_REQUIRED' || ownershipStatus === 'DISPUTED' || ownershipStatus === 'SUSPENDED') {
    return {
      recommended: 'REPORT_OWNERSHIP_ISSUE',
      available: ['OPEN_PROFILE', 'REPORT_OWNERSHIP_ISSUE'],
    };
  }
  return {
    recommended: 'OPEN_PROFILE',
    available: ['OPEN_PROFILE'],
  };
};

const confidenceRank: Record<OrganizationMatchConfidence, number> = {
  EXACT: 0,
  RELATED: 1,
  POSSIBLE: 2,
};

const buildOrganizationWhere = (
  input: NormalizedMatchInput,
): Record<string, unknown> => {
  const conditions: Array<Record<string, unknown>> = [];
  const searchToken = getSearchToken(input.name);
  if (searchToken) {
    conditions.push({ name: { contains: searchToken, mode: 'insensitive' } });
  }
  const locationToken = input.location.split(' ')[0];
  if (locationToken && locationToken.length >= 3) {
    conditions.push({ location: { contains: locationToken, mode: 'insensitive' } });
  }
  return conditions.length > 0 ? { OR: conditions } : { id: { in: [] } };
};

const toMatchView = (params: {
  organization: OrganizationRow;
  input: NormalizedMatchInput;
  domains: DomainRow[];
  candidates: AffiliateCandidateRow[];
  sources: AffiliateSourceRow[];
}): OrganizationMatchView | null => {
  const { organization, input, domains, candidates, sources } = params;
  const reasonCodes = new Set<OrganizationMatchReasonCode>();
  const normalizedOrganizationName = normalizeOrganizationName(organization.name);
  const candidateNames = candidates.flatMap((candidate) => [
    normalizeOrganizationName(candidate.organizerName),
    normalizeOrganizationName(candidate.title),
  ]).filter(Boolean);
  const sourceNames = sources.map((source) => normalizeOrganizationName(source.name)).filter(Boolean);
  const comparisonNames = [normalizedOrganizationName, ...candidateNames, ...sourceNames];
  const nameExact = Boolean(input.name) && comparisonNames.some((name) => name === input.name);
  const nameStrong = Boolean(input.name) && comparisonNames.some((name) => strongNameMatch(input.name, name));
  if (nameExact) reasonCodes.add('NORMALIZED_NAME_MATCH');
  else if (nameStrong) reasonCodes.add('SIMILAR_NAME');

  const organizationLocation = normalizeLocation(organization.location);
  const candidateLocations = candidates.flatMap((candidate) => [
    normalizeLocation(candidate.city),
    normalizeLocation(candidate.address),
  ]).filter(Boolean);
  const comparisonLocations = [organizationLocation, ...candidateLocations].filter(Boolean);
  const locationStrong = Boolean(input.location)
    && comparisonLocations.some((location) => strongLocationMatch(input.location, location));
  if (locationStrong) reasonCodes.add('LOCATION_MATCH');

  const nearbyDistance = distanceKm(input.coordinates, coordinatesFromRow(organization.coordinates));
  const isVeryNear = nearbyDistance !== null && nearbyDistance <= 1;
  const isNear = nearbyDistance !== null && nearbyDistance <= 15;
  if (isNear) reasonCodes.add('NEARBY_COORDINATES');

  const submittedPolicy = input.websitePolicy;
  const domainPolicies = [
    tryDomainPolicy(organization.website),
    ...domains.map((domain) => tryDomainPolicy(domain.url)),
    ...sources.flatMap((source) => [tryDomainPolicy(source.baseUrl), tryDomainPolicy(source.listUrl)]),
  ].filter((policy): policy is OrganizationDomainPolicy => Boolean(policy));

  const canonicalUrlMatch = Boolean(submittedPolicy)
    && domainPolicies.some((policy) => policy.canonicalUrl === submittedPolicy?.canonicalUrl);
  const registrableDomainMatch = Boolean(submittedPolicy)
    && domainPolicies.some((policy) => (
      policy.registrableDomain === submittedPolicy?.registrableDomain
    ));
  if (canonicalUrlMatch) reasonCodes.add('EXACT_OFFICIAL_URL');
  if (registrableDomainMatch) reasonCodes.add('REGISTRABLE_DOMAIN_MATCH');
  if (submittedPolicy?.isSharedPlatform && registrableDomainMatch) {
    reasonCodes.add('SHARED_PLATFORM_DOMAIN');
  }

  const verifiedDomainConflict = Boolean(submittedPolicy)
    && domains.some((domain) => (
      domain.registrableDomain === submittedPolicy?.registrableDomain && Boolean(domain.verifiedAt)
    ));
  if (verifiedDomainConflict) reasonCodes.add('VERIFIED_DOMAIN_CONFLICT');

  const hasAffiliateEvidence = organization.originType === 'AFFILIATE_IMPORTED'
    || candidates.length > 0
    || sources.length > 0;
  if (hasAffiliateEvidence && (nameStrong || registrableDomainMatch || locationStrong)) {
    reasonCodes.add('AFFILIATE_SOURCE_MATCH');
  }

  let confidence: OrganizationMatchConfidence | null = null;
  if (
    (canonicalUrlMatch && (!submittedPolicy?.isSharedPlatform || nameStrong))
    || (registrableDomainMatch && nameStrong && !submittedPolicy?.isSharedPlatform)
    || (hasAffiliateEvidence && nameExact && (locationStrong || isVeryNear))
  ) {
    confidence = 'EXACT';
  } else if (
    registrableDomainMatch
    || (nameStrong && (locationStrong || isNear))
  ) {
    confidence = 'RELATED';
  } else if (nameStrong || locationStrong || isNear) {
    confidence = 'POSSIBLE';
  }

  if (!confidence) return null;

  const actions = availableActionsForOwnership(organization.ownershipStatus);
  const profileUrl = organization.publicPageEnabled && organization.publicSlug
    ? buildPublicOrganizationPath(organization.publicSlug)
    : `/organizations/${encodeURIComponent(organization.id)}`;

  return {
    organizationId: organization.id,
    name: organization.name,
    logoUrl: organization.logoId
      ? `/api/files/${encodeURIComponent(organization.logoId)}/preview?w=96&h=96&fit=cover`
      : null,
    approximateLocation: approximateLocation(organization.location),
    profileUrl,
    claimUrl: `/organizations/${encodeURIComponent(organization.id)}/claim`,
    confidence,
    reasonCodes: Array.from(reasonCodes),
    originType: organization.originType,
    ownershipStatus: organization.ownershipStatus,
    claimVerificationLevel: organization.claimVerificationLevel,
    recommendedAction: actions.recommended,
    availableActions: actions.available,
    submittedWebsiteDomain: registrableDomainMatch
      ? submittedPolicy?.registrableDomain ?? null
      : null,
    blocksCreation: confidence === 'EXACT' || verifiedDomainConflict,
  };
};

const matchIdsForToken = (matches: OrganizationMatchView[]): string[] => (
  matches
    .map((match) => `${match.organizationId}:${match.confidence}:${match.blocksCreation ? '1' : '0'}`)
    .sort()
);

const signMatchToken = (params: {
  input: NormalizedMatchInput;
  viewerUserId: string;
  matches: OrganizationMatchView[];
  acknowledgedMatchIds: string[];
}): string => jwt.sign(
  {
    purpose: MATCH_TOKEN_PURPOSE,
    userId: params.viewerUserId,
    fingerprint: fingerprintForInput(params.input),
    matchIds: matchIdsForToken(params.matches),
    acknowledgedMatchIds: params.acknowledgedMatchIds,
  },
  getAuthSecret(),
  {
    algorithm: 'HS256',
    issuer: MATCH_TOKEN_ISSUER,
    audience: MATCH_TOKEN_AUDIENCE,
    expiresIn: MATCH_TOKEN_TTL_SECONDS,
  },
);

const verifyMatchToken = (
  token: string,
  input: NormalizedMatchInput,
  viewerUserId: string,
): MatchTokenPayload | null => {
  try {
    const decoded = jwt.verify(token, getAuthSecret(), {
      algorithms: ['HS256'],
      issuer: MATCH_TOKEN_ISSUER,
      audience: MATCH_TOKEN_AUDIENCE,
    }) as MatchTokenPayload;
    if (
      decoded.purpose !== MATCH_TOKEN_PURPOSE
      || decoded.userId !== viewerUserId
      || decoded.fingerprint !== fingerprintForInput(input)
      || !Array.isArray(decoded.matchIds)
      || !decoded.matchIds.every((value) => typeof value === 'string')
      || !Array.isArray(decoded.acknowledgedMatchIds)
      || !decoded.acknowledgedMatchIds.every((value) => typeof value === 'string')
    ) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
};

export async function findOrganizationMatches(
  rawInput: FindOrganizationMatchesInput,
  viewer: OrganizationMatchViewer,
  client: MatchClient = prisma,
): Promise<OrganizationMatchResult> {
  const input = normalizeMatchInput(rawInput);
  const submittedDomain = input.websitePolicy?.registrableDomain ?? null;
  const searchToken = getSearchToken(input.name);
  const locationToken = input.location.split(' ')[0] || null;

  const [domains, candidates, sources] = await Promise.all([
    submittedDomain
      ? client.organizationDomains.findMany({
        where: { registrableDomain: submittedDomain },
        select: {
          organizationId: true,
          url: true,
          host: true,
          registrableDomain: true,
          isPrimary: true,
          isSharedPlatform: true,
          verifiedAt: true,
        },
        take: MAX_CANDIDATES,
      })
      : Promise.resolve([]),
    searchToken || (locationToken && locationToken.length >= 3)
      ? client.affiliateImportCandidates.findMany({
        where: {
          publishedOrganizationId: { not: null },
          OR: [
            ...(searchToken ? [
              { organizerName: { contains: searchToken, mode: 'insensitive' } },
              { title: { contains: searchToken, mode: 'insensitive' } },
            ] : []),
            ...(locationToken && locationToken.length >= 3 ? [
              { city: { contains: locationToken, mode: 'insensitive' } },
              { address: { contains: locationToken, mode: 'insensitive' } },
            ] : []),
          ],
        },
        select: {
          publishedOrganizationId: true,
          title: true,
          organizerName: true,
          city: true,
          address: true,
          officialActionUrl: true,
          sourceUrl: true,
        },
        orderBy: { updatedAt: 'desc' },
        take: MAX_CANDIDATES,
      })
      : Promise.resolve([]),
    submittedDomain
      ? client.affiliateScrapeSources.findMany({
        where: { organizationId: { not: null } },
        select: {
          organizationId: true,
          name: true,
          baseUrl: true,
          listUrl: true,
        },
        orderBy: { updatedAt: 'desc' },
        take: MAX_SOURCES,
      })
      : Promise.resolve([]),
  ]) as [DomainRow[], AffiliateCandidateRow[], AffiliateSourceRow[]];

  const domainOrganizationIds = domains.map((domain) => domain.organizationId);
  const candidateOrganizationIds = candidates
    .map((candidate) => candidate.publishedOrganizationId)
    .filter((value): value is string => Boolean(value));
  const sourceOrganizationIds = sources
    .filter((source) => {
      const policies = [tryDomainPolicy(source.baseUrl), tryDomainPolicy(source.listUrl)]
        .filter((policy): policy is OrganizationDomainPolicy => Boolean(policy));
      return policies.some((policy) => policy.registrableDomain === submittedDomain);
    })
    .map((source) => source.organizationId)
    .filter((value): value is string => Boolean(value));
  const discoveredOrganizationIds = Array.from(new Set([
    ...domainOrganizationIds,
    ...candidateOrganizationIds,
    ...sourceOrganizationIds,
  ]));

  const organizationSelect = {
    id: true,
    name: true,
    location: true,
    logoId: true,
    website: true,
    coordinates: true,
    publicSlug: true,
    publicPageEnabled: true,
    originType: true,
    ownershipStatus: true,
    claimVerificationLevel: true,
  };
  const [discoveredOrganizations, textOrganizations] = await Promise.all([
    discoveredOrganizationIds.length > 0
      ? client.organizations.findMany({
        where: { id: { in: discoveredOrganizationIds } },
        select: organizationSelect,
        take: MAX_CANDIDATES,
      })
      : Promise.resolve([]),
    client.organizations.findMany({
      where: buildOrganizationWhere(input),
      select: organizationSelect,
      take: MAX_CANDIDATES,
    }),
  ]) as [OrganizationRow[], OrganizationRow[]];
  const organizations = Array.from(new Map(
    [...discoveredOrganizations, ...textOrganizations]
      .map((organization) => [organization.id, organization] as const),
  ).values());

  const excludedOrganizationId = typeof (rawInput as FindOrganizationMatchesInput & { excludeOrganizationId?: string }).excludeOrganizationId === 'string'
    ? (rawInput as FindOrganizationMatchesInput & { excludeOrganizationId?: string }).excludeOrganizationId
    : null;
  const matches = organizations
    .filter((organization) => organization.id !== excludedOrganizationId)
    .map((organization) => toMatchView({
      organization,
      input,
      domains: domains.filter((domain) => domain.organizationId === organization.id),
      candidates: candidates.filter((candidate) => candidate.publishedOrganizationId === organization.id),
      sources: sources.filter((source) => source.organizationId === organization.id),
    }))
    .filter((match): match is OrganizationMatchView => Boolean(match))
    .sort((left, right) => (
      confidenceRank[left.confidence] - confidenceRank[right.confidence]
      || Number(right.blocksCreation) - Number(left.blocksCreation)
      || left.name.localeCompare(right.name)
    ))
    .slice(0, MAX_MATCHES);

  const currentMatchIds = new Set(matches.map((match) => match.organizationId));
  const acknowledgedMatchIds = Array.from(new Set(rawInput.acknowledgedMatchIds ?? []))
    .filter((id) => currentMatchIds.has(id))
    .sort();
  const blockingMatches = matches.filter((match) => match.blocksCreation);
  const unacknowledgedMatches = matches.filter((match) => (
    !match.blocksCreation && !acknowledgedMatchIds.includes(match.organizationId)
  ));

  return {
    matches,
    matchToken: signMatchToken({
      input,
      viewerUserId: viewer.userId,
      matches,
      acknowledgedMatchIds,
    }),
    expiresInSeconds: MATCH_TOKEN_TTL_SECONDS,
    acknowledgedMatchIds,
    canContinue: blockingMatches.length === 0 && unacknowledgedMatches.length === 0,
  };
}

export type AssertOrganizationCreationInput = FindOrganizationMatchesInput & {
  organizationMatchToken?: string | null;
  organizationMatchOverrideReason?: string | null;
};

export async function assertOrganizationCreationAllowed(
  rawInput: AssertOrganizationCreationInput,
  viewer: OrganizationMatchViewer,
  client: MatchClient = prisma,
): Promise<OrganizationMatchResult & { overrideReason: string | null }> {
  const input = normalizeMatchInput(rawInput);
  const result = await findOrganizationMatches(rawInput, viewer, client);
  const blockingMatches = result.matches.filter((match) => match.blocksCreation);
  const overrideReason = rawInput.organizationMatchOverrideReason?.trim() ?? '';

  if (blockingMatches.length > 0) {
    if (viewer.isAdmin && overrideReason.length >= 10) {
      return { ...result, overrideReason: overrideReason.slice(0, 500) };
    }
    const verifiedDomainConflict = blockingMatches.some((match) => (
      match.reasonCodes.includes('VERIFIED_DOMAIN_CONFLICT')
      && match.confidence !== 'EXACT'
    ));
    throw new OrganizationMatchError(
      verifiedDomainConflict
        ? 'This website domain is already verified for another organization.'
        : 'An organization matching these details already exists.',
      verifiedDomainConflict
        ? 'ORGANIZATION_DOMAIN_ALREADY_VERIFIED'
        : 'ORGANIZATION_ALREADY_EXISTS',
      409,
      blockingMatches,
    );
  }

  const token = rawInput.organizationMatchToken?.trim() ?? '';
  const tokenPayload = token ? verifyMatchToken(token, input, viewer.userId) : null;
  if (!tokenPayload) {
    throw new OrganizationMatchError(
      'Search for existing organizations again before creating a new profile.',
      'ORGANIZATION_MATCH_REQUIRED',
      409,
      result.matches,
    );
  }

  const currentSnapshot = matchIdsForToken(result.matches);
  const tokenSnapshot = [...tokenPayload.matchIds].sort();
  if (
    currentSnapshot.length !== tokenSnapshot.length
    || currentSnapshot.some((value, index) => value !== tokenSnapshot[index])
  ) {
    throw new OrganizationMatchError(
      'Organization matches changed. Review the latest results before continuing.',
      'ORGANIZATION_MATCH_CHANGED',
      409,
      result.matches,
    );
  }

  const acknowledged = new Set(tokenPayload.acknowledgedMatchIds);
  const unacknowledgedMatches = result.matches.filter((match) => (
    !match.blocksCreation && !acknowledged.has(match.organizationId)
  ));
  if (unacknowledgedMatches.length > 0) {
    throw new OrganizationMatchError(
      'Confirm that the suggested profiles are different organizations before continuing.',
      'ORGANIZATION_MATCH_ACKNOWLEDGEMENT_REQUIRED',
      409,
      unacknowledgedMatches,
    );
  }

  return {
    ...result,
    acknowledgedMatchIds: Array.from(acknowledged).sort(),
    canContinue: true,
    overrideReason: null,
  };
}

export async function assertOrganizationWebsiteAvailableForUpdate(
  organizationId: string,
  input: FindOrganizationMatchesInput,
  viewer: OrganizationMatchViewer,
  client: MatchClient = prisma,
): Promise<void> {
  if (!input.website?.trim()) return;
  const result = await findOrganizationMatches(
    { ...input, excludeOrganizationId: organizationId } as FindOrganizationMatchesInput,
    viewer,
    client,
  );
  const blockingMatches = result.matches.filter((match) => match.blocksCreation);
  if (blockingMatches.length > 0) {
    throw new OrganizationMatchError(
      'This website matches another organization profile. Resolve that profile before changing this website.',
      'ORGANIZATION_WEBSITE_CONFLICT',
      409,
      blockingMatches,
    );
  }
}

export async function acquireOrganizationMatchLock(
  client: MatchClient,
  input: FindOrganizationMatchesInput,
): Promise<void> {
  if (typeof client.$executeRawUnsafe !== 'function') return;
  const normalized = normalizeMatchInput(input);
  const fingerprint = lockFingerprintForInput(normalized);
  const toSignedInt32 = (hex: string): number => {
    const unsigned = Number.parseInt(hex, 16);
    return unsigned > 0x7fffffff ? unsigned - 0x100000000 : unsigned;
  };
  await client.$executeRawUnsafe(
    'SELECT pg_advisory_xact_lock($1::integer, $2::integer)',
    toSignedInt32(fingerprint.slice(0, 8)),
    toSignedInt32(fingerprint.slice(8, 16)),
  );
}
