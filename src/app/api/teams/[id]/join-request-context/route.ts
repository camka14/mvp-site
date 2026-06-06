import { NextRequest, NextResponse } from 'next/server';
import { getOptionalSession } from '@/lib/permissions';
import { listRegistrationQuestions } from '@/server/registrationQuestions';
import { getCurrentTeamJoinRequestForUser } from '@/server/teams/teamJoinRequests';
import { loadCanonicalTeamById } from '@/server/teams/teamMembership';
import { resolveSerializedTeamJoinPolicy } from '@/server/teams/teamJoinPolicy';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const team = await loadCanonicalTeamById(id);
  if (!team) {
    return NextResponse.json({ error: 'Team not found.' }, { status: 404 });
  }
  const session = await getOptionalSession(req);
  const [questions, currentRequest] = await Promise.all([
    listRegistrationQuestions({
      scopeType: 'TEAM',
      scopeId: id,
    }),
    session?.userId
      ? getCurrentTeamJoinRequestForUser({
        teamId: id,
        userId: session.userId,
      })
      : Promise.resolve(null),
  ]);

  return NextResponse.json({
    teamId: id,
    joinPolicy: resolveSerializedTeamJoinPolicy(team as Record<string, unknown>),
    openRegistration: Boolean((team as Record<string, unknown>).openRegistration),
    registrationPriceCents: Math.max(0, Math.round(Number((team as Record<string, unknown>).registrationPriceCents ?? 0))),
    questions,
    currentRequest,
  }, { status: 200 });
}
