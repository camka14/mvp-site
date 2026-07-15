import { createHash } from 'node:crypto';
import {
  buildDivisionToken,
  deriveDivisionTypeDisplayName,
  getSkillDivisionTypeOptionsForSport,
  inferDivisionDetails,
  normalizeDivisionGender,
  normalizeDivisionRatingType,
  normalizeDivisionTypeIds,
  type DivisionGender,
  type DivisionRatingType,
} from '@/lib/divisionTypes';

export type ClubEventSyncRow = {
  id: string;
  organizationId: string;
  name: string;
  eventType: string | null;
  sourceUrl: string | null;
  affiliateUrl: string | null;
  sportId: string | null;
  start: Date | string;
  updatedAt: Date | string | null;
  tagSlugs?: string[];
};

export type LegacyClubDivisionRow = {
  id: string;
  eventId: string;
  name: string;
  key: string | null;
  sportId: string | null;
  price: number | null;
  maxParticipants: number | null;
  divisionTypeId: string | null;
  skillDivisionTypeId?: string | null;
  ageDivisionTypeId?: string | null;
  ratingType: string | null;
  gender: string | null;
};

export type NormalizedClubDivision = LegacyClubDivisionRow & {
  gender: DivisionGender;
  ratingType: DivisionRatingType;
  divisionTypeId: string;
  skillDivisionTypeId: string;
  ageDivisionTypeId: string;
  key: string;
  identityKey: string;
};

export type OrganizationDivisionSyncPlan = {
  id: string;
  organizationId: string;
  name: string;
  key: string;
  sportId: string;
  price: number | null;
  maxParticipants: number | null;
  divisionTypeId: string;
  skillDivisionTypeId: string;
  ageDivisionTypeId: string;
  ratingType: 'SKILL';
  gender: DivisionGender;
  description: string;
  registrationUrl: string | null;
  sourceUrl: string | null;
  lastVerifiedAt: Date;
  sourceEventId: string;
  seasonPriceSourceEventId: string | null;
};

export type ClubStructurePlan = {
  tryoutEventIds: string[];
  normalizedEventDivisions: NormalizedClubDivision[];
  organizationDivisions: OrganizationDivisionSyncPlan[];
  sourceDivisionIdByEventDivisionId: Map<string, string>;
};

const normalizeText = (value: unknown): string => String(value ?? '').trim().toLowerCase();

const hasTryoutPath = (value: string | null): boolean => {
  if (!value) return false;
  try {
    const url = new URL(value);
    return /(?:^|[-_/])tryouts?(?:[-_/]|$)/i.test(`${url.pathname}${url.search}`);
  } catch {
    return /\btryouts?\b/i.test(value);
  }
};

export const isReviewedTryoutEvent = (event: ClubEventSyncRow): boolean => {
  const eventType = normalizeText(event.eventType);
  if (eventType === 'league' || eventType === 'tournament') return false;
  return /\btryouts?\b/i.test(event.name) || hasTryoutPath(event.sourceUrl);
};

const inferGenderFromName = (value: string): DivisionGender => {
  if (/\b(girls?|women|womens|women's|female)\b/i.test(value)) return 'F';
  if (/\b(boys?|men|mens|men's|male)\b/i.test(value)) return 'M';
  return 'C';
};

const inferAgeIdFromName = (value: string): string | null => {
  const youthAges = Array.from(value.matchAll(/\bU\s*([1-9]\d?)\b/gi), (match) => Number(match[1]));
  const youthSuffixAges = Array.from(value.matchAll(/\b([1-9]\d?)\s*U\b/gi), (match) => Number(match[1]));
  const ages = [...youthAges, ...youthSuffixAges].filter(Number.isFinite);
  if (ages.length > 0) return `u${Math.max(...ages)}`;
  const minimumAge = value.match(/\b([1-9]\d?)\s*(?:\+|and\s+over|or\s+older|and\s+older)\b/i);
  return minimumAge ? `${Number(minimumAge[1])}plus` : null;
};

const inferSkillIdFromName = (value: string): string | null => {
  const rules: Array<[RegExp, string]> = [
    [/\b(recreational|recreation|rec)\b/i, 'rec'],
    [/\bpremier\b/i, 'premier'],
    [/\bnovice\b/i, 'novice'],
    [/\bbeginner\b/i, 'beginner'],
    [/\bintermediate\b/i, 'intermediate'],
    [/\badvanced\b/i, 'advanced'],
    [/\bcompetitive\b/i, 'competitive'],
    [/\bopen\b/i, 'open'],
  ];
  return rules.find(([pattern]) => pattern.test(value))?.[1] ?? null;
};

const normalizeSkillToken = (value: unknown): string => String(value ?? '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '');

const containsPhrase = (value: string, phrase: string): boolean => {
  const normalizedValue = `_${normalizeSkillToken(value)}_`;
  const normalizedPhrase = normalizeSkillToken(phrase);
  return Boolean(normalizedPhrase) && normalizedValue.includes(`_${normalizedPhrase}_`);
};

export const resolveStrictClubSkillId = (params: {
  sportId?: string | null;
  candidate?: string | null;
  divisionName?: string | null;
}): string => {
  const options = getSkillDivisionTypeOptionsForSport(params.sportId);
  const validIds = new Set(options.map((option) => normalizeSkillToken(option.id)));
  const candidate = normalizeSkillToken(params.candidate);
  if (validIds.has(candidate)) return candidate;

  const evidence = `${params.candidate ?? ''} ${params.divisionName ?? ''}`;
  const exactMatches = options
    .filter((option) => containsPhrase(evidence, option.id) || containsPhrase(evidence, option.name))
    .map((option) => normalizeSkillToken(option.id))
    .filter((value, index, values) => values.indexOf(value) === index && value !== 'open');
  if (exactMatches.length === 1) return exactMatches[0];

  const has = (pattern: RegExp): boolean => pattern.test(evidence);
  if (validIds.has('premier') && has(/\b(?:premier|competitive|select|travel|classic|academy)\b/i)) {
    return 'premier';
  }
  if (validIds.has('rec') && has(/\b(?:recreational|recreation|rec)\b/i)) return 'rec';

  if (validIds.has('developmental') && has(/\b(?:developmental|development|beginner|foundation|instructional)\b/i)) {
    return 'developmental';
  }
  if (validIds.has('competitive') && has(/\b(?:competitive|advanced|intermediate|travel|club)\b/i)) {
    return 'competitive';
  }

  const genericMatches = [
    ['beginner', /\bbeginner\b/i],
    ['intermediate', /\bintermediate\b/i],
    ['advanced', /\badvanced\b/i],
  ] as const;
  const matchedGenericIds = genericMatches
    .filter(([id, pattern]) => validIds.has(id) && has(pattern))
    .map(([id]) => id);
  if (matchedGenericIds.length === 1) return matchedGenericIds[0];

  if (validIds.has('open')) return 'open';
  throw new Error(`No canonical skill division is configured for ${params.sportId ?? 'Other'}.`);
};

export const normalizeLegacyClubDivision = (
  row: LegacyClubDivisionRow,
): NormalizedClubDivision => {
  const identifier = row.key ?? row.divisionTypeId ?? row.name ?? row.id;
  const inferred = inferDivisionDetails({
    identifier,
    sportInput: row.sportId,
    fallbackName: row.name,
  });
  const ratingType = normalizeDivisionRatingType(row.ratingType) ?? inferred.ratingType;
  const gender = normalizeDivisionGender(row.gender) ?? inferGenderFromName(row.name) ?? inferred.gender;
  const inferredTypeIds = normalizeDivisionTypeIds({
    divisionTypeId: row.divisionTypeId ?? inferred.divisionTypeId,
    skillDivisionTypeId: row.skillDivisionTypeId,
    ageDivisionTypeId: row.ageDivisionTypeId,
    ratingType,
  });
  const inferredSkillDivisionTypeId = row.skillDivisionTypeId
    ?? (ratingType === 'SKILL' ? inferredTypeIds.skillDivisionTypeId : inferSkillIdFromName(row.name))
    ?? inferSkillIdFromName(row.name)
    ?? 'open';
  const sportId = row.sportId?.trim() || 'Other';
  const skillDivisionTypeId = resolveStrictClubSkillId({
    sportId,
    candidate: inferredSkillDivisionTypeId,
    divisionName: row.name,
  });
  const ageDivisionTypeId = row.ageDivisionTypeId
    ?? inferAgeIdFromName(row.name)
    ?? inferredTypeIds.ageDivisionTypeId
    ?? '18plus';
  const normalizedTypeIds = normalizeDivisionTypeIds({
    skillDivisionTypeId,
    ageDivisionTypeId,
    ratingType: 'SKILL',
  });
  const key = buildDivisionToken({
    gender,
    ratingType: 'SKILL',
    divisionTypeId: normalizedTypeIds.divisionTypeId,
  });
  return {
    ...row,
    sportId,
    gender,
    ratingType: 'SKILL',
    ...normalizedTypeIds,
    key,
    identityKey: [
      sportId.toLowerCase(),
      gender,
      normalizedTypeIds.skillDivisionTypeId,
      normalizedTypeIds.ageDivisionTypeId,
      normalizeText(row.name),
    ].join('|'),
  };
};

const dateValue = (value: Date | string | null): number => {
  if (!value) return 0;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
};

const deterministicOrganizationDivisionId = (organizationId: string, identityKey: string): string => {
  const digest = createHash('sha256').update(`${organizationId}|${identityKey}`).digest('hex').slice(0, 20);
  return `live_club_division_${digest}`;
};

export const buildClubStructurePlan = (
  events: ClubEventSyncRow[],
  legacyDivisions: LegacyClubDivisionRow[],
): ClubStructurePlan => {
  const eventById = new Map(events.map((event) => [event.id, event]));
  const tryoutEventIds = events.filter(isReviewedTryoutEvent).map((event) => event.id);
  const tryoutEventIdSet = new Set(tryoutEventIds);
  const normalizedEventDivisions = legacyDivisions
    .filter((row) => eventById.has(row.eventId))
    .map(normalizeLegacyClubDivision);
  const groups = new Map<string, NormalizedClubDivision[]>();

  for (const division of normalizedEventDivisions) {
    const event = eventById.get(division.eventId);
    if (!event) continue;
    const groupKey = `${event.organizationId}|${division.identityKey}`;
    const rows = groups.get(groupKey) ?? [];
    rows.push(division);
    groups.set(groupKey, rows);
  }

  const organizationDivisions: OrganizationDivisionSyncPlan[] = [];
  const organizationDivisionIdByGroup = new Map<string, string>();

  for (const [groupKey, rows] of groups) {
    if (!rows.some((row) => tryoutEventIdSet.has(row.eventId))) continue;
    const rankedRows = [...rows].sort((left, right) => {
      const leftEvent = eventById.get(left.eventId)!;
      const rightEvent = eventById.get(right.eventId)!;
      return dateValue(rightEvent.updatedAt ?? rightEvent.start) - dateValue(leftEvent.updatedAt ?? leftEvent.start);
    });
    const representative = rankedRows[0];
    const representativeEvent = eventById.get(representative.eventId)!;
    const seasonPriceRow = rankedRows.find((row) => !tryoutEventIdSet.has(row.eventId) && row.price !== null);
    const seasonPriceEvent = seasonPriceRow ? eventById.get(seasonPriceRow.eventId)! : null;
    const id = deterministicOrganizationDivisionId(representativeEvent.organizationId, representative.identityKey);
    organizationDivisionIdByGroup.set(groupKey, id);
    const displayName = representative.name.trim() || deriveDivisionTypeDisplayName({
      sportInput: representative.sportId,
      gender: representative.gender,
      ratingType: 'SKILL',
      divisionTypeId: representative.divisionTypeId,
    });
    organizationDivisions.push({
      id,
      organizationId: representativeEvent.organizationId,
      name: displayName,
      key: representative.key,
      sportId: representative.sportId ?? representativeEvent.sportId ?? 'Other',
      price: seasonPriceRow?.price ?? null,
      maxParticipants: seasonPriceRow?.maxParticipants ?? representative.maxParticipants,
      divisionTypeId: representative.divisionTypeId,
      skillDivisionTypeId: representative.skillDivisionTypeId,
      ageDivisionTypeId: representative.ageDivisionTypeId,
      ratingType: 'SKILL',
      gender: representative.gender,
      description: seasonPriceRow
        ? `Club division imported from ${seasonPriceEvent?.name ?? representativeEvent.name}.`
        : `Club division inferred from ${representativeEvent.name}. Season price is not specified by the live source.`,
      registrationUrl: seasonPriceEvent?.affiliateUrl ?? null,
      sourceUrl: seasonPriceEvent?.sourceUrl ?? representativeEvent.sourceUrl,
      lastVerifiedAt: new Date(representativeEvent.updatedAt ?? representativeEvent.start),
      sourceEventId: representativeEvent.id,
      seasonPriceSourceEventId: seasonPriceEvent?.id ?? null,
    });
  }

  const sourceDivisionIdByEventDivisionId = new Map<string, string>();
  for (const division of normalizedEventDivisions) {
    if (!tryoutEventIdSet.has(division.eventId)) continue;
    const event = eventById.get(division.eventId)!;
    const organizationDivisionId = organizationDivisionIdByGroup.get(`${event.organizationId}|${division.identityKey}`);
    if (organizationDivisionId) sourceDivisionIdByEventDivisionId.set(division.id, organizationDivisionId);
  }

  return {
    tryoutEventIds,
    normalizedEventDivisions,
    organizationDivisions,
    sourceDivisionIdByEventDivisionId,
  };
};
