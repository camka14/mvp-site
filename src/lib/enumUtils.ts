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
