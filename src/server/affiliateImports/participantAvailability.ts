const nullableString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const parsePositiveInt = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.trunc(value);
  }
  const text = nullableString(value);
  if (!text) return null;
  const parsed = Number.parseInt(text, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const parseNonNegativeInt = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.trunc(value);
  }
  const text = nullableString(value);
  if (!text || !/^\d+$/.test(text)) return null;
  const parsed = Number.parseInt(text, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const firstPositiveIntFromMatch = (match: RegExpMatchArray | null, index = 1): number | null => {
  if (!match?.[index]) return null;
  const parsed = Number.parseInt(match[index], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const firstNonNegativeIntFromMatch = (match: RegExpMatchArray | null, index = 1): number | null => {
  if (!match?.[index]) return null;
  const parsed = Number.parseInt(match[index], 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

export const parseAffiliateMaxParticipants = (value: unknown): number | null => {
  const text = nullableString(value);
  if (!text) return null;

  return firstPositiveIntFromMatch(text.match(/\b(?:max(?:imum)?|capacity|limit(?:ed)?(?:\s+to)?|up\s+to)\s*:?\s*([1-9]\d{0,3})\b/i))
    ?? firstPositiveIntFromMatch(text.match(/\b([1-9]\d{0,3})\s*(?:to|-|–)\s*([1-9]\d{0,3})\s+players?\b/i), 2)
    ?? firstPositiveIntFromMatch(text.match(/\b(?:with|and)\s+([1-9]\d{0,3})\s+players?\s+divided\b/i))
    ?? firstPositiveIntFromMatch(text.match(/\bmake\s+([1-9]\d{0,3})\s+players?\b/i));
};

export const parseAffiliateCurrentParticipants = (value: unknown): number | null => {
  const text = nullableString(value);
  if (!text) return null;

  return parseNonNegativeInt(text)
    ?? firstNonNegativeIntFromMatch(text.match(/\bview\s+signed\s+up\s+players?\s*\(([0-9]\d{0,3})\)/i))
    ?? firstNonNegativeIntFromMatch(text.match(/\bsigned\s+up\s+players?\s*\(([0-9]\d{0,3})\)/i))
    ?? firstNonNegativeIntFromMatch(text.match(/\b([0-9]\d{0,3})\s+(?:players?\s+)?(?:signed\s+up|registered|joined)\b/i));
};

export const parseAffiliateSpotsRemaining = (value: unknown): number | null => {
  const text = nullableString(value);
  if (!text) return null;
  if (/\b(?:game\s+full|sold\s+out|full)\b/i.test(text)) return 0;

  return parseNonNegativeInt(text)
    ?? firstNonNegativeIntFromMatch(text.match(/\b([0-9]\d{0,3})\s+spots?\s+(?:available|open|left|remaining)\b/i));
};

export const inferAffiliateParticipantAvailability = (input: {
  maxParticipants?: unknown;
  maxParticipantsText?: unknown;
  currentParticipantsText?: unknown;
  spotsRemainingText?: unknown;
  participantOptionsText?: unknown;
  statusText?: unknown;
  description?: unknown;
}): {
  maxParticipants: number | null;
  currentParticipants: number | null;
  spotsRemaining: number | null;
} => {
  const maxParticipants = parsePositiveInt(input.maxParticipants)
    ?? parseAffiliateMaxParticipants(input.maxParticipantsText)
    ?? parseAffiliateMaxParticipants(input.participantOptionsText)
    ?? parseAffiliateMaxParticipants(input.description);
  const currentParticipants = parseAffiliateCurrentParticipants(input.currentParticipantsText)
    ?? parseAffiliateCurrentParticipants(input.participantOptionsText);
  const spotsRemaining = parseAffiliateSpotsRemaining(input.spotsRemainingText)
    ?? parseAffiliateSpotsRemaining(input.statusText)
    ?? parseAffiliateSpotsRemaining(input.participantOptionsText);

  const inferredMax = maxParticipants
    ?? (currentParticipants !== null && spotsRemaining !== null
      ? currentParticipants + spotsRemaining
      : null);
  const inferredCurrent = currentParticipants
    ?? (inferredMax !== null && spotsRemaining !== null
      ? Math.max(0, inferredMax - spotsRemaining)
      : null);
  const inferredSpots = spotsRemaining
    ?? (inferredMax !== null && inferredCurrent !== null
      ? Math.max(0, inferredMax - inferredCurrent)
      : null);

  return {
    maxParticipants: inferredMax,
    currentParticipants: inferredCurrent,
    spotsRemaining: inferredSpots,
  };
};
