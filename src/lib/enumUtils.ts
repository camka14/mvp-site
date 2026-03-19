export function normalizeEnumValue(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.toUpperCase();
}

export function normalizeEnumValueOrFallback(
  value: unknown,
  fallback?: string,
): string | undefined {
  return normalizeEnumValue(value) ?? fallback;
}

export function formatEnumDisplayLabel(
  value: unknown,
  fallback = '',
): string {
  if (typeof value !== 'string') {
    return fallback;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }

  return trimmed
    .replace(/[_-]+/g, ' ')
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}
