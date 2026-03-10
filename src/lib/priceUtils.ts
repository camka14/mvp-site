type NormalizePriceCentsOptions = {
  maxCents?: number;
};

type FormatPriceInputValueOptions = NormalizePriceCentsOptions & {
  blankWhenZero?: boolean;
};

export const normalizePriceCents = (
  value: unknown,
  options?: NormalizePriceCentsOptions,
): number => {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 0;
  }

  const normalized = Math.trunc(numeric);
  if (
    typeof options?.maxCents === "number" &&
    Number.isFinite(options.maxCents)
  ) {
    return Math.min(normalized, Math.max(0, Math.trunc(options.maxCents)));
  }

  return normalized;
};

export const normalizePriceCentsArray = (value: unknown): number[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((entry) => normalizePriceCents(entry));
};

export const parsePriceInputToCents = (
  value: string,
  options?: NormalizePriceCentsOptions,
): number => {
  const digitsOnly = String(value ?? "").replace(/\D/g, "");
  if (!digitsOnly.length) {
    return 0;
  }

  return normalizePriceCents(Number.parseInt(digitsOnly, 10), options);
};

export const formatPriceInputValue = (
  value: unknown,
  options?: FormatPriceInputValueOptions,
): string => {
  const cents = normalizePriceCents(value, options);
  if ((options?.blankWhenZero ?? true) && cents === 0) {
    return "";
  }

  const dollars = Math.trunc(cents / 100).toLocaleString("en-US");
  const fractional = String(cents % 100).padStart(2, "0");
  return `${dollars}.${fractional}`;
};
