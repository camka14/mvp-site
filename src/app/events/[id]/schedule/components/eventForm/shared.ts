export const normalizeResourceText = (value: unknown): string => (
    typeof value === 'string' ? value.trim() : ''
);

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
