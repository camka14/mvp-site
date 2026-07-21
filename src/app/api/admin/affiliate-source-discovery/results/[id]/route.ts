import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRazumlyAdmin } from '@/server/razumlyAdmin';
import { updateAffiliateSourceDiscoveryResult } from '@/server/affiliateImports/sourceDiscovery';

type RouteContext = { params: Promise<{ id: string }> };
const actionSchema = z.object({ action: z.enum(['REJECT', 'RETRY_CLASSIFICATION']) });

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  try {
    await requireRazumlyAdmin(req);
    const id = (await params).id?.trim();
    const parsed = actionSchema.safeParse(await req.json().catch(() => null));
    if (!id || !parsed.success) return NextResponse.json({ error: 'Valid result action is required.' }, { status: 400 });
    return NextResponse.json({ result: await updateAffiliateSourceDiscoveryResult(id, parsed.data) });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : 'Result action failed.';
    return NextResponse.json({ error: message }, { status: message.includes('not found') ? 404 : 400 });
  }
}
