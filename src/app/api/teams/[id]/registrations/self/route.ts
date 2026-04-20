import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/permissions';
import { withLegacyFields } from '@/server/legacyFormat';
import { loadCanonicalTeamById } from '@/server/teams/teamMembership';
import { leaveTeam, registerForTeam } from '@/server/teams/teamOpenRegistration';

export const dynamic = 'force-dynamic';

const toUniqueStrings = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((entry) => String(entry).trim()).filter(Boolean)));
};

const withTeamRoleAliases = (team: Record<string, any>) => {
  const formatted = withLegacyFields(team);
  const assistantCoachIds = toUniqueStrings((formatted as any).assistantCoachIds ?? (formatted as any).coachIds);
  return {
    ...formatted,
    assistantCoachIds,
    coachIds: assistantCoachIds,
  };
};

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(_req);
  const { id } = await params;
  const result = await registerForTeam({
    teamId: id,
    userId: session.userId,
    actorUserId: session.userId,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const team = await loadCanonicalTeamById(id);
  return NextResponse.json({
    registrationId: result.registrationId,
    status: result.status,
    team: team ? withTeamRoleAliases(team as Record<string, any>) : null,
  }, { status: 200 });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(req);
  const { id } = await params;
  const result = await leaveTeam({
    teamId: id,
    userId: session.userId,
    now: new Date(),
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const team = await loadCanonicalTeamById(id);
  return NextResponse.json({
    left: true,
    team: team ? withTeamRoleAliases(team as Record<string, any>) : null,
  }, { status: 200 });
}

