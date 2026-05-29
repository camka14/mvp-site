import { NextRequest, NextResponse } from 'next/server';

const CANONICAL_HOST = 'bracket-iq.com';
const WWW_HOST = `www.${CANONICAL_HOST}`;

const normalizeHost = (host: string | null) => host?.split(':')[0]?.toLowerCase() ?? '';

export function proxy(request: NextRequest) {
  if (normalizeHost(request.headers.get('host')) !== WWW_HOST) {
    return NextResponse.next();
  }

  const redirectUrl = request.nextUrl.clone();
  redirectUrl.protocol = 'https:';
  redirectUrl.hostname = CANONICAL_HOST;
  redirectUrl.port = '';

  return NextResponse.redirect(redirectUrl, 308);
}

export const config = {
  matcher: '/:path*',
};
