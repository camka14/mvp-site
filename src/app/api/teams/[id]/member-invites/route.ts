import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { normalizeOptionalName } from '@/lib/nameCase';
import { isInvitePlaceholderAuthUser } from '@/lib/authUserPlaceholders';
import { getRequestOrigin } from '@/lib/requestOrigin';
import { sendInviteEmails } from '@/server/inviteEmails';
import { ensureAuthUserAndUserDataByEmail } from '@/server/inviteUsers';
import { canManageOrganization } from '@/server/accessControl';
import { upsertEventRegistration } from '@/server/events/eventRegistrations';
import {
  getEventTeamsDelegate,
  loadCanonicalTeamById,
  normalizeId,
  normalizeIdList,
  syncCanonicalTeamRoster,
} from '@/server/teams/teamMembership';
import {
  loadEventRegistrationSnapshot,
  rollbackTeamInviteEventSyncs,
} from '@/server/teams/teamInviteEventSync';

export const dynamic = 'force-dynamic';

type InviteRole = 'player' | 'team_manager' | 'team_head_coach' | 'team_assistant_coach';

const memberInviteSchema = z.object({
  userId: z.string().optional(),
  email: z.string().optional(),
  role: z.enum(['player', 'team_manager', 'team_head_coach', 'team_assistant_coach']).default('player'),
  eventTeamIds: z.array(z.string()).optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
}).passthrough();

const emailSchema = z.string().email();

const uniqueStrings = (values: Array<string | null | undefined>): string[] => (
  Array.from(new Set(values.filter((value): value is string => Boolean(value))))
);

const roleToStaffType = (role: InviteRole): string | null => {
  switch (role) {
    case 'team_manager':
      return 'MANAGER';
    case 'team_head_coach':
      return 'HEAD_COACH';
    case 'team_assistant_coach':
      return 'ASSISTANT_COACH';
    default:
      return null;
  }
};

const mapInviteRecord = (invite: Record<string, any>) => ({
  ...invite,
  $id: invite.id,
  $createdAt: invite.createdAt,
  $updatedAt: invite.updatedAt,
});

const hasOrganizationTeamManagementAccess = async (
  teamId: string,
  session: { userId: string; isAdmin: boolean },
  client: any,
): Promise<boolean> => {
  const team = await client.canonicalTeams?.findUnique?.({
    where: { id: teamId },
    select: { organizationId: true },
  });
  const organizationId = normalizeId(team?.organizationId);
  if (!organizationId) {
    return false;
  }
  const organization = await client.organizations.findUnique({
    where: { id: organizationId },
    select: { id: true, ownerId: true, hostIds: true, officialIds: true },
  });
  return canManageOrganization(session, organization, client);
};

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
      row.userId === session.userId
      && row.status === 'ACTIVE'
      && String(row.role ?? '').toUpperCase() === 'MANAGER'
    ));
  const isCoach = normalizeId((team as any).headCoachId) === session.userId
    || normalizeIdList((team as any).coachIds).includes(session.userId);
  if (isCaptain || isManager || isCoach) {
    return true;
  }

  return hasOrganizationTeamManagementAccess(teamId, session, client);
};

const resolveInviteUser = async (
  client: any,
  input: z.infer<typeof memberInviteSchema>,
  now: Date,
): Promise<{ userId: string; email: string; shouldSendEmail: boolean; isUserIdInvite: boolean }> => {
  const inviteUserId = normalizeId(input.userId);
  let email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';

  if (inviteUserId) {
    const authUser = await client.authUser.findUnique({
      where: { id: inviteUserId },
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
          where: { userId: inviteUserId },
          select: { email: true },
        });
        if (sensitive?.email) {
          email = sensitive.email.trim().toLowerCase();
        }
      }
    }
    if (!emailSchema.safeParse(email).success) {
      throw new Error('Missing invite email');
    }
    return {
      userId: inviteUserId,
      email,
      shouldSendEmail: isInvitePlaceholderAuthUser(authUser),
      isUserIdInvite: true,
    };
  }

  if (!emailSchema.safeParse(email).success) {
    throw new Error('Invalid email');
  }

  const ensured = await ensureAuthUserAndUserDataByEmail(client, email, now, {
    firstName: normalizeOptionalName(input.firstName),
    lastName: normalizeOptionalName(input.lastName),
  });
  return {
    userId: ensured.userId,
    email,
    shouldSendEmail: !ensured.authUserExisted,
    isUserIdInvite: false,
  };
};

const findSourceTeamRegistrationId = async (
  tx: any,
  canonicalTeamId: string,
  userId: string,
): Promise<string | null> => {
  const row = await tx.teamRegistrations?.findUnique?.({
    where: {
      teamId_userId: {
        teamId: canonicalTeamId,
        userId,
      },
    },
    select: { id: true },
  });
  return normalizeId(row?.id);
};

const loadSelectedFutureEventTeams = async (
  tx: any,
  canonicalTeamId: string,
  eventTeamIds: string[],
  now: Date,
) => {
  const selectedIds = normalizeIdList(eventTeamIds);
  if (!selectedIds.length) {
    return [];
  }

  const eventTeamsDelegate = getEventTeamsDelegate(tx);
  const rows = await eventTeamsDelegate?.findMany?.({
    where: {
      id: { in: selectedIds },
      parentTeamId: canonicalTeamId,
      eventId: { not: null },
    },
    select: {
      id: true,
      eventId: true,
      playerIds: true,
      pending: true,
      division: true,
      divisionTypeId: true,
      divisionTypeName: true,
      playerRegistrationIds: true,
    },
  }) ?? [];

  const eventIds = normalizeIdList(rows.map((row: any) => row.eventId));
  const futureEvents = eventIds.length
    ? await tx.events.findMany({
      where: {
        id: { in: eventIds },
        NOT: { end: { lt: now } },
      },
      select: { id: true },
    })
    : [];
  const futureEventIds = new Set(futureEvents.map((event: { id: string }) => event.id));
  const futureRows = rows.filter((row: any) => futureEventIds.has(row.eventId));

  if (futureRows.length !== selectedIds.length) {
    const foundIds = new Set(futureRows.map((row: any) => row.id));
    const missingIds = selectedIds.filter((eventTeamId) => !foundIds.has(eventTeamId));
    throw new Error(`Invalid event team selection: ${missingIds.join(', ')}`);
  }

  return futureRows;
};

const updateStaffInviteAssignment = async (
  tx: any,
  role: InviteRole,
  canonicalTeamId: string,
  userId: string,
  actingUserId: string,
  now: Date,
) => {
  const staffRole = roleToStaffType(role);
  if (!staffRole || !tx.teamStaffAssignments?.upsert) {
    return;
  }

  await tx.teamStaffAssignments.upsert({
    where: {
      teamId_userId_role: {
        teamId: canonicalTeamId,
        userId,
        role: staffRole,
      },
    },
    create: {
      id: `${canonicalTeamId}__${staffRole}__${userId}`,
      teamId: canonicalTeamId,
      userId,
      role: staffRole,
      status: 'INVITED',
      createdBy: actingUserId,
      createdAt: now,
      updatedAt: now,
    },
    update: {
      status: 'INVITED',
      updatedAt: now,
    },
  });
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(req);
  const { id } = await params;
  const canonicalTeamId = normalizeId(id);
  if (!canonicalTeamId) {
    return NextResponse.json({ error: 'Invalid team id' }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const parsed = memberInviteSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const now = new Date();
  let inviteForEmail: Record<string, any> | null = null;
  try {
    const result = await prisma.$transaction(async (tx) => {
      const canonicalTeam = await loadCanonicalTeamById(canonicalTeamId, tx);
      if (!canonicalTeam) {
        throw new Error('Team not found');
      }
      if (!(await canManageTeamInvites(canonicalTeamId, session, tx))) {
        throw new Error('Forbidden');
      }

      const resolvedUser = await resolveInviteUser(tx, parsed.data, now);
      const userId = resolvedUser.userId;
      const existingInvite = await tx.invites.findFirst({
        where: {
          type: 'TEAM',
          teamId: canonicalTeamId,
          userId,
        },
      });
      const invite = existingInvite
        ? await tx.invites.update({
          where: { id: existingInvite.id },
          data: {
            email: resolvedUser.email,
            status: 'PENDING',
            createdBy: session.userId,
            firstName: normalizeOptionalName(parsed.data.firstName) ?? existingInvite.firstName,
            lastName: normalizeOptionalName(parsed.data.lastName) ?? existingInvite.lastName,
            updatedAt: now,
          },
        })
        : await tx.invites.create({
          data: {
            id: crypto.randomUUID(),
            type: 'TEAM',
            email: resolvedUser.email,
            status: 'PENDING',
            teamId: canonicalTeamId,
            userId,
            createdBy: session.userId,
            firstName: normalizeOptionalName(parsed.data.firstName),
            lastName: normalizeOptionalName(parsed.data.lastName),
            createdAt: now,
            updatedAt: now,
          },
        });

      const shouldSendEmail = resolvedUser.isUserIdInvite || resolvedUser.shouldSendEmail;
      inviteForEmail = shouldSendEmail ? invite : null;

      await rollbackTeamInviteEventSyncs(tx, invite, 'CANCELLED', now);

      if (parsed.data.role === 'player') {
        const activePlayerIds = normalizeIdList((canonicalTeam as any).playerIds);
        if (activePlayerIds.includes(userId)) {
          throw new Error('User is already on this team');
        }
        await syncCanonicalTeamRoster({
          teamId: canonicalTeamId,
          captainId: (canonicalTeam as any).captainId,
          playerIds: activePlayerIds,
          pendingPlayerIds: uniqueStrings([...normalizeIdList((canonicalTeam as any).pending), userId]),
          managerId: (canonicalTeam as any).managerId,
          headCoachId: (canonicalTeam as any).headCoachId,
          assistantCoachIds: normalizeIdList((canonicalTeam as any).coachIds),
          actingUserId: session.userId,
          now,
        }, tx);

        const sourceTeamRegistrationId = await findSourceTeamRegistrationId(tx, canonicalTeamId, userId);
        const selectedEventTeams = await loadSelectedFutureEventTeams(
          tx,
          canonicalTeamId,
          parsed.data.eventTeamIds ?? [],
          now,
        );
        const syncDelegate = (tx as any).teamInviteEventSyncs;
        if (selectedEventTeams.length && !syncDelegate?.upsert) {
          throw new Error('Invite event-team sync storage is unavailable. Regenerate Prisma client.');
        }
        await Promise.all(selectedEventTeams.map(async (eventTeam: any) => {
          const eventTeamHadUser = normalizeIdList(eventTeam.playerIds).includes(userId);
          const eventTeamHadPendingUser = normalizeIdList(eventTeam.pending).includes(userId);
          const previousRegistrationSnapshot = await loadEventRegistrationSnapshot(tx, eventTeam.eventId, userId);
          const previousRegistrationId = previousRegistrationSnapshot && typeof previousRegistrationSnapshot === 'object' && !Array.isArray(previousRegistrationSnapshot)
            ? normalizeId((previousRegistrationSnapshot as Record<string, unknown>).id)
            : null;
          await getEventTeamsDelegate(tx)?.update?.({
            where: { id: eventTeam.id },
            data: {
              pending: eventTeamHadUser
                ? normalizeIdList(eventTeam.pending)
                : uniqueStrings([...normalizeIdList(eventTeam.pending), userId]),
              updatedAt: now,
            },
          });
          const registration = await upsertEventRegistration({
            eventId: eventTeam.eventId,
            registrantType: 'SELF',
            registrantId: userId,
            registrationId: previousRegistrationId,
            parentId: canonicalTeamId,
            rosterRole: 'PARTICIPANT',
            status: 'STARTED',
            eventTeamId: eventTeam.id,
            sourceTeamRegistrationId,
            divisionId: normalizeId(eventTeam.division),
            divisionTypeId: normalizeId(eventTeam.divisionTypeId),
            divisionTypeKey: normalizeId(eventTeam.divisionTypeName)?.toLowerCase() ?? null,
            createdBy: session.userId,
          }, tx);
          await getEventTeamsDelegate(tx)?.update?.({
            where: { id: eventTeam.id },
            data: {
              playerRegistrationIds: uniqueStrings([
                ...normalizeIdList((eventTeam as any).playerRegistrationIds),
                registration.id,
              ]),
              updatedAt: now,
            },
          });
          await syncDelegate.upsert({
            where: {
              inviteId_eventTeamId_userId: {
                inviteId: invite.id,
                eventTeamId: eventTeam.id,
                userId,
              },
            },
            create: {
              id: crypto.randomUUID(),
              inviteId: invite.id,
              canonicalTeamId,
              eventId: eventTeam.eventId,
              eventTeamId: eventTeam.id,
              userId,
              previousRegistrationSnapshot,
              eventTeamHadUser,
              eventTeamHadPendingUser,
              sourceTeamRegistrationId,
              status: 'PENDING',
              createdAt: now,
              updatedAt: now,
            },
            update: {
              canonicalTeamId,
              eventId: eventTeam.eventId,
              previousRegistrationSnapshot,
              eventTeamHadUser,
              eventTeamHadPendingUser,
              sourceTeamRegistrationId,
              status: 'PENDING',
              updatedAt: now,
            },
          });
        }));
      } else {
        await updateStaffInviteAssignment(tx, parsed.data.role, canonicalTeamId, userId, session.userId, now);
      }

      return {
        invite,
        team: await loadCanonicalTeamById(canonicalTeamId, tx),
        eventSyncs: await (tx as any).teamInviteEventSyncs?.findMany?.({
          where: {
            inviteId: invite.id,
            status: 'PENDING',
          },
          orderBy: [
            { createdAt: 'asc' },
            { id: 'asc' },
          ],
        }) ?? [],
      };
    });

    if (inviteForEmail) {
      const baseUrl = getRequestOrigin(req);
      await sendInviteEmails([inviteForEmail], baseUrl);
    }

    return NextResponse.json({
      ok: true,
      invite: mapInviteRecord(result.invite),
      team: result.team,
      eventSyncs: result.eventSyncs,
    }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create member invite';
    const status = message === 'Forbidden'
      ? 403
      : message === 'Team not found'
        ? 404
        : message.startsWith('Invalid event team selection')
          ? 400
          : message === 'User is already on this team'
            ? 409
            : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
