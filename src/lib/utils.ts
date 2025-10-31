import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}



export function buildPayload(data: Record<string, any>) {
  const isFiniteNumber = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value);

  const isPlainObject = (value: unknown): value is Record<string, unknown> => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return false;
    }
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  };

  const sanitizeValue = (value: unknown, depth: number = 0): unknown => {
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
        .map((item) => sanitizeValue(item, depth + 1))
        .filter((item) => item !== undefined);
      return sanitizedItems.length ? sanitizedItems : undefined;
    }

    if (isPlainObject(value) && depth < 5) {
      const sanitizedObject: Record<string, unknown> = {};
      for (const [key, nestedValue] of Object.entries(value)) {
        const sanitized = sanitizeValue(nestedValue, depth + 1);
        if (sanitized !== undefined) {
          sanitizedObject[key] = sanitized;
        }
      }
      return Object.keys(sanitizedObject).length ? sanitizedObject : undefined;
    }

    return undefined;
  };

  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    const sanitized = sanitizeValue(value);
    if (sanitized !== undefined) {
      payload[key] = sanitized;
    }
  }

  return payload;
}
