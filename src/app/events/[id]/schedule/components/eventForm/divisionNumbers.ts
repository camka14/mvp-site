export const parseOptionalWholeNumber = (value: string | number): number | undefined => {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? Math.trunc(value) : undefined;
    }
    if (!value.trim()) {
        return undefined;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : undefined;
};
