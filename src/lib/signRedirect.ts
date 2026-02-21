const parseHttpUrl = (raw: unknown): URL | null => {
  if (typeof raw !== 'string') {
    return null;
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

const isIpv4Private = (hostname: string): boolean => {
  const octets = hostname.split('.').map((part) => Number(part));
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  const [first, second] = octets;
  if (first === 10 || first === 127 || first === 0) {
    return true;
  }
  if (first === 192 && second === 168) {
    return true;
  }
  if (first === 172 && second >= 16 && second <= 31) {
    return true;
  }
  if (first === 169 && second === 254) {
    return true;
  }
  return false;
};

const isIpv6Private = (hostname: string): boolean => {
  const normalized = hostname.toLowerCase();
  if (normalized === '::1') {
    return true;
  }
  return normalized.startsWith('fc')
    || normalized.startsWith('fd')
    || normalized.startsWith('fe80:');
};

const isLikelyPrivateHost = (hostname: string): boolean => {
  const normalized = hostname.toLowerCase();
  if (!normalized) {
    return false;
  }
  if (
    normalized === 'localhost'
    || normalized.endsWith('.localhost')
    || normalized.endsWith('.local')
  ) {
    return true;
  }
  if (isIpv4Private(normalized)) {
    return true;
  }
  if (normalized.includes(':') && isIpv6Private(normalized)) {
    return true;
  }
  return false;
};

const applyPathFromRequested = (fallback: URL, requested: URL): string => {
  const merged = new URL(fallback.toString());
  merged.pathname = requested.pathname;
  merged.search = requested.search;
  merged.hash = requested.hash;
  return merged.toString();
};

export const resolveBoldSignRedirectUrl = (requestedRedirectUrl?: string): string | undefined => {
  const requested = parseHttpUrl(requestedRedirectUrl);
  if (!requested) {
    return undefined;
  }

  const fallback = parseHttpUrl(process.env.BOLDSIGN_DEV_REDIRECT_BASE_URL);
  if (isLikelyPrivateHost(requested.hostname) && fallback) {
    return applyPathFromRequested(fallback, requested);
  }

  return requested.toString();
};
