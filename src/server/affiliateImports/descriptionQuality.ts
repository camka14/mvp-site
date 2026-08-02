export type AffiliateDescriptionEntityKind = 'EVENT' | 'ORGANIZATION';

export type AffiliateDescriptionQualityIssue = {
  code: 'MISSING_DESCRIPTION' | 'DISCOVERY_NARRATION' | 'TITLE_RESTATEMENT';
  message: string;
};

const discoveryNarrationPatterns = [
  /\b(?:is|was|are|were)\s+listed\s+(?:by|on|at)\b/i,
  /\blisted\s+(?:by|on|at)\b/i,
  /\b(?:is|was|are|were)\s+(?:shown|found|published|posted)\s+(?:by|on|at)\b/i,
  /\baccording\s+to\s+(?:the\s+)?(?:website|site|source|listing|page)\b/i,
  /\b(?:the\s+)?(?:website|site|source|listing|page)\s+(?:says|states|shows|lists|publishes|describes)\b/i,
  /\b(?:official|public)\s+(?:website|site|source|listing|page)\b/i,
  /\b(?:scraped|captured|mapped|imported)\s+from\b/i,
];

const normalizeWords = (value: string): string => value
  .toLocaleLowerCase('en-US')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const startsByRestatingName = (name: string, description: string): boolean => {
  const normalizedName = normalizeWords(name);
  const normalizedDescription = normalizeWords(description);
  if (!normalizedName || normalizedName.split(' ').length < 2) return false;
  return normalizedDescription === normalizedName
    || normalizedDescription.startsWith(`${normalizedName} is `)
    || normalizedDescription.startsWith(`${normalizedName} was `)
    || normalizedDescription.startsWith(`${normalizedName} runs `)
    || normalizedDescription.startsWith(`${normalizedName} takes place `);
};

export const analyzeAffiliateDescriptionQuality = (input: {
  kind: AffiliateDescriptionEntityKind;
  name: string;
  description: string | null | undefined;
}): AffiliateDescriptionQualityIssue[] => {
  const description = input.description?.trim() ?? '';
  if (!description) {
    return [{
      code: 'MISSING_DESCRIPTION',
      message: `${input.kind === 'EVENT' ? 'Event' : 'Organization'} description is missing.`,
    }];
  }

  const issues: AffiliateDescriptionQualityIssue[] = [];
  if (discoveryNarrationPatterns.some((pattern) => pattern.test(description))) {
    issues.push({
      code: 'DISCOVERY_NARRATION',
      message: 'Description narrates where the record was found instead of describing the subject.',
    });
  }
  if (input.kind === 'EVENT' && startsByRestatingName(input.name, description)) {
    issues.push({
      code: 'TITLE_RESTATEMENT',
      message: 'Event description starts by restating the full event title.',
    });
  }
  return issues;
};
