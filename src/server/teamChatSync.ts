import { prisma } from '@/lib/prisma';
import { isMinorAtUtcDate } from '@/server/userPrivacy';

const getTeamsDelegate = (client: any) => client?.teams ?? client?.volleyBallTeams;

const normalizeIdList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((entry) => String(entry).trim()).filter(Boolean)));
};

type TeamRecord = {
  id: string;
  name: string | null;
  captainId: string;
  managerId: string;
  headCoachId: string | null;
  coachIds: string[];
  playerIds: string[];
};

const resolveTeamChatHostId = (team: TeamRecord, memberIds: string[]): string => {
  const preferred = [
    team.managerId,
    team.captainId,
    team.headCoachId ?? '',
    ...normalizeIdList(team.coachIds),
    ...memberIds,
  ]
    .map((entry) => String(entry ?? '').trim())
    .find((entry) => entry.length > 0);
  if (!preferred) {
    throw new Error(`Cannot resolve team chat host for team ${team.id}`);
  }
  return preferred;
};

const getTeamMemberIds = (team: TeamRecord): string[] => {
  return Array.from(new Set([
    team.managerId,
    team.captainId,
    team.headCoachId ?? '',
    ...normalizeIdList(team.coachIds),
    ...normalizeIdList(team.playerIds),
  ].map((entry) => String(entry).trim()).filter(Boolean)));
};

const getActiveParentIdsForMinorMembers = async (tx: any, memberIds: string[]): Promise<string[]> => {
  if (!memberIds.length) {
    return [];
  }
  const userDataDelegate = tx?.userData;
  const parentChildLinksDelegate = tx?.parentChildLinks;
  if (!userDataDelegate?.findMany || !parentChildLinksDelegate?.findMany) {
    return [];
  }

  const members = await userDataDelegate.findMany({
    where: { id: { in: memberIds } },
    select: {
      id: true,
      dateOfBirth: true,
    },
  });

  const minorMemberIds = members
    .filter((member: { dateOfBirth: Date | null }) => isMinorAtUtcDate(member.dateOfBirth))
    .map((member: { id: string }) => member.id);

  if (!minorMemberIds.length) {
    return [];
  }

  const activeLinks = await parentChildLinksDelegate.findMany({
    where: {
      childId: { in: minorMemberIds },
      status: 'ACTIVE',
    },
    select: {
      parentId: true,
    },
  });

  return Array.from(new Set(activeLinks.map((link: { parentId: string }) => link.parentId.trim()).filter(Boolean)));
};

const getTeamById = async (tx: any, teamId: string): Promise<TeamRecord | null> => {
  const teamsDelegate = getTeamsDelegate(tx);
  if (!teamsDelegate?.findUnique) {
    return null;
  }

  return teamsDelegate.findUnique({
    where: { id: teamId },
    select: {
      id: true,
      name: true,
      captainId: true,
      managerId: true,
      headCoachId: true,
      coachIds: true,
      playerIds: true,
    },
  });
};

export const syncTeamChatInTx = async (tx: any, teamId: string): Promise<void> => {
  const team = await getTeamById(tx, teamId);
  if (!team) {
    return;
  }
  const chatGroupDelegate = tx?.chatGroup;
  if (!chatGroupDelegate?.findUnique || !chatGroupDelegate?.create || !chatGroupDelegate?.update) {
    return;
  }

  const baseMemberIds = getTeamMemberIds(team);
  const parentIds = await getActiveParentIdsForMinorMembers(tx, baseMemberIds);
  const memberIds = Array.from(new Set([...baseMemberIds, ...parentIds]));
  if (!memberIds.length) {
    return;
  }

  const hostId = resolveTeamChatHostId(team, memberIds);
  const now = new Date();
  const existing = await chatGroupDelegate.findUnique({
    where: { teamId: team.id },
    select: { id: true },
  });

  if (existing) {
    await chatGroupDelegate.update({
      where: { id: existing.id },
      data: {
        name: team.name,
        userIds: memberIds,
        hostId,
        updatedAt: now,
      },
    });
    return;
  }

  await chatGroupDelegate.create({
    data: {
      id: crypto.randomUUID(),
      name: team.name,
      teamId: team.id,
      hostId,
      userIds: memberIds,
      createdAt: now,
      updatedAt: now,
    },
  });
};

export const syncTeamChatByTeamId = async (teamId: string): Promise<void> => {
  await prisma.$transaction(async (tx) => {
    await syncTeamChatInTx(tx, teamId);
  });
};

export const deleteTeamChatInTx = async (tx: any, teamId: string): Promise<void> => {
  const chatGroupDelegate = tx?.chatGroup;
  if (!chatGroupDelegate?.findUnique || !chatGroupDelegate?.delete || !tx?.messages?.deleteMany) {
    return;
  }

  const existing = await chatGroupDelegate.findUnique({
    where: { teamId },
    select: { id: true },
  });
  if (!existing?.id) {
    return;
  }

  await tx.messages.deleteMany({ where: { chatId: existing.id } });
  await chatGroupDelegate.delete({ where: { id: existing.id } });
};
