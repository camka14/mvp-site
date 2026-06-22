import { normalizePriceCentsArray } from '@/lib/priceUtils';

export const normalizeInstallmentAmounts = (amounts: unknown): number[] => normalizePriceCentsArray(amounts);

export const sumInstallmentAmounts = (amounts: unknown): number => (
    normalizeInstallmentAmounts(amounts).reduce((sum, amount) => sum + amount, 0)
);

export const hasMobileBlockingPaymentPlanConfig = (config: {
    allowPaymentPlans?: boolean | null;
    installmentCount?: number | null;
    installmentAmounts?: unknown;
    installmentDueDates?: unknown;
    installmentDueRelativeDays?: unknown;
}): boolean => {
    const installmentCount = Number.isFinite(Number(config.installmentCount))
        ? Math.max(0, Math.trunc(Number(config.installmentCount)))
        : 0;
    return Boolean(config.allowPaymentPlans)
        || installmentCount > 0
        || normalizeInstallmentAmounts(config.installmentAmounts).length > 0
        || (Array.isArray(config.installmentDueDates) && config.installmentDueDates.length > 0)
        || (Array.isArray(config.installmentDueRelativeDays) && config.installmentDueRelativeDays.length > 0);
};

export const formatMobileEditUnsupportedReasons = (reasons: string[]): string => {
    if (reasons.length === 0) return 'unsupported settings';
    if (reasons.length === 1) return reasons[0];
    if (reasons.length === 2) return `${reasons[0]} and ${reasons[1]}`;
    return `${reasons.slice(0, -1).join(', ')}, and ${reasons[reasons.length - 1]}`;
};

const parseInstallmentDateValue = (value?: string | null): Date | null => {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const normalizeInstallmentDates = (dates: unknown): string[] => {
    if (!Array.isArray(dates)) return [];
    return dates
        .map((entry) => parseInstallmentDateValue(typeof entry === 'string' ? entry : String(entry ?? '')))
        .filter((value): value is Date => Boolean(value))
        .map((value) => value.toISOString());
};

export const normalizeInstallmentRelativeDays = (value: unknown): number[] => {
    if (!Array.isArray(value)) return [];
    return value
        .map((entry) => (typeof entry === 'number' ? entry : Number(entry)))
        .filter((entry) => Number.isFinite(entry))
        .map((entry) => Math.trunc(entry));
};
