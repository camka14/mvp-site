import { NextRequest, NextResponse } from 'next/server';
import { requireRazumlyAdmin } from '@/server/razumlyAdmin';
import {
  addAffiliateSourceDiscoveryResultToIntake,
  promoteAffiliateSourceDiscoveryResult,
} from '@/server/affiliateImports/sourceDiscovery';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const session = await requireRazumlyAdmin(req);
    const id = (await params).id?.trim();
    if (!id) return NextResponse.json({ error: 'Result id is required.' }, { status: 400 });
    const body = await req.json().catch(() => ({}));
    const intakeId = typeof body?.intakeId === 'string' ? body.intakeId.trim() : '';
    const intake = intakeId
      ? await addAffiliateSourceDiscoveryResultToIntake(id, intakeId, session.userId)
      : await promoteAffiliateSourceDiscoveryResult(id, session.userId);
    return NextResponse.json({ intake }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : 'Failed to create intake.';
    return NextResponse.json({ error: message }, { status: message.includes('not found') ? 404 : 400 });
  }
}
