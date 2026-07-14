export const parseDateValue = (value?: string | Date | number | null): Date | null => {
    if (!value) return null;
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
    }
    if (typeof value === 'number') {
        const parsedNumber = new Date(value);
        return Number.isNaN(parsedNumber.getTime()) ? null : parsedNumber;
    }
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        const [year, month, day] = trimmed.split('-').map(Number);
        if (![year, month, day].some(Number.isNaN)) {
            return new Date(year, (month ?? 1) - 1, day ?? 1);
        }
    }
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};
