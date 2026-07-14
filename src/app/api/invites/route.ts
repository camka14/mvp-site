import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { normalizeOptionalName } from '@/lib/nameCase';
import { requireSession } from '@/lib/permissions';
import { isInvitePlaceholderAuthUser } from '@/lib/authUserPlaceholders';
import {
  deriveStaffInviteTypes,
  getStaffMemberTypesForOrganizationRole,
  getLegacyTeamInviteRole,
  normalizeInviteStatus,
  normalizeInviteType,
  normalizeStaffMemberTypes,
} from '@/lib/staff';
import { withLegacyFields } from '@/server/legacyFormat';
import { sendInviteEmails } from '@/server/inviteEmails';
import { ensureAuthUserAndUserDataByEmail } from '@/server/inviteUsers';
import { getRequestOrigin } from '@/lib/requestOrigin';
import { canManageEvent, canManageOrganization, hasOrgPermission } from '@/server/accessControl';
import { ORG_PERMISSIONS } from '@/lib/organizationPermissions';
import { resolveDefaultOrganizationRoleIdForStaffTypes } from '@/server/organizationRoles';
import { loadCanonicalTeamById, normalizeId, normalizeIdList } from '@/server/teams/teamMembership';
import { listActiveChildIdsForParent } from '@/server/teams/teamGuardianInvites';
import {
  removeCanonicalPendingInvitee,
  rollbackTeamInviteEventSyncs,
} from '@/server/teams/teamInviteEventSync';
import { acquireEventLock } from '@/server/repositories/locks';
import {
  InvalidInviteCursorError,
  listInviteRecordsPage,
  normalizeInvitePageLimit,
  pruneExpiredTerminalInvites,
} from '@/server/inviteListing';

export const dynamic = 'force-dynamic';

const inviteSchema = z.object({
  type: z.string(),
  email: z.string().optional(),
  status: z.string().optional(),
  staffTypes: z.array(z.string()).optional(),
  eventId: z.string().optional(),
  organizationId: z.string().optional(),
  teamId: z.string().optional(),
  userId: z.string().optional(),
  roleId: z.string().nullable().optional(),
  createdBy: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  replaceStaffTypes: z.boolean().optional(),
}).passthrough();

const createSchema = z.object({
  invites: z.array(inviteSchema).optional(),
}).passthrough();

const emailSchema = z.string().email();
const getTeamsDelegate = (client: any) => client?.teams ?? client?.volleyBallTeams;

class InviteRouteError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = 'InviteRouteError';
    this.status = status;
    this.details = details;
  }
}

const mapInviteRecord = (invite: Record<string, any>) => withLegacyFields({
  ...invite,
  type: normalizeInviteType(invite.type) ?? invite.type,
  status: normalizeInviteStatus(invite.status) ?? 'PENDING',
  staffTypes: deriveStaffInviteTypes({ staffTypes: invite.staffTypes }, invite.type),
  firstName: normalizeOptionalName(invite.firstName),
  lastName: normalizeOptionalName(invite.lastName),
});

const unionStrings = (left: string[] | null | undefined, right: string[] | null | undefined): string[] => Array.from(
  new Set([...(Array.isArray(left) ? left : []), ...(Array.isArray(right) ? right : [])].filter(Boolean)),
);

const formatFullName = (firstName?: string | null, lastName?: string | null): string => (
  `${normalizeOptionalName(firstName) ?? ''} ${normalizeOptionalName(lastName) ?? ''}`.trim()
);

const canManageTeamInvites = async (
  teamId: string,
  session: { userId: string; isAdmin: boolean },
  client: any,
): Promise<boolean> => {
  if (session.isAdmin) {
    return true;
  }

  const team = await loadCanonicalTeamById(teamId, client);
  if (!team) {
    return false;
  }

  const staffAssignments = Array.isArray((team as any).staffAssignments) ? (team as any).staffAssignments : [];
  const isCaptain = normalizeId((team as any).captainId) === session.userId;
  const isManager = normalizeId((team as any).managerId) === session.userId
    || staffAssignments.some((row: any) => (
      normalizeId(row?.userId) === session.userId
      && String(row?.status ?? '').toUpperCase() === 'ACTIVE'
      && String(row?.role ?? '').toUpperCase() === 'MANAGER'
    ));
  const isCoach = normalizeId((team as any).headCoachId) === session.userId
    || normalizeIdList((team as any).coachIds).includes(session.userId);

  if (isCaptain || isManager || isCoach) {
    return true;
  }

  const organizationId = normalizeId((team as any).organizationId);
  if (!organizationId) {
    return false;
  }

  const organization = await client.organizations?.findUnique?.({
    where: { id: organizationId },
    select: { id: true, ownerId: true },
  });
  return canManageOrganization(session, organization, client);
};

const resolveInviteUser = async (client: any, invite: z.infer<typeof inviteSchema>, now: Date) => {
  const inviteUserId = typeof invite.userId === 'string' ? invite.userId.trim() : '';
  let email = typeof invite.email === 'string' ? invite.email.trim().toLowerCase() : '';
  let userId = inviteUserId;
  let shouldSendEmail = false;
  let skipped = false;

  if (userId) {
    const authUser = await client.authUser.findUnique({
      where: { id: userId },
      select: {
        email: true,
        passwordHash: true,
        lastLogin: true,
        emailVerifiedAt: true,
      },
    });
    if (!emailSchema.safeParse(email).success) {
      if (authUser?.email) {
        email = authUser.email.trim().toLowerCase();
      } else {
        const sensitive = await client.sensitiveUserData.findFirst({
          where: { userId },
          select: { email: true },
        });
        if (sensitive?.email) {
          email = sensitive.email.trim().toLowerCase();
        }
      }
    }
    if (!emailSchema.safeParse(email).success) {
      // Some profile-only users (for example dependent child profiles) may not have
      // a linked auth account or sensitive email yet. Skip invite creation silently.
      skipped = true;
      return { userId, email: '', shouldSendEmail: false, skipped };
    }
    shouldSendEmail = isInvitePlaceholderAuthUser(authUser);
    return { userId, email, shouldSendEmail, skipped };
  }

  if (!emailSchema.safeParse(email).success) {
    throw new Error('Invalid email');
  }

  const ensured = await ensureAuthUserAndUserDataByEmail(client, email, now, {
    firstName: normalizeOptionalName(invite.firstName),
    lastName: normalizeOptionalName(invite.lastName),
  });
  userId = ensured.userId;
  shouldSendEmail = !ensured.authUserExisted;
  return { userId, email, shouldSendEmail, skipped };
};

export async function GET(req: NextRequest) {
  const session = await requireSession(req);
  const params = req.nextUrl.searchParams;
  const userId = normalizeId(params.get('userId'));
  const type = normalizeInviteType(params.get('type'));
  const teamId = normalizeId(params.get('teamId'));
  const rawStatus = params.get('status');
  const status = rawStatus === null ? null : normalizeInviteStatus(rawStatus);
  const rawHistory = params.get('history');
  const history = rawHistory === 'true';
  const limit = normalizeInvitePageLimit(params.get('limit'));
  const cursor = params.get('cursor');

  if (
    (rawStatus !== null && !status)
    || (rawHistory !== null && rawHistory !== 'true' && rawHistory !== 'false')
    || (history && rawStatus !== null)
    || limit === null
  ) {
    return NextResponse.json({ error: 'Invalid invite list query' }, { status: 400 });
  }

  if (userId && !session.isAdmin && userId !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const where: any = {};
  let canListTeamInvites = false;
  let includeChildTeamInvites = false;
  let childInviteIdsForViewer: string[] = [];
  if (!session.isAdmin) {
    canListTeamInvites = teamId ? await canManageTeamInvites(teamId, session, prisma) : false;
    if (userId || !canListTeamInvites) {
      where.userId = userId ?? session.userId;
    }
    includeChildTeamInvites = !teamId
      && (userId === session.userId || (!userId && !canListTeamInvites))
      && (!type || type === 'TEAM');
    if (includeChildTeamInvites) {
      childInviteIdsForViewer = await listActiveChildIdsForParent(prisma, session.userId);
      if (childInviteIdsForViewer.length) {
        delete where.userId;
        where.OR = [
          { userId: userId ?? session.userId },
          {
            type: 'TEAM',
            userId: { in: childInviteIdsForViewer },
            status: 'PENDING',
          },
        ];
      }
    }
  } else if (userId) {
    where.userId = userId;
  }
  if (type) where.type = type;
  if (teamId) where.teamId = teamId;
  const requestedStatus = status ?? 'PENDING';
  const statusWhere = history
    ? { status: { in: ['DECLINED', 'REJECTED', 'FAILED'] } }
    : requestedStatus === 'PENDING'
      ? { OR: [{ status: null }, { status: { in: ['PENDING', 'SENT'] } }] }
      : requestedStatus === 'DECLINED'
        ? { status: { in: ['DECLINED', 'REJECTED'] } }
        : { status: requestedStatus };
  const listingWhere = { AND: [where, statusWhere] };

  let page: { invites: Array<Record<string, any>>; nextCursor: string | null };
  try {
    page = await listInviteRecordsPage(prisma, listingWhere, { limit, cursor });
  } catch (error) {
    if (error instanceof InvalidInviteCursorError) {
      return NextResponse.json({ error: 'Invalid invite cursor' }, { status: 400 });
    }
    throw error;
  }
  const invites = page.invites;

  const childProfiles = childInviteIdsForViewer.length
    ? await prisma.userData.findMany({
      where: { id: { in: childInviteIdsForViewer } },
      select: { id: true, firstName: true, lastName: true },
    })
    : [];
  const childById = new Map(childProfiles.map((child) => [child.id, child]));

  if (!cursor) {
    try {
      await pruneExpiredTerminalInvites({
        client: prisma,
        scope: {
          userId: session.isAdmin
            ? userId
            : (userId || !canListTeamInvites ? userId ?? session.userId : null),
          delegatedChildUserIds: childInviteIdsForViewer,
          teamId,
          type,
          allowGlobal: session.isAdmin && !userId && !teamId,
        },
      });
    } catch (error) {
      console.warn('Failed to prune expired terminal invites', error);
    }
  }

  return NextResponse.json({
    invites: invites.map((invite) => {
      const child = invite.userId ? childById.get(invite.userId) : null;
      return mapInviteRecord({
        ...invite,
        ...(child
          ? {
            childUserId: invite.userId,
            childFirstName: normalizeOptionalName(child.firstName),
            childLastName: normalizeOptionalName(child.lastName),
            childFullName: formatFullName(child.firstName, child.lastName) || 'Child',
            viewerCanAcceptForChild: true,
          }
          : {}),
      });
    }),
    nextCursor: page.nextCursor,
  }, { status: 200 });
}

export async function POST(req: NextRequest) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const invitesInput: unknown[] = parsed.data.invites
    ?? (Array.isArray((body as any)?.invites) ? (body as any).invites : [body]).filter(Boolean);

  if (!invitesInput.length) {
    return NextResponse.json({ error: 'No invites provided' }, { status: 400 });
  }

  const eventStaffLockIds = Array.from(new Set<string>(invitesInput.flatMap((inviteInput): string[] => {
    const parsedInvite = inviteSchema.safeParse(inviteInput);
    if (!parsedInvite.success || normalizeInviteType(parsedInvite.data.type) !== 'STAFF') {
      return [];
    }
    const eventId = normalizeId(parsedInvite.data.eventId);
    return eventId ? [eventId] : [];
  }))).sort();

  const now = new Date();
  try {
    const { created, toEmail } = await prisma.$transaction(async (tx) => {
      for (const eventId of eventStaffLockIds) {
        await acquireEventLock(tx, eventId);
      }

      const createdRecords: any[] = [];
      const toEmailRecords: any[] = [];

      for (const inviteInput of invitesInput) {
        const parsedInvite = inviteSchema.safeParse(inviteInput);
        if (!parsedInvite.success) {
          throw new InviteRouteError(400, 'Invalid invite', parsedInvite.error.flatten());
        }

        const invite = parsedInvite.data;
        const isUserIdInvite = Boolean(typeof invite.userId === 'string' && invite.userId.trim());
        const normalizedFirstName = normalizeOptionalName(invite.firstName);
        const normalizedLastName = normalizeOptionalName(invite.lastName);
        const inviteType = normalizeInviteType(invite.type);
        if (!inviteType) {
          throw new InviteRouteError(400, 'Invalid invite type');
        }

        const normalizedStatus = normalizeInviteStatus(invite.status) ?? 'PENDING';
        const eventId = typeof invite.eventId === 'string' && invite.eventId.trim() ? invite.eventId.trim() : null;
        const organizationId = typeof invite.organizationId === 'string' && invite.organizationId.trim()
          ? invite.organizationId.trim()
          : null;
        const teamId = typeof invite.teamId === 'string' && invite.teamId.trim() ? invite.teamId.trim() : null;

        const resolvedUser = await resolveInviteUser(tx, invite, now);
        if (resolvedUser.skipped) {
          if (inviteType !== 'STAFF') {
            throw new InviteRouteError(400, 'Missing invite email');
          }
          continue;
        }
        const inviteUserId = resolvedUser.userId;

        if (inviteType === 'STAFF') {
          const organization = organizationId
            ? await tx.organizations.findUnique({
              where: { id: organizationId },
              select: { id: true, ownerId: true },
            })
            : null;
          const event = eventId
            ? await tx.events.findUnique({
              where: { id: eventId },
              select: { id: true, hostId: true, assistantHostIds: true, organizationId: true, state: true },
            })
            : null;
          if (!organizationId && !eventId) {
            throw new InviteRouteError(400, 'Staff invites require organizationId or eventId');
          }
          if (organizationId) {
            if (!organization) {
              throw new InviteRouteError(404, 'Organization not found');
            }
            if (!(await hasOrgPermission(session, organization, ORG_PERMISSIONS.STAFF_MANAGE, tx))) {
              throw new InviteRouteError(403, 'Forbidden');
            }
            if (organization.ownerId && inviteUserId === organization.ownerId) {
              throw new InviteRouteError(409, 'Organization owner already has staff access');
            }
          } else {
            if (!event) {
              throw new InviteRouteError(404, 'Event not found');
            }
            if (!(await canManageEvent(session, event, tx))) {
              throw new InviteRouteError(403, 'Forbidden');
            }
          }

          const requestedRoleId = typeof invite.roleId === 'string' && invite.roleId.trim()
            ? invite.roleId.trim()
            : null;
          if (requestedRoleId && !organizationId) {
            throw new InviteRouteError(400, 'Role selection requires organizationId');
          }
          const selectedRole = requestedRoleId && organizationId
            ? await tx.organizationRoles.findFirst({
              where: {
                id: requestedRoleId,
                organizationId,
              },
              select: {
                id: true,
                name: true,
                kind: true,
                systemKey: true,
              },
            })
            : null;
          if (requestedRoleId && !selectedRole) {
            throw new InviteRouteError(404, 'Role not found');
          }

          const staffTypes = selectedRole
            ? getStaffMemberTypesForOrganizationRole(selectedRole)
            : normalizeStaffMemberTypes(
              deriveStaffInviteTypes(
                { staffTypes: invite.staffTypes },
                typeof invite.type === 'string' ? invite.type : null,
              ),
            );
          if (!staffTypes.length) {
            throw new InviteRouteError(400, 'Staff invite requires at least one staff type');
          }

          const replaceStaffTypes = invite.replaceStaffTypes === true;

          if (organizationId) {
            const existingStaffMember = await tx.staffMembers.findUnique({
              where: {
                organizationId_userId: {
                  organizationId,
                  userId: inviteUserId,
                },
              },
              select: { roleId: true, types: true },
            });
            const defaultRoleId = selectedRole?.id
              ?? existingStaffMember?.roleId
              ?? await resolveDefaultOrganizationRoleIdForStaffTypes(tx, organizationId, staffTypes);
            await tx.staffMembers.upsert({
              where: {
                organizationId_userId: {
                  organizationId,
                  userId: inviteUserId,
                },
              },
              create: {
                id: crypto.randomUUID(),
                organizationId,
                userId: inviteUserId,
                types: staffTypes,
                roleId: defaultRoleId,
                createdAt: now,
                updatedAt: now,
              },
              update: {
                types: {
                  set: replaceStaffTypes ? staffTypes : unionStrings(staffTypes, existingStaffMember?.types ?? []),
                },
                roleId: defaultRoleId,
                updatedAt: now,
              },
            });
          }

          const existingInvite = await tx.invites.findFirst({
            where: {
              type: 'STAFF',
              organizationId,
              eventId,
              userId: inviteUserId,
            },
          });
          const wasCreated = !existingInvite;
          const record = existingInvite
            ? await tx.invites.update({
              where: { id: existingInvite.id },
              data: {
                email: resolvedUser.email,
                status: normalizedStatus,
                staffTypes: replaceStaffTypes ? staffTypes : unionStrings(existingInvite.staffTypes, staffTypes),
                createdBy: invite.createdBy ?? session.userId,
                firstName: normalizedFirstName ?? existingInvite.firstName,
                lastName: normalizedLastName ?? existingInvite.lastName,
                updatedAt: now,
              },
            })
            : await tx.invites.create({
              data: {
                id: crypto.randomUUID(),
                type: 'STAFF',
                email: resolvedUser.email,
                status: normalizedStatus,
                staffTypes,
                eventId,
                organizationId,
                userId: inviteUserId,
                createdBy: invite.createdBy ?? session.userId,
                firstName: normalizedFirstName ?? null,
                lastName: normalizedLastName ?? null,
                createdAt: now,
                updatedAt: now,
              },
            });
          createdRecords.push(record);
          if (wasCreated && (isUserIdInvite || resolvedUser.shouldSendEmail)) {
            toEmailRecords.push(record);
          }
          continue;
        }

        if (inviteType === 'TEAM') {
          if (!teamId) {
            throw new InviteRouteError(400, 'Team invites require teamId');
          }
          const teamsDelegate = getTeamsDelegate(tx);
          const team = await teamsDelegate.findUnique({ where: { id: teamId } });
          if (!team) {
            throw new InviteRouteError(404, 'Team not found');
          }

          const legacyRole = getLegacyTeamInviteRole(invite.type);
          if (legacyRole === 'player' && Array.isArray(team.playerIds) && team.playerIds.includes(inviteUserId)) {
            throw new InviteRouteError(409, 'User is already on this team');
          }

          const existingInvite = await tx.invites.findFirst({
            where: {
              type: 'TEAM',
              teamId,
              userId: inviteUserId,
            },
          });
          const wasCreated = !existingInvite;
          const record = existingInvite
            ? await tx.invites.update({
              where: { id: existingInvite.id },
              data: {
                email: resolvedUser.email,
                status: normalizedStatus,
                createdBy: invite.createdBy ?? session.userId,
                firstName: normalizedFirstName ?? existingInvite.firstName,
                lastName: normalizedLastName ?? existingInvite.lastName,
                updatedAt: now,
              },
            })
            : await tx.invites.create({
              data: {
                id: crypto.randomUUID(),
                type: 'TEAM',
                email: resolvedUser.email,
                status: normalizedStatus,
                teamId,
                userId: inviteUserId,
                createdBy: invite.createdBy ?? session.userId,
                firstName: normalizedFirstName ?? null,
                lastName: normalizedLastName ?? null,
                createdAt: now,
                updatedAt: now,
              },
            });
          createdRecords.push(record);
          if (wasCreated && (isUserIdInvite || resolvedUser.shouldSendEmail)) {
            toEmailRecords.push(record);
          }
          continue;
        }

        if (!eventId) {
          throw new InviteRouteError(400, 'Event invites require eventId');
        }

        const existingInvite = await tx.invites.findFirst({
          where: {
            type: 'EVENT',
            eventId,
            userId: inviteUserId,
          },
        });
        const wasCreated = !existingInvite;
        const record = existingInvite
          ? await tx.invites.update({
            where: { id: existingInvite.id },
            data: {
              email: resolvedUser.email,
              status: normalizedStatus,
              createdBy: invite.createdBy ?? session.userId,
              firstName: normalizedFirstName ?? existingInvite.firstName,
              lastName: normalizedLastName ?? existingInvite.lastName,
              updatedAt: now,
            },
          })
          : await tx.invites.create({
            data: {
              id: crypto.randomUUID(),
              type: 'EVENT',
              email: resolvedUser.email,
              status: normalizedStatus,
              eventId,
              organizationId,
              teamId,
              userId: inviteUserId,
              createdBy: invite.createdBy ?? session.userId,
              firstName: normalizedFirstName ?? null,
              lastName: normalizedLastName ?? null,
              createdAt: now,
              updatedAt: now,
            },
          });
        createdRecords.push(record);
        if (wasCreated && (isUserIdInvite || resolvedUser.shouldSendEmail)) {
          toEmailRecords.push(record);
        }
      }

      return { created: createdRecords, toEmail: toEmailRecords };
    });

    const baseUrl = getRequestOrigin(req);
    const emailedInvites = await sendInviteEmails(toEmail, baseUrl);
    const emailedById = new Map(emailedInvites.map((invite) => [invite.id, invite]));
    const mergedInvites = created.map((invite) => {
      const emailed = emailedById.get(invite.id);
      return emailed
        ? { ...invite, status: emailed.status ?? invite.status, sentAt: emailed.sentAt ?? invite.sentAt }
        : invite;
    });

    return NextResponse.json({ invites: mergedInvites.map((invite) => mapInviteRecord(invite)) }, { status: 201 });
  } catch (error) {
    if (error instanceof InviteRouteError) {
      const payload = error.details === undefined
        ? { error: error.message }
        : { error: error.message, details: error.details };
      return NextResponse.json(payload, { status: error.status });
    }
    const message = error instanceof Error ? error.message : 'Failed to create invite';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const userId = typeof body?.userId === 'string' ? body.userId : undefined;
  const teamId = typeof body?.teamId === 'string' ? body.teamId : undefined;
  const type = normalizeInviteType(body?.type);

  const where: any = {};
  if (userId) where.userId = userId;
  if (teamId) where.teamId = teamId;
  if (type) where.type = type;

  if (!session.isAdmin) {
    const canActOnUser = userId && userId === session.userId;

    let isTeamCaptain = false;
    if (teamId) {
      const teamsDelegate = getTeamsDelegate(prisma);
      const team = await teamsDelegate?.findUnique({ where: { id: teamId } });
      isTeamCaptain = Boolean(team && (((team as any).captainId === session.userId) || ((team as any).managerId === session.userId)));
    }

    if (!canActOnUser && !isTeamCaptain) {
      where.createdBy = session.userId;
    }
  }

  const inviteCandidates = await prisma.invites.findMany({ where });
  if (!inviteCandidates.length) {
    return NextResponse.json({ deleted: true }, { status: 200 });
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const eventStaffLockIds = Array.from(new Set(inviteCandidates.flatMap((invite) => (
      normalizeInviteType(invite.type) === 'STAFF' && normalizeId(invite.eventId)
        ? [normalizeId(invite.eventId) as string]
        : []
    )))).sort();
    for (const eventId of eventStaffLockIds) {
      await acquireEventLock(tx, eventId);
    }

    // Re-run the scoped query after taking the event locks. This keeps the
    // authorization filter and the destructive write in the same transaction.
    // If a candidate's event scope changed while waiting, leave it untouched
    // rather than mutating it without the corresponding advisory lock.
    const lockedEventIds = new Set(eventStaffLockIds);
    const lockedCandidates = await tx.invites.findMany({
      where: {
        AND: [where, { id: { in: inviteCandidates.map((invite) => invite.id) } }],
      },
    });
    const invites = lockedCandidates.filter((invite) => {
      const currentEventId = normalizeId(invite.eventId);
      return normalizeInviteType(invite.type) !== 'STAFF'
        || !currentEventId
        || lockedEventIds.has(currentEventId);
    });

    for (const invite of invites) {
      if (normalizeInviteType(invite.type) === 'TEAM' && invite.teamId && invite.userId) {
        const teamsDelegate = getTeamsDelegate(tx);
        const team = await teamsDelegate?.findUnique({ where: { id: invite.teamId } });
        if (team && Array.isArray(team.pending) && team.pending.includes(invite.userId)) {
          await teamsDelegate.update({
            where: { id: invite.teamId },
            data: {
              pending: team.pending.filter((entry: string) => entry !== invite.userId),
              updatedAt: now,
            },
          });
        }
        await rollbackTeamInviteEventSyncs(tx, invite, 'CANCELLED', now);
        await removeCanonicalPendingInvitee(tx, invite, session.userId, now);
      }
    }

    await tx.invites.deleteMany({
      where: { id: { in: invites.map((invite) => invite.id) } },
    });
  });

  return NextResponse.json({ deleted: true }, { status: 200 });
}
