import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/permissions';
import { handleApiRouteError } from '@/server/http/routeErrors';
import { requestTeamRegistrationRefund } from '@/server/teams/teamOpenRegistration';

export const dynamic = 'force-dynamic';

type RefundRequestBody = {
  reason?: unknown;
};

const normalizeReason = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length ? normalized : null;
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(req);
    const { id } = await params;
    const body = await req.json().catch(() => null) as RefundRequestBody | null;
    const result = await requestTeamRegistrationRefund({
      teamId: id,
      userId: session.userId,
      reason: normalizeReason(body?.reason),
      now: new Date(),
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      success: true,
      refundId: result.refundId,
      refundAlreadyPending: result.refundAlreadyPending,
    }, { status: 200 });
  } catch (error) {
    return handleApiRouteError(error, 'Failed to request team registration refund');
  }
}
