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

const isPlainObject = (value: unknown): value is Record<string, any> => {
  if (!value || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

// Remove Appwrite-style legacy fields (e.g. `$id`, `$createdAt`) from request payloads
// before passing them into Prisma inputs.
export const stripLegacyFieldsDeep = <T>(value: T): T => {
  if (!value) return value;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) {
    return value.map((item) => stripLegacyFieldsDeep(item)) as unknown as T;
  }
  if (isPlainObject(value)) {
    const cleaned: Record<string, any> = {};
    for (const [key, val] of Object.entries(value)) {
      if (key.startsWith('$')) continue;
      cleaned[key] = stripLegacyFieldsDeep(val);
    }
    return cleaned as unknown as T;
  }
  return value;
};

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
