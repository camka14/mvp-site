export const normalizeDivisionKey = (value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    const normalized = value.trim().toLowerCase();
    return normalized.length ? normalized : null;
};

export const getDivisionIdFromEventEntry = (entry: unknown): string | null => {
    if (typeof entry === 'string') {
        return normalizeDivisionKey(entry);
    }
    if (entry && typeof entry === 'object') {
        const row = entry as Record<string, unknown>;
        return normalizeDivisionKey(row.id)
            ?? normalizeDivisionKey(row.$id)
            ?? normalizeDivisionKey(row.key)
            ?? normalizeDivisionKey(row.name);
    }
    return null;
};
