import { NextRequest, NextResponse } from 'next/server';
import { getRequestOrigin } from '@/lib/requestOrigin';
import {
  appendQuickBooksResultQuery,
  exchangeQuickBooksAuthorizationCode,
  getQuickBooksCallbackUrl,
  parseQuickBooksStateResult,
  upsertQuickBooksConnection,
} from '@/server/integrations/quickBooksConnection';

export const dynamic = 'force-dynamic';

const fallbackUrlFor = (origin: string): string => new URL('/', origin).toString();

const redirectWithResult = (
  target: string,
  result: 'return' | 'error',
  reason?: string,
): NextResponse => (
  NextResponse.redirect(
    new URL(appendQuickBooksResultQuery(target, result, reason ? { reason } : undefined)),
    { status: 302 },
  )
);

export async function GET(req: NextRequest) {
  const origin = getRequestOrigin(req);
  const fallbackUrl = fallbackUrlFor(origin);
  const stateToken = req.nextUrl.searchParams.get('state');
  const error = req.nextUrl.searchParams.get('error');
  const code = req.nextUrl.searchParams.get('code');
  const realmId = req.nextUrl.searchParams.get('realmId');

  const stateResult = stateToken ? parseQuickBooksStateResult(stateToken) : null;
  const state = stateResult?.state ?? null;
  const stateErrorTarget = stateResult?.expiredState?.refreshUrl ?? fallbackUrl;

  if (error) {
    return redirectWithResult(state?.refreshUrl ?? stateErrorTarget, 'error', error);
  }
  if (!stateToken) {
    return redirectWithResult(fallbackUrl, 'error', 'missing_state');
  }
  if (!state) {
    return redirectWithResult(stateErrorTarget, 'error', stateResult?.error ?? 'invalid_state');
  }
  if (!code) {
    return redirectWithResult(state.refreshUrl, 'error', 'missing_code');
  }
  if (!realmId) {
    return redirectWithResult(state.refreshUrl, 'error', 'missing_realm');
  }

  try {
    const token = await exchangeQuickBooksAuthorizationCode({
      code,
      redirectUri: getQuickBooksCallbackUrl(origin),
    });
    await upsertQuickBooksConnection({
      organizationId: state.organizationId,
      actingUserId: state.userId,
      realmId,
      token,
    });
    return redirectWithResult(state.returnUrl, 'return');
  } catch (error) {
    console.error('QuickBooks OAuth callback failed', {
      message: error instanceof Error ? error.message : 'Unknown QuickBooks OAuth callback error.',
    });
    return redirectWithResult(state.refreshUrl, 'error', 'token_exchange_failed');
  }
}
