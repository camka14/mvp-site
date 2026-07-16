const normalizeDivisionIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string') {
      continue;
    }
    const id = entry.trim();
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    normalized.push(id);
  }
  return normalized;
};

export const resolveRelationalEventDivisionIds = (divisionDetails: unknown): string[] => {
  if (!Array.isArray(divisionDetails)) {
    return [];
  }
  return normalizeDivisionIds(divisionDetails.map((detail) => (
    detail && typeof detail === 'object' ? (detail as { id?: unknown }).id : null
  )));
};
