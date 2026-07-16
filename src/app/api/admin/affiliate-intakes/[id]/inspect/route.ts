import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRazumlyAdmin } from '@/server/razumlyAdmin';
import { queueAffiliateSourceIntakeRun } from '@/server/affiliateImports/sourceIntake';

type RouteContext = { params: Promise<{ id: string }> };
const inspectSchema = z.object({ pageIds: z.array(z.string().trim().min(1)).min(1).max(10) });

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const session = await requireRazumlyAdmin(req);
    const id = (await params).id?.trim();
    const parsed = inspectSchema.safeParse(await req.json().catch(() => null));
    if (!id || !parsed.success) {
      return NextResponse.json({ error: 'Valid intake id and selected page ids are required.' }, { status: 400 });
    }
    const run = await queueAffiliateSourceIntakeRun(id, parsed.data.pageIds, session.userId);
    return NextResponse.json({ run }, { status: 202 });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : 'Failed to queue source inspection.';
    const status = message.includes('not found') ? 404 : message.includes('policy') ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
