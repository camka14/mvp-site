import { createHash } from 'crypto';
import {
  buildCompositeDivisionTypeId,
  buildDivisionToken,
  deriveDivisionTypeDisplayName,
  type DivisionGender,
  type DivisionRatingType,
} from '@/lib/divisionTypes';
import { prisma } from '@/lib/prisma';
import { createId } from '@/lib/id';
import { geocodeAddressToCoordinates } from '@/server/geocoding';
import { syncEventDivisions } from '@/server/repositories/events';
import { extractAffiliateCandidatesFromPage, extractAffiliateFieldValuesFromPage } from './mappingExtractor';
import {
  inferAffiliateParticipantAvailability,
  parseAffiliateMaxParticipants,
} from './participantAvailability';
import { scrapingDogClient } from './scrapingDogClient';
import {
  type AffiliateDateDisplayMode,
  type AffiliateCandidateInput,
  type AffiliateScrapeMapping,
  parseAffiliateScrapeMapping,
  type ScrapePageClient,
} from './types';

type AffiliateSourceCreateInput = {
  name: string;
  sourceKey: string;
  listUrl: string;
  targetKind?: string;
  organizationId?: string | null;
  baseUrl?: string | null;
  status?: string;
  autoScrapeEnabled?: boolean;
  scrapeIntervalMinutes?: number;
  notes?: string | null;
  metadata?: Record<string, unknown> | null;
  mapping?: AffiliateScrapeMapping;
};

type AffiliateScrapeSourceRow = {
  id: string;
  name?: string | null;
  sourceKey?: string | null;
  activeMappingId: string | null;
  listUrl: string;
  organizationId?: string | null;
  baseUrl?: string | null;
};

type AffiliateScrapeMappingRow = {
  id: string;
  sourceId: string;
  mapping: unknown;
};

const affiliatePrisma = () => {
  const client = prisma as any;
  return {
    sources: client.affiliateScrapeSources,
    mappings: client.affiliateScrapeMappings,
    runs: client.affiliateScrapeRuns,
    candidates: client.affiliateImportCandidates,
    events: client.events,
    teams: client.canonicalTeams,
    facilities: client.facilities,
    divisions: client.divisions,
    organizations: client.organizations,
    sports: client.sports,
  };
};

const nullableString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const sleep = (milliseconds: number): Promise<void> => (
  milliseconds > 0
    ? new Promise((resolve) => setTimeout(resolve, milliseconds))
    : Promise.resolve()
);

const AFFILIATE_DATE_DISPLAY_MODES = new Set(['SCHEDULED', 'NO_FIXED_DATE', 'ONGOING']);
const EVERGREEN_AFFILIATE_START_DATE = new Date('2099-12-31T12:00:00.000Z');

const normalizeDateDisplayMode = (value: unknown): AffiliateDateDisplayMode => {
  const normalized = nullableString(value)?.toUpperCase();
  return normalized && AFFILIATE_DATE_DISPLAY_MODES.has(normalized)
    ? normalized as AffiliateDateDisplayMode
    : 'SCHEDULED';
};

const isEvergreenAffiliateCandidate = (candidate: any): boolean => (
  normalizeDateDisplayMode(candidate?.dateDisplayMode) !== 'SCHEDULED'
);

const dateDisplayTextFromCandidate = (candidate: any): string | null => (
  nullableString(candidate.dateDisplayText)
  ?? (isEvergreenAffiliateCandidate(candidate) ? nullableString(candidate.scheduleText) : null)
  ?? (isEvergreenAffiliateCandidate(candidate) ? 'No fixed start date' : null)
);

const normalizeStatus = (value: unknown, fallback: string): string => (
  nullableString(value)?.toUpperCase() ?? fallback
);

const parseDateOrNull = (value: string | null | undefined): Date | null => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const normalizeDateText = (value: string): string => (
  value
    .replace(/\s+/g, ' ')
    .replace(/\b(\d{1,2})(st|nd|rd|th)\b/gi, '$1')
    .replace(/\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+/gi, '')
    .trim()
);

const parseSourceDateOrNull = (
  value: string | null | undefined,
  params: { referenceYear?: number | null; endOfDay?: boolean } = {},
): Date | null => {
  const text = nullableString(value);
  if (!text) return null;
  const normalized = normalizeDateText(text);
  const hasYear = /\b\d{4}\b/.test(normalized);
  const year = Number.isInteger(params.referenceYear) ? params.referenceYear : new Date().getFullYear();
  const parsed = new Date(hasYear ? normalized : `${normalized}, ${year}`);
  if (Number.isNaN(parsed.getTime())) return null;
  if (params.endOfDay) {
    parsed.setHours(23, 59, 59, 999);
  }
  return parsed;
};

const candidateStartDate = (candidate: Pick<AffiliateCandidateInput, 'startsAt'> | any): Date | null => {
  if (candidate.startsAt instanceof Date && !Number.isNaN(candidate.startsAt.getTime())) {
    return candidate.startsAt;
  }
  return parseDateOrNull(typeof candidate.startsAt === 'string' ? candidate.startsAt : null);
};

const candidateRegistrationDeadline = (
  candidate: Pick<AffiliateCandidateInput, 'registrationDeadlineText' | 'startsAt'> | any,
): Date | null => {
  const text = nullableString(candidate.registrationDeadlineText);
  if (!text) return null;
  const start = candidateStartDate(candidate);
  return parseSourceDateOrNull(text, {
    referenceYear: start?.getFullYear() ?? null,
    endOfDay: true,
  });
};

const isImportableCandidate = (
  candidate: AffiliateCandidateInput,
  now: Date = new Date(),
): boolean => {
  return candidateImportRejectionReasons(candidate, now).length === 0;
};

const candidateImportRejectionReasons = (
  candidate: AffiliateCandidateInput,
  now: Date = new Date(),
): string[] => {
  if (candidate.listingKind === 'RENTAL') return [];
  const reasons: string[] = [];
  const start = candidateStartDate(candidate);
  if (!isEvergreenAffiliateCandidate(candidate) && (!start || start.getTime() <= now.getTime())) {
    reasons.push(start ? 'start is not in the future' : 'missing source start date');
  }
  const registrationDeadline = candidateRegistrationDeadline(candidate);
  if (registrationDeadline && registrationDeadline.getTime() < now.getTime()) {
    reasons.push('registration deadline passed');
  }
  return reasons;
};

const assertEventOrTeamCandidateImportable = (candidate: any) => {
  const start = candidateStartDate(candidate);
  if (!isEvergreenAffiliateCandidate(candidate) && !start) {
    throw new Error('Affiliate event candidates must include a valid start date from the source.');
  }
  if (!isEvergreenAffiliateCandidate(candidate) && start && start.getTime() <= Date.now()) {
    throw new Error('Affiliate event candidates must start in the future.');
  }
  const registrationDeadline = candidateRegistrationDeadline(candidate);
  if (registrationDeadline && registrationDeadline.getTime() < Date.now()) {
    throw new Error('Affiliate candidate registration deadline has passed.');
  }
};

const candidateValue = (candidate: AffiliateCandidateInput, fieldName: string): string => {
  const value = (candidate as Record<string, unknown>)[fieldName];
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
};

export const buildAffiliateCandidateDedupeKey = (
  sourceId: string,
  candidate: AffiliateCandidateInput,
  mapping: AffiliateScrapeMapping,
): string => {
  const fields = mapping.dedupe?.fields?.length
    ? mapping.dedupe.fields
    : ['officialActionUrl', 'title', 'startsAt'];
  const raw = [
    sourceId,
    ...fields.map((fieldName) => candidateValue(candidate, fieldName)),
  ].join('|');
  return createHash('sha256').update(raw).digest('hex');
};

const candidatePersistenceData = (
  params: {
    sourceId: string;
    runId: string;
    mappingId: string | null;
    dedupeKey: string;
    candidate: AffiliateCandidateInput;
  },
) => {
  const { sourceId, runId, mappingId, dedupeKey, candidate } = params;
  const rawPayload = {
    ...(candidate.rawPayload ?? {}),
    normalizedImport: buildAffiliateImportMetadata(candidate),
  };
  return {
    sourceId,
    runId,
    mappingId,
    listingKind: candidate.listingKind,
    dedupeKey,
    title: candidate.title,
    organizerName: candidate.organizerName ?? null,
    sportName: candidate.sportName ?? null,
    formatLabel: candidate.formatLabel ?? null,
    city: candidate.city ?? null,
    venueName: candidate.venueName ?? null,
    address: candidate.address ?? null,
    startsAt: parseDateOrNull(candidate.startsAt),
    endsAt: parseDateOrNull(candidate.endsAt),
    timeZone: candidate.timeZone ?? null,
    scheduleText: candidate.scheduleText ?? null,
    dateDisplayMode: normalizeDateDisplayMode(candidate.dateDisplayMode),
    dateDisplayText: candidate.dateDisplayText ?? null,
    skillLevel: candidate.skillLevel ?? null,
    ageGroup: candidate.ageGroup ?? null,
    divisionText: candidate.divisionText ?? null,
    participantOptionsText: candidate.participantOptionsText ?? null,
    priceText: candidate.priceText ?? null,
    statusText: candidate.statusText ?? null,
    registrationDeadlineText: candidate.registrationDeadlineText ?? null,
    officialActionUrl: candidate.officialActionUrl,
    sourceUrl: candidate.sourceUrl,
    description: candidate.description ?? null,
    rawPayload,
    warnings: candidate.warnings ?? [],
  };
};

export const listAffiliateSources = async () => {
  const { sources } = affiliatePrisma();
  return sources.findMany({
    where: { status: 'ACTIVE' },
    orderBy: { name: 'asc' },
  });
};

export const createAffiliateSource = async (input: AffiliateSourceCreateInput, adminUserId?: string) => {
  const { sources, mappings } = affiliatePrisma();
  const sourceId = createId();
  const source = await sources.create({
    data: {
      id: sourceId,
      name: input.name.trim(),
      sourceKey: input.sourceKey.trim(),
      organizationId: nullableString(input.organizationId),
      baseUrl: nullableString(input.baseUrl),
      listUrl: input.listUrl.trim(),
      targetKind: normalizeStatus(input.targetKind, 'EVENT'),
      status: normalizeStatus(input.status, 'ACTIVE'),
      autoScrapeEnabled: input.autoScrapeEnabled === true,
      scrapeIntervalMinutes: typeof input.scrapeIntervalMinutes === 'number'
        && Number.isInteger(input.scrapeIntervalMinutes)
        && input.scrapeIntervalMinutes >= 60
        ? input.scrapeIntervalMinutes
        : 1440,
      notes: nullableString(input.notes),
      metadata: input.metadata ?? null,
    },
  });

  if (!input.mapping) {
    return source;
  }

  const mapping = await mappings.create({
    data: {
      id: createId(),
      sourceId,
      version: 1,
      isActive: true,
      mapping: input.mapping,
      createdByUserId: adminUserId ?? null,
    },
  });

  return sources.update({
    where: { id: sourceId },
    data: { activeMappingId: mapping.id },
  });
};

const normalizeSourceType = (value: unknown): string | null => (
  nullableString(value)?.toUpperCase() ?? null
);

const normalizeListingKind = (value: unknown): 'EVENT' | 'TEAM' | 'RENTAL' => {
  const normalized = normalizeSourceType(value);
  if (normalized === 'EVENT' || normalized === 'TEAM' || normalized === 'RENTAL') {
    return normalized;
  }
  throw new Error('Affiliate listing kind must be EVENT, TEAM, or RENTAL.');
};

const publishedEventIdFromCandidate = (candidate: any): string | null => (
  nullableString(candidate?.publishedEventId)
);

const publishedTeamIdFromCandidate = (candidate: any): string | null => (
  nullableString(candidate?.publishedTeamId)
);

const slugifyForId = (value: string): string => (
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'item'
);

const parseFirstPositiveInteger = (value: unknown): number | null => {
  const text = nullableString(value);
  if (!text) return null;
  const match = text.match(/\b([1-9]\d{0,2})\b/);
  if (!match) return null;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const parseMaxParticipants = parseAffiliateMaxParticipants;

const rawExtractedCandidateFields = (candidate: any): Record<string, unknown> => {
  const rawPayload = candidate?.rawPayload;
  if (!rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) {
    return {};
  }
  const extractedFields = (rawPayload as Record<string, unknown>).extractedFields;
  const detailPage = (rawPayload as Record<string, unknown>).detailPage;
  const detailFields = detailPage && typeof detailPage === 'object' && !Array.isArray(detailPage)
    ? (detailPage as Record<string, unknown>).extractedFields
    : null;
  return {
    ...(extractedFields && typeof extractedFields === 'object' && !Array.isArray(extractedFields)
      ? extractedFields as Record<string, unknown>
      : {}),
    ...(detailFields && typeof detailFields === 'object' && !Array.isArray(detailFields)
      ? detailFields as Record<string, unknown>
      : {}),
  };
};

const inferCandidateParticipantAvailability = (candidate: any) => (
  inferAffiliateParticipantAvailability({
    ...rawExtractedCandidateFields(candidate),
    ...candidate,
  })
);

const parsePriceCents = (value: unknown): number | null => {
  const text = nullableString(value);
  if (!text) return null;
  const match = text.match(/\$\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/);
  if (!match) return null;
  const amount = Number.parseFloat(match[1].replace(/,/g, ''));
  if (!Number.isFinite(amount)) return null;
  return Math.max(0, Math.round(amount * 100));
};

const affiliateCandidateText = (candidate: any): string => (
  [
    candidate.title,
    candidate.description,
    candidate.priceText,
    candidate.participantOptionsText,
    candidate.divisionText,
    candidate.skillLevel,
    candidate.sportName,
    rawExtractedCandidateFields(candidate).priceText,
    rawExtractedCandidateFields(candidate).participantOptionsText,
  ]
    .map((value) => nullableString(value) ?? '')
    .join(' ')
);

const inferAffiliateTeamSignup = (
  candidate: any,
  eventType: 'EVENT' | 'WEEKLY_EVENT' | 'LEAGUE' | 'TOURNAMENT',
): boolean => {
  const text = affiliateCandidateText(candidate);
  const lower = text.toLowerCase();

  if (/\b(?:individual|player|free[-\s]?agent)\s+registration\b|\bindividual\s+type\s+price\b|\bregister\s+individually\b|\bno\s+team\s+required\b|\bopen\s+(?:gym|play|court)\b|\bpick[-\s]?up\b|\bdrop[-\s]?in\b/.test(lower)) {
    return false;
  }

  if (/\$\s*[0-9]+(?:\.[0-9]{1,2})?\s*\/\s*team\b|\bper\s+team\b|\bteam\s+(?:entry|registration|fee|price|cost)\b|\bregister\s+a\s+(?:full\s+)?team\b/.test(lower)) {
    return true;
  }

  if (/\bsoftball\b|\bbaseball\b/.test(lower)) {
    return eventType === 'LEAGUE' || eventType === 'TOURNAMENT';
  }

  return eventType === 'LEAGUE' || eventType === 'TOURNAMENT';
};

const inferAffiliateTeamSizeLimit = (
  candidate: any,
  teamSignup: boolean,
): number => {
  if (!teamSignup) return 1;

  const text = affiliateCandidateText(candidate).toLowerCase();
  const explicitTeamSize = text.match(/\bteams?\s+of\s+([1-9]\d?)\b/)
    ?? text.match(/\b([1-9]\d?)\s*(?:person|player)\s+teams?\b/);
  if (explicitTeamSize) {
    const parsed = Number.parseInt(explicitTeamSize[1], 10);
    if (Number.isFinite(parsed) && parsed > 1) {
      return parsed;
    }
  }

  if (/\bsoftball\b|\bbaseball\b/.test(text)) return 10;
  if (/\bquads?\b/.test(text)) return 4;
  if (/\bdoubles?\b|\b2s\b/.test(text)) return 2;
  if (/\bbasketball\b/.test(text)) return 5;
  if (/\bsoccer\b|\bfutsal\b/.test(text)) return 20;
  if (/\bvolleyball\b/.test(text)) return 2;
  return 20;
};

const slugToken = (value: string): string => (
  value
    .trim()
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
);

const inferDivisionGender = (value: unknown): DivisionGender => {
  const text = nullableString(value)?.toLowerCase() ?? '';
  if (/\b(coed|co-ed|mixed)\b/.test(text)) return 'C';
  if (/\b(women|womens|women's|female|girls?)\b/.test(text)) return 'F';
  if (/\b(men|mens|men's|male|boys?)\b/.test(text)) return 'M';
  return 'C';
};

const inferAgeRangeFromText = (value: unknown): { minAge: number | null; maxAge: number | null; ageDivisionTypeId: string | null } => {
  const haystack = nullableString(value) ?? '';
  const uRangeMatch = haystack.match(/\bU\s*([1-9]\d?)\s*(?:-|–|to)\s*U?\s*([1-9]\d?)\b/i);
  if (uRangeMatch) {
    const minAge = Number.parseInt(uRangeMatch[1], 10);
    const maxAge = Number.parseInt(uRangeMatch[2], 10);
    if (Number.isFinite(minAge) && Number.isFinite(maxAge)) {
      return {
        minAge: Math.min(minAge, maxAge),
        maxAge: Math.max(minAge, maxAge),
        ageDivisionTypeId: `u${Math.max(minAge, maxAge)}`,
      };
    }
  }

  const ageRangeMatch = haystack.match(/\bages?\s*([1-9]\d?)\s*(?:-|–|to)\s*([1-9]\d?)\b/i);
  if (ageRangeMatch) {
    const minAge = Number.parseInt(ageRangeMatch[1], 10);
    const maxAge = Number.parseInt(ageRangeMatch[2], 10);
    if (Number.isFinite(minAge) && Number.isFinite(maxAge)) {
      return {
        minAge: Math.min(minAge, maxAge),
        maxAge: Math.max(minAge, maxAge),
        ageDivisionTypeId: `u${Math.max(minAge, maxAge)}`,
      };
    }
  }

  const upperMatch = haystack.match(/\bU\s*([1-9]\d?)\b/i) ?? haystack.match(/\b([1-9]\d?)\s*U\b/i);
  if (upperMatch) {
    const maxAge = Number.parseInt(upperMatch[1], 10);
    return { minAge: null, maxAge, ageDivisionTypeId: `u${maxAge}` };
  }

  const overMatch = haystack.match(/\b(?:ages?|adult)\s*([1-9]\d?)\s*(?:\+|(?:and\s+)?over|or\s+older|and\s+older|and\s+up)(?!\w)/i)
    ?? haystack.match(/\bover\s*([1-9]\d?)(?!\d)/i)
    ?? haystack.match(/\b([1-9]\d?)\s*(?:\+|(?:and\s+)?over|or\s+older|and\s+older|and\s+up)(?!\w)/i)
    ?? haystack.match(/\b(?:ages?|adult)\s*([1-9]\d?)\b/i);
  if (overMatch) {
    const minAge = Number.parseInt(overMatch[1], 10);
    return { minAge, maxAge: null, ageDivisionTypeId: `${minAge}plus` };
  }

  return { minAge: null, maxAge: null, ageDivisionTypeId: null };
};

const inferAgeRange = (candidate: any): { minAge: number | null; maxAge: number | null; ageDivisionTypeId: string | null } => (
  inferAgeRangeFromText([
    candidate.divisionText,
    candidate.skillLevel,
    candidate.ageGroup,
    candidate.description,
    candidate.title,
  ]
    .map((value) => nullableString(value) ?? '')
    .join(' '))
);

const inferSkillDivisionTypeId = (value: unknown): string => {
  const raw = nullableString(value) ?? '';
  const withoutGender = raw
    .replace(/\b(?:men|women)(?:['’]s)?\b|\b(?:mens|womens|coed|co-ed|mixed|male|female|boys?|girls?)\b/gi, ' ')
    .replace(/\b(?:ages?|adult)\s*[1-9]\d?\s*(?:\+|(?:and\s+)?over|or\s+older|and\s+older|and\s+up)?(?!\w)/gi, ' ')
    .replace(/\b[1-9]\d?\s*(?:\+|(?:and\s+)?over|or\s+older|and\s+older|and\s+up)(?!\w)/gi, ' ')
    .replace(/\bU\s*[1-9]\d?\b/gi, ' ')
    .replace(/\b[1-9]\d?\s*U\b/gi, ' ');
  return slugToken(withoutGender) || 'open';
};

const buildAffiliateDivisionDetailFromLabel = (
  sourceLabel: string,
  candidate: any,
  sportId?: string | null,
) => {
  const gender = inferDivisionGender(sourceLabel);
  const ageRange = inferAgeRangeFromText([
    sourceLabel,
    candidate.ageGroup,
    candidate.description,
    candidate.title,
  ]
    .map((value) => nullableString(value) ?? '')
    .join(' '));
  const ratingType: DivisionRatingType = 'SKILL';
  const skillDivisionTypeId = inferSkillDivisionTypeId(sourceLabel);
  const divisionTypeId = ageRange.ageDivisionTypeId
    ? buildCompositeDivisionTypeId(skillDivisionTypeId, ageRange.ageDivisionTypeId)
    : skillDivisionTypeId;
  const key = buildDivisionToken({
    gender,
    ratingType,
    divisionTypeId,
  });
  const divisionTypeName = deriveDivisionTypeDisplayName({
    sportInput: sportId ?? nullableString(candidate.sportName),
    gender,
    ratingType,
    divisionTypeId,
  });

  return {
    key,
    name: sourceLabel,
    kind: 'LEAGUE',
    divisionTypeId,
    divisionTypeName,
    ratingType,
    gender,
    price: parsePriceCents(candidate.priceText),
    maxParticipants: inferCandidateParticipantAvailability(candidate).maxParticipants,
    ageCutoffLabel: nullableString(candidate.ageGroup),
    ageCutoffSource: nullableString(candidate.ageGroup) ? 'Affiliate source age label' : null,
    fieldIds: [],
    teamIds: [],
  };
};

const buildAffiliateDivisionDetail = (candidate: any, sportId?: string | null) => {
  const sourceLabel = nullableString(candidate.divisionText)
    ?? nullableString(candidate.skillLevel);
  if (!sourceLabel) return null;
  return buildAffiliateDivisionDetailFromLabel(sourceLabel, candidate, sportId);
};

const normalizeDivisionGenderValue = (value: unknown): DivisionGender | null => {
  return value === 'M' || value === 'F' || value === 'C' ? value : null;
};

const normalizeDivisionRatingTypeValue = (value: unknown): DivisionRatingType | null => {
  return value === 'AGE' || value === 'SKILL' ? value : null;
};

const normalizeSourceDivisionPrice = (value: unknown): number | null | undefined => {
  if (value == null) return value === null ? null : undefined;
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return undefined;
  return Math.max(0, Math.round(numeric));
};

const normalizeSourceDivisionMaxParticipants = (value: unknown): number | null | undefined => {
  if (value == null) return value === null ? null : undefined;
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return undefined;
  return Math.max(0, Math.trunc(numeric));
};

const sourceDivisionRowsFromCandidate = (candidate: any): Record<string, unknown>[] => {
  const rows = rawExtractedCandidateFields(candidate).divisions;
  return Array.isArray(rows)
    ? rows.filter((row): row is Record<string, unknown> => (
        row != null && typeof row === 'object' && !Array.isArray(row)
      ))
    : [];
};

const buildAffiliateDivisionDetailsFromSourceRows = (candidate: any, sportId?: string | null) => {
  return sourceDivisionRowsFromCandidate(candidate)
    .map((row) => {
      const name = nullableString(row.name);
      if (!name) return null;
      const inferred = buildAffiliateDivisionDetailFromLabel(name, candidate, sportId);
      const gender = normalizeDivisionGenderValue(row.gender) ?? inferred.gender;
      const ratingType = normalizeDivisionRatingTypeValue(row.ratingType) ?? inferred.ratingType;
      const divisionTypeId = nullableString(row.divisionTypeId) ?? inferred.divisionTypeId;
      const key = nullableString(row.key)
        ?? buildDivisionToken({
          gender,
          ratingType,
          divisionTypeId,
        });

      return {
        ...inferred,
        key,
        name,
        gender,
        ratingType,
        divisionTypeId,
        divisionTypeName: deriveDivisionTypeDisplayName({
          sportInput: sportId ?? nullableString(candidate.sportName),
          gender,
          ratingType,
          divisionTypeId,
        }),
        price: normalizeSourceDivisionPrice(row.priceCents),
        maxParticipants: normalizeSourceDivisionMaxParticipants(row.maxParticipants),
        ageCutoffLabel: nullableString(row.ageCutoffLabel) ?? inferred.ageCutoffLabel,
        ageCutoffSource: nullableString(row.ageCutoffSource) ?? inferred.ageCutoffSource,
      };
    })
    .filter((detail): detail is NonNullable<typeof detail> => detail !== null);
};

const inferSourceDivisionLabels = (candidate: any): string[] => {
  const explicitLabel = nullableString(candidate.divisionText)
    ?? nullableString(candidate.skillLevel);
  if (explicitLabel) return [explicitLabel];

  const haystack = [
    candidate.title,
    candidate.description,
    candidate.participantOptionsText,
  ]
    .map((value) => nullableString(value) ?? '')
    .join(' ');
  const labels: string[] = [];
  const addLabel = (label: string) => {
    if (!labels.some((existing) => existing.toLowerCase() === label.toLowerCase())) {
      labels.push(label);
    }
  };

  if (/\bmen(?:['’]s)?\b|\bmens\b/i.test(haystack)) addLabel('Men');
  if (/\bwomen(?:['’]s)?\b|\bwomens\b/i.test(haystack)) addLabel('Women');
  if (/\bcoed\b|\bco-ed\b|\bmixed\b/i.test(haystack)) addLabel('Coed');

  Array.from(haystack.matchAll(/\b([1-9]\d?)\s*(?:&|and)\s*over\b|\b([1-9]\d?)\s*\+/gi))
    .forEach((match) => {
      const age = match[1] ?? match[2];
      if (age) addLabel(`${age}+`);
    });
  if (/\bsenior(?:s)?\b/i.test(haystack) && !labels.some((label) => label === '40+')) {
    addLabel('40+');
  }

  return labels;
};

const buildAffiliateDivisionDetails = (candidate: any, sportId?: string | null) => {
  const sourceDivisionDetails = buildAffiliateDivisionDetailsFromSourceRows(candidate, sportId);
  if (sourceDivisionDetails.length > 0) {
    return sourceDivisionDetails;
  }

  const details = inferSourceDivisionLabels(candidate)
    .map((label) => buildAffiliateDivisionDetailFromLabel(label, candidate, sportId));
  const byKey = new Map<string, NonNullable<ReturnType<typeof buildAffiliateDivisionDetailFromLabel>>>();
  details.forEach((detail) => {
    if (detail) byKey.set(detail.key, detail);
  });
  return Array.from(byKey.values());
};

const buildAffiliateImportMetadata = (candidate: AffiliateCandidateInput) => {
  const ageRange = inferAgeRange(candidate);
  const participantAvailability = inferCandidateParticipantAvailability(candidate);
  return {
    division: buildAffiliateDivisionDetail(candidate),
    divisions: buildAffiliateDivisionDetails(candidate),
    ageRange,
    participantAvailability,
    maxParticipants: participantAvailability.maxParticipants,
    dateDisplayMode: normalizeDateDisplayMode(candidate.dateDisplayMode),
    dateDisplayText: dateDisplayTextFromCandidate(candidate),
    evergreen: isEvergreenAffiliateCandidate(candidate),
  };
};

const eventStartFromCandidate = (candidate: any): Date => {
  assertEventOrTeamCandidateImportable(candidate);
  return candidateStartDate(candidate) ?? EVERGREEN_AFFILIATE_START_DATE;
};

const buildAffiliateEventDescription = (candidate: any): string | null => {
  return nullableString(candidate.description);
};

const inferAffiliateEventType = (candidate: any): 'EVENT' | 'WEEKLY_EVENT' | 'LEAGUE' | 'TOURNAMENT' => {
  const sourceFormat = nullableString(candidate.formatLabel ?? candidate.formatName)?.toLowerCase() ?? '';
  if (/\btournament\b/.test(sourceFormat)) {
    return 'TOURNAMENT';
  }
  if (/\bleague\b/.test(sourceFormat)) {
    return 'LEAGUE';
  }
  if (/\bweekly\b/.test(sourceFormat)) {
    return 'WEEKLY_EVENT';
  }
  if (/\b(?:camp|class|clinic|pickup|pick[-\s]?up|open\s+(?:gym|play|court))\b/.test(sourceFormat)) {
    return 'EVENT';
  }

  const haystack = [
    candidate.title,
    candidate.formatLabel,
    candidate.formatName,
    candidate.scheduleText,
    candidate.description,
  ]
    .map((value) => nullableString(value)?.toLowerCase() ?? '')
    .join(' ');
  if (/\btournament\b|\bbracket\b|\bpool play\b|\b(?:[2-9]\s*)?game guarantee\b|\b[2-9]\s*gg\b|\bteam entry fee\b|\bhomerun bracelets?\b/.test(haystack)) {
    return 'TOURNAMENT';
  }
  if (/\bleague\b|\bleagues\b/.test(haystack)) {
    return 'LEAGUE';
  }
  if (/\bweekly\b|\bevery\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.test(haystack)) {
    return 'WEEKLY_EVENT';
  }
  return 'EVENT';
};

const resolveAffiliateSportId = async (sportName: unknown): Promise<string | null> => {
  const name = nullableString(sportName);
  if (!name) return null;
  const { sports } = affiliatePrisma();
  const sport = await sports.findFirst({
    where: { name: { equals: name, mode: 'insensitive' } },
    select: { id: true },
  });
  return sport?.id ?? null;
};

const normalizePersistedCoordinates = (value: unknown): [number, number] | null => {
  if (!Array.isArray(value) || value.length < 2) return null;
  const lng = Number(value[0]);
  const lat = Number(value[1]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  if (lng === 0 && lat === 0) return null;
  return [lng, lat];
};

const buildAffiliateEventData = async (
  candidate: any,
  source: { id: string; organizationId?: string | null; name?: string | null },
  state: 'UNPUBLISHED' | 'PUBLISHED' | 'PRIVATE' = 'UNPUBLISHED',
  fallbackCoordinates?: unknown,
) => {
  const sportId = await resolveAffiliateSportId(candidate.sportName);
  const dateDisplayMode = normalizeDateDisplayMode(candidate.dateDisplayMode);
  const dateDisplayText = dateDisplayTextFromCandidate(candidate);
  const start = eventStartFromCandidate(candidate);
  const end = dateDisplayMode === 'SCHEDULED'
    ? (
        candidate.endsAt instanceof Date
          ? candidate.endsAt
          : parseDateOrNull(typeof candidate.endsAt === 'string' ? candidate.endsAt : null)
      )
    : null;
  const ageRange = inferAgeRange(candidate);
  const participantAvailability = inferCandidateParticipantAvailability(candidate);
  const maxParticipants = participantAvailability.maxParticipants;
  const hasSourceDivision = buildAffiliateDivisionDetails(candidate, sportId).length > 0;
  const eventType = inferAffiliateEventType(candidate);
  const teamSignup = inferAffiliateTeamSignup(candidate, eventType);
  const location = nullableString(candidate.venueName)
    ?? nullableString(candidate.city)
    ?? nullableString(candidate.address)
    ?? 'Location TBD';
  const address = nullableString(candidate.address);
  const city = nullableString(candidate.city);
  const geocodeAddress = address && city && !address.toLowerCase().includes(city.toLowerCase())
    ? `${address}, ${city}`
    : address ?? location;
  const coordinates = await geocodeAddressToCoordinates(geocodeAddress)
    ?? normalizePersistedCoordinates(fallbackCoordinates);
  const organizerName = nullableString(candidate.organizerName) ?? nullableString(source.name);

  return {
    name: nullableString(candidate.title) ?? 'Untitled affiliate event',
    createdAt: new Date(),
    updatedAt: new Date(),
    start,
    end,
    timeZone: nullableString(candidate.timeZone) ?? 'America/Los_Angeles',
    description: buildAffiliateEventDescription(candidate),
    affiliateUrl: nullableString(candidate.officialActionUrl),
    sourceType: 'AFFILIATE_IMPORT',
    sourceId: candidate.id,
    sourceUrl: nullableString(candidate.sourceUrl),
    organizerName,
    scheduleText: nullableString(candidate.scheduleText) ?? dateDisplayText,
    dateDisplayMode,
    dateDisplayText,
    priceText: nullableString(candidate.priceText),
    statusText: nullableString(candidate.statusText),
    winnerSetCount: null,
    loserSetCount: null,
    doubleElimination: false,
    location,
    address,
    rating: null,
    teamSizeLimit: inferAffiliateTeamSizeLimit(candidate, teamSignup),
    maxParticipants,
    minAge: ageRange.minAge,
    maxAge: ageRange.maxAge,
    hostId: null,
    assistantHostIds: [],
    noFixedEndDateTime: true,
    price: parsePriceCents(candidate.priceText) ?? 0,
    taxHandling: 'ORGANIZER_COLLECTS',
    organizerManualTaxRateBps: 0,
    singleDivision: !hasSourceDivision,
    registrationByDivisionType: hasSourceDivision,
    cancellationRefundHours: null,
    teamSignup,
    prize: null,
    registrationCutoffHours: null,
    seedColor: 0,
    imageId: null,
    fieldCount: null,
    winnerBracketPointsToVictory: [],
    loserBracketPointsToVictory: [],
    coordinates: coordinates ?? [0, 0],
    gamesPerOpponent: null,
    includePlayoffs: false,
    playoffTeamCount: null,
    usesSets: false,
    matchDurationMinutes: null,
    setDurationMinutes: null,
    setsPerMatch: null,
    restTimeMinutes: null,
    state,
    pointsToVictory: [],
    sportId,
    timeSlotIds: [],
    fieldIds: [],
    leagueScoringConfigId: null,
    organizationId: nullableString(source.organizationId),
    parentEvent: null,
    autoCancellation: null,
    eventType,
    officialSchedulingMode: 'OFF',
    doTeamsOfficiate: false,
    teamOfficialsMaySwap: false,
    officialPositions: [],
    allowPaymentPlans: false,
    installmentCount: 0,
    installmentDueDates: [],
    installmentDueRelativeDays: [],
    installmentAmounts: [],
    allowTeamSplitDefault: false,
    splitLeaguePlayoffDivisions: false,
    requiredTemplateIds: [],
  };
};

const loadSourceOrganization = async (source: { organizationId?: string | null }) => {
  const organizationId = nullableString(source.organizationId);
  if (!organizationId) {
    throw new Error('Affiliate source must be linked to a private organization before affiliate rows can be created.');
  }

  const { organizations } = affiliatePrisma();
  const organization = await organizations.findUnique({
    where: { id: organizationId },
    select: { id: true, ownerId: true, coordinates: true },
  });
  if (!organization) {
    throw new Error('Affiliate source organization was not found.');
  }
  return organization;
};

const assertSourceOrganization = async (source: { organizationId?: string | null }) => {
  await loadSourceOrganization(source);
};

const buildAffiliateTeamData = async (
  candidate: any,
  source: { id: string; organizationId?: string | null; name?: string | null },
  visibility: 'ADMIN_ONLY' | 'PUBLIC' = 'ADMIN_ONLY',
) => {
  const organization = await loadSourceOrganization(source);
  const sourceName = nullableString(source.name);
  const title = nullableString(candidate.title) ?? 'Affiliate team registration';
  const name = sourceName && !title.toLowerCase().includes(sourceName.toLowerCase())
    ? `${sourceName} ${title}`
    : title;
  const division = nullableString(candidate.divisionText)
    ?? nullableString(candidate.formatLabel)
    ?? 'Community Team';
  const divisionDetail = buildAffiliateDivisionDetail(candidate);

  return {
    name,
    division,
    divisionTypeId: divisionDetail?.divisionTypeId ?? null,
    wins: null,
    losses: null,
    teamSize: parseFirstPositiveInteger(candidate.participantOptionsText) ?? 20,
    profileImageId: null,
    sport: nullableString(candidate.sportName) ?? 'Soccer',
    organizationId: organization.id,
    createdBy: nullableString(organization.ownerId),
    openRegistration: true,
    joinPolicy: 'OPEN_REGISTRATION',
    registrationPriceCents: 0,
    requiredTemplateIds: [],
    visibility,
    affiliateUrl: nullableString(candidate.officialActionUrl),
    sourceType: 'AFFILIATE_IMPORT',
    sourceId: candidate.id,
    sourceUrl: nullableString(candidate.sourceUrl),
  };
};

const upsertAffiliateTeamForCandidate = async (
  candidate: any,
  source: { id: string; organizationId?: string | null; name?: string | null },
  options: { visibility?: 'ADMIN_ONLY' | 'PUBLIC' } = {},
) => {
  const { teams } = affiliatePrisma();
  const existingTeamId = publishedTeamIdFromCandidate(candidate);
  if (existingTeamId) {
    const existingTeam = await teams.findUnique({ where: { id: existingTeamId } });
    if (existingTeam) {
      const updateData = await buildAffiliateTeamData(
        candidate,
        source,
        options.visibility ?? existingTeam.visibility ?? 'ADMIN_ONLY',
      );
      return teams.update({
        where: { id: existingTeamId },
        data: updateData,
      });
    }
  }

  const existingBySource = await teams.findFirst({
    where: {
      sourceType: 'AFFILIATE_IMPORT',
      sourceId: candidate.id,
    },
  });
  if (existingBySource) {
    const updateData = await buildAffiliateTeamData(
      candidate,
      source,
      options.visibility ?? existingBySource.visibility ?? 'ADMIN_ONLY',
    );
    return teams.update({
      where: { id: existingBySource.id },
      data: updateData,
    });
  }

  const createData = await buildAffiliateTeamData(candidate, source, options.visibility ?? 'ADMIN_ONLY');
  return teams.create({
    data: {
      id: createId(),
      createdAt: new Date(),
      updatedAt: new Date(),
      ...createData,
    },
  });
};

const affiliateFacilityIdForCandidate = (candidate: any, source: AffiliateScrapeSourceRow): string => {
  const sourceKey = nullableString(source.sourceKey) ?? nullableString(source.id) ?? 'source';
  const title = nullableString(candidate.title) ?? nullableString(candidate.venueName) ?? candidate.id;
  return `affiliate_facility_${slugifyForId(sourceKey)}_${slugifyForId(title)}`;
};

const upsertAffiliateFacilityForCandidate = async (
  candidate: any,
  source: AffiliateScrapeSourceRow,
  options: { status?: string | null } = {},
) => {
  const organization = await loadSourceOrganization(source);
  const { facilities } = affiliatePrisma();
  const facilityId = nullableString(candidate.publishedFacilityId) ?? affiliateFacilityIdForCandidate(candidate, source);
  const name = nullableString(candidate.title)
    ?? nullableString(candidate.venueName)
    ?? 'Affiliate facility';
  const location = nullableString(candidate.venueName)
    ?? nullableString(candidate.city)
    ?? nullableString(candidate.address)
    ?? name;
  const address = nullableString(candidate.address);
  const geocodeAddress = address ?? location;
  const coordinates = await geocodeAddressToCoordinates(geocodeAddress)
    ?? normalizePersistedCoordinates(organization.coordinates);
  const data = {
    organizationId: nullableString(source.organizationId),
    name,
    location,
    address,
    coordinates,
    operatingHours: null,
    timeZone: nullableString(candidate.timeZone) ?? 'America/Los_Angeles',
    status: nullableString(options.status) ?? (candidate.status === 'PUBLISHED' ? 'ACTIVE' : 'DRAFT'),
    isDefault: false,
    affiliateUrl: nullableString(candidate.officialActionUrl),
  };

  return facilities.upsert({
    where: { id: facilityId },
    create: {
      id: facilityId,
      ...data,
    },
    update: data,
  });
};

const upsertAffiliateEventForCandidate = async (
  candidate: any,
  source: { id: string; organizationId?: string | null; name?: string | null },
  options: { state?: 'UNPUBLISHED' | 'PUBLISHED' | 'PRIVATE' } = {},
) => {
  await assertSourceOrganization(source);
  const { events } = affiliatePrisma();
  const syncSourceDivisions = async (event: any) => {
    const divisionDetails = buildAffiliateDivisionDetails(candidate, event?.sportId ?? null);
    if (divisionDetails.length === 0) {
      return;
    }
    await syncEventDivisions({
      eventId: event.id,
      divisionIds: divisionDetails.map((divisionDetail) => divisionDetail.key),
      fieldIds: [],
      includePlayoffs: false,
      singleDivision: false,
      sportId: event?.sportId ?? null,
      referenceDate: event?.start instanceof Date ? event.start : candidateStartDate(candidate),
      organizationId: nullableString(source.organizationId),
      divisionDetails,
      defaultPrice: null,
      defaultMaxParticipants: null,
      eventType: event?.eventType ?? inferAffiliateEventType(candidate),
    });
  };
  const existingEventId = publishedEventIdFromCandidate(candidate);
  if (existingEventId) {
    const existingEvent = await events.findUnique({ where: { id: existingEventId } });
    if (existingEvent) {
      const updateData = await buildAffiliateEventData(
        candidate,
        source,
        options.state ?? existingEvent.state ?? 'UNPUBLISHED',
        existingEvent.coordinates,
      );
      delete (updateData as any).createdAt;
      const event = await events.update({
        where: { id: existingEventId },
        data: updateData,
      });
      await syncSourceDivisions(event);
      return event;
    }
  }

  const existingBySource = await events.findFirst({
    where: {
      sourceType: 'AFFILIATE_IMPORT',
      sourceId: candidate.id,
    },
  });
  if (existingBySource) {
    const updateData = await buildAffiliateEventData(
      candidate,
      source,
      options.state ?? existingBySource.state ?? 'UNPUBLISHED',
      existingBySource.coordinates,
    );
    delete (updateData as any).createdAt;
    const event = await events.update({
      where: { id: existingBySource.id },
      data: updateData,
    });
    await syncSourceDivisions(event);
    return event;
  }

  const createData = await buildAffiliateEventData(candidate, source, options.state ?? 'UNPUBLISHED');
  const existingByOccurrence = createData.affiliateUrl
    ? await events.findFirst({
        where: {
          sourceType: 'AFFILIATE_IMPORT',
          sourceId: { not: candidate.id },
          organizationId: createData.organizationId,
          affiliateUrl: createData.affiliateUrl,
          name: createData.name,
          start: createData.start,
          eventType: createData.eventType,
          archivedAt: null,
        },
        orderBy: { createdAt: 'asc' },
      })
    : null;
  if (existingByOccurrence) {
    const updateData = {
      ...createData,
      state: options.state ?? existingByOccurrence.state ?? createData.state,
      sourceId: existingByOccurrence.sourceId ?? createData.sourceId,
    };
    delete (updateData as any).createdAt;
    const event = await events.update({
      where: { id: existingByOccurrence.id },
      data: updateData,
    });
    await syncSourceDivisions(event);
    return event;
  }

  const event = await events.create({
    data: {
      id: createId(),
      ...createData,
    },
  });
  await syncSourceDivisions(event);
  return event;
};

const resolveActiveMapping = async (
  source: AffiliateScrapeSourceRow,
): Promise<{ row: AffiliateScrapeMappingRow; mapping: AffiliateScrapeMapping }> => {
  const { mappings } = affiliatePrisma();
  const mappingRow = source.activeMappingId
    ? await mappings.findUnique({ where: { id: source.activeMappingId } })
    : await mappings.findFirst({
        where: { sourceId: source.id, isActive: true },
        orderBy: { version: 'desc' },
      });

  if (!mappingRow) {
    throw new Error('No active scrape mapping is configured for this source.');
  }

  return {
    row: mappingRow,
    mapping: parseAffiliateScrapeMapping(mappingRow.mapping),
  };
};

const enrichCandidatesWithDetailPages = async (
  candidates: AffiliateCandidateInput[],
  mapping: AffiliateScrapeMapping,
  client: ScrapePageClient,
): Promise<AffiliateCandidateInput[]> => {
  if (!mapping.detailPage) {
    return candidates;
  }

  const delayMs = mapping.detailPage.requestDelayMs ?? 0;
  const enriched: AffiliateCandidateInput[] = [];
  let fetchedDetailCount = 0;

  for (const candidate of candidates) {
    const detailUrl = nullableString(candidate[mapping.detailPage.urlField]);
    if (!detailUrl) {
      enriched.push(candidate);
      continue;
    }

    if (fetchedDetailCount > 0) {
      await sleep(delayMs);
    }

    try {
      const detailPage = await client.fetchPage({
        url: detailUrl,
        renderJavascript: mapping.detailPage.renderJavascript,
        waitMs: mapping.detailPage.waitMs,
      });
      fetchedDetailCount += 1;
      const detailValues = extractAffiliateFieldValuesFromPage(detailPage, mapping.detailPage.fields);
      const warnings = [...(candidate.warnings ?? [])];
      const nextCandidate: AffiliateCandidateInput = {
        ...candidate,
        rawPayload: {
          ...(candidate.rawPayload ?? {}),
          detailPage: {
            url: detailUrl,
            finalUrl: detailPage.finalUrl,
            statusCode: detailPage.statusCode,
            extractedFields: detailValues,
          },
        },
      };

      Object.entries(mapping.detailPage.fields).forEach(([fieldName, fieldMapping]) => {
        const value = nullableString(detailValues[fieldName]);
        if (!value) {
          if (fieldMapping.required) {
            warnings.push(`Missing required detail field: ${fieldName}`);
          }
          return;
        }
        (nextCandidate as Record<string, unknown>)[fieldName] = value;
      });
      nextCandidate.warnings = warnings;
      enriched.push(nextCandidate);
    } catch (error) {
      enriched.push({
        ...candidate,
        warnings: [
          ...(candidate.warnings ?? []),
          `Detail page fetch failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        ],
      });
    }
  }

  return enriched;
};

export const runAffiliateSourceScrape = async (
  sourceId: string,
  params: { requestedByUserId?: string | null; client?: ScrapePageClient } = {},
) => {
  const { sources, runs, candidates } = affiliatePrisma();
  const source = await sources.findUnique({ where: { id: sourceId } });
  if (!source) {
    throw new Error('Affiliate scrape source not found.');
  }

  const { row: mappingRow, mapping } = await resolveActiveMapping(source);
  if (mapping.kind === 'EVENT' || mapping.kind === 'TEAM') {
    await assertSourceOrganization(source);
  }
  const run = await runs.create({
    data: {
      id: createId(),
      sourceId,
      mappingId: mappingRow.id,
      requestedByUserId: params.requestedByUserId ?? null,
      status: 'RUNNING',
      fetchedUrl: mapping.listUrl,
    },
  });

  try {
    const client = params.client ?? scrapingDogClient;
    const page = await client.fetchPage({
      url: mapping.listUrl || source.listUrl,
      renderJavascript: mapping.renderJavascript,
      waitMs: mapping.waitMs,
    });
    const extractedListCandidates = extractAffiliateCandidatesFromPage(page, mapping);
    const extractedCandidates = await enrichCandidatesWithDetailPages(extractedListCandidates, mapping, client);
    const now = new Date();
    const rejectedCandidates: Array<{ title: string; reasons: string[] }> = [];
    const importableCandidates = extractedCandidates.filter((candidate) => {
      const reasons = candidateImportRejectionReasons(candidate, now);
      if (reasons.length) {
        rejectedCandidates.push({ title: candidate.title, reasons });
        return false;
      }
      return true;
    });
    const rejectionSummary = rejectedCandidates.reduce<Record<string, number>>((summary, candidate) => {
      candidate.reasons.forEach((reason) => {
        summary[reason] = (summary[reason] ?? 0) + 1;
      });
      return summary;
    }, {});
    const savedCandidates = [];
    let createdCandidateCount = 0;
    let updatedCandidateCount = 0;

    for (const candidate of importableCandidates) {
      const dedupeKey = buildAffiliateCandidateDedupeKey(sourceId, candidate, mapping);
      const existing = await candidates.findUnique({
        where: {
          sourceId_dedupeKey: {
            sourceId,
            dedupeKey,
          },
        },
      });
      const data = candidatePersistenceData({
        sourceId,
        runId: run.id,
        mappingId: mappingRow.id,
        dedupeKey,
        candidate,
      });

      const saved = existing
        ? await candidates.update({
            where: { id: existing.id },
            data: {
              ...data,
              publishedEventId: existing.publishedEventId ?? null,
              publishedTeamId: existing.publishedTeamId ?? null,
              publishedFacilityId: existing.publishedFacilityId ?? null,
              status: existing.status === 'PUBLISHED' ? 'PUBLISHED' : 'DISCOVERED',
            },
          })
        : await candidates.create({
            data: {
              id: createId(),
              ...data,
            },
          });
      if (candidate.listingKind === 'EVENT') {
        const event = await upsertAffiliateEventForCandidate(saved, source, {
          state: saved.status === 'PUBLISHED' ? 'PUBLISHED' : 'UNPUBLISHED',
        });
        const savedWithEvent = await candidates.update({
          where: { id: saved.id },
          data: { publishedEventId: event.id },
        });
        savedCandidates.push(savedWithEvent);
      } else if (candidate.listingKind === 'TEAM') {
        const team = await upsertAffiliateTeamForCandidate(saved, source, {
          visibility: saved.status === 'PUBLISHED' ? 'PUBLIC' : 'ADMIN_ONLY',
        });
        const savedWithTeam = await candidates.update({
          where: { id: saved.id },
          data: { publishedTeamId: team.id },
        });
        savedCandidates.push(savedWithTeam);
      } else if (candidate.listingKind === 'RENTAL' && nullableString(source.organizationId)) {
        const facility = await upsertAffiliateFacilityForCandidate(saved, source, {
          status: saved.status === 'PUBLISHED' ? 'ACTIVE' : 'DRAFT',
        });
        const savedWithFacility = await candidates.update({
          where: { id: saved.id },
          data: { publishedFacilityId: facility.id },
        });
        savedCandidates.push(savedWithFacility);
      } else {
        savedCandidates.push(saved);
      }
      if (existing) {
        updatedCandidateCount += 1;
      } else {
        createdCandidateCount += 1;
      }
    }

    const finishedRun = await runs.update({
      where: { id: run.id },
      data: {
        status: 'SUCCEEDED',
        finishedAt: new Date(),
        finalUrl: page.finalUrl,
        httpStatus: page.statusCode,
        itemCount: extractedCandidates.length,
        candidateCount: savedCandidates.length,
        logs: {
          createdCandidateCount,
          updatedCandidateCount,
          rejectedCount: rejectedCandidates.length,
          rejectionSummary,
          rejectedCandidates: rejectedCandidates.slice(0, 25),
        },
      },
    });
    await sources.update({
      where: { id: sourceId },
      data: {
        lastScrapeRunId: run.id,
        lastScrapedAt: new Date(),
      },
    });

    return {
      run: finishedRun,
      candidates: savedCandidates,
    };
  } catch (error) {
    await runs.update({
      where: { id: run.id },
      data: {
        status: 'FAILED',
        finishedAt: new Date(),
        errorMessage: error instanceof Error ? error.message : 'Scrape failed.',
      },
    });
    throw error;
  }
};

export const listAffiliateCandidates = async (params: { status?: string | null; sourceId?: string | null } = {}) => {
  const { candidates } = affiliatePrisma();
  const where: Record<string, unknown> = {};
  const status = nullableString(params.status);
  const sourceId = nullableString(params.sourceId);
  if (status) {
    where.status = status.toUpperCase();
  } else {
    where.NOT = { status: 'PUBLISHED' };
  }
  if (sourceId) where.sourceId = sourceId;

  return candidates.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    take: 100,
  });
};

export const getAffiliateCandidate = async (candidateId: string) => {
  const { candidates } = affiliatePrisma();
  return candidates.findUnique({ where: { id: candidateId } });
};

export const deleteAffiliateCandidate = async (candidateId: string) => {
  const { candidates, divisions, events, teams, facilities } = affiliatePrisma();
  const candidate = await candidates.findUnique({ where: { id: candidateId } });
  if (!candidate) {
    throw new Error('Affiliate import candidate not found.');
  }

  const eventId = nullableString(candidate.publishedEventId);
  if (eventId) {
    await divisions.deleteMany({ where: { eventId } });
    await events.deleteMany({ where: { id: eventId } });
  }

  const teamId = nullableString(candidate.publishedTeamId);
  if (teamId) {
    await teams.deleteMany({ where: { id: teamId } });
  }

  const facilityId = nullableString(candidate.publishedFacilityId);
  if (facilityId) {
    await facilities.deleteMany({ where: { id: facilityId } });
  }

  await candidates.delete({ where: { id: candidateId } });
  return candidate;
};

export const reclassifyAffiliateCandidate = async (
  candidateId: string,
  listingKind: unknown,
) => {
  const nextKind = normalizeListingKind(listingKind);
  const { candidates, divisions, events, teams, facilities, sources } = affiliatePrisma();
  const candidate = await candidates.findUnique({ where: { id: candidateId } });
  if (!candidate) {
    throw new Error('Affiliate import candidate not found.');
  }
  const source = await sources.findUnique({ where: { id: candidate.sourceId } });
  if (!source) {
    throw new Error('Affiliate scrape source not found.');
  }

  const nextCandidate = {
    ...candidate,
    listingKind: nextKind,
  };
  const deleteReplacedTargets = async () => {
    if (nextKind !== 'EVENT') {
      const eventId = nullableString(candidate.publishedEventId);
      if (eventId) {
        await divisions.deleteMany({ where: { eventId } });
        await events.deleteMany({ where: { id: eventId } });
      }
    }
    if (nextKind !== 'TEAM') {
      const teamId = nullableString(candidate.publishedTeamId);
      if (teamId) {
        await teams.deleteMany({ where: { id: teamId } });
      }
    }
    if (nextKind !== 'RENTAL') {
      const facilityId = nullableString(candidate.publishedFacilityId);
      if (facilityId) {
        await facilities.deleteMany({ where: { id: facilityId } });
      }
    }
  };

  if (nextKind === 'EVENT') {
    const event = await upsertAffiliateEventForCandidate(nextCandidate, source, {
      state: candidate.status === 'PUBLISHED' ? 'PUBLISHED' : 'UNPUBLISHED',
    });
    await deleteReplacedTargets();
    const updatedCandidate = await candidates.update({
      where: { id: candidateId },
      data: {
        listingKind: nextKind,
        publishedEventId: event.id,
        publishedTeamId: null,
        publishedFacilityId: null,
      },
    });
    return { candidate: updatedCandidate, target: event };
  }

  if (nextKind === 'TEAM') {
    const team = await upsertAffiliateTeamForCandidate(nextCandidate, source, {
      visibility: candidate.status === 'PUBLISHED' ? 'PUBLIC' : 'ADMIN_ONLY',
    });
    await deleteReplacedTargets();
    const updatedCandidate = await candidates.update({
      where: { id: candidateId },
      data: {
        listingKind: nextKind,
        publishedEventId: null,
        publishedTeamId: team.id,
        publishedFacilityId: null,
      },
    });
    return { candidate: updatedCandidate, target: team };
  }

  const facility = await upsertAffiliateFacilityForCandidate(nextCandidate, source, {
    status: candidate.status === 'PUBLISHED' ? 'ACTIVE' : 'DRAFT',
  });
  await deleteReplacedTargets();
  const updatedCandidate = await candidates.update({
    where: { id: candidateId },
    data: {
      listingKind: nextKind,
      publishedEventId: null,
      publishedTeamId: null,
      publishedFacilityId: facility.id,
    },
  });
  return { candidate: updatedCandidate, target: facility };
};

export const publishAffiliateCandidate = async (
  candidateId: string,
  _params: { publishedByUserId?: string | null } = {},
) => {
  const { candidates, sources } = affiliatePrisma();
  const candidate = await candidates.findUnique({ where: { id: candidateId } });
  if (!candidate) {
    throw new Error('Affiliate import candidate not found.');
  }

  if (normalizeSourceType(candidate.listingKind) === 'EVENT') {
    const source = await sources.findUnique({ where: { id: candidate.sourceId } });
    if (!source) {
      throw new Error('Affiliate scrape source not found.');
    }
    const event = await upsertAffiliateEventForCandidate(candidate, source, { state: 'PUBLISHED' });
    await candidates.update({
      where: { id: candidateId },
      data: {
        status: 'PUBLISHED',
        publishedEventId: event.id,
      },
    });
    return event;
  }

  if (normalizeSourceType(candidate.listingKind) === 'TEAM') {
    const source = await sources.findUnique({ where: { id: candidate.sourceId } });
    if (!source) {
      throw new Error('Affiliate scrape source not found.');
    }
    const team = await upsertAffiliateTeamForCandidate(candidate, source, { visibility: 'PUBLIC' });
    await candidates.update({
      where: { id: candidateId },
      data: {
        status: 'PUBLISHED',
        publishedTeamId: team.id,
      },
    });
    return team;
  }

  const source = await sources.findUnique({ where: { id: candidate.sourceId } });
  if (normalizeSourceType(candidate.listingKind) === 'RENTAL') {
    if (!source) {
      throw new Error('Affiliate scrape source not found.');
    }
    const facility = await upsertAffiliateFacilityForCandidate(candidate, source, { status: 'ACTIVE' });
    await candidates.update({
      where: { id: candidateId },
      data: {
        status: 'PUBLISHED',
        publishedFacilityId: facility.id,
      },
    });
    return facility;
  }

  throw new Error('Affiliate listing kind must be EVENT, TEAM, or RENTAL.');
};
