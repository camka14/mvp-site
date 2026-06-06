import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/permissions';
import { canManageRegistrationQuestionScope } from '@/server/registrationQuestionAccess';
import {
  listTeamJoinRequests,
  submitTeamJoinRequest,
} from '@/server/teams/teamJoinRequests';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(req);
  const { id } = await params;
  const canManage = await canManageRegistrationQuestionScope({
    session,
    scopeType: 'TEAM',
    scopeId: id,
  });
  if (!canManage) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const requests = await listTeamJoinRequests({ teamId: id });
  return NextResponse.json({ requests }, { status: 200 });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(req);
  const { id } = await params;
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const result = await submitTeamJoinRequest({
    teamId: id,
    requesterUserId: session.userId,
    registrantUserId: typeof body?.registrantUserId === 'string' ? body.registrantUserId : session.userId,
    parentId: typeof body?.parentId === 'string' ? body.parentId : null,
    registrantType: String(body?.registrantType ?? '').toUpperCase() === 'CHILD' ? 'CHILD' : 'SELF',
    answers: body?.answers,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ request: result.request }, { status: 201 });
}
