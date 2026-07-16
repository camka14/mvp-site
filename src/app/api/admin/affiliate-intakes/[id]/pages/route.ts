import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRazumlyAdmin } from '@/server/razumlyAdmin';
import { addAffiliateSourceIntakePage } from '@/server/affiliateImports/sourceIntake';

type RouteContext = { params: Promise<{ id: string }> };
const pageSchema = z.object({
  url: z.string().trim().url(),
  role: z.string().trim().min(1).optional(),
  targetKindHints: z.array(z.string().trim().min(1)).optional(),
});

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    await requireRazumlyAdmin(req);
    const id = (await params).id?.trim();
    const parsed = pageSchema.safeParse(await req.json().catch(() => null));
    if (!id || !parsed.success) {
      return NextResponse.json({ error: 'Valid intake id and page are required.' }, { status: 400 });
    }
    return NextResponse.json({ page: await addAffiliateSourceIntakePage(id, parsed.data) }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : 'Failed to add intake page.';
    return NextResponse.json({ error: message }, { status: message.includes('not found') ? 404 : 400 });
  }
}
