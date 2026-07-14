const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== 'object') return false;
  return Object.prototype.toString.call(value) === '[object Object]';
};

/**
 * Returns the paths of Appwrite-style dollar-prefixed fields in a JSON value.
 * Canonical API handlers use this to reject obsolete request aliases instead
 * of silently discarding them.
 */
export const findDollarPrefixedFields = (
  value: unknown,
  parentPath = '',
): string[] => {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => (
      findDollarPrefixedFields(item, `${parentPath}[${index}]`)
    ));
  }
  if (!isPlainObject(value)) {
    return [];
  }

  return Object.entries(value).flatMap(([key, nestedValue]) => {
    const path = parentPath ? `${parentPath}.${key}` : key;
    return [
      ...(key.startsWith('$') ? [path] : []),
      ...findDollarPrefixedFields(nestedValue, path),
    ];
  });
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
