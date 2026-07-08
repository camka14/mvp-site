import crypto from 'crypto';

export type ErrorLogContext = Record<string, unknown>;

const SENSITIVE_KEY_PATTERN = /(authorization|cookie|csrf|email|password|phone|secret|session|token)/i;
const CODE_KEY_PATTERN = /(discountCode|couponCode|promoCode)/i;

const normalizeString = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const summarizeCode = (value: unknown): Record<string, string | number> | null => {
  const normalized = normalizeString(value)?.toUpperCase();
  if (!normalized) {
    return null;
  }

  return {
    prefix: normalized.slice(0, 4),
    length: normalized.length,
    sha256: crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 12),
  };
};

const sanitizeContextValue = (key: string, value: unknown, depth = 0): unknown => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (CODE_KEY_PATTERN.test(key)) {
    return summarizeCode(value);
  }

  if (SENSITIVE_KEY_PATTERN.test(key)) {
    return '[redacted]';
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
    };
  }

  if (Array.isArray(value)) {
    if (depth >= 2) {
      return { type: 'array', length: value.length };
    }
    return value
      .slice(0, 20)
      .map((entry, index) => sanitizeContextValue(`${key}[${index}]`, entry, depth + 1))
      .filter((entry) => entry !== undefined);
  }

  if (typeof value === 'object') {
    if (depth >= 2) {
      return { type: 'object' };
    }

    const sanitized: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>).forEach(([childKey, childValue]) => {
      const sanitizedValue = sanitizeContextValue(childKey, childValue, depth + 1);
      if (sanitizedValue !== undefined) {
        sanitized[childKey] = sanitizedValue;
      }
    });
    return Object.keys(sanitized).length > 0 ? sanitized : undefined;
  }

  return value;
};

export const sanitizeErrorLogContext = (context: ErrorLogContext = {}): Record<string, unknown> => {
  const sanitized: Record<string, unknown> = {};
  Object.entries(context).forEach(([key, value]) => {
    const sanitizedValue = sanitizeContextValue(key, value);
    if (sanitizedValue !== undefined) {
      sanitized[key] = sanitizedValue;
    }
  });
  return sanitized;
};

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  if (typeof error === 'string' && error.trim()) {
    return error.trim();
  }
  return fallback;
};

export const logServerError = ({
  message,
  error,
  status = 500,
  route,
  stage,
  context,
}: {
  message: string;
  error?: unknown;
  status?: number;
  route?: string;
  stage?: string;
  context?: ErrorLogContext;
}) => {
  const payload = {
    route,
    stage,
    status,
    message: getErrorMessage(error, message),
    errorName: error instanceof Error ? error.name : undefined,
    stack: status >= 500 && error instanceof Error ? error.stack : undefined,
    ...sanitizeErrorLogContext(context),
  };

  if (status >= 500) {
    console.error(message, payload);
  } else {
    console.warn(message, payload);
  }
};
