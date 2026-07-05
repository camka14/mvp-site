import { withLegacyFields } from '@/server/legacyFormat';

const EXPLICIT_OFFSET_SUFFIX = /([+-]\d{2}:?\d{2}|Z)$/i;

const parseExplicitInstantString = (value: string): Date | null => {
  const trimmed = value.trim();
  if (!trimmed || !EXPLICIT_OFFSET_SUFFIX.test(trimmed)) {
    return null;
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const parseMatchInstantInput = (value: unknown): Date | null => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'string') {
    return parseExplicitInstantString(value);
  }
  return null;
};

export const serializeInstantField = (value: unknown): string | null => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (typeof value === 'string') {
    const parsed = parseExplicitInstantString(value);
    return parsed ? parsed.toISOString() : null;
  }
  return null;
};

export const serializeMatchRecordLegacy = <T extends Record<string, any>>(match: T) => ({
  ...withLegacyFields(match),
  start: serializeInstantField(match.start),
  end: serializeInstantField(match.end),
  actualStart: serializeInstantField(match.actualStart),
  actualEnd: serializeInstantField(match.actualEnd),
});

export const serializeMatchRecordsLegacy = <T extends Record<string, any>>(matches: T[]) =>
  matches.map((match) => serializeMatchRecordLegacy(match));
