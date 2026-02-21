const normalizePublicUrl = (raw: unknown): string | undefined => {
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
    return parsed.toString();
  } catch {
    return undefined;
  }
};

export const resolveClientSignRedirectUrl = (): string | undefined => {
  const fromEnv = normalizePublicUrl(process.env.NEXT_PUBLIC_BOLDSIGN_DEV_REDIRECT_BASE_URL);
  if (fromEnv) {
    return fromEnv;
  }

  if (typeof window === 'undefined') {
    return undefined;
  }
  return normalizePublicUrl(window.location.origin);
};
