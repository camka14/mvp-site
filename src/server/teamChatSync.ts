import { prisma } from '@/lib/prisma';
import { isMinorAtUtcDate } from '@/server/userPrivacy';
import { loadCanonicalTeamById } from '@/server/teams/teamMembership';

const TEAM_CHAT_GROUP_ID_PREFIX = 'team:';

const getTeamsDelegate = (client: any) => client?.teams;

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
): Promise<{ id: string; userIds: string[]; teamId?: string | null } | null> => {
  const stableGroupId = buildTeamChatGroupId(teamId);
  const readGroup = async (where: Record<string, unknown>) => {
    try {
      return await chatGroupDelegate.findUnique({
        where,
        select: { id: true, userIds: true, teamId: true },
      });
    } catch (error) {
      if (!isUnknownTeamIdArgumentError(error)) {
        throw error;
      }
      return chatGroupDelegate.findUnique({
        where,
        select: { id: true, userIds: true },
      });
    }
  };

  const byStableId = await readGroup({ id: stableGroupId });
  if (byStableId?.id) {
    return byStableId;
  }

  try {
    const byLegacyTeamId = await readGroup({ teamId });
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

const getActiveParentIdsForMinorMembers = async (
  tx: any,
  memberIds: string[],
  options: { failClosed?: boolean } = {},
): Promise<string[] | null> => {
  if (!memberIds.length) {
    return [];
  }
  const userDataDelegate = tx?.userData;
  if (!userDataDelegate?.findMany) {
    return options.failClosed ? null : [];
  }

  const members = await userDataDelegate.findMany({
    where: { id: { in: memberIds } },
    select: {
      id: true,
      dateOfBirth: true,
    },
  });
  if (options.failClosed && members.length !== new Set(memberIds).size) {
    return null;
  }

  const minorMemberIds = members
    .filter((member: { dateOfBirth: Date | null }) => isMinorAtUtcDate(member.dateOfBirth))
    .map((member: { id: string }) => member.id);

  if (!minorMemberIds.length) {
    return [];
  }

  const parentChildLinksDelegate = tx?.parentChildLinks;
  if (!parentChildLinksDelegate?.findMany) {
    return options.failClosed ? null : [];
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

/**
 * Returns the authoritative roster for a team chat, including active guardians
 * of current minor players. Unlike the write-side synchronizer, this fails
 * closed when the roster cannot be fully resolved so an old ChatGroup.userIds
 * array can never grant access by itself.
 */
export const getCurrentTeamChatMemberIds = async (
  tx: any,
  teamId: string,
): Promise<string[] | null> => {
  const normalizedTeamId = String(teamId ?? '').trim();
  if (!normalizedTeamId) {
    return null;
  }

  const team = await getTeamById(tx, normalizedTeamId);
  if (!team) {
    return null;
  }

  const baseMemberIds = getTeamMemberIds(team);
  if (!baseMemberIds.length) {
    return null;
  }

  const parentIds = await getActiveParentIdsForMinorMembers(tx, baseMemberIds, { failClosed: true });
  if (!parentIds) {
    return null;
  }

  return Array.from(new Set([...baseMemberIds, ...parentIds]));
};

export const syncTeamChatInTx = async (
  tx: any,
  teamId: string,
  options: TeamChatSyncOptions = {},
): Promise<void> => {
  // Team-chat membership is roster-derived. Retaining arbitrary historical
  // group members lets a forged/preexisting row survive future roster syncs.
  void options;
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
  const managedMemberIds = Array.from(new Set([...baseMemberIds, ...(parentIds ?? [])]));
  if (!managedMemberIds.length) {
    return;
  }

  const hostId = resolveTeamChatHostId(team, managedMemberIds);
  const now = new Date();
  const chatGroupId = buildTeamChatGroupId(team.id);
  const existing = await findExistingTeamChatGroup(chatGroupDelegate, team.id);

  if (existing) {
    const nextUserIds = managedMemberIds;

    // A historical generic row can collide with the deterministic team ID.
    // Clear its untrusted messages before adopting it, then persist the team
    // association so all team-chat guards apply going forward.
    if (existing.id === chatGroupId && existing.teamId === null && tx?.messages?.deleteMany) {
      await tx.messages.deleteMany({ where: { chatId: existing.id } });
    }
    const baseData = {
      name: team.name,
      userIds: nextUserIds,
      hostId,
      updatedAt: now,
    };
    try {
      await chatGroupDelegate.update({
        where: { id: existing.id },
        data: { ...baseData, teamId: team.id },
      });
    } catch (error) {
      if (!isUnknownTeamIdArgumentError(error)) {
        throw error;
      }
      await chatGroupDelegate.update({
        where: { id: existing.id },
        data: baseData,
      });
    }
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
