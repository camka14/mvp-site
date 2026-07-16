import { NextRequest, NextResponse } from 'next/server';
import { requireRazumlyAdmin } from '@/server/razumlyAdmin';
import {
  getAffiliateSourceIntakeContext,
  reviewAffiliateSourceIntakePolicy,
  updateAffiliateSourceIntake,
} from '@/server/affiliateImports/sourceIntake';

type RouteContext = { params: Promise<{ id: string }> };
const normalizeId = (value: unknown): string | null => typeof value === 'string' && value.trim() ? value.trim() : null;

export async function GET(req: NextRequest, { params }: RouteContext) {
  try {
    await requireRazumlyAdmin(req);
    const id = normalizeId((await params).id);
    if (!id) return NextResponse.json({ error: 'Intake id is required.' }, { status: 400 });
    const runId = new URL(req.url).searchParams.get('runId');
    return NextResponse.json(await getAffiliateSourceIntakeContext(id, runId));
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : 'Failed to load affiliate source intake.';
    return NextResponse.json({ error: message }, { status: message.includes('not found') ? 404 : 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  try {
    const session = await requireRazumlyAdmin(req);
    const id = normalizeId((await params).id);
    if (!id) return NextResponse.json({ error: 'Intake id is required.' }, { status: 400 });
    const body = await req.json().catch(() => ({}));
    const intake = body?.policy
      ? await reviewAffiliateSourceIntakePolicy(id, body.policy, session.userId)
      : await updateAffiliateSourceIntake(id, {
        status: body?.status,
        notes: body?.notes,
        selectedLogoArtifactId: body?.selectedLogoArtifactId,
      });
    return NextResponse.json({ intake });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : 'Failed to update affiliate source intake.';
    return NextResponse.json({ error: message }, { status: message.includes('not found') ? 404 : 400 });
  }
}
