import { NextRequest } from 'next/server';

const normalizeBaseUrl = (value: string | undefined | null): string | null => {
  const raw = value?.trim();
  if (!raw) return null;

  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
};

const firstHeaderValue = (value: string | null): string | null => {
  if (!value) return null;
  const first = value.split(',')[0]?.trim();
  return first || null;
};

const isLoopbackHost = (hostname: string): boolean => {
  const normalized = hostname.trim().toLowerCase();
  return normalized === 'localhost'
    || normalized === '127.0.0.1'
    || normalized === '[::1]'
    || normalized.endsWith('.localhost');
};

const normalizeRequestDerivedOrigin = (value: string | null): string | null => {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
};

export const getRequestOrigin = (req: NextRequest): string => {
  const configured =
    normalizeBaseUrl(process.env.PUBLIC_WEB_BASE_URL) ??
    normalizeBaseUrl(process.env.NEXT_PUBLIC_SITE_URL) ??
    normalizeBaseUrl(process.env.NEXT_PUBLIC_WEB_BASE_URL);
  if (configured) {
    return configured;
  }

  const proto = firstHeaderValue(req.headers.get('x-forwarded-proto'));
  const host = firstHeaderValue(req.headers.get('x-forwarded-host')) ?? firstHeaderValue(req.headers.get('host'));
  const headerOrigin = normalizeRequestDerivedOrigin(proto && host ? `${proto}://${host}` : null);
  if (headerOrigin) {
    const parsed = new URL(headerOrigin);
    if (isLoopbackHost(parsed.hostname)) {
      return parsed.origin;
    }
  }

  if (isLoopbackHost(req.nextUrl.hostname)) {
    return req.nextUrl.origin;
  }

  throw new Error(
    'PUBLIC_WEB_BASE_URL (or NEXT_PUBLIC_SITE_URL / NEXT_PUBLIC_WEB_BASE_URL) must be set for non-local request origin resolution.',
  );
};
