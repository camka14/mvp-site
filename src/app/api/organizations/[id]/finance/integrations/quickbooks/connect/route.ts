import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { getRequestOrigin } from '@/lib/requestOrigin';
import { canManageOrganizationFinance } from '@/server/finance/financeAccess';
import {
  buildQuickBooksAuthorizeUrl,
  createQuickBooksState,
  getQuickBooksCallbackUrl,
  getQuickBooksEnvironment,
  getQuickBooksScopes,
  sanitizeSameOriginUrl,
} from '@/server/integrations/quickBooksConnection';

export const dynamic = 'force-dynamic';

const schema = z.object({
  returnUrl: z.string().trim().optional().nullable(),
  refreshUrl: z.string().trim().optional().nullable(),
}).strict();

const defaultFinanceUrl = (origin: string, organizationId: string): string => (
  new URL(`/organizations/${encodeURIComponent(organizationId)}/finance`, origin).toString()
);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession(req);
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const organization = await prisma.organizations.findUnique({
    where: { id },
    select: { id: true, ownerId: true },
  });
  if (!organization) {
    return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
  }
  if (!(await canManageOrganizationFinance(session, organization, prisma))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const clientId = process.env.INTUIT_CLIENT_ID?.trim();
  const clientSecret = process.env.INTUIT_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: 'QuickBooks is not configured.' }, { status: 500 });
  }

  const origin = getRequestOrigin(req);
  const fallbackUrl = defaultFinanceUrl(origin, id);
  const returnUrl = sanitizeSameOriginUrl(parsed.data.returnUrl, origin) ?? fallbackUrl;
  const refreshUrl = sanitizeSameOriginUrl(parsed.data.refreshUrl, origin) ?? returnUrl;
  const redirectUri = getQuickBooksCallbackUrl(origin);
  const scopes = getQuickBooksScopes();
  const state = createQuickBooksState(id, session.userId, returnUrl, refreshUrl);
  const authorizationUrl = buildQuickBooksAuthorizeUrl({
    clientId,
    redirectUri,
    scopes,
    state,
  });

  return NextResponse.json({
    authorizationUrl,
    redirectUri,
    scopes,
    environment: getQuickBooksEnvironment(),
  }, { status: 200 });
}
