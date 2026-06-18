import { NextRequest, NextResponse } from 'next/server';

const CANONICAL_HOST = 'bracket-iq.com';
const WWW_HOST = `www.${CANONICAL_HOST}`;
const BLOCKED_METHODS = new Set(['TRACE', 'TRACK']);
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const NO_STORE_VALUE = 'no-store, no-cache, must-revalidate, proxy-revalidate';
const ALLOWED_METHODS = 'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS';

const CROSS_ORIGIN_ALLOWED_PATHS = [
  /^\/api\/billing\/webhook(?:\/|$)/,
  /^\/api\/documents\/webhook(?:\/|$)/,
  /^\/api\/boldsign\/webhook(?:\/|$)/,
  /^\/api\/integrations\/quickbooks\/callback(?:\/|$)/,
];

const SENSITIVE_PATH_PREFIXES = [
  '/admin',
  '/billing',
  '/customers',
  '/events',
  '/login',
  '/my-schedule',
  '/organizations',
  '/profile',
  '/settings',
  '/signup',
  '/teams',
  '/verify',
  '/api/auth',
  '/api/billing',
  '/api/boldsign',
  '/api/children',
  '/api/documents',
  '/api/events',
  '/api/friends',
  '/api/integrations',
  '/api/invites',
  '/api/messages',
  '/api/notifications',
  '/api/organizations',
  '/api/profile',
  '/api/rentals',
  '/api/teams',
  '/api/users',
];

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(self)',
};

const normalizeHost = (host: string | null) => host?.split(':')[0]?.toLowerCase() ?? '';

const firstHeaderValue = (value: string | null): string | null => {
  const first = value?.split(',')[0]?.trim();
  return first || null;
};

const isLocalHost = (host: string): boolean => (
  host === 'localhost'
  || host === '10.0.2.2'
  || host === '127.0.0.1'
  || host === '0.0.0.0'
  || host === '::1'
);

const canonicalizeHost = (host: string): string => (
  host === WWW_HOST ? CANONICAL_HOST : host
);

const requestOrigin = (request: NextRequest): string => {
  const host = canonicalizeHost(normalizeHost(
    firstHeaderValue(request.headers.get('x-forwarded-host')) ?? request.headers.get('host'),
  ));
  const protocol = firstHeaderValue(request.headers.get('x-forwarded-proto'))
    ?? request.nextUrl.protocol.replace(':', '');

  return `${protocol}://${host}`;
};

const originFromHeader = (value: string | null): string | null => {
  if (!value) {
    return null;
  }
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
};

const normalizeOrigin = (value: string | null): string | null => {
  if (!value) {
    return null;
  }
  try {
    const url = new URL(value);
    url.hostname = canonicalizeHost(url.hostname.toLowerCase());
    url.port = '';
    return url.origin;
  } catch {
    return null;
  }
};

const isSensitivePath = (pathname: string): boolean => (
  SENSITIVE_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
);

const isEmbeddableWidgetPath = (pathname: string): boolean => (
  pathname === '/embed' || pathname.startsWith('/embed/')
);

const allowsCrossOriginUnsafeRequest = (pathname: string): boolean => (
  CROSS_ORIGIN_ALLOWED_PATHS.some((pattern) => pattern.test(pathname))
);

const isCrossOriginUnsafeRequest = (request: NextRequest): boolean => {
  if (SAFE_METHODS.has(request.method.toUpperCase())) {
    return false;
  }
  if (allowsCrossOriginUnsafeRequest(request.nextUrl.pathname)) {
    return false;
  }

  const requestHeaderOrigin = normalizeOrigin(requestOrigin(request));
  const originHeader = normalizeOrigin(request.headers.get('origin'));
  const refererHeader = normalizeOrigin(originFromHeader(request.headers.get('referer')));
  const submittedOrigin = originHeader ?? refererHeader;

  return Boolean(submittedOrigin && requestHeaderOrigin && submittedOrigin !== requestHeaderOrigin);
};

const applySecurityHeaders = (response: NextResponse, request: NextRequest): NextResponse => {
  Object.entries(SECURITY_HEADERS).forEach(([name, value]) => {
    if (name === 'X-Frame-Options' && isEmbeddableWidgetPath(request.nextUrl.pathname)) {
      return;
    }
    response.headers.set(name, value);
  });
  if (process.env.NODE_ENV === 'production') {
    response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  }
  if (isSensitivePath(request.nextUrl.pathname)) {
    response.headers.set('Cache-Control', NO_STORE_VALUE);
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');
  }
  return response;
};

export function proxy(request: NextRequest) {
  const host = normalizeHost(request.headers.get('host'));
  const forwardedProto = firstHeaderValue(request.headers.get('x-forwarded-proto'));

  if (BLOCKED_METHODS.has(request.method.toUpperCase())) {
    return applySecurityHeaders(
      new NextResponse(null, {
        status: 405,
        headers: { Allow: ALLOWED_METHODS },
      }),
      request,
    );
  }

  if (isCrossOriginUnsafeRequest(request)) {
    return applySecurityHeaders(
      NextResponse.json({ error: 'Cross-origin request blocked.' }, { status: 403 }),
      request,
    );
  }

  if (
    process.env.NODE_ENV === 'production'
    && forwardedProto === 'http'
    && !isLocalHost(host)
  ) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.protocol = 'https:';
    return applySecurityHeaders(NextResponse.redirect(redirectUrl, 308), request);
  }

  if (host !== WWW_HOST) {
    return applySecurityHeaders(NextResponse.next(), request);
  }

  const redirectUrl = request.nextUrl.clone();
  redirectUrl.protocol = 'https:';
  redirectUrl.hostname = CANONICAL_HOST;
  redirectUrl.port = '';

  return applySecurityHeaders(NextResponse.redirect(redirectUrl, 308), request);
}

export const config = {
  matcher: '/:path*',
};
