import { NextRequest, NextResponse } from 'next/server';
import { requireRazumlyAdmin } from '@/server/razumlyAdmin';
import { approveAffiliateSourceAutomation } from '@/server/affiliateImports/service';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRazumlyAdmin(req);
    const { id } = await params;
    const sourceId = id.trim();
    if (!sourceId) {
      return NextResponse.json({ error: 'Source id is required.' }, { status: 400 });
    }
    const source = await approveAffiliateSourceAutomation(sourceId, session.userId);
    return NextResponse.json({ source }, { status: 200 });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : 'Failed to approve automatic imports.';
    const status = message.includes('not found') ? 404 : 409;
    return NextResponse.json({ error: message }, { status });
  }
}
