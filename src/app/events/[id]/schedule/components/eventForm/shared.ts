export const normalizeResourceText = (value: unknown): string => (
    typeof value === 'string' ? value.trim() : ''
);

export const normalizeBoolean = (value: unknown): boolean | undefined => {
    if (typeof value === 'boolean') {
        return value;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
        if (value === 1) return true;
        if (value === 0) return false;
    }
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
        if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
    }
    return undefined;
};

export const stringArraysEqual = (left: string[], right: string[]): boolean => {
    if (left.length !== right.length) {
        return false;
    }
    return left.every((value, index) => value === right[index]);
};

export const stringSetsEqual = (left: string[], right: string[]): boolean => {
    const normalizedLeft = Array.from(new Set(left)).sort();
    const normalizedRight = Array.from(new Set(right)).sort();
    return stringArraysEqual(normalizedLeft, normalizedRight);
};

export const nullableNumbersEqual = (
    left: number | null | undefined,
    right: number | null | undefined,
): boolean => (left ?? null) === (right ?? null);
