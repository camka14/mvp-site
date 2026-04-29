import { prisma } from '@/lib/prisma';
import { canManageOrganization, canOfficialOrganization } from '@/server/accessControl';

type SessionLike = {
  userId: string;
  isAdmin: boolean;
};

type OrganizationUsersAccessOrg = {
  id: string;
  ownerId: string;
  hostIds?: string[] | null;
  officialIds?: string[] | null;
};

export type OrganizationUsersScopeEvent = {
  id: string;
  name: string;
  start: Date;
  end: Date;
  organizationId: string | null;
  userIds: string[];
  teamIds: string[];
  hostId: string | null;
  assistantHostIds: string[];
  officialIds: string[];
};

type OrganizationUsersAccessClient = {
  authUser: {
    findUnique: (args: {
      where: { id: string };
      select: { email: true; emailVerifiedAt: true; sessionVersion: true };
    }) => Promise<{ email: string; emailVerifiedAt: Date | null; sessionVersion: number | null } | null>;
  };
  organizations: {
    findUnique: (args: {
      where: { id: string };
      select: { id: true; ownerId: true; hostIds: true; officialIds: true };
    }) => Promise<OrganizationUsersAccessOrg | null>;
  };
  fields: {
    findMany: (args: {
      where: { organizationId: string };
      select: { id: true };
    }) => Promise<Array<{ id: string }>>;
  };
  events: {
    findMany: (args: {
      where: Record<string, unknown>;
      select: {
        id: true;
        name: true;
        start: true;
        end: true;
        organizationId: true;
        hostId: true;
        assistantHostIds: true;
      };
      orderBy: { start: 'desc' };
    }) => Promise<Array<{
      id: string;
      name: string;
      start: Date;
      end: Date | null;
      organizationId: string | null;
      hostId: string | null;
      assistantHostIds: unknown;
    }>>;
  };
  eventRegistrations: {
    findMany?: (args: any) => Promise<Array<{
      eventId: string;
      registrantId: string;
      registrantType: string;
      rosterRole: string | null;
      status: string | null;
    }>>;
    findFirst: (args: {
      where: {
        eventId: { in: string[] };
        OR: Array<{
          registrantId?: string;
          createdBy?: string;
        }>;
      };
      select: { id: true };
    }) => Promise<{ id: string } | null>;
  };
  eventOfficials?: {
    findMany?: (args: any) => Promise<Array<{
      eventId: string;
      userId: string;
    }>>;
  };
  staffMembers?: {
    findUnique: (args: {
      where: {
        organizationId_userId: {
          organizationId: string;
          userId: string;
        };
      };
      select: {
        organizationId: true;
        userId: true;
        types: true;
      };
    }) => Promise<{
      organizationId: string;
      userId: string;
      types: string[] | null;
    } | null>;
  };
  invites?: {
    findMany: (args: {
      where: {
        organizationId: string;
        userId: string;
        type: 'STAFF';
      };
      select: {
        organizationId: true;
        userId: true;
        type: true;
        status: true;
      };
    }) => Promise<Array<{
      organizationId: string | null;
      userId: string | null;
      type: string;
      status: string | null;
    }>>;
  };
};

const normalizeEventName = (value: string | null | undefined): string => {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed.length > 0 ? trimmed : 'Untitled Event';
};

const normalizeId = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const normalizeIdList = (values: unknown): string[] => {
  if (!Array.isArray(values)) {
    return [];
  }
  const ids = new Set<string>();
  values.forEach((value) => {
    const normalized = normalizeId(value);
    if (normalized) {
      ids.add(normalized);
    }
  });
  return Array.from(ids);
};

export const listOrganizationUsersScopeEvents = async (
  organizationId: string,
  client: OrganizationUsersAccessClient = prisma,
): Promise<OrganizationUsersScopeEvent[]> => {
  const organizationFields = await client.fields.findMany({
    where: { organizationId },
    select: { id: true },
  });
  const organizationFieldIds = organizationFields
    .map((field) => normalizeId(field.id))
    .filter((fieldId): fieldId is string => Boolean(fieldId));

  const eventWhere = organizationFieldIds.length
    ? {
      OR: [
        { organizationId },
        { fieldIds: { hasSome: organizationFieldIds } },
      ],
    }
    : { organizationId };

  const events = await client.events.findMany({
    where: eventWhere,
    select: {
      id: true,
      name: true,
      start: true,
      end: true,
      organizationId: true,
      hostId: true,
      assistantHostIds: true,
    },
    orderBy: { start: 'desc' },
  });
  const eventIds = events.map((event) => event.id);
  const [registrationRows, officialRows] = await Promise.all([
    eventIds.length && typeof client.eventRegistrations.findMany === 'function'
      ? client.eventRegistrations.findMany({
        where: {
          eventId: { in: eventIds },
          status: { in: ['STARTED', 'ACTIVE', 'BLOCKED'] },
          slotId: null,
          occurrenceDate: null,
        },
        select: {
          eventId: true,
          registrantId: true,
          registrantType: true,
          rosterRole: true,
          status: true,
        },
      })
      : Promise.resolve([]),
    eventIds.length && typeof client.eventOfficials?.findMany === 'function'
      ? client.eventOfficials.findMany({
        where: {
          eventId: { in: eventIds },
          isActive: { not: false },
        },
        select: {
          eventId: true,
          userId: true,
        },
      })
      : Promise.resolve([]),
  ]);
  const participantIdsByEventId = new Map<string, { userIds: string[]; teamIds: string[] }>();
  const officialIdsByEventId = new Map<string, string[]>();
  const getParticipantIds = (eventId: string) => {
    let ids = participantIdsByEventId.get(eventId);
    if (!ids) {
      ids = { userIds: [], teamIds: [] };
      participantIdsByEventId.set(eventId, ids);
    }
    return ids;
  };
  registrationRows.forEach((row) => {
    const eventId = normalizeId(row.eventId);
    const registrantId = normalizeId(row.registrantId);
    if (!eventId || !registrantId) {
      return;
    }
    const ids = getParticipantIds(eventId);
    const role = normalizeId(row.rosterRole)?.toUpperCase() ?? 'PARTICIPANT';
    const registrantType = normalizeId(row.registrantType)?.toUpperCase();
    if (role !== 'PARTICIPANT') {
      return;
    }
    if (registrantType === 'TEAM') {
      ids.teamIds.push(registrantId);
    } else if (registrantType === 'SELF' || registrantType === 'CHILD') {
      ids.userIds.push(registrantId);
    }
  });
  officialRows.forEach((row) => {
    const eventId = normalizeId(row.eventId);
    const userId = normalizeId(row.userId);
    if (!eventId || !userId) {
      return;
    }
    const officialIds = officialIdsByEventId.get(eventId) ?? [];
    if (!officialIds.includes(userId)) {
      officialIds.push(userId);
    }
    officialIdsByEventId.set(eventId, officialIds);
  });

  return events.map((event) => ({
    id: event.id,
    name: normalizeEventName(event.name),
    start: event.start,
    end: event.end ?? event.start,
    organizationId: normalizeId(event.organizationId),
    userIds: Array.from(new Set(participantIdsByEventId.get(event.id)?.userIds ?? [])),
    teamIds: Array.from(new Set(participantIdsByEventId.get(event.id)?.teamIds ?? [])),
    hostId: normalizeId(event.hostId),
    assistantHostIds: normalizeIdList(event.assistantHostIds),
    officialIds: officialIdsByEventId.get(event.id) ?? [],
  }));
};

export const canAccessOrganizationUsers = async (
  params: {
    session: SessionLike;
    organization: OrganizationUsersAccessOrg;
    canManage?: boolean;
    events?: OrganizationUsersScopeEvent[];
  },
  client: OrganizationUsersAccessClient = prisma,
): Promise<boolean> => {
  const canManage = typeof params.canManage === 'boolean'
    ? params.canManage
    : await canManageOrganization(params.session, params.organization, client);
  if (canManage) {
    return true;
  }

  if (await canOfficialOrganization(params.session, params.organization, client)) {
    return true;
  }

  const scopedEvents = params.events ?? await listOrganizationUsersScopeEvents(params.organization.id, client);
  const inEventUsers = scopedEvents.some((event) => event.userIds.includes(params.session.userId));
  if (inEventUsers) {
    return true;
  }

  const eventIds = scopedEvents.map((event) => event.id);
  if (!eventIds.length) {
    return false;
  }

  const registration = await client.eventRegistrations.findFirst({
    where: {
      eventId: { in: eventIds },
      OR: [
        { registrantId: params.session.userId },
        { createdBy: params.session.userId },
      ],
    },
    select: { id: true },
  });

  return Boolean(registration);
};
