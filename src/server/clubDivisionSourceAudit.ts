export type ClubDivisionSkillId = 'rec' | 'premier';

export type SourceEvidence = {
  value: string;
  snippet: string;
};

export type SourcePriceEvidence = {
  amountCents: number;
  display: string;
  snippet: string;
};

export type SourceAgeEvidence = SourceEvidence & {
  upperAgeId: string | null;
};

const normalizeWhitespace = (value: string): string => value.replace(/\s+/g, ' ').trim();

export const isAuditableHtmlContentType = (contentType: string | null): boolean => {
  if (!contentType) return true;
  return /^(?:text\/html|application\/xhtml\+xml)(?:;|$)/i.test(contentType.trim());
};

const evidenceSnippet = (text: string, index: number, matchedLength: number): string => {
  const radius = 150;
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + matchedLength + radius);
  return normalizeWhitespace(`${start > 0 ? '...' : ''}${text.slice(start, end)}${end < text.length ? '...' : ''}`);
};

const uniqueEvidence = <T extends { value?: string; display?: string; snippet: string }>(rows: T[]): T[] => {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = `${row.value ?? row.display ?? ''}|${row.snippet}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const SOCCER_SKILL_PATTERNS: Array<{ skill: ClubDivisionSkillId; pattern: RegExp }> = [
  { skill: 'rec', pattern: /\b(?:recreational|recreation|rec\s+(?:league|program|soccer|division))\b/gi },
  { skill: 'premier', pattern: /\b(?:premier|competitive|select|travel)\s+(?:league|program|soccer|division|team|teams|club|pathway)\b/gi },
  { skill: 'premier', pattern: /\b(?:premier|competitive)\b/gi },
];

export const detectSoccerSkillEvidence = (text: string): SourceEvidence[] => {
  const normalized = normalizeWhitespace(text);
  const rows: SourceEvidence[] = [];
  for (const { skill, pattern } of SOCCER_SKILL_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of normalized.matchAll(pattern)) {
      if (match.index == null) continue;
      rows.push({
        value: skill,
        snippet: evidenceSnippet(normalized, match.index, match[0].length),
      });
      if (rows.length >= 20) return uniqueEvidence(rows);
    }
  }
  return uniqueEvidence(rows);
};

const PRICE_PATTERN = /\$\s*([0-9]{1,5}(?:,[0-9]{3})*)(?:\.(\d{2}))?/g;

export const detectPriceEvidence = (text: string): SourcePriceEvidence[] => {
  const normalized = normalizeWhitespace(text);
  const rows: SourcePriceEvidence[] = [];
  PRICE_PATTERN.lastIndex = 0;
  for (const match of normalized.matchAll(PRICE_PATTERN)) {
    if (match.index == null) continue;
    const dollars = Number(match[1].replace(/,/g, ''));
    const cents = Number(match[2] ?? '0');
    if (!Number.isFinite(dollars) || dollars <= 0) continue;
    rows.push({
      amountCents: dollars * 100 + cents,
      display: `$${dollars.toLocaleString('en-US')}${cents ? `.${String(cents).padStart(2, '0')}` : ''}`,
      snippet: evidenceSnippet(normalized, match.index, match[0].length),
    });
    if (rows.length >= 40) break;
  }
  return uniqueEvidence(rows);
};

const AGE_PATTERNS = [
  /\bU\s*([1-9]\d?)(?:\s*[-–—]\s*U?\s*([1-9]\d?))?\b/gi,
  /\b([1-9]\d?)\s*U(?:\s*[-–—]\s*([1-9]\d?)\s*U)?\b/gi,
  /\b(?:ages?|players?\s+ages?)\s+([1-9]\d?)(?:\s*[-–—]|\s+through\s+|\s+to\s+)([1-9]\d?)\b/gi,
  /\b(K|[1-9]|1[0-2])(?:st|nd|rd|th)?\s*[-–—]\s*(K|[1-9]|1[0-2])(?:st|nd|rd|th)?\s+grades?\b/gi,
];

export const detectAgeEvidence = (text: string): SourceAgeEvidence[] => {
  const normalized = normalizeWhitespace(text);
  const rows: SourceAgeEvidence[] = [];
  for (const pattern of AGE_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of normalized.matchAll(pattern)) {
      if (match.index == null) continue;
      const rawUpper = match[2] ?? match[1];
      const numericUpper = /^k$/i.test(rawUpper) ? 6 : Number(rawUpper);
      const isGrade = /grades?$/i.test(match[0]);
      rows.push({
        value: match[0],
        upperAgeId: Number.isFinite(numericUpper)
          ? `u${Math.min(19, numericUpper + (isGrade ? 6 : 0))}`
          : null,
        snippet: evidenceSnippet(normalized, match.index, match[0].length),
      });
      if (rows.length >= 40) return uniqueEvidence(rows);
    }
  }
  return uniqueEvidence(rows);
};

export const clubDivisionLinkScore = (label: string, href: string): number => {
  const value = `${label} ${href}`.toLowerCase();
  let score = 0;
  if (/\b(?:fees?|pricing|tuition|costs?|dues)\b/.test(value)) score += 120;
  if (/\b(?:premier|competitive|select|recreational|recreation)\b/.test(value)) score += 110;
  if (/\b(?:programs?|teams?|levels?|divisions?|pathways?)\b/.test(value)) score += 75;
  if (/\b(?:register|registration|tryouts?|evaluations?)\b/.test(value)) score += 60;
  if (/\b(?:camps?|clinics?|events?|tournaments?|schedule)\b/.test(value)) score += 20;
  if (/\b(?:privacy|terms|news|blog|donate|sponsors?|store|contact)\b/.test(value)) score -= 100;
  return score;
};
