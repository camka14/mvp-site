const normalizePublicOrigin = (raw: unknown): string | undefined => {
  if (typeof raw !== 'string') {
    return undefined;
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return undefined;
    }
    return parsed.origin;
  } catch {
    return undefined;
  }
};

export const resolveClientPublicOrigin = (): string | undefined => {
  const fromNgrokDev = normalizePublicOrigin(process.env.NEXT_PUBLIC_BOLDSIGN_DEV_REDIRECT_BASE_URL);
  if (fromNgrokDev) {
    return fromNgrokDev;
  }

  const fromWebBase = normalizePublicOrigin(process.env.NEXT_PUBLIC_WEB_BASE_URL);
  if (fromWebBase) {
    return fromWebBase;
  }

  const fromSiteUrl = normalizePublicOrigin(process.env.NEXT_PUBLIC_SITE_URL);
  if (fromSiteUrl) {
    return fromSiteUrl;
  }

  if (typeof window === 'undefined') {
    return undefined;
  }

  return normalizePublicOrigin(window.location.origin);
};
