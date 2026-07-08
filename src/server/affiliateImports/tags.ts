import { normalizeEventTagInputs } from '@/server/eventTags';

const nullableString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const splitTagText = (value: unknown): string[] => {
  const text = nullableString(value);
  if (!text) return [];
  return text
    .split(/[,;|]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
};

const normalizeTagList = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return normalizeEventTagInputs(value);
  }
  return normalizeEventTagInputs(splitTagText(value));
};

const objectRecord = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
);

export const affiliateCandidateExplicitTagNames = (candidate: Record<string, unknown>): string[] => {
  const rawPayload = objectRecord(candidate.rawPayload);
  const extractedFields = objectRecord(rawPayload?.extractedFields);
  const detailPage = objectRecord(rawPayload?.detailPage);
  const detailFields = objectRecord(detailPage?.extractedFields);

  return normalizeEventTagInputs([
    ...normalizeTagList(candidate.tags),
    ...normalizeTagList(candidate.tagText),
    ...normalizeTagList(rawPayload?.tags),
    ...normalizeTagList(extractedFields?.tags),
    ...normalizeTagList(extractedFields?.tagText),
    ...normalizeTagList(detailFields?.tags),
    ...normalizeTagList(detailFields?.tagText),
  ]);
};

const affiliateCandidateTagText = (candidate: Record<string, unknown>): string => {
  const rawPayload = objectRecord(candidate.rawPayload);
  const extractedFields = objectRecord(rawPayload?.extractedFields);
  const detailPage = objectRecord(rawPayload?.detailPage);
  const detailFields = objectRecord(detailPage?.extractedFields);

  return [
    candidate.title,
    candidate.name,
    candidate.formatLabel,
    candidate.formatName,
    candidate.statusText,
    candidate.divisionText,
    candidate.skillLevel,
    candidate.sportName,
    extractedFields?.title,
    extractedFields?.formatLabel,
    extractedFields?.statusText,
    extractedFields?.divisionText,
    detailFields?.title,
    detailFields?.formatLabel,
    detailFields?.statusText,
    detailFields?.divisionText,
  ]
    .map((value) => nullableString(value) ?? '')
    .join(' ')
    .toLowerCase();
};

export const inferAffiliateEventTagNames = (
  candidate: Record<string, unknown>,
  options: {
    eventType?: unknown;
    listingKind?: unknown;
  } = {},
): string[] => {
  const tags = [...affiliateCandidateExplicitTagNames(candidate)];
  const addTag = (name: string) => {
    if (!tags.some((tag) => tag.toLowerCase() === name.toLowerCase())) {
      tags.push(name);
    }
  };

  const listingKind = nullableString(options.listingKind ?? candidate.listingKind)?.toUpperCase();
  if (listingKind === 'RENTAL') {
    addTag('Rental');
  }

  const eventType = nullableString(options.eventType ?? candidate.eventType)?.toUpperCase();
  if (eventType === 'LEAGUE') {
    addTag('League');
  } else if (eventType === 'TOURNAMENT') {
    addTag('Tournament');
  }

  const text = affiliateCandidateTagText(candidate);
  const socialLike = /\bsocial event\b|\badult social\b|\bfamily field day\b|\bmember appreciation\b|\bholiday party\b/.test(text);
  if (!/\bpre[-\s]?tryout\b/.test(text) && /\btry[-\s]?outs?\b|\bevaluations?\b/.test(text)) {
    addTag('Tryouts');
  }
  if (!socialLike && /\bcamps?\b/.test(text) && !/\bcamp\s+recs\b/.test(text)) {
    addTag('Camp');
  }
  if (!socialLike && /\bclinics?\b|\bclasses?\b|\blessons?\b|\btraining sessions?\b/.test(text)) {
    addTag('Clinic');
  }
  if (/\bopen\s+(?:gym|play|court|field|run)\b|\bdrop[-\s]?in\b|\bteam\s+play\b|\bfree\s+play\b/.test(text)) {
    addTag('Open Play');
  }
  const classLike = /\bclasses?\b|\bcamps?\b|\bclinics?\b|\blessons?\b|\btraining sessions?\b/.test(text);
  if (
    /\bpick[-\s]?up\b|\bpick\s+to\s+play\b|\bfriendly\s+matches?\b|\bdrop[-\s]?in\s+games?\b/.test(text)
    || (!classLike && /\bscrimmages?\b/.test(text))
  ) {
    addTag('Pickup Game');
  }

  return normalizeEventTagInputs(tags);
};
