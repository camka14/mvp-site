const toIsoString = (value: unknown): string | null => {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return null;
};

export const withLegacyFields = <T extends Record<string, any>>(row: T): T & {
  $id: string;
  $createdAt?: string | null;
  $updatedAt?: string | null;
} => {
  const id = row.$id ?? row.id ?? '';
  return {
    ...(row as Record<string, any>),
    $id: typeof id === 'string' ? id : String(id),
    $createdAt: toIsoString((row as any).createdAt ?? (row as any).$createdAt),
    $updatedAt: toIsoString((row as any).updatedAt ?? (row as any).$updatedAt),
  } as T & {
    $id: string;
    $createdAt?: string | null;
    $updatedAt?: string | null;
  };
};

export const withLegacyList = <T extends Record<string, any>>(rows: T[]): Array<T & {
  $id: string;
  $createdAt?: string | null;
  $updatedAt?: string | null;
}> => rows.map((row) => withLegacyFields(row));

export const normalizeLegacyId = (value: unknown): string | null => {
  if (typeof value === 'string' && value.trim().length > 0) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
};

export const parseDateInput = (value: unknown): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
};
