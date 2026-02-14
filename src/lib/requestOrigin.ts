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
  if (proto && host) {
    return `${proto}://${host}`;
  }

  return req.nextUrl.origin;
};
