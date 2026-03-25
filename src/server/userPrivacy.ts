import type { Prisma } from '@/generated/prisma/client';
import { formatNameParts, normalizeOptionalName } from '@/lib/nameCase';

export const NAME_HIDDEN_LABEL = 'Name Hidden';

export const publicUserSelect = {
  id: true,
  createdAt: true,
  updatedAt: true,
  firstName: true,
  lastName: true,
  dateOfBirth: true,
  dobVerified: true,
  dobVerifiedAt: true,
  ageVerificationProvider: true,
  teamIds: true,
  friendIds: true,
  userName: true,
  hasStripeAccount: true,
  followingIds: true,
  friendRequestIds: true,
  friendRequestSentIds: true,
  uploadedImages: true,
  profileImageId: true,
  homePageOrganizationId: true,
} as const;

export type PublicUser = Prisma.UserDataGetPayload<{ select: typeof publicUserSelect }>;

export type VisibilityUser = PublicUser & {
  isMinor: boolean;
  isIdentityHidden: boolean;
  displayName: string;
};

type VisibilityContextOptions = {
  viewerId?: string | null;
  isAdmin?: boolean;
  teamId?: string | null;
  eventId?: string | null;
  allowManagerFreeAgentUnmask?: boolean;
  freeAgentUserIds?: string[];
  now?: Date;
};

export type VisibilityContext = {
  viewerId: string | null;
  isAdmin: boolean;
  now: Date;
  activeChildIds: Set<string>;
  parentTeamIds: Set<string>;
  viewerBelongsToContextTeam: boolean;
  contextTeamAllowsParent: boolean;
  contextEventAllowsParent: boolean;
  contextEventAllowsHost: boolean;
  contextOrganizationAllowsStaff: boolean;
  contextTeamVisibleUserIds: Set<string>;
  contextEventVisibleUserIds: Set<string>;
  contextEventViewerTeamVisibleUserIds: Set<string>;
  contextEventParentVisibleUserIds: Set<string>;
  contextOrganizationVisibleUserIds: Set<string>;
  contextEventFreeAgentIds: Set<string>;
  viewerManagesContextTeam: boolean;
  allowManagerFreeAgentUnmask: boolean;
};

const normalizeId = (value: string | null | undefined): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length ? normalized : null;
};

const normalizeIdList = (value: string[] | null | undefined): string[] => {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((entry) => String(entry).trim()).filter(Boolean)));
};

const UNKNOWN_DOB_MAX_TIMESTAMP = 24 * 60 * 60 * 1000;

export const isUnknownDateOfBirth = (value: Date | string | null | undefined): boolean => {
  if (value == null) return true;
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return true;
  return parsed.getTime() <= UNKNOWN_DOB_MAX_TIMESTAMP;
};

export const isMinorAtUtcDate = (value: Date | string | null | undefined, now: Date = new Date()): boolean => {
  if (isUnknownDateOfBirth(value)) {
    return true;
  }

  const dob = value instanceof Date ? value : new Date(value as string);
  const birthYear = dob.getUTCFullYear();
  const birthMonth = dob.getUTCMonth();
  const birthDay = dob.getUTCDate();

  const nowYear = now.getUTCFullYear();
  const nowMonth = now.getUTCMonth();
  const nowDay = now.getUTCDate();

  let age = nowYear - birthYear;
  if (nowMonth < birthMonth || (nowMonth === birthMonth && nowDay < birthDay)) {
    age -= 1;
  }

  return age < 18;
};

const resolveDisplayName = (user: Pick<PublicUser, 'firstName' | 'lastName' | 'userName'>): string => {
  const fullName = formatNameParts(user.firstName, user.lastName);
  if (fullName) return fullName;
  const handle = user.userName?.trim();
  if (handle) return handle;
  return 'User';
};

export const createVisibilityContext = async (
  client: {
    parentChildLinks: { findMany: (args: any) => Promise<Array<{ childId: string }>> };
    staffMembers: { findMany: (args: any) => Promise<Array<{ organizationId: string }>> };
    teams: {
      findMany: (args: any) => Promise<Array<{
        id?: string;
        captainId?: string | null;
        managerId?: string | null;
        headCoachId?: string | null;
        coachIds?: string[];
        playerIds?: string[];
        pending?: string[];
      }>>;
      findUnique: (args: any) => Promise<{
        id: string;
        captainId: string;
        managerId: string;
        headCoachId: string | null;
        coachIds: string[];
        playerIds: string[];
        pending: string[];
      } | null>;
    };
    events: {
      findUnique: (args: any) => Promise<{
        hostId: string | null;
        organizationId: string | null;
        teamIds: string[];
        freeAgentIds: string[];
        userIds: string[];
      } | null>;
    };
    organizations: {
      findMany: (args: any) => Promise<Array<{ id: string }>>;
      findUnique: (args: any) => Promise<{ id?: string; teamIds?: string[] } | null>;
      findFirst: (args: any) => Promise<{ id: string } | null>;
    };
  },
  options: VisibilityContextOptions,
): Promise<VisibilityContext> => {
  const viewerId = normalizeId(options.viewerId ?? null);
  const isAdmin = Boolean(options.isAdmin);
  const now = options.now ?? new Date();

  const contextTeamId = normalizeId(options.teamId ?? null);
  const contextEventId = normalizeId(options.eventId ?? null);

  if (!viewerId || isAdmin) {
    return {
      viewerId,
      isAdmin,
      now,
      activeChildIds: new Set(),
      parentTeamIds: new Set(),
      viewerBelongsToContextTeam: false,
      contextTeamAllowsParent: false,
      contextEventAllowsParent: false,
      contextEventAllowsHost: false,
      contextOrganizationAllowsStaff: false,
      contextTeamVisibleUserIds: new Set(),
      contextEventVisibleUserIds: new Set(),
      contextEventViewerTeamVisibleUserIds: new Set(),
      contextEventParentVisibleUserIds: new Set(),
      contextOrganizationVisibleUserIds: new Set(),
      contextEventFreeAgentIds: new Set(normalizeIdList(options.freeAgentUserIds)),
      viewerManagesContextTeam: isAdmin,
      allowManagerFreeAgentUnmask: Boolean(options.allowManagerFreeAgentUnmask),
    };
  }

  const childLinks = await client.parentChildLinks.findMany({
    where: {
      parentId: viewerId,
      status: 'ACTIVE',
    },
    select: { childId: true },
  });
  const activeChildIds = new Set(normalizeIdList(childLinks.map((row) => row.childId)));

  const [ownedOrganizations, staffMemberships] = await Promise.all([
    client.organizations.findMany({
      where: { ownerId: viewerId },
      select: { id: true },
    }),
    client.staffMembers.findMany({
      where: { userId: viewerId },
      select: { organizationId: true },
    }),
  ]);
  const viewerOrganizationIds = new Set(normalizeIdList([
    ...ownedOrganizations.map((organization) => organization.id),
    ...staffMemberships.map((membership) => membership.organizationId),
  ]));

  let parentTeamIds = new Set<string>();
  if (activeChildIds.size > 0) {
    const childTeams = await client.teams.findMany({
      where: {
        playerIds: { hasSome: Array.from(activeChildIds) },
      },
      select: { id: true },
    });
    parentTeamIds = new Set(normalizeIdList(childTeams.map((row) => row.id ?? '')));
  }

  let viewerManagesContextTeam = false;
  let viewerBelongsToContextTeam = false;
  let contextTeamVisibleUserIds = new Set<string>();
  let contextOrganizationId: string | null = null;
  if (contextTeamId) {
    const contextTeam = await client.teams.findUnique({
      where: { id: contextTeamId },
      select: {
        id: true,
        captainId: true,
        managerId: true,
        headCoachId: true,
        coachIds: true,
        playerIds: true,
        pending: true,
      },
    });
    if (contextTeam) {
      viewerManagesContextTeam = (
        contextTeam.captainId === viewerId
        || contextTeam.managerId === viewerId
        || contextTeam.headCoachId === viewerId
        || normalizeIdList(contextTeam.coachIds).includes(viewerId)
      );
      contextTeamVisibleUserIds = new Set(normalizeIdList([
        contextTeam.captainId,
        contextTeam.managerId,
        contextTeam.headCoachId ?? '',
        ...contextTeam.coachIds,
        ...contextTeam.playerIds,
        ...contextTeam.pending,
      ]));
      viewerBelongsToContextTeam = contextTeamVisibleUserIds.has(viewerId);
      const contextTeamOrganization = await client.organizations.findFirst({
        where: { teamIds: { has: contextTeam.id } },
        select: { id: true },
      });
      contextOrganizationId = normalizeId(contextTeamOrganization?.id ?? null);
    }
  }

  let contextEventAllowsParent = false;
  let contextEventAllowsHost = false;
  let contextEventVisibleUserIds = new Set<string>();
  let contextEventViewerTeamVisibleUserIds = new Set<string>();
  let contextEventParentVisibleUserIds = new Set<string>();
  let contextEventFreeAgentIds = new Set<string>(normalizeIdList(options.freeAgentUserIds));
  if (contextEventId) {
    const contextEvent = await client.events.findUnique({
      where: { id: contextEventId },
      select: {
        hostId: true,
        organizationId: true,
        teamIds: true,
        userIds: true,
        freeAgentIds: true,
      },
    });

    const contextEventTeamIds = new Set(normalizeIdList(contextEvent?.teamIds));
    const contextEventTeamIdValues = Array.from(contextEventTeamIds);
    contextEventAllowsParent = contextEventTeamIdValues.some((teamId) => parentTeamIds.has(teamId));
    contextEventAllowsHost = normalizeId(contextEvent?.hostId ?? null) === viewerId;
    contextOrganizationId = normalizeId(contextEvent?.organizationId ?? null) ?? contextOrganizationId;

    if (contextEvent?.freeAgentIds?.length) {
      contextEventFreeAgentIds = new Set([
        ...Array.from(contextEventFreeAgentIds),
        ...normalizeIdList(contextEvent.freeAgentIds),
      ]);
    }

    let eventTeamVisibleUserIds: string[] = [];
    if (contextEventTeamIdValues.length) {
      const contextEventTeams = await client.teams.findMany({
        where: { id: { in: contextEventTeamIdValues } },
        select: {
          id: true,
          captainId: true,
          managerId: true,
          headCoachId: true,
          coachIds: true,
          playerIds: true,
          pending: true,
        },
      });
      const eventTeamVisibilityRows = contextEventTeams.map((team) => {
        const teamId = normalizeId(team.id ?? '') ?? '';
        const visibleUserIds = normalizeIdList([
          team.captainId ?? '',
          team.managerId ?? '',
          team.headCoachId ?? '',
          ...(team.coachIds ?? []),
          ...(team.playerIds ?? []),
          ...(team.pending ?? []),
        ]);
        return { teamId, visibleUserIds };
      });

      eventTeamVisibleUserIds = eventTeamVisibilityRows.flatMap((row) => row.visibleUserIds);

      const viewerScopedRows = eventTeamVisibilityRows.filter((row) => row.visibleUserIds.includes(viewerId));
      contextEventViewerTeamVisibleUserIds = new Set(
        normalizeIdList(viewerScopedRows.flatMap((row) => row.visibleUserIds)),
      );

      const parentScopedRows = eventTeamVisibilityRows.filter((row) => row.teamId && parentTeamIds.has(row.teamId));
      contextEventParentVisibleUserIds = new Set(
        normalizeIdList(parentScopedRows.flatMap((row) => row.visibleUserIds)),
      );
      contextEventAllowsParent = parentScopedRows.length > 0;
    }

    contextEventVisibleUserIds = new Set(normalizeIdList([
      ...(contextEvent?.userIds ?? []),
      ...(contextEvent?.freeAgentIds ?? []),
      ...eventTeamVisibleUserIds,
    ]));
  }

  let contextOrganizationAllowsStaff = false;
  let contextOrganizationVisibleUserIds = new Set<string>();
  if (contextOrganizationId && viewerOrganizationIds.has(contextOrganizationId)) {
    contextOrganizationAllowsStaff = true;
    const organization = await client.organizations.findUnique({
      where: { id: contextOrganizationId },
      select: { teamIds: true },
    });
    const organizationTeamIds = normalizeIdList(organization?.teamIds);
    if (organizationTeamIds.length) {
      const organizationTeams = await client.teams.findMany({
        where: { id: { in: organizationTeamIds } },
        select: {
          captainId: true,
          managerId: true,
          headCoachId: true,
          coachIds: true,
          playerIds: true,
          pending: true,
        },
      });
      contextOrganizationVisibleUserIds = new Set(normalizeIdList(organizationTeams.flatMap((team) => [
        team.captainId ?? '',
        team.managerId ?? '',
        team.headCoachId ?? '',
        ...(team.coachIds ?? []),
        ...(team.playerIds ?? []),
        ...(team.pending ?? []),
      ])));
    }
  }

  return {
    viewerId,
    isAdmin,
    now,
    activeChildIds,
    parentTeamIds,
    viewerBelongsToContextTeam,
    contextTeamAllowsParent: contextTeamId ? parentTeamIds.has(contextTeamId) : false,
    contextEventAllowsParent,
    contextEventAllowsHost,
    contextOrganizationAllowsStaff,
    contextTeamVisibleUserIds,
    contextEventVisibleUserIds,
    contextEventViewerTeamVisibleUserIds,
    contextEventParentVisibleUserIds,
    contextOrganizationVisibleUserIds,
    contextEventFreeAgentIds,
    viewerManagesContextTeam,
    allowManagerFreeAgentUnmask: Boolean(options.allowManagerFreeAgentUnmask),
  };
};

const canViewerSeeMinorIdentity = (targetUserId: string, context: VisibilityContext): boolean => {
  if (context.isAdmin) return true;
  if (!context.viewerId) return false;
  if (context.viewerId === targetUserId) return true;
  if (context.activeChildIds.has(targetUserId)) return true;
  if (context.viewerBelongsToContextTeam && context.contextTeamVisibleUserIds.has(targetUserId)) return true;
  if (context.viewerManagesContextTeam && context.contextTeamVisibleUserIds.has(targetUserId)) return true;
  if (context.contextEventViewerTeamVisibleUserIds.has(targetUserId)) return true;
  if (context.contextEventAllowsHost && context.contextEventVisibleUserIds.has(targetUserId)) return true;
  if (context.contextTeamAllowsParent && context.contextTeamVisibleUserIds.has(targetUserId)) return true;
  if (context.contextEventAllowsParent && context.contextEventParentVisibleUserIds.has(targetUserId)) return true;
  if (context.contextOrganizationAllowsStaff && context.contextOrganizationVisibleUserIds.has(targetUserId)) return true;

  if (
    context.allowManagerFreeAgentUnmask
    && context.viewerManagesContextTeam
    && context.contextEventFreeAgentIds.has(targetUserId)
  ) {
    return true;
  }

  return false;
};

export const applyUserPrivacy = (user: PublicUser, context: VisibilityContext): VisibilityUser => {
  const isMinor = isMinorAtUtcDate(user.dateOfBirth, context.now);
  const canViewMinor = isMinor ? canViewerSeeMinorIdentity(user.id, context) : true;
  const isIdentityHidden = isMinor && !canViewMinor;

  const normalizedUser: PublicUser = {
    ...user,
    firstName: normalizeOptionalName(user.firstName),
    lastName: normalizeOptionalName(user.lastName),
  };

  if (!isIdentityHidden) {
    return {
      ...normalizedUser,
      isMinor,
      isIdentityHidden: false,
      displayName: resolveDisplayName(normalizedUser),
    };
  }

  return {
    ...user,
    firstName: 'Name',
    lastName: 'Hidden',
    userName: 'hidden',
    isMinor,
    isIdentityHidden: true,
    displayName: NAME_HIDDEN_LABEL,
  };
};

export const applyUserPrivacyList = (users: PublicUser[], context: VisibilityContext): VisibilityUser[] => {
  return users.map((user) => applyUserPrivacy(user, context));
};

export const isVisibleInGenericSearch = (user: Pick<PublicUser, 'dateOfBirth'>): boolean => {
  return !isMinorAtUtcDate(user.dateOfBirth);
};
