import { DEFAULT_SPORTS } from '@/server/defaultSports';

const canonicalSportNames = Array.from(new Set(
  DEFAULT_SPORTS
    .map((sport) => (typeof sport.name === 'string' ? sport.name.trim() : ''))
    .filter(Boolean),
));

const canonicalSportNameSet = new Set(canonicalSportNames);
const canonicalSportNamesByLowercase = new Map(
  canonicalSportNames.map((name) => [name.toLowerCase(), name]),
);

export type AffiliateAgentSportIssue = {
  path: string;
  sportName: string | null;
  canonicalSuggestion: string | null;
  code: 'SPORT_NAME_REQUIRED' | 'SPORT_NAME_NOT_CANONICAL' | 'SPORT_NOT_IN_CATALOG';
  message: string;
};

const normalizedString = (value: unknown): string | null => (
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
);

export const affiliateAgentCanonicalSportNames = (): string[] => [...canonicalSportNames].sort();

export const validateAffiliateAgentSportName = (
  value: unknown,
  path: string,
): AffiliateAgentSportIssue | null => {
  const sportName = normalizedString(value);
  if (!sportName) {
    return {
      path,
      sportName: null,
      canonicalSuggestion: null,
      code: 'SPORT_NAME_REQUIRED',
      message: 'Executable affiliate mappings require an exact canonical sport name.',
    };
  }
  if (canonicalSportNameSet.has(sportName)) return null;

  const canonicalSuggestion = canonicalSportNamesByLowercase.get(sportName.toLowerCase()) ?? null;
  if (canonicalSuggestion) {
    return {
      path,
      sportName,
      canonicalSuggestion,
      code: 'SPORT_NAME_NOT_CANONICAL',
      message: `Use the exact canonical sport name ${canonicalSuggestion}.`,
    };
  }

  return {
    path,
    sportName,
    canonicalSuggestion: null,
    code: 'SPORT_NOT_IN_CATALOG',
    message: `The sport ${sportName} is not in the BracketIQ sports catalog. Send it to human review; do not guess a surface or replacement sport.`,
  };
};

export const collectAffiliateAgentSportIssues = (draft: any): AffiliateAgentSportIssue[] => {
  const executable = draft?.implementationMode === 'GENERIC_MAPPING'
    || draft?.implementationMode === 'MANUAL_CANDIDATES';
  if (!executable) return [];

  const issues: AffiliateAgentSportIssue[] = [];
  const expectedCandidates = Array.isArray(draft?.expectedCandidates)
    ? draft.expectedCandidates
    : [];
  expectedCandidates.forEach((candidate: any, index: number) => {
    const issue = validateAffiliateAgentSportName(
      candidate?.sportName,
      `expectedCandidates.${index}.sportName`,
    );
    if (issue) issues.push(issue);
  });

  const manualCandidates = Array.isArray(draft?.mapping?.manualCandidates)
    ? draft.mapping.manualCandidates
    : [];
  manualCandidates.forEach((candidate: any, index: number) => {
    const issue = validateAffiliateAgentSportName(
      candidate?.sportName,
      `mapping.manualCandidates.${index}.sportName`,
    );
    if (issue) issues.push(issue);
  });

  const sportField = draft?.mapping?.fields?.sportName;
  if (sportField?.mode === 'literal') {
    const issue = validateAffiliateAgentSportName(sportField.value, 'mapping.fields.sportName.value');
    if (issue) issues.push(issue);
  }
  if (sportField?.valueMap && typeof sportField.valueMap === 'object') {
    Object.entries(sportField.valueMap).forEach(([sourceValue, mappedValue]) => {
      const issue = validateAffiliateAgentSportName(
        mappedValue,
        `mapping.fields.sportName.valueMap.${sourceValue}`,
      );
      if (issue) issues.push(issue);
    });
  }

  return issues;
};
