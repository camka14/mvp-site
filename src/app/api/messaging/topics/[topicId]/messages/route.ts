import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ topicId: string }> }) {
  await requireSession(req);
  const { topicId } = await params;
  const payload = await req.json().catch(() => null);
  return NextResponse.json({ ok: true, topicId, payload }, { status: 200 });
}
