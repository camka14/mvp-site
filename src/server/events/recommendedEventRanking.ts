export const EVENT_SEARCH_SORT_VALUES = [
  'RECOMMENDED',
  'NEAREST',
  'SOONEST',
] as const;

export type EventSearchSort = (typeof EVENT_SEARCH_SORT_VALUES)[number];

export interface EventRankingCandidate {
  id: string;
  name?: string | null;
  start?: Date | string | number | null;
  coordinates?: unknown;
  organizationId?: string | null;
  sourceType?: string | null;
}

export interface OrganizationRankingMetadata {
  originType?: string | null;
  ownershipStatus?: string | null;
  claimVerificationLevel?: string | null;
  claimedAt?: Date | string | null;
  ownershipVerifiedAt?: Date | string | null;
}

export interface RankEventSearchCandidatesOptions {
  sort: EventSearchSort;
  userLocation?: { lat: number; lng: number } | null;
  organizationsById?: ReadonlyMap<string, OrganizationRankingMetadata>;
  diversifyOrganizations?: boolean;
}

const NATIVE_EVENT_BOOST = 30;
const CLAIMED_ORGANIZATION_BOOST = 15;
const VERIFIED_ORGANIZATION_BOOST = 5;
const ORGANIZATION_REPEAT_PENALTY = 45;
const TITLE_REPEAT_PENALTY = 25;
const CONSECUTIVE_ORGANIZATION_PENALTY = 200;
const MILES_WITH_LOCATION_PENALTY = 2;
const MAX_DISTANCE_SCORE_MILES = 100;
const MAX_SOONNESS_SCORE = 20;
const SOONNESS_SCORE_WEEK_STEP = 1;

const toComparableTime = (value: unknown): number => {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
  if (typeof value === 'string') {
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
  }
  return Number.MAX_SAFE_INTEGER;
};

const usableCoordinates = (value: unknown): [number, number] | null => {
  if (!Array.isArray(value) || value.length < 2) return null;
  const [lng, lat] = value;
  if (typeof lng !== 'number' || typeof lat !== 'number') return null;
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  if (lat === 0 && lng === 0) return null;
  return [lng, lat];
};

const haversineMiles = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const earthRadiusMiles = 3958.8;
  const toRadians = (degrees: number) => degrees * Math.PI / 180;
  const deltaLat = toRadians(lat2 - lat1);
  const deltaLon = toRadians(lon2 - lon1);
  const value = Math.sin(deltaLat / 2) ** 2
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(deltaLon / 2) ** 2;
  return 2 * earthRadiusMiles * Math.asin(Math.sqrt(value));
};

const distanceMiles = (
  event: EventRankingCandidate,
  userLocation?: { lat: number; lng: number } | null,
): number | null => {
  if (!userLocation) return null;
  const coordinates = usableCoordinates(event.coordinates);
  if (!coordinates) return null;
  return haversineMiles(userLocation.lat, userLocation.lng, coordinates[1], coordinates[0]);
};

const normalizeOrganizationId = (event: EventRankingCandidate): string | null => {
  if (typeof event.organizationId !== 'string') return null;
  const normalized = event.organizationId.trim();
  return normalized || null;
};

const organizationBucket = (event: EventRankingCandidate): string => (
  normalizeOrganizationId(event) ?? `event:${event.id}`
);

const normalizeTitle = (value: unknown): string => String(value ?? '')
  .normalize('NFKD')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const titleBucket = (event: EventRankingCandidate): string => (
  `${organizationBucket(event)}:${normalizeTitle(event.name) || event.id}`
);

const isNativeBracketIqEvent = (event: EventRankingCandidate): boolean => (
  String(event.sourceType ?? '').trim().toUpperCase() !== 'AFFILIATE_IMPORT'
);

const organizationPreferenceScore = (
  event: EventRankingCandidate,
  organizationsById?: ReadonlyMap<string, OrganizationRankingMetadata>,
): number => {
  const organizationId = normalizeOrganizationId(event);
  if (!organizationId) return 0;
  const organization = organizationsById?.get(organizationId);
  if (!organization || String(organization.ownershipStatus ?? '').toUpperCase() !== 'CLAIMED') {
    return 0;
  }

  const isVerified = String(organization.claimVerificationLevel ?? 'NONE').toUpperCase() !== 'NONE'
    || Boolean(organization.ownershipVerifiedAt);
  return CLAIMED_ORGANIZATION_BOOST + (isVerified ? VERIFIED_ORGANIZATION_BOOST : 0);
};

const compareStable = (left: EventRankingCandidate, right: EventRankingCandidate): number => {
  const timeDifference = toComparableTime(left.start) - toComparableTime(right.start);
  if (timeDifference !== 0) return timeDifference;
  return left.id.localeCompare(right.id);
};

const recommendedBaseScore = (
  event: EventRankingCandidate,
  earliestStart: number,
  options: RankEventSearchCandidatesOptions,
): number => {
  let score = isNativeBracketIqEvent(event) ? NATIVE_EVENT_BOOST : 0;
  score += organizationPreferenceScore(event, options.organizationsById);

  if (options.userLocation) {
    const distance = distanceMiles(event, options.userLocation);
    score += distance === null
      ? -MAX_DISTANCE_SCORE_MILES * MILES_WITH_LOCATION_PENALTY
      : (MAX_DISTANCE_SCORE_MILES - Math.min(distance, MAX_DISTANCE_SCORE_MILES))
        * MILES_WITH_LOCATION_PENALTY;
  }

  const startTime = toComparableTime(event.start);
  if (startTime !== Number.MAX_SAFE_INTEGER && earliestStart !== Number.MAX_SAFE_INTEGER) {
    const weeksAfterEarliest = Math.max(0, startTime - earliestStart) / (7 * 24 * 60 * 60 * 1000);
    score += Math.max(0, MAX_SOONNESS_SCORE - weeksAfterEarliest * SOONNESS_SCORE_WEEK_STEP);
  }

  return score;
};

const diversifyRecommendedOrder = <T extends EventRankingCandidate>(
  events: T[],
  baseScores: ReadonlyMap<string, number>,
): T[] => {
  const remaining = [...events];
  const ranked: T[] = [];
  const organizationCounts = new Map<string, number>();
  const titleCounts = new Map<string, number>();

  while (remaining.length > 0) {
    const recentOrganizationBuckets = ranked.slice(-2).map(organizationBucket);
    let selectedIndex = 0;
    let selectedAdjustedScore = Number.NEGATIVE_INFINITY;

    remaining.forEach((event, index) => {
      const orgBucket = organizationBucket(event);
      const repeatedOrganizationCount = organizationCounts.get(orgBucket) ?? 0;
      const repeatedTitleCount = titleCounts.get(titleBucket(event)) ?? 0;
      const isThirdConsecutive = recentOrganizationBuckets.length === 2
        && recentOrganizationBuckets.every((bucket) => bucket === orgBucket);
      const adjustedScore = (baseScores.get(event.id) ?? 0)
        - repeatedOrganizationCount * ORGANIZATION_REPEAT_PENALTY
        - repeatedTitleCount * TITLE_REPEAT_PENALTY
        - (isThirdConsecutive ? CONSECUTIVE_ORGANIZATION_PENALTY : 0);

      const selectedEvent = remaining[selectedIndex];
      if (
        adjustedScore > selectedAdjustedScore
        || (
          adjustedScore === selectedAdjustedScore
          && compareStable(event, selectedEvent) < 0
        )
      ) {
        selectedIndex = index;
        selectedAdjustedScore = adjustedScore;
      }
    });

    const [selected] = remaining.splice(selectedIndex, 1);
    ranked.push(selected);
    const orgBucket = organizationBucket(selected);
    const selectedTitleBucket = titleBucket(selected);
    organizationCounts.set(orgBucket, (organizationCounts.get(orgBucket) ?? 0) + 1);
    titleCounts.set(selectedTitleBucket, (titleCounts.get(selectedTitleBucket) ?? 0) + 1);
  }

  return ranked;
};

export const rankEventSearchCandidates = <T extends EventRankingCandidate>(
  events: readonly T[],
  options: RankEventSearchCandidatesOptions,
): T[] => {
  const candidates = [...events];
  if (options.sort === 'SOONEST') {
    return candidates.sort(compareStable);
  }
  if (options.sort === 'NEAREST') {
    return candidates.sort((left, right) => {
      const leftDistance = distanceMiles(left, options.userLocation);
      const rightDistance = distanceMiles(right, options.userLocation);
      if (leftDistance !== null && rightDistance !== null && leftDistance !== rightDistance) {
        return leftDistance - rightDistance;
      }
      if (leftDistance !== null) return -1;
      if (rightDistance !== null) return 1;
      return compareStable(left, right);
    });
  }

  const earliestStart = candidates.reduce(
    (earliest, event) => Math.min(earliest, toComparableTime(event.start)),
    Number.MAX_SAFE_INTEGER,
  );
  const baseScores = new Map(candidates.map((event) => [
    event.id,
    recommendedBaseScore(event, earliestStart, options),
  ]));
  const baseOrder = candidates.sort((left, right) => {
    const scoreDifference = (baseScores.get(right.id) ?? 0) - (baseScores.get(left.id) ?? 0);
    return scoreDifference || compareStable(left, right);
  });

  if (options.diversifyOrganizations === false) {
    return baseOrder;
  }
  return diversifyRecommendedOrder(baseOrder, baseScores);
};
