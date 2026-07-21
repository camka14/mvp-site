import { NextRequest, NextResponse } from 'next/server';
import {
  AFFILIATE_OUTBOUND_COOKIE_NAME,
  createAffiliateBrowserProof,
  createAffiliateBrowserSessionId,
  isAffiliateOutboundKind,
  isBlockedAffiliateUserAgent,
  normalizeAffiliateOutboundTargetId,
  resolveAffiliateDestination,
  verifyAffiliateBrowserProof,
  verifyAffiliateOutboundSignature,
  type AffiliateOutboundTarget,
} from '@/server/affiliateOutbound';
import { applyRateLimit, RATE_LIMIT_POLICIES } from '@/server/rateLimit';

export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{ kind: string; id: string; signature: string }>;
};

const SECURITY_HEADERS = {
  'Cache-Control': 'no-store, max-age=0',
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-Robots-Tag': 'noindex, nofollow, noarchive, nosnippet',
} as const;

const htmlResponse = (body: string, status: number, extraHeaders?: HeadersInit): NextResponse => (
  new NextResponse(body, {
    status,
    headers: {
      ...SECURITY_HEADERS,
      'Content-Type': 'text/html; charset=utf-8',
      ...extraHeaders,
    },
  })
);

const errorPage = (status: number, title: string, message: string): NextResponse => htmlResponse(
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} | BracketIQ</title></head><body><main><h1>${title}</h1><p>${message}</p><p><a href="/discover">Return to Discover</a></p></main></body></html>`,
  status,
);

const resolveTarget = async (context: RouteContext): Promise<AffiliateOutboundTarget | null> => {
  const { kind, id, signature } = await context.params;
  const normalizedId = normalizeAffiliateOutboundTargetId(id);
  if (
    !isAffiliateOutboundKind(kind)
    || !normalizedId
    || !verifyAffiliateOutboundSignature(kind, normalizedId, signature)
  ) {
    return null;
  }
  return { kind, id: normalizedId, signature };
};

const targetKey = (target: AffiliateOutboundTarget): string => `${target.kind}:${target.id}`;

const sameOriginPost = (request: NextRequest): boolean => {
  const fetchSite = request.headers.get('sec-fetch-site')?.trim().toLowerCase();
  if (fetchSite && fetchSite !== 'same-origin') return false;

  const origin = request.headers.get('origin');
  if (origin) {
    try {
      return new URL(origin).origin === request.nextUrl.origin;
    } catch {
      return false;
    }
  }

  const referer = request.headers.get('referer');
  if (!referer) return false;
  try {
    return new URL(referer).origin === request.nextUrl.origin;
  } catch {
    return false;
  }
};

const rateLimitResponse = (response: NextResponse): NextResponse => {
  const headers = new Headers(response.headers);
  Object.entries(SECURITY_HEADERS).forEach(([key, value]) => headers.set(key, value));
  return new NextResponse('Too many outbound requests. Please wait before trying again.', {
    status: response.status,
    headers,
  });
};

export async function GET(request: NextRequest, context: RouteContext) {
  const target = await resolveTarget(context);
  if (!target) return errorPage(404, 'Link unavailable', 'This BracketIQ outbound link is invalid or has expired.');
  if (isBlockedAffiliateUserAgent(request.headers.get('user-agent'))) {
    return errorPage(403, 'Automated access blocked', 'Affiliate destinations are available only through normal browser navigation.');
  }

  const clientLimit = await applyRateLimit(request, RATE_LIMIT_POLICIES.affiliateOutboundView);
  if (clientLimit) return rateLimitResponse(clientLimit);
  const targetLimit = await applyRateLimit(
    request,
    RATE_LIMIT_POLICIES.affiliateOutboundTargetView,
    targetKey(target),
  );
  if (targetLimit) return rateLimitResponse(targetLimit);

  const destinationExists = await resolveAffiliateDestination(target.kind, target.id);
  if (!destinationExists) {
    return errorPage(404, 'Link unavailable', 'This affiliate listing is no longer active.');
  }

  const browserSessionId = createAffiliateBrowserSessionId();
  const proof = createAffiliateBrowserProof(target, browserSessionId);
  const action = request.nextUrl.pathname;
  const response = htmlResponse(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow,noarchive,nosnippet">
  <title>Opening organizer website | BracketIQ</title>
  <style>
    :root{color-scheme:light;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f8fafc;color:#0f172a}
    body{min-height:100vh;margin:0;display:grid;place-items:center;padding:24px;box-sizing:border-box}
    main{width:min(100%,460px);padding:32px;border:1px solid #dbe3ee;border-radius:20px;background:#fff;box-shadow:0 18px 45px rgba(15,23,42,.08);text-align:center}
    .mark{display:inline-grid;place-items:center;width:48px;height:48px;border-radius:14px;background:#0f766e;color:#fff;font-weight:800;font-size:20px}
    h1{font-size:24px;margin:18px 0 8px}p{line-height:1.55;color:#475569;margin:0 0 20px}
    button{width:100%;border:0;border-radius:12px;background:#0f766e;color:#fff;padding:13px 18px;font:inherit;font-weight:700;cursor:pointer}
    button:focus-visible{outline:3px solid #5eead4;outline-offset:3px}.fine{font-size:12px;margin-top:16px;color:#64748b}
  </style>
</head>
<body>
  <main>
    <span class="mark" aria-hidden="true">BIQ</span>
    <h1>Opening the organizer's website</h1>
    <p>BracketIQ is checking this outbound link before continuing.</p>
    <form id="affiliate-outbound-form" method="post" action="${action}">
      <input type="hidden" name="proof" value="${proof}">
      <button type="submit">Continue</button>
    </form>
    <p class="fine">The destination is managed by a third party and is subject to its own terms and privacy policy.</p>
  </main>
  <script src="/affiliate-outbound.js" defer></script>
</body>
</html>`, 200);

  response.cookies.set({
    name: AFFILIATE_OUTBOUND_COOKIE_NAME,
    value: browserSessionId,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 10 * 60,
    path: action,
  });
  return response;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const target = await resolveTarget(context);
  if (!target) return errorPage(404, 'Link unavailable', 'This BracketIQ outbound link is invalid or has expired.');
  if (isBlockedAffiliateUserAgent(request.headers.get('user-agent')) || !sameOriginPost(request)) {
    return errorPage(403, 'Request blocked', 'Please open this link from its BracketIQ event, team, or organization page.');
  }

  const clientLimit = await applyRateLimit(request, RATE_LIMIT_POLICIES.affiliateOutboundRedirect);
  if (clientLimit) return rateLimitResponse(clientLimit);
  const targetLimit = await applyRateLimit(
    request,
    RATE_LIMIT_POLICIES.affiliateOutboundTargetRedirect,
    targetKey(target),
  );
  if (targetLimit) return rateLimitResponse(targetLimit);

  const contentType = request.headers.get('content-type')?.toLowerCase() ?? '';
  if (!contentType.startsWith('application/x-www-form-urlencoded') && !contentType.startsWith('multipart/form-data')) {
    return errorPage(415, 'Request blocked', 'The outbound confirmation could not be validated.');
  }
  const formData = await request.formData().catch(() => null);
  const proof = formData?.get('proof');
  const browserSessionId = request.cookies.get(AFFILIATE_OUTBOUND_COOKIE_NAME)?.value ?? '';
  if (
    typeof proof !== 'string'
    || !browserSessionId
    || !verifyAffiliateBrowserProof(proof, target, browserSessionId)
  ) {
    return errorPage(403, 'Confirmation expired', 'Return to the BracketIQ detail page and open the link again.');
  }

  const destination = await resolveAffiliateDestination(target.kind, target.id);
  if (!destination) return errorPage(404, 'Link unavailable', 'This affiliate listing is no longer active.');

  const response = NextResponse.redirect(destination, 303);
  Object.entries(SECURITY_HEADERS).forEach(([key, value]) => response.headers.set(key, value));
  response.cookies.set({
    name: AFFILIATE_OUTBOUND_COOKIE_NAME,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: request.nextUrl.pathname,
  });
  return response;
}
