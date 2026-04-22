import type { Field } from '@/types';

type FieldIdentity = Partial<Pick<Field, '$id' | 'name' | '$createdAt' | 'createdAt'>> & {
  id?: string | null;
};

const normalizeText = (value: unknown): string => (
  typeof value === 'string' ? value.trim() : ''
);

export const getFieldId = (field?: FieldIdentity | null): string | null => {
  const legacyId = normalizeText(field?.$id);
  if (legacyId) {
    return legacyId;
  }
  const directId = normalizeText(field?.id);
  return directId || null;
};

const getFieldCreatedAtTime = (field?: FieldIdentity | null): number | null => {
  const rawValue = field?.$createdAt ?? field?.createdAt ?? null;
  if (!rawValue) {
    return null;
  }

  if (rawValue instanceof Date) {
    return Number.isNaN(rawValue.getTime()) ? null : rawValue.getTime();
  }

  if (typeof rawValue === 'string') {
    const parsed = Date.parse(rawValue);
    return Number.isNaN(parsed) ? null : parsed;
  }

  return null;
};

export const getFieldDisplayName = (
  field?: FieldIdentity | null,
  fallback = 'Field',
): string => {
  const name = normalizeText(field?.name);
  if (name) {
    return name;
  }

  return getFieldId(field) ?? fallback;
};

export const compareFieldsByCreatedAt = <T extends FieldIdentity>(left: T, right: T): number => {
  const leftCreatedAt = getFieldCreatedAtTime(left);
  const rightCreatedAt = getFieldCreatedAtTime(right);

  if (leftCreatedAt !== rightCreatedAt) {
    if (leftCreatedAt === null) return 1;
    if (rightCreatedAt === null) return -1;
    return leftCreatedAt - rightCreatedAt;
  }

  const leftLabel = getFieldDisplayName(left, '');
  const rightLabel = getFieldDisplayName(right, '');
  const labelComparison = leftLabel.localeCompare(rightLabel, undefined, { numeric: true, sensitivity: 'base' });
  if (labelComparison !== 0) {
    return labelComparison;
  }

  const leftId = getFieldId(left) ?? '';
  const rightId = getFieldId(right) ?? '';
  return leftId.localeCompare(rightId);
};

export const sortFieldsByCreatedAt = <T extends FieldIdentity>(fields: T[]): T[] => (
  [...fields].sort(compareFieldsByCreatedAt)
);
