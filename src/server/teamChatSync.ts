import { prisma } from '@/lib/prisma';
import { isMinorAtUtcDate } from '@/server/userPrivacy';
import { loadCanonicalTeamById } from '@/server/teams/teamMembership';

const TEAM_CHAT_GROUP_ID_PREFIX = 'team:';

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

export type TeamChatSyncOptions = {
  previousMemberIds?: string[];
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

export const getTeamChatBaseMemberIds = (team: {
  captainId?: unknown;
  managerId?: unknown;
  headCoachId?: unknown;
  coachIds?: unknown;
  playerIds?: unknown;
}): string[] => {
  return Array.from(new Set([
    String(team.managerId ?? '').trim(),
    String(team.captainId ?? '').trim(),
    String(team.headCoachId ?? '').trim(),
    ...normalizeIdList(team.coachIds),
    ...normalizeIdList(team.playerIds),
  ].filter(Boolean)));
};

const buildTeamChatGroupId = (teamId: string): string => {
  const normalizedTeamId = String(teamId ?? '').trim();
  if (!normalizedTeamId) {
    throw new Error('Cannot build team chat group id without a team id');
  }
  return `${TEAM_CHAT_GROUP_ID_PREFIX}${normalizedTeamId}`;
};

const isUnknownTeamIdArgumentError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return message.includes('Unknown argument `teamId`');
};

const findExistingTeamChatGroup = async (
  chatGroupDelegate: any,
  teamId: string,
): Promise<{ id: string; userIds: string[] } | null> => {
  const stableGroupId = buildTeamChatGroupId(teamId);

  const byStableId = await chatGroupDelegate.findUnique({
    where: { id: stableGroupId },
    select: { id: true, userIds: true },
  });
  if (byStableId?.id) {
    return byStableId;
  }

  try {
    const byLegacyTeamId = await chatGroupDelegate.findUnique({
      where: { teamId },
      select: { id: true, userIds: true },
    });
    if (byLegacyTeamId?.id) {
      return byLegacyTeamId;
    }
  } catch (error) {
    if (!isUnknownTeamIdArgumentError(error)) {
      throw error;
    }
  }

  return null;
};

const createTeamChatGroup = async (
  chatGroupDelegate: any,
  params: {
    chatGroupId: string;
    team: TeamRecord;
    memberIds: string[];
    hostId: string;
    now: Date;
  },
): Promise<void> => {
  const baseData = {
    id: params.chatGroupId,
    name: params.team.name,
    hostId: params.hostId,
    userIds: params.memberIds,
    createdAt: params.now,
    updatedAt: params.now,
  };

  try {
    await chatGroupDelegate.create({
      data: {
        ...baseData,
        teamId: params.team.id,
      },
    });
  } catch (error) {
    if (!isUnknownTeamIdArgumentError(error)) {
      throw error;
    }

    await chatGroupDelegate.create({
      data: baseData,
    });
  }
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
  const canonicalTeam = await loadCanonicalTeamById(teamId, tx);
  if (canonicalTeam) {
    return {
      id: canonicalTeam.id,
      name: canonicalTeam.name ?? null,
      captainId: canonicalTeam.captainId ?? '',
      managerId: canonicalTeam.managerId ?? '',
      headCoachId: canonicalTeam.headCoachId ?? null,
      coachIds: Array.isArray(canonicalTeam.coachIds) ? canonicalTeam.coachIds : [],
      playerIds: Array.isArray(canonicalTeam.playerIds) ? canonicalTeam.playerIds : [],
    };
  }

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

export const syncTeamChatInTx = async (
  tx: any,
  teamId: string,
  options: TeamChatSyncOptions = {},
): Promise<void> => {
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
  const managedMemberIds = Array.from(new Set([...baseMemberIds, ...parentIds]));
  if (!managedMemberIds.length) {
    return;
  }

  const hostId = resolveTeamChatHostId(team, managedMemberIds);
  const now = new Date();
  const chatGroupId = buildTeamChatGroupId(team.id);
  const existing = await findExistingTeamChatGroup(chatGroupDelegate, team.id);

  if (existing) {
    let nextUserIds = managedMemberIds;
    const previousMemberIds = normalizeIdList(options.previousMemberIds);
    if (previousMemberIds.length > 0) {
      const previousParentIds = await getActiveParentIdsForMinorMembers(tx, previousMemberIds);
      const previousManagedMemberSet = new Set([...previousMemberIds, ...previousParentIds]);
      const currentManagedMemberSet = new Set(managedMemberIds);
      const existingUserSet = new Set(normalizeIdList(existing.userIds));

      for (const memberId of currentManagedMemberSet) {
        if (!previousManagedMemberSet.has(memberId)) {
          existingUserSet.add(memberId);
        }
      }
      for (const memberId of previousManagedMemberSet) {
        if (!currentManagedMemberSet.has(memberId)) {
          existingUserSet.delete(memberId);
        }
      }
      existingUserSet.add(hostId);
      nextUserIds = Array.from(existingUserSet);
    }

    await chatGroupDelegate.update({
      where: { id: existing.id },
      data: {
        name: team.name,
        userIds: nextUserIds,
        hostId,
        updatedAt: now,
      },
    });
    return;
  }

  await createTeamChatGroup(chatGroupDelegate, {
    chatGroupId,
    team,
    memberIds: managedMemberIds,
    hostId,
    now,
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

  const existing = await findExistingTeamChatGroup(chatGroupDelegate, teamId);
  if (!existing?.id) {
    return;
  }

  await tx.messages.deleteMany({ where: { chatId: existing.id } });
  await chatGroupDelegate.delete({ where: { id: existing.id } });
};
