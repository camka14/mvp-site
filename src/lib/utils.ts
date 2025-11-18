import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}



export function buildPayload<T>(data: Record<string, any>, omitKeys: string[] = []): Record<string, unknown> {
  const isFiniteNumber = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value);

  const sanitizeValue = (value: unknown): unknown => {
    if (value === undefined || value === null) {
      return undefined;
    }

    if (typeof value === 'string' || typeof value === 'boolean') {
      return value;
    }

    if (isFiniteNumber(value)) {
      return value;
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    if (Array.isArray(value)) {
      const sanitizedItems = value
        .map((item) => sanitizeValue(item))
        .filter((item) => item !== undefined);
      return sanitizedItems.length ? sanitizedItems : undefined;
    }

    return undefined;
  };

  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (omitKeys.includes(key)) {
      continue;
    }
    const sanitized = sanitizeValue(value);
    if (sanitized !== undefined) {
      payload[key] = sanitized;
    }
  }

  return payload;
}
