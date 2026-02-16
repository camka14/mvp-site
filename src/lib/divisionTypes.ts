import { calculateAgeOnDate } from '@/lib/age';

export type DivisionGender = 'M' | 'F' | 'C';
export type DivisionRatingType = 'AGE' | 'SKILL';

export type DivisionAgeRuleKind = 'UNDER_OR_EQUAL' | 'MINIMUM' | 'EXACT';

export type DivisionAgeBracket = {
  kind: DivisionAgeRuleKind;
  age: number;
  label: string;
};

export type SportAgeCutoffRule = {
  sportKey: string;
  month: number;
  day: number;
  yearOffset: number;
  label: string;
  source: string;
};

export type DivisionTypeOption = {
  id: string;
  name: string;
  ratingType: DivisionRatingType;
  sportKey: string;
};

type DivisionTypeSeed = Omit<DivisionTypeOption, 'sportKey'>;

type SportDivisionTypeCatalog = {
  sportKey: string;
  aliases: string[];
  options: DivisionTypeSeed[];
};

type SportCutoffCatalog = {
  sportKey: string;
  aliases: string[];
  rule: Omit<SportAgeCutoffRule, 'sportKey'>;
};

const GENERIC_SPORT_KEY = 'generic';

const DEFAULT_SPORT_AGE_CUTOFF: SportAgeCutoffRule = {
  sportKey: GENERIC_SPORT_KEY,
  month: 12,
  day: 31,
  yearOffset: 0,
  label: 'December 31',
  source: 'Fallback calendar-year cutoff (no governing-body-specific youth cutoff configured).',
};

// Governing-body references used for age cutoffs:
// - US Youth Soccer (age groups currently aligned to Aug 1 through Jul 31 seasonal year)
// - USA Volleyball junior age definition (July 1 cutoff)
// - USA Hockey age classes (birth-year classifications by season)
// - Little League Baseball and Softball age determination dates
// - USA Pickleball age policy (Dec 31)
// - USTA leagues (age as of Dec 31)
// - AAU basketball age chart (Aug 31)
const SPORT_AGE_CUTOFFS: SportCutoffCatalog[] = [
  {
    sportKey: 'soccer',
    aliases: ['soccer', 'futbol', 'football'],
    rule: {
      month: 8,
      day: 1,
      yearOffset: 0,
      label: 'August 1',
      source: 'US Youth Soccer seasonal-year age grouping guidance.',
    },
  },
  {
    sportKey: 'volleyball',
    aliases: ['volleyball', 'vb'],
    rule: {
      month: 7,
      day: 1,
      yearOffset: 0,
      label: 'July 1',
      source: 'USA Volleyball junior player age definition.',
    },
  },
  {
    sportKey: 'hockey',
    aliases: ['hockey', 'ice hockey'],
    rule: {
      month: 12,
      day: 31,
      yearOffset: 0,
      label: 'December 31',
      source: 'USA Hockey birth-year age classifications.',
    },
  },
  {
    sportKey: 'baseball',
    aliases: ['baseball'],
    rule: {
      month: 8,
      day: 31,
      yearOffset: 0,
      label: 'August 31',
      source: 'Little League Baseball age determination date.',
    },
  },
  {
    sportKey: 'softball',
    aliases: ['softball'],
    rule: {
      month: 12,
      day: 31,
      yearOffset: -1,
      label: 'December 31 (previous year)',
      source: 'Little League Softball age determination date.',
    },
  },
  {
    sportKey: 'pickleball',
    aliases: ['pickleball'],
    rule: {
      month: 12,
      day: 31,
      yearOffset: 0,
      label: 'December 31',
      source: 'USA Pickleball age policy.',
    },
  },
  {
    sportKey: 'tennis',
    aliases: ['tennis'],
    rule: {
      month: 12,
      day: 31,
      yearOffset: 0,
      label: 'December 31',
      source: 'USTA league age eligibility guidance.',
    },
  },
  {
    sportKey: 'basketball',
    aliases: ['basketball', 'hoops'],
    rule: {
      month: 8,
      day: 31,
      yearOffset: 0,
      label: 'August 31',
      source: 'AAU basketball age chart guidance.',
    },
  },
];

const GENERIC_DIVISION_TYPES: DivisionTypeSeed[] = [
  { id: 'u10', name: 'U10', ratingType: 'AGE' },
  { id: 'u11', name: 'U11', ratingType: 'AGE' },
  { id: 'u12', name: 'U12', ratingType: 'AGE' },
  { id: 'u13', name: 'U13', ratingType: 'AGE' },
  { id: 'u14', name: 'U14', ratingType: 'AGE' },
  { id: 'u15', name: 'U15', ratingType: 'AGE' },
  { id: 'u16', name: 'U16', ratingType: 'AGE' },
  { id: 'u17', name: 'U17', ratingType: 'AGE' },
  { id: 'u18', name: 'U18', ratingType: 'AGE' },
  { id: 'beginner', name: 'Beginner', ratingType: 'SKILL' },
  { id: 'intermediate', name: 'Intermediate', ratingType: 'SKILL' },
  { id: 'advanced', name: 'Advanced', ratingType: 'SKILL' },
  { id: 'open', name: 'Open', ratingType: 'SKILL' },
];

// Sources used when assembling the defaults:
// - US Youth Soccer (U6-U19 age group format)
// - USA Volleyball (Open/AA/A/BB/B + youth age groups)
// - USA Hockey (8U-19U/13O/15O classifications)
// - Little League Baseball (Tee Ball through Senior League)
// - USA Pickleball sanctioned formats (age+skill brackets)
// - USTA NTRP league levels
const SPORT_DIVISION_TYPES: SportDivisionTypeCatalog[] = [
  {
    sportKey: 'soccer',
    aliases: ['soccer', 'futbol', 'football'],
    options: [
      { id: 'u6', name: 'U6', ratingType: 'AGE' },
      { id: 'u7', name: 'U7', ratingType: 'AGE' },
      { id: 'u8', name: 'U8', ratingType: 'AGE' },
      { id: 'u9', name: 'U9', ratingType: 'AGE' },
      { id: 'u10', name: 'U10', ratingType: 'AGE' },
      { id: 'u11', name: 'U11', ratingType: 'AGE' },
      { id: 'u12', name: 'U12', ratingType: 'AGE' },
      { id: 'u13', name: 'U13', ratingType: 'AGE' },
      { id: 'u14', name: 'U14', ratingType: 'AGE' },
      { id: 'u15', name: 'U15', ratingType: 'AGE' },
      { id: 'u16', name: 'U16', ratingType: 'AGE' },
      { id: 'u17', name: 'U17', ratingType: 'AGE' },
      { id: 'u18', name: 'U18', ratingType: 'AGE' },
      { id: 'u19', name: 'U19', ratingType: 'AGE' },
      { id: 'rec', name: 'Recreational', ratingType: 'SKILL' },
      { id: 'premier', name: 'Premier', ratingType: 'SKILL' },
      { id: 'open', name: 'Open', ratingType: 'SKILL' },
    ],
  },
  {
    sportKey: 'volleyball',
    aliases: ['volleyball', 'vb'],
    options: [
      { id: '12u', name: '12U', ratingType: 'AGE' },
      { id: '13u', name: '13U', ratingType: 'AGE' },
      { id: '14u', name: '14U', ratingType: 'AGE' },
      { id: '15u', name: '15U', ratingType: 'AGE' },
      { id: '16u', name: '16U', ratingType: 'AGE' },
      { id: '17u', name: '17U', ratingType: 'AGE' },
      { id: '18u', name: '18U', ratingType: 'AGE' },
      { id: 'open', name: 'Open', ratingType: 'SKILL' },
      { id: 'aa', name: 'AA', ratingType: 'SKILL' },
      { id: 'a', name: 'A', ratingType: 'SKILL' },
      { id: 'bb', name: 'BB', ratingType: 'SKILL' },
      { id: 'b', name: 'B', ratingType: 'SKILL' },
      { id: 'c', name: 'C', ratingType: 'SKILL' },
    ],
  },
  {
    sportKey: 'hockey',
    aliases: ['hockey', 'ice hockey'],
    options: [
      { id: '8u', name: '8U', ratingType: 'AGE' },
      { id: '9u', name: '9U', ratingType: 'AGE' },
      { id: '10u', name: '10U', ratingType: 'AGE' },
      { id: '11u', name: '11U', ratingType: 'AGE' },
      { id: '12u', name: '12U', ratingType: 'AGE' },
      { id: '13u', name: '13U', ratingType: 'AGE' },
      { id: '13o', name: '13O', ratingType: 'AGE' },
      { id: '14u', name: '14U', ratingType: 'AGE' },
      { id: '15u', name: '15U', ratingType: 'AGE' },
      { id: '15o', name: '15O', ratingType: 'AGE' },
      { id: '16u', name: '16U', ratingType: 'AGE' },
      { id: '17u', name: '17U', ratingType: 'AGE' },
      { id: '18u', name: '18U', ratingType: 'AGE' },
      { id: '19u', name: '19U', ratingType: 'AGE' },
      { id: 'aaa', name: 'AAA', ratingType: 'SKILL' },
      { id: 'aa', name: 'AA', ratingType: 'SKILL' },
      { id: 'a', name: 'A', ratingType: 'SKILL' },
      { id: 'b', name: 'B', ratingType: 'SKILL' },
      { id: 'c', name: 'C', ratingType: 'SKILL' },
    ],
  },
  {
    sportKey: 'baseball',
    aliases: ['baseball'],
    options: [
      { id: 'tee_ball', name: 'Tee Ball', ratingType: 'AGE' },
      { id: 'minor', name: 'Minor League', ratingType: 'AGE' },
      { id: 'major', name: 'Major Division', ratingType: 'AGE' },
      { id: 'intermediate', name: 'Intermediate (50/70)', ratingType: 'AGE' },
      { id: 'junior', name: 'Junior League', ratingType: 'AGE' },
      { id: 'senior', name: 'Senior League', ratingType: 'AGE' },
      { id: 'aaa', name: 'AAA', ratingType: 'SKILL' },
      { id: 'aa', name: 'AA', ratingType: 'SKILL' },
      { id: 'a', name: 'A', ratingType: 'SKILL' },
      { id: 'open', name: 'Open', ratingType: 'SKILL' },
    ],
  },
  {
    sportKey: 'softball',
    aliases: ['softball'],
    options: [
      { id: '10u', name: '10U', ratingType: 'AGE' },
      { id: '11u', name: '11U', ratingType: 'AGE' },
      { id: '12u', name: '12U', ratingType: 'AGE' },
      { id: '13u', name: '13U', ratingType: 'AGE' },
      { id: '14u', name: '14U', ratingType: 'AGE' },
      { id: '15u', name: '15U', ratingType: 'AGE' },
      { id: '16u', name: '16U', ratingType: 'AGE' },
      { id: '17u', name: '17U', ratingType: 'AGE' },
      { id: '18u', name: '18U', ratingType: 'AGE' },
      { id: 'a', name: 'A', ratingType: 'SKILL' },
      { id: 'aa', name: 'AA', ratingType: 'SKILL' },
      { id: 'b', name: 'B', ratingType: 'SKILL' },
      { id: 'open', name: 'Open', ratingType: 'SKILL' },
    ],
  },
  {
    sportKey: 'pickleball',
    aliases: ['pickleball'],
    options: [
      { id: '12u', name: '12U', ratingType: 'AGE' },
      { id: '13u', name: '13U', ratingType: 'AGE' },
      { id: '14u', name: '14U', ratingType: 'AGE' },
      { id: '15u', name: '15U', ratingType: 'AGE' },
      { id: '17u', name: '17U', ratingType: 'AGE' },
      { id: '18u', name: '18U', ratingType: 'AGE' },
      { id: '19plus', name: '19+', ratingType: 'AGE' },
      { id: '30plus', name: '30+', ratingType: 'AGE' },
      { id: '40plus', name: '40+', ratingType: 'AGE' },
      { id: '50plus', name: '50+', ratingType: 'AGE' },
      { id: '55plus', name: '55+', ratingType: 'AGE' },
      { id: '60plus', name: '60+', ratingType: 'AGE' },
      { id: '65plus', name: '65+', ratingType: 'AGE' },
      { id: '70plus', name: '70+', ratingType: 'AGE' },
      { id: '75plus', name: '75+', ratingType: 'AGE' },
      { id: '80plus', name: '80+', ratingType: 'AGE' },
      { id: '3_0', name: '3.0', ratingType: 'SKILL' },
      { id: '3_5', name: '3.5', ratingType: 'SKILL' },
      { id: '4_0', name: '4.0', ratingType: 'SKILL' },
      { id: '4_5', name: '4.5', ratingType: 'SKILL' },
      { id: '5_0', name: '5.0', ratingType: 'SKILL' },
      { id: 'open', name: 'Open', ratingType: 'SKILL' },
    ],
  },
  {
    sportKey: 'tennis',
    aliases: ['tennis'],
    options: [
      { id: '18plus', name: '18+', ratingType: 'AGE' },
      { id: '40plus', name: '40+', ratingType: 'AGE' },
      { id: '55plus', name: '55+', ratingType: 'AGE' },
      { id: '2_5', name: '2.5', ratingType: 'SKILL' },
      { id: '3_0', name: '3.0', ratingType: 'SKILL' },
      { id: '3_5', name: '3.5', ratingType: 'SKILL' },
      { id: '4_0', name: '4.0', ratingType: 'SKILL' },
      { id: '4_5', name: '4.5', ratingType: 'SKILL' },
      { id: '5_0', name: '5.0', ratingType: 'SKILL' },
      { id: 'open', name: 'Open', ratingType: 'SKILL' },
    ],
  },
  {
    sportKey: 'basketball',
    aliases: ['basketball', 'hoops'],
    options: [
      { id: 'u10', name: 'U10', ratingType: 'AGE' },
      { id: 'u11', name: 'U11', ratingType: 'AGE' },
      { id: 'u12', name: 'U12', ratingType: 'AGE' },
      { id: 'u13', name: 'U13', ratingType: 'AGE' },
      { id: 'u14', name: 'U14', ratingType: 'AGE' },
      { id: 'u15', name: 'U15', ratingType: 'AGE' },
      { id: 'u16', name: 'U16', ratingType: 'AGE' },
      { id: 'u17', name: 'U17', ratingType: 'AGE' },
      { id: 'u18', name: 'U18', ratingType: 'AGE' },
      { id: 'u19', name: 'U19', ratingType: 'AGE' },
      { id: 'rec', name: 'Recreational', ratingType: 'SKILL' },
      { id: 'c', name: 'C', ratingType: 'SKILL' },
      { id: 'b', name: 'B', ratingType: 'SKILL' },
      { id: 'a', name: 'A', ratingType: 'SKILL' },
      { id: 'aa', name: 'AA', ratingType: 'SKILL' },
      { id: 'aaa', name: 'AAA', ratingType: 'SKILL' },
      { id: 'open', name: 'Open', ratingType: 'SKILL' },
    ],
  },
];

const sanitizeTokenPart = (value: string): string => value
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '');

export const normalizeDivisionIdToken = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return normalized.length ? normalized : null;
};

const normalizeSportValue = (sportInput?: string | null): string => {
  if (!sportInput) return '';
  return sportInput.trim().toLowerCase();
};

const buildCatalogOptions = (
  sportKey: string,
  options: DivisionTypeSeed[],
): DivisionTypeOption[] => options.map((option) => ({
  ...option,
  id: sanitizeTokenPart(option.id),
  sportKey,
}));

const uniqueOptions = (options: DivisionTypeOption[]): DivisionTypeOption[] => {
  const seen = new Set<string>();
  const result: DivisionTypeOption[] = [];
  for (const option of options) {
    const key = `${option.ratingType}:${option.id}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(option);
  }
  return result;
};

const findCatalogForSport = (sportInput?: string | null): SportDivisionTypeCatalog | null => {
  const normalizedSport = normalizeSportValue(sportInput);
  if (!normalizedSport) {
    return null;
  }
  return SPORT_DIVISION_TYPES.find((entry) =>
    entry.aliases.some((alias) =>
      normalizedSport.includes(alias) || alias.includes(normalizedSport),
    ),
  ) ?? null;
};

export const getDivisionTypeOptionsForSport = (sportInput?: string | null): DivisionTypeOption[] => {
  const catalog = findCatalogForSport(sportInput);
  const base = catalog
    ? buildCatalogOptions(catalog.sportKey, catalog.options)
    : buildCatalogOptions(GENERIC_SPORT_KEY, GENERIC_DIVISION_TYPES);
  return uniqueOptions(base);
};

const findCutoffRuleForSport = (sportInput?: string | null): SportAgeCutoffRule => {
  const normalizedSport = normalizeSportValue(sportInput);
  if (!normalizedSport) {
    return DEFAULT_SPORT_AGE_CUTOFF;
  }
  const matched = SPORT_AGE_CUTOFFS.find((entry) =>
    entry.aliases.some((alias) =>
      normalizedSport.includes(alias) || alias.includes(normalizedSport),
    ),
  );
  if (!matched) {
    return DEFAULT_SPORT_AGE_CUTOFF;
  }
  return {
    sportKey: matched.sportKey,
    ...matched.rule,
  };
};

const resolveReferenceYear = (referenceDate?: Date | null): number => {
  if (referenceDate instanceof Date && !Number.isNaN(referenceDate.getTime())) {
    return referenceDate.getUTCFullYear();
  }
  return new Date().getUTCFullYear();
};

export const getSportAgeCutoffRule = (sportInput?: string | null): SportAgeCutoffRule => (
  findCutoffRuleForSport(sportInput)
);

export const getSportAgeCutoffDate = (params: {
  sportInput?: string | null;
  referenceDate?: Date | null;
}): Date => {
  const rule = findCutoffRuleForSport(params.sportInput);
  const referenceYear = resolveReferenceYear(params.referenceDate);
  const year = referenceYear + rule.yearOffset;
  return new Date(Date.UTC(year, rule.month - 1, rule.day, 12, 0, 0, 0));
};

export const parseDivisionAgeBracket = (divisionTypeId: string): DivisionAgeBracket | null => {
  const normalized = sanitizeTokenPart(divisionTypeId);
  if (!normalized.length) {
    return null;
  }

  const underMatch = normalized.match(/^u(\d+)$/) ?? normalized.match(/^(\d+)u$/);
  if (underMatch) {
    const age = Number(underMatch[1]);
    if (Number.isInteger(age) && age >= 0) {
      return {
        kind: 'UNDER_OR_EQUAL',
        age,
        label: `U${age}`,
      };
    }
  }

  const plusMatch = normalized.match(/^(\d+)plus$/);
  if (plusMatch) {
    const age = Number(plusMatch[1]);
    if (Number.isInteger(age) && age >= 0) {
      return {
        kind: 'MINIMUM',
        age,
        label: `${age}+`,
      };
    }
  }

  const exactMatch = normalized.match(/^(\d+)o$/);
  if (exactMatch) {
    const age = Number(exactMatch[1]);
    if (Number.isInteger(age) && age >= 0) {
      return {
        kind: 'EXACT',
        age,
        label: `${age}O`,
      };
    }
  }

  return null;
};

const isAgeEligibleForBracket = (age: number, bracket: DivisionAgeBracket): boolean => {
  if (bracket.kind === 'UNDER_OR_EQUAL') {
    return age <= bracket.age;
  }
  if (bracket.kind === 'MINIMUM') {
    return age >= bracket.age;
  }
  return age === bracket.age;
};

export const describeDivisionAgeBracket = (params: {
  divisionTypeId: string;
  sportInput?: string | null;
  referenceDate?: Date | null;
}): string | null => {
  const bracket = parseDivisionAgeBracket(params.divisionTypeId);
  if (!bracket) {
    return null;
  }
  const cutoffDate = getSportAgeCutoffDate({
    sportInput: params.sportInput,
    referenceDate: params.referenceDate,
  });
  const cutoffLabel = cutoffDate.toLocaleDateString('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  if (bracket.kind === 'UNDER_OR_EQUAL') {
    return `Age ${bracket.age} or younger as of ${cutoffLabel}`;
  }
  if (bracket.kind === 'MINIMUM') {
    return `Age ${bracket.age}+ as of ${cutoffLabel}`;
  }
  return `Must be age ${bracket.age} on ${cutoffLabel}`;
};

export const evaluateDivisionAgeEligibility = (params: {
  dateOfBirth?: Date | null;
  divisionTypeId: string;
  sportInput?: string | null;
  referenceDate?: Date | null;
}): {
  applies: boolean;
  bracket: DivisionAgeBracket | null;
  cutoffDate: Date;
  cutoffRule: SportAgeCutoffRule;
  ageAtCutoff: number | null;
  eligible: boolean | null;
  message: string | null;
} => {
  const cutoffRule = findCutoffRuleForSport(params.sportInput);
  const cutoffDate = getSportAgeCutoffDate({
    sportInput: params.sportInput,
    referenceDate: params.referenceDate,
  });
  const bracket = parseDivisionAgeBracket(params.divisionTypeId);
  if (!bracket) {
    return {
      applies: false,
      bracket: null,
      cutoffDate,
      cutoffRule,
      ageAtCutoff: null,
      eligible: null,
      message: null,
    };
  }

  const message = describeDivisionAgeBracket({
    divisionTypeId: params.divisionTypeId,
    sportInput: params.sportInput,
    referenceDate: params.referenceDate,
  });

  if (!(params.dateOfBirth instanceof Date) || Number.isNaN(params.dateOfBirth.getTime())) {
    return {
      applies: true,
      bracket,
      cutoffDate,
      cutoffRule,
      ageAtCutoff: null,
      eligible: null,
      message,
    };
  }

  const ageAtCutoff = calculateAgeOnDate(params.dateOfBirth, cutoffDate);
  if (!Number.isFinite(ageAtCutoff)) {
    return {
      applies: true,
      bracket,
      cutoffDate,
      cutoffRule,
      ageAtCutoff: null,
      eligible: null,
      message,
    };
  }

  return {
    applies: true,
    bracket,
    cutoffDate,
    cutoffRule,
    ageAtCutoff,
    eligible: isAgeEligibleForBracket(ageAtCutoff, bracket),
    message,
  };
};

const humanizeToken = (value: string): string => {
  const normalized = sanitizeTokenPart(value);
  if (!normalized.length) return 'Open';
  if (/^\d+_\d+$/.test(normalized)) {
    return normalized.replace('_', '.');
  }
  if (/^\d+plus$/.test(normalized)) {
    return `${normalized.replace('plus', '')}+`;
  }
  if (/^\d+u$/.test(normalized)) {
    return `${normalized.slice(0, -1)}U`;
  }
  if (/^u\d+$/.test(normalized)) {
    return normalized.toUpperCase();
  }
  if (/^\d+[of]$/.test(normalized)) {
    return normalized.toUpperCase();
  }
  return normalized
    .split('_')
    .map((chunk) => (chunk.length <= 3 ? chunk.toUpperCase() : chunk.charAt(0).toUpperCase() + chunk.slice(1)))
    .join(' ');
};

export const getDivisionTypeById = (
  sportInput: string | null | undefined,
  divisionTypeId: string,
  ratingType?: DivisionRatingType | null,
): DivisionTypeOption | null => {
  const normalized = sanitizeTokenPart(divisionTypeId);
  if (!normalized.length) {
    return null;
  }
  const options = getDivisionTypeOptionsForSport(sportInput);
  return options.find((option) =>
    option.id === normalized && (!ratingType || option.ratingType === ratingType),
  ) ?? null;
};

export const normalizeDivisionGender = (value: unknown): DivisionGender | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase();
  if (normalized === 'M' || normalized === 'MEN' || normalized === 'MALE') return 'M';
  if (normalized === 'F' || normalized === 'WOMEN' || normalized === 'FEMALE') return 'F';
  if (normalized === 'C' || normalized === 'COED' || normalized === 'CO-ED' || normalized === 'COED') return 'C';
  return null;
};

export const normalizeDivisionRatingType = (value: unknown): DivisionRatingType | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase();
  if (normalized === 'AGE' || normalized === 'AGE_BASED' || normalized === 'AGE-BASED') return 'AGE';
  if (normalized === 'SKILL' || normalized === 'SKILL_BASED' || normalized === 'SKILL-BASED') return 'SKILL';
  return null;
};

const inferRatingTypeFromTypeId = (divisionTypeId: string): DivisionRatingType => {
  const normalized = sanitizeTokenPart(divisionTypeId);
  if (
    /^u\d+$/.test(normalized)
    || /^\d+u$/.test(normalized)
    || /^\d+plus$/.test(normalized)
    || normalized === 'tee_ball'
    || normalized === 'minor'
    || normalized === 'major'
    || normalized === 'intermediate'
    || normalized === 'junior'
    || normalized === 'senior'
    || normalized === '13o'
    || normalized === '15o'
  ) {
    return 'AGE';
  }
  return 'SKILL';
};

export const getDivisionGenderLabel = (gender: DivisionGender): string => {
  if (gender === 'M') return 'Mens';
  if (gender === 'F') return 'Womens';
  return 'CoEd';
};

export const buildDivisionName = (params: {
  gender: DivisionGender;
  divisionTypeName: string;
}): string => `${getDivisionGenderLabel(params.gender)} ${params.divisionTypeName}`.trim();

export const buildDivisionToken = (params: {
  gender: DivisionGender;
  ratingType: DivisionRatingType;
  divisionTypeId: string;
}): string => {
  const divisionTypeId = sanitizeTokenPart(params.divisionTypeId);
  if (!divisionTypeId.length) {
    return `${params.gender.toLowerCase()}_${params.ratingType.toLowerCase()}_open`;
  }
  return `${params.gender.toLowerCase()}_${params.ratingType.toLowerCase()}_${divisionTypeId}`;
};

export const parseDivisionToken = (
  token: unknown,
): { gender: DivisionGender; ratingType: DivisionRatingType; divisionTypeId: string } | null => {
  if (typeof token !== 'string') {
    return null;
  }
  const normalized = sanitizeTokenPart(token);
  const match = normalized.match(/^(m|f|c)_(age|skill)_([a-z0-9_]+)$/);
  if (!match) {
    return null;
  }
  const [, genderRaw, ratingRaw, typeId] = match;
  const gender = normalizeDivisionGender(genderRaw);
  const ratingType = normalizeDivisionRatingType(ratingRaw);
  if (!gender || !ratingType || !typeId.length) {
    return null;
  }
  return { gender, ratingType, divisionTypeId: typeId };
};

export const extractDivisionTokenFromId = (value: unknown): string | null => {
  const normalized = normalizeDivisionIdToken(value);
  if (!normalized) return null;
  const marker = '__division__';
  const markerIndex = normalized.lastIndexOf(marker);
  if (markerIndex >= 0) {
    const token = normalized.slice(markerIndex + marker.length);
    return token.length ? sanitizeTokenPart(token) : null;
  }
  return sanitizeTokenPart(normalized);
};

export const buildEventDivisionId = (eventId: string, token: string): string => {
  const normalizedEventId = (eventId || 'event')
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_') || 'event';
  const normalizedToken = sanitizeTokenPart(token || 'c_skill_open');
  return `${normalizedEventId}__division__${normalizedToken}`;
};

export const inferDivisionDetails = (params: {
  identifier: string;
  sportInput?: string | null;
  fallbackName?: string | null;
}): {
  id: string;
  token: string;
  gender: DivisionGender;
  ratingType: DivisionRatingType;
  divisionTypeId: string;
  divisionTypeName: string;
  defaultName: string;
} => {
  const id = normalizeDivisionIdToken(params.identifier) ?? sanitizeTokenPart(params.identifier);
  const token = extractDivisionTokenFromId(id) ?? 'c_skill_open';
  const parsed = parseDivisionToken(token);

  const divisionTypeId = parsed?.divisionTypeId ?? token;
  const ratingType = parsed?.ratingType ?? inferRatingTypeFromTypeId(divisionTypeId);
  const gender = parsed?.gender ?? 'C';
  const knownType = getDivisionTypeById(params.sportInput ?? null, divisionTypeId, ratingType);
  const divisionTypeName = knownType?.name ?? humanizeToken(divisionTypeId);
  const defaultName = buildDivisionName({
    gender,
    divisionTypeName,
  });

  return {
    id,
    token,
    gender,
    ratingType,
    divisionTypeId,
    divisionTypeName,
    defaultName: params.fallbackName?.trim().length ? params.fallbackName : defaultName,
  };
};
