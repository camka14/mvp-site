const MAX_EXTERNAL_URL_LENGTH = 2048;

/**
 * Returns a canonical public web URL, or null when the value is empty or unsafe
 * to persist/open as an external destination.
 */
export const normalizeExternalHttpUrl = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_EXTERNAL_URL_LENGTH) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    if (
      (url.protocol !== 'http:' && url.protocol !== 'https:')
      || !url.hostname
      || url.username
      || url.password
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
};

export const isValidOptionalExternalHttpUrl = (value: unknown): boolean => (
  value === null
  || value === undefined
  || (typeof value === 'string' && (!value.trim() || normalizeExternalHttpUrl(value) !== null))
);
