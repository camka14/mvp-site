import crypto from 'crypto';
import { z } from 'zod';
import type { Prisma } from '@/generated/prisma/client';
import { normalizeOptionalName } from '@/lib/nameCase';
import { sanitizeOrganizationEventAssignments } from '@/lib/organizationEventAccess';
import {
  deriveStaffInviteTypes,
  normalizeInviteStatus,
  normalizeInviteType,
  normalizeStaffMemberTypes,
} from '@/lib/staff';
import {
  buildEventOfficialPositionsFromTemplates,
  buildEventOfficialRecordId,
  normalizeEventOfficialPositions,
  normalizeEventOfficials,
  normalizeSportOfficialPositionTemplates,
} from '@/server/officials/config';
import { clearRemovedEventOfficialMatchAssignments } from '@/server/repositories/events';
import { ensureAuthUserAndUserDataByEmail } from '@/server/inviteUsers';
import { acquireEventLock } from '@/server/repositories/locks';

export const EVENT_STAFF_CONTRACT_VERSION = 1 as const;
export const EVENT_STAFF_REVISION_CONFLICT_CODE = 'EVENT_STAFF_REVISION_CONFLICT';

const identifierSchema = z.string().trim().min(1);
const staffRoleSchema = z.enum(['OFFICIAL', 'ASSISTANT_HOST']);

const eventOfficialInputSchema = z.object({
  id: identifierSchema.optional(),
  userId: identifierSchema,
  positionIds: z.array(identifierSchema).default([]),
  fieldIds: z.array(identifierSchema).default([]),
  isActive: z.boolean().default(true),
}).strict();

const pendingInviteInputSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  roles: z.array(staffRoleSchema).min(1),
  resolvedUserId: identifierSchema.optional(),
}).strict();

export const eventStaffPutSchema = z.object({
  contractVersion: z.literal(EVENT_STAFF_CONTRACT_VERSION),
  expectedRevision: z.string().trim().min(1),
  assistantHostIds: z.array(identifierSchema).default([]),
  eventOfficials: z.array(eventOfficialInputSchema).default([]),
  pendingInvites: z.array(pendingInviteInputSchema).default([]),
}).strict();

export type EventStaffPutInput = z.infer<typeof eventStaffPutSchema>;
type EventStaffRole = z.infer<typeof staffRoleSchema>;
type EventStaffTransactionClient = Prisma.TransactionClient;

type CanonicalEventOfficial = {
  id: string;
  userId: string;
  positionIds: string[];
  fieldIds: string[];
  isActive: boolean;
};

type CanonicalStaffInvite = {
  id: string;
  createdAt: Date | null;
  updatedAt: Date | null;
  sentAt: Date | null;
  type: 'STAFF';
  email: string;
  status: string;
  staffTypes: string[];
  eventId: string;
  organizationId: string | null;
  teamId: string | null;
  userId: string | null;
  createdBy: string | null;
  firstName: string | null;
  lastName: string | null;
};

export type EventStaffSnapshot = {
  contractVersion: typeof EVENT_STAFF_CONTRACT_VERSION;
  eventId: string;
  revision: string;
  assistantHostIds: string[];
  officialPositions: Array<{
    id: string;
    name: string;
    count: number;
    order: number;
  }>;
  eventOfficials: CanonicalEventOfficial[];
  officialIds: string[];
  staffInvites: CanonicalStaffInvite[];
};

export type EventStaffReconciliationResult = {
  snapshot: EventStaffSnapshot;
  emailCandidates: CanonicalStaffInvite[];
};

export class EventStaffNotFoundError extends Error {
  constructor() {
    super('Event not found');
    this.name = 'EventStaffNotFoundError';
  }
}

export class EventStaffRevisionConflictError extends Error {
  readonly currentRevision: string;

  constructor(currentRevision: string) {
    super('Event staff changed. Reload and try again.');
    this.name = 'EventStaffRevisionConflictError';
    this.currentRevision = currentRevision;
  }
}

export class EventStaffInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EventStaffInputError';
  }
}

const normalizeId = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized || null;
};

const normalizeIdList = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(new Set(
    value
      .map(normalizeId)
      .filter((id): id is string => Boolean(id)),
  )).sort();
};

const normalizeEmail = (value: unknown): string => (
  typeof value === 'string' ? value.trim().toLowerCase() : ''
);

const normalizeStatus = (value: unknown): string => {
  const canonical = normalizeInviteStatus(value);
  if (canonical) {
    return canonical;
  }
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return normalized || 'PENDING';
};

const normalizeEventStaffTypes = (value: unknown, fallbackType?: string | null): string[] => (
  normalizeStaffMemberTypes(deriveStaffInviteTypes({ staffTypes: value }, fallbackType))
    .filter((type) => type === 'HOST' || type === 'OFFICIAL')
    .sort()
);

const canonicalizeInvite = (invite: Record<string, any>, eventId: string): CanonicalStaffInvite => ({
  id: String(invite.id),
  createdAt: invite.createdAt instanceof Date ? invite.createdAt : null,
  updatedAt: invite.updatedAt instanceof Date ? invite.updatedAt : null,
  sentAt: invite.sentAt instanceof Date ? invite.sentAt : null,
  type: 'STAFF',
  email: normalizeEmail(invite.email),
  status: normalizeStatus(invite.status),
  staffTypes: normalizeEventStaffTypes(invite.staffTypes, invite.type),
  eventId,
  organizationId: normalizeId(invite.organizationId),
  teamId: normalizeId(invite.teamId),
  userId: normalizeId(invite.userId),
  createdBy: normalizeId(invite.createdBy),
  firstName: normalizeOptionalName(invite.firstName) ?? null,
  lastName: normalizeOptionalName(invite.lastName) ?? null,
});

const revisionFor = (input: {
  assistantHostIds: string[];
  eventOfficials: CanonicalEventOfficial[];
  staffInvites: CanonicalStaffInvite[];
}): string => {
  const canonical = {
    assistantHostIds: [...input.assistantHostIds].sort(),
    eventOfficials: input.eventOfficials
      .map((official) => ({
        id: official.id,
        userId: official.userId,
        positionIds: [...official.positionIds].sort(),
        fieldIds: [...official.fieldIds].sort(),
        isActive: official.isActive,
      }))
      .sort((left, right) => left.userId.localeCompare(right.userId) || left.id.localeCompare(right.id)),
    staffInvites: input.staffInvites
      .map((invite) => ({
        id: invite.id,
        userId: invite.userId,
        email: invite.email,
        status: invite.status,
        staffTypes: [...invite.staffTypes].sort(),
      }))
      .sort((left, right) => (
        (left.userId ?? left.email).localeCompare(right.userId ?? right.email)
        || left.id.localeCompare(right.id)
      )),
  };
  return crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
};

export const loadEventStaffSnapshot = async (
  client: EventStaffTransactionClient | typeof import('@/lib/prisma').prisma,
  eventId: string,
): Promise<EventStaffSnapshot> => {
  const event = await (client as any).events.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      hostId: true,
      assistantHostIds: true,
      fieldIds: true,
      sportId: true,
      officialPositions: true,
    },
  });
  if (!event) {
    throw new EventStaffNotFoundError();
  }

  const [officialRows, inviteRows] = await Promise.all([
    (client as any).eventOfficials.findMany({
      where: { eventId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    }),
    (client as any).invites.findMany({
      where: { eventId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    }),
  ]);

  const officialPositions = await resolveOfficialPositions(client, event, officialRows.length > 0);
  const validPositionIds = new Set(officialPositions.map((position) => position.id));
  const validFieldIds = new Set(normalizeIdList(event.fieldIds));
  const fallbackPositionId = officialPositions[0]?.id ?? null;
  // Hash the stored staff rows, not the view rebased against mutable event
  // fields/position metadata. A general event PATCH may legitimately replace
  // those definitions before the atomic staff PUT; that must not invalidate
  // the staff revision unless the underlying staff state itself changed.
  const storedEventOfficials: CanonicalEventOfficial[] = (officialRows as Array<Record<string, any>>)
    .map((row) => {
      const userId = normalizeId(row.userId);
      const id = normalizeId(row.id);
      if (!userId || !id) {
        return null;
      }
      return {
        id,
        userId,
        positionIds: normalizeIdList(row.positionIds),
        fieldIds: normalizeIdList(row.fieldIds),
        isActive: row.isActive !== false,
      };
    })
    .filter((row): row is CanonicalEventOfficial => Boolean(row))
    .sort((left, right) => left.userId.localeCompare(right.userId) || left.id.localeCompare(right.id));
  const eventOfficials: CanonicalEventOfficial[] = storedEventOfficials
    .map((row) => {
      let positionIds = row.positionIds.filter((positionId) => validPositionIds.has(positionId));
      if (!positionIds.length && fallbackPositionId) {
        positionIds = [fallbackPositionId];
      }
      if (!positionIds.length) {
        return null;
      }
      return {
        id: row.id,
        userId: row.userId,
        positionIds,
        fieldIds: row.fieldIds.filter((fieldId) => validFieldIds.has(fieldId)),
        isActive: row.isActive,
      };
    })
    .filter((row): row is CanonicalEventOfficial => Boolean(row))
    .sort((left, right) => left.userId.localeCompare(right.userId) || left.id.localeCompare(right.id));
  const hostId = normalizeId(event.hostId);
  const storedAssistantHostIds = normalizeIdList(event.assistantHostIds);
  const assistantHostIds = storedAssistantHostIds.filter((id) => id !== hostId);
  const staffInvites = (inviteRows as Array<Record<string, any>>)
    .filter((invite) => normalizeInviteType(invite.type) === 'STAFF')
    .map((invite) => canonicalizeInvite(invite, eventId))
    .sort((left, right) => left.id.localeCompare(right.id));
  const revision = revisionFor({
    assistantHostIds: storedAssistantHostIds,
    eventOfficials: storedEventOfficials,
    staffInvites,
  });

  return {
    contractVersion: EVENT_STAFF_CONTRACT_VERSION,
    eventId,
    revision,
    assistantHostIds,
    officialPositions,
    eventOfficials,
    officialIds: eventOfficials.map((official) => official.userId),
    staffInvites,
  };
};

export const loadLockedEventStaffSnapshot = async (
  client: { $transaction: (callback: (tx: EventStaffTransactionClient) => Promise<EventStaffSnapshot>) => Promise<EventStaffSnapshot> },
  eventId: string,
): Promise<EventStaffSnapshot> => client.$transaction(async (tx) => {
  await acquireEventLock(tx, eventId);
  return loadEventStaffSnapshot(tx, eventId);
});

const rolesToStaffTypes = (roles: ReadonlySet<EventStaffRole>): string[] => {
  const types: string[] = [];
  if (roles.has('ASSISTANT_HOST')) {
    types.push('HOST');
  }
  if (roles.has('OFFICIAL')) {
    types.push('OFFICIAL');
  }
  return types.sort();
};

const retryableInviteStatuses = new Set(['PENDING', 'DECLINED', 'FAILED', 'EMAIL_INVITE']);

const retryableInvitePriority = (invite: CanonicalStaffInvite): number => {
  if (invite.status === 'PENDING' && invite.sentAt) return 0;
  if (invite.status === 'PENDING') return 1;
  if (invite.status === 'FAILED') return 2;
  if (invite.status === 'EMAIL_INVITE') return 3;
  return 4;
};

const retryableInviteTime = (invite: CanonicalStaffInvite): number => (
  invite.updatedAt?.getTime()
  ?? invite.createdAt?.getTime()
  ?? 0
);

const resolveOfficialPositions = async (
  client: EventStaffTransactionClient | typeof import('@/lib/prisma').prisma,
  event: {
    id: string;
    sportId?: string | null;
    officialPositions?: unknown;
  },
  needsFallback: boolean,
) => {
  const explicitPositions = normalizeEventOfficialPositions(event.officialPositions, event.id);
  if (explicitPositions.length) {
    return explicitPositions;
  }
  const sportId = normalizeId(event.sportId);
  const sport = sportId && typeof (client as any).sports?.findUnique === 'function'
    ? await (client as any).sports.findUnique({
        where: { id: sportId },
        select: { officialPositionTemplates: true },
      })
    : null;
  const templatePositions = buildEventOfficialPositionsFromTemplates(
    event.id,
    normalizeSportOfficialPositionTemplates(sport?.officialPositionTemplates),
  );
  if (templatePositions.length || !needsFallback) {
    return templatePositions;
  }
  return buildEventOfficialPositionsFromTemplates(event.id, [{ name: 'Official', count: 1 }]);
};

const loadUserContact = async (
  client: EventStaffTransactionClient,
  userId: string,
): Promise<{ email: string; firstName: string | null; lastName: string | null } | null> => {
  const [authUser, sensitive, profile] = await Promise.all([
    (client as any).authUser.findUnique({
      where: { id: userId },
      select: { email: true },
    }),
    (client as any).sensitiveUserData.findFirst({
      where: { userId },
      select: { email: true },
    }),
    (client as any).userData.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true },
    }),
  ]);
  const email = normalizeEmail(authUser?.email || sensitive?.email);
  if (!email) {
    return null;
  }
  return {
    email,
    firstName: normalizeOptionalName(profile?.firstName) ?? null,
    lastName: normalizeOptionalName(profile?.lastName) ?? null,
  };
};

export const reconcileEventStaffDesiredState = async (
  client: EventStaffTransactionClient,
  eventId: string,
  input: EventStaffPutInput,
  actorUserId: string,
): Promise<EventStaffReconciliationResult> => {
  const current = await loadEventStaffSnapshot(client, eventId);
  if (current.revision !== input.expectedRevision) {
    throw new EventStaffRevisionConflictError(current.revision);
  }

  const event = await (client as any).events.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      hostId: true,
      organizationId: true,
      fieldIds: true,
      sportId: true,
      officialPositions: true,
    },
  });
  if (!event) {
    throw new EventStaffNotFoundError();
  }

  const now = new Date();
  const hostId = normalizeId(event.hostId);
  const assistantHostIds = normalizeIdList(input.assistantHostIds).filter((id) => id !== hostId);
  const fieldIds = normalizeIdList(event.fieldIds);
  const pendingNeedsOfficialPosition = input.pendingInvites.some((invite) => invite.roles.includes('OFFICIAL'));
  const officialPositions = await resolveOfficialPositions(
    client,
    event,
    input.eventOfficials.length > 0 || pendingNeedsOfficialPosition,
  );

  let desiredOfficials: CanonicalEventOfficial[];
  try {
    desiredOfficials = normalizeEventOfficials(
      input.eventOfficials.map((official) => ({
        userId: official.userId,
        positionIds: official.positionIds,
        fieldIds: official.fieldIds,
        isActive: official.isActive,
      })),
      {
        eventId,
        positionIds: officialPositions.map((position) => position.id),
        fieldIds,
      },
    );
  } catch (error) {
    throw new EventStaffInputError(error instanceof Error ? error.message : 'Invalid event officials');
  }

  const explicitUserIds = Array.from(new Set([
    ...assistantHostIds,
    ...desiredOfficials.map((official) => official.userId),
  ]));
  if (explicitUserIds.length) {
    const existingUsers = await (client as any).userData.findMany({
      where: { id: { in: explicitUserIds } },
      select: { id: true },
    });
    const existingUserIds = new Set(
      (existingUsers as Array<{ id?: unknown }>)
        .map((user) => normalizeId(user.id))
        .filter((userId): userId is string => Boolean(userId)),
    );
    const missingUserIds = explicitUserIds.filter((userId) => !existingUserIds.has(userId));
    if (missingUserIds.length) {
      throw new EventStaffInputError(`Unknown event staff user: ${missingUserIds.join(', ')}`);
    }
  }

  const currentOfficialIdByUserId = new Map(
    current.eventOfficials.map((official) => [official.userId, official.id]),
  );
  const desiredOfficialByUserId = new Map(
    desiredOfficials.map((official) => [official.userId, {
      ...official,
      id: currentOfficialIdByUserId.get(official.userId) ?? buildEventOfficialRecordId(eventId, official.userId),
    }]),
  );
  const rolesByUserId = new Map<string, Set<EventStaffRole>>();
  const pendingContactByUserId = new Map<string, {
    email: string;
    firstName: string;
    lastName: string;
  }>();
  const forceInviteUserIds = new Set<string>();

  assistantHostIds.forEach((userId) => {
    const roles = rolesByUserId.get(userId) ?? new Set<EventStaffRole>();
    roles.add('ASSISTANT_HOST');
    rolesByUserId.set(userId, roles);
  });
  desiredOfficialByUserId.forEach((_, userId) => {
    const roles = rolesByUserId.get(userId) ?? new Set<EventStaffRole>();
    roles.add('OFFICIAL');
    rolesByUserId.set(userId, roles);
  });

  for (const pending of input.pendingInvites) {
    const ensured = await ensureAuthUserAndUserDataByEmail(client, pending.email, now, {
      firstName: pending.firstName,
      lastName: pending.lastName,
    });
    if (pending.resolvedUserId && pending.resolvedUserId !== ensured.userId) {
      throw new EventStaffInputError('Pending staff invite no longer resolves to the selected user.');
    }
    const userId = ensured.userId;
    const roles = rolesByUserId.get(userId) ?? new Set<EventStaffRole>();
    if (userId === hostId && pending.roles.includes('ASSISTANT_HOST')) {
      throw new EventStaffInputError('The event host cannot be invited as an assistant host.');
    }
    pending.roles.forEach((role) => roles.add(role));
    rolesByUserId.set(userId, roles);
    forceInviteUserIds.add(userId);
    pendingContactByUserId.set(userId, {
      email: pending.email,
      firstName: pending.firstName,
      lastName: pending.lastName,
    });
    if (roles.has('ASSISTANT_HOST') && userId !== hostId && !assistantHostIds.includes(userId)) {
      assistantHostIds.push(userId);
      assistantHostIds.sort();
    }
    if (roles.has('OFFICIAL') && !desiredOfficialByUserId.has(userId)) {
      const defaultPositionId = officialPositions[0]?.id;
      if (!defaultPositionId) {
        throw new EventStaffInputError('At least one official position is required to invite an official.');
      }
      desiredOfficialByUserId.set(userId, {
        id: currentOfficialIdByUserId.get(userId) ?? buildEventOfficialRecordId(eventId, userId),
        userId,
        positionIds: [defaultPositionId],
        fieldIds: [],
        isActive: true,
      });
    }
  }
  desiredOfficials = Array.from(desiredOfficialByUserId.values())
    .sort((left, right) => left.userId.localeCompare(right.userId));

  const organizationId = normalizeId(event.organizationId);
  if (organizationId) {
    const [organization, staffMembers, organizationStaffInvites] = await Promise.all([
      (client as any).organizations.findUnique({
        where: { id: organizationId },
        select: { ownerId: true },
      }),
      (client as any).staffMembers.findMany({
        where: { organizationId },
        select: {
          organizationId: true,
          userId: true,
          types: true,
        },
      }),
      (client as any).invites.findMany({
        where: { organizationId },
        select: {
          organizationId: true,
          userId: true,
          type: true,
          status: true,
        },
      }),
    ]);
    if (!organization) {
      throw new EventStaffInputError('Organization not found.');
    }
    const requestedOfficialIds = desiredOfficials.map((official) => official.userId);
    const sanitized = sanitizeOrganizationEventAssignments(
      {
        hostId,
        assistantHostIds,
        officialIds: requestedOfficialIds,
      },
      {
        ...organization,
        staffMembers,
        staffInvites: organizationStaffInvites.filter((invite: Record<string, unknown>) => (
          normalizeInviteType(invite.type) === 'STAFF'
        )),
      },
    );
    const allowedAssistantHostIds = new Set(sanitized.assistantHostIds);
    const allowedOfficialIds = new Set(sanitized.officialIds);
    const disallowedAssistantHostIds = assistantHostIds.filter((userId) => !allowedAssistantHostIds.has(userId));
    const disallowedOfficialIds = requestedOfficialIds.filter((userId) => !allowedOfficialIds.has(userId));
    if (disallowedAssistantHostIds.length || disallowedOfficialIds.length) {
      throw new EventStaffInputError(
        'Organization events can only assign active organization hosts and officials.',
      );
    }
  }

  await (client as any).events.update({
    where: { id: eventId },
    data: {
      assistantHostIds: { set: assistantHostIds },
      ...(officialPositions.length && !normalizeEventOfficialPositions(event.officialPositions, eventId).length
        ? { officialPositions }
        : {}),
      updatedAt: now,
    },
  });

  const desiredOfficialUserIds = desiredOfficials.map((official) => official.userId);
  await (client as any).eventOfficials.deleteMany({
    where: desiredOfficialUserIds.length
      ? { eventId, userId: { notIn: desiredOfficialUserIds } }
      : { eventId },
  });
  for (const official of desiredOfficials) {
    await (client as any).eventOfficials.upsert({
      where: {
        eventId_userId: {
          eventId,
          userId: official.userId,
        },
      },
      create: {
        ...official,
        eventId,
        createdAt: now,
        updatedAt: now,
      },
      update: {
        positionIds: { set: official.positionIds },
        fieldIds: { set: official.fieldIds },
        isActive: official.isActive,
        updatedAt: now,
      },
    });
  }
  await clearRemovedEventOfficialMatchAssignments(client, eventId, desiredOfficials);

  const currentAssignedUserIds = new Set([
    ...current.assistantHostIds,
    ...current.eventOfficials.map((official) => official.userId),
  ]);
  const existingInvites = current.staffInvites;
  const existingByUserId = new Map<string, CanonicalStaffInvite[]>();
  existingInvites.forEach((invite) => {
    const key = invite.userId ?? invite.email;
    const rows = existingByUserId.get(key) ?? [];
    rows.push(invite);
    existingByUserId.set(key, rows);
  });
  const keptInviteIds = new Set<string>();
  const emailCandidates: CanonicalStaffInvite[] = [];

  for (const [userId, roles] of rolesByUserId.entries()) {
    const desiredStaffTypes = rolesToStaffTypes(roles);
    if (!desiredStaffTypes.length) {
      continue;
    }
    const pendingContact = pendingContactByUserId.get(userId);
    const contact = pendingContact ?? await loadUserContact(client, userId);
    const candidates = [
      ...(existingByUserId.get(userId) ?? []),
      ...(contact ? (existingByUserId.get(contact.email) ?? []) : []),
    ].filter((invite, index, rows) => rows.findIndex((row) => row.id === invite.id) === index)
      .sort((left, right) => left.id.localeCompare(right.id));
    const operationalCandidates = candidates
      .filter((invite) => retryableInviteStatuses.has(invite.status))
      .sort((left, right) => (
        retryableInvitePriority(left) - retryableInvitePriority(right)
        || retryableInviteTime(right) - retryableInviteTime(left)
        || left.id.localeCompare(right.id)
      ));
    const keeper = operationalCandidates[0] ?? null;
    const duplicateIds = operationalCandidates.slice(1).map((invite) => invite.id);
    if (duplicateIds.length) {
      await (client as any).invites.deleteMany({ where: { id: { in: duplicateIds } } });
    }

    if (keeper) {
      keptInviteIds.add(keeper.id);
      if (retryableInviteStatuses.has(keeper.status)) {
        const updated = await (client as any).invites.update({
          where: { id: keeper.id },
          data: {
            type: 'STAFF',
            userId,
            email: contact?.email ?? keeper.email,
            status: 'PENDING',
            staffTypes: { set: desiredStaffTypes },
            createdBy: actorUserId,
            firstName: contact?.firstName ?? keeper.firstName,
            lastName: contact?.lastName ?? keeper.lastName,
            updatedAt: now,
          },
        });
        if (keeper.status !== 'PENDING' || keeper.sentAt === null) {
          emailCandidates.push(canonicalizeInvite(updated, eventId));
        }
      }
      continue;
    }

    const shouldCreateInvite = !currentAssignedUserIds.has(userId) || forceInviteUserIds.has(userId);
    if (!shouldCreateInvite || !contact?.email) {
      continue;
    }
    const created = await (client as any).invites.create({
      data: {
        id: crypto.randomUUID(),
        type: 'STAFF',
        email: contact.email,
        status: 'PENDING',
        staffTypes: desiredStaffTypes,
        eventId,
        organizationId: null,
        teamId: null,
        userId,
        createdBy: actorUserId,
        firstName: contact.firstName,
        lastName: contact.lastName,
        createdAt: now,
        updatedAt: now,
      },
    });
    const canonical = canonicalizeInvite(created, eventId);
    keptInviteIds.add(canonical.id);
    emailCandidates.push(canonical);
  }

  const obsoleteInviteIds = existingInvites
    .filter((invite) => !keptInviteIds.has(invite.id))
    .filter((invite) => retryableInviteStatuses.has(invite.status))
    .map((invite) => invite.id);
  if (obsoleteInviteIds.length) {
    await (client as any).invites.deleteMany({ where: { id: { in: obsoleteInviteIds } } });
  }

  return {
    snapshot: await loadEventStaffSnapshot(client, eventId),
    emailCandidates,
  };
};
