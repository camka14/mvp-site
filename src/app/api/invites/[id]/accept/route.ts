import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

const uniqueStrings = (values: unknown[]): string[] => {
  return Array.from(new Set(values.map((value) => String(value)).filter(Boolean)));
};

const TEAM_INVITE_TYPE_TO_ROLE: Record<string, 'player' | 'manager' | 'headCoach' | 'assistantCoach'> = {
  player: 'player',
  team_manager: 'manager',
  team_head_coach: 'headCoach',
  team_assistant_coach: 'assistantCoach',
};
const getTeamsDelegate = (client: any) => client?.teams ?? client?.volleyBallTeams;
const UNKNOWN_ARGUMENT_REGEX = /Unknown argument `([^`]+)`/i;

const extractUnknownArgument = (error: unknown): string | null => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const match = message.match(UNKNOWN_ARGUMENT_REGEX);
  return match?.[1] ?? null;
};

const omitKeys = (data: Record<string, unknown>, keys: Set<string>): Record<string, unknown> => {
  if (!keys.size) return data;
  return Object.fromEntries(Object.entries(data).filter(([key]) => !keys.has(key)));
};

const updateTeamWithCompatibility = async (
  teamsDelegate: any,
  where: Record<string, unknown>,
  data: Record<string, unknown>,
  inviteUserId: string,
  currentCoachIds: string[],
): Promise<void> => {
  const omittedKeys = new Set<string>();
  let fallbackCoachIdsApplied = false;
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      await teamsDelegate.update({
        where,
        data: omitKeys(data, omittedKeys),
      });
      return;
    } catch (error) {
      lastError = error;
      const unknownArgument = extractUnknownArgument(error);
      if (!unknownArgument) throw error;

      // Backward compatibility: older schemas may not have headCoachId.
      // Preserve role assignment by folding into coachIds once.
      if (
        unknownArgument === 'headCoachId'
        && Object.prototype.hasOwnProperty.call(data, 'headCoachId')
        && !fallbackCoachIdsApplied
      ) {
        data.coachIds = uniqueStrings([...(Array.isArray(data.coachIds) ? data.coachIds : currentCoachIds), inviteUserId]);
        fallbackCoachIdsApplied = true;
      }

      if (omittedKeys.has(unknownArgument) || !Object.prototype.hasOwnProperty.call(data, unknownArgument)) {
        throw error;
      }
      omittedKeys.add(unknownArgument);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Failed to update team with compatible schema.');
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(req);
  const { id } = await params;

  const invite = await prisma.invites.findUnique({ where: { id } });
  if (!invite) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (!session.isAdmin && invite.userId !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const inviteRole = TEAM_INVITE_TYPE_TO_ROLE[String(invite.type ?? '').toLowerCase()];
  if (!inviteRole || !invite.teamId || !invite.userId) {
    return NextResponse.json({ error: 'Invalid invite' }, { status: 400 });
  }

  const now = new Date();
  const ok = await prisma.$transaction(async (tx) => {
    const teamsDelegate = getTeamsDelegate(tx);
    const team = await teamsDelegate?.findUnique({ where: { id: invite.teamId as string } });
    if (!team) {
      return false;
    }

    const updatePayload: Record<string, unknown> = { updatedAt: now };
    if (inviteRole === 'player') {
      const playerIds = Array.isArray(team.playerIds) ? team.playerIds : [];
      const pending = Array.isArray(team.pending) ? team.pending : [];
      updatePayload.playerIds = uniqueStrings([...playerIds, invite.userId]);
      updatePayload.pending = pending.filter((userId: string) => userId !== invite.userId);
    } else if (inviteRole === 'manager') {
      updatePayload.managerId = invite.userId;
    } else if (inviteRole === 'headCoach') {
      updatePayload.headCoachId = invite.userId;
    } else if (inviteRole === 'assistantCoach') {
      const currentAssistantCoachIds = Array.isArray(team.coachIds) ? team.coachIds : [];
      updatePayload.coachIds = uniqueStrings([...currentAssistantCoachIds, invite.userId]);
    }

    await updateTeamWithCompatibility(
      teamsDelegate,
      { id: invite.teamId as string },
      updatePayload,
      invite.userId as string,
      Array.isArray(team.coachIds) ? team.coachIds : [],
    );

    // Keep userData.teamIds consistent with team membership.
    const user = await tx.userData.findUnique({ where: { id: invite.userId as string } });
    if (user) {
      const teamIds = Array.isArray(user.teamIds) ? user.teamIds : [];
      const nextTeamIds = uniqueStrings([...teamIds, invite.teamId]);
      await tx.userData.update({
        where: { id: invite.userId as string },
        data: {
          teamIds: nextTeamIds,
          updatedAt: now,
        },
      });
    }

    await tx.invites.delete({ where: { id: invite.id } });
    return true;
  });

  if (!ok) {
    return NextResponse.json({ error: 'Team not found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
