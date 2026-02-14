type ErrorLike = {
  name?: unknown;
  message?: unknown;
  code?: unknown;
  status?: unknown;
  $metadata?: {
    httpStatusCode?: unknown;
    requestId?: unknown;
  };
};

const asNonEmptyString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const asNumber = (value: unknown): number | undefined => {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
};

export const summarizeErrorForLog = (error: unknown) => {
  if (error instanceof Error) {
    const withExtras = error as Error & ErrorLike;
    return {
      name: asNonEmptyString(withExtras.name) || 'Error',
      message: asNonEmptyString(withExtras.message) || 'Unexpected error',
      code:
        asNonEmptyString(withExtras.code) ||
        (typeof withExtras.code === 'number' ? String(withExtras.code) : undefined),
      status: asNumber(withExtras.status) || asNumber(withExtras.$metadata?.httpStatusCode),
      requestId: asNonEmptyString(withExtras.$metadata?.requestId),
    };
  }

  if (typeof error === 'object' && error !== null) {
    const maybeError = error as ErrorLike;
    return {
      name: asNonEmptyString(maybeError.name) || 'UnknownError',
      message: asNonEmptyString(maybeError.message) || 'Unexpected non-Error value thrown',
      code:
        asNonEmptyString(maybeError.code) ||
        (typeof maybeError.code === 'number' ? String(maybeError.code) : undefined),
      status: asNumber(maybeError.status) || asNumber(maybeError.$metadata?.httpStatusCode),
      requestId: asNonEmptyString(maybeError.$metadata?.requestId),
    };
  }

  return {
    name: 'UnknownError',
    message: typeof error === 'string' ? error : 'Unexpected primitive value thrown',
  };
};
