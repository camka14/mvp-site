import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/permissions';
import { canManageRegistrationQuestionScope } from '@/server/registrationQuestionAccess';
import {
  reviewTeamJoinRequest,
  withdrawTeamJoinRequest,
  type TeamJoinRequestAction,
} from '@/server/teams/teamJoinRequests';

export const dynamic = 'force-dynamic';

const normalizeAction = (value: unknown): TeamJoinRequestAction | null => {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (normalized === 'APPROVE' || normalized === 'DECLINE') {
    return normalized;
  }
  return null;
};

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; requestId: string }> },
) {
  const session = await requireSession(req);
  const { id, requestId } = await params;
  const canManage = await canManageRegistrationQuestionScope({
    session,
    scopeType: 'TEAM',
    scopeId: id,
  });
  if (!canManage) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const action = normalizeAction(body?.action);
  if (!action) {
    return NextResponse.json({ error: 'action must be APPROVE or DECLINE.' }, { status: 400 });
  }
  const result = await reviewTeamJoinRequest({
    teamId: id,
    requestId,
    reviewerUserId: session.userId,
    action,
    note: typeof body?.note === 'string' ? body.note : null,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ request: result.request }, { status: 200 });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; requestId: string }> },
) {
  const session = await requireSession(req);
  const { id, requestId } = await params;
  const result = await withdrawTeamJoinRequest({
    teamId: id,
    requestId,
    requesterUserId: session.userId,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ request: result.request }, { status: 200 });
}
