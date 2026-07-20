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
import {
  loadCanonicalTeamById,
  normalizeId,
  normalizeIdList,
  syncCanonicalTeamRoster,
} from '@/server/teams/teamMembership';
import {
  rollbackTeamInviteEventSyncs,
} from '@/server/teams/teamInviteEventSync';
import {
  buildTeamInviteShareUrl,
  TEAM_INVITE_LINK_TTL_MS,
} from '@/server/teamInviteLinks';

export const dynamic = 'force-dynamic';

type InviteRole = 'player' | 'team_manager' | 'team_head_coach' | 'team_assistant_coach';

const memberInviteSchema = z.object({
  userId: z.string().optional(),
  email: z.string().optional(),
  role: z.enum(['player', 'team_manager', 'team_head_coach', 'team_assistant_coach']).default('player'),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  phone: z.string().optional(),
  shareOnly: z.boolean().optional(),
}).passthrough();

const emailSchema = z.string().email();

const normalizeOptionalContact = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized || null;
};

const uniqueStrings = (values: Array<string | null | undefined>): string[] => (
  Array.from(new Set(values.filter((value): value is string => Boolean(value))))
);
const PLAYER_CAPACITY_STATUSES = new Set(['ACTIVE', 'INVITED', 'STARTED', 'PENDING']);

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
    select: { id: true, ownerId: true },
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
): Promise<{ userId: string | null; email: string | null; shouldSendEmail: boolean; isUserIdInvite: boolean }> => {
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

  const firstName = normalizeOptionalName(input.firstName);
  const lastName = normalizeOptionalName(input.lastName);
  const phone = normalizeOptionalContact(input.phone);
  const isClaimablePersonInvite = Boolean(input.shareOnly || firstName || lastName || phone);
  if (isClaimablePersonInvite) {
    if (!firstName || !lastName) {
      throw new Error('First and last name are required');
    }
    if (email && !emailSchema.safeParse(email).success) {
      throw new Error('Invalid email');
    }
    if (!email && !phone && !input.shareOnly) {
      throw new Error('Add an email, phone, or choose a share-only invite');
    }
    return {
      userId: null,
      email: email || null,
      shouldSendEmail: Boolean(email),
      isUserIdInvite: false,
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

const getPlayerCapacityUserIds = (team: Record<string, any>): Set<string> => {
  const ids = new Set<string>();
  const registrations = Array.isArray(team.playerRegistrations) ? team.playerRegistrations : [];

  registrations.forEach((registration: any) => {
    const userId = normalizeId(registration?.userId);
    const status = String(registration?.status ?? '').trim().toUpperCase();
    if (userId && PLAYER_CAPACITY_STATUSES.has(status)) {
      ids.add(userId);
    }
  });

  if (ids.size === 0) {
    normalizeIdList(team.playerIds).forEach((userId) => ids.add(userId));
    normalizeIdList(team.pending).forEach((userId) => ids.add(userId));
  }

  return ids;
};

const assertPlayerInviteCapacity = (
  team: Record<string, any>,
  userId: string | null,
  anonymousPendingInviteCount = 0,
) => {
  const teamSize = typeof team.teamSize === 'number' && Number.isFinite(team.teamSize)
    ? Math.max(0, Math.trunc(team.teamSize))
    : 0;
  if (teamSize <= 0) {
    return;
  }

  const capacityUserIds = getPlayerCapacityUserIds(team);
  const alreadyCounted = userId ? capacityUserIds.has(userId) : false;
  if (!alreadyCounted && capacityUserIds.size + anonymousPendingInviteCount >= teamSize) {
    throw new Error('Team is full. Player invite was not sent.');
  }
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
      const normalizedPhone = normalizeOptionalContact(parsed.data.phone);
      const activePlayerIdsForInvite = parsed.data.role === 'player'
        ? normalizeIdList((canonicalTeam as any).playerIds)
        : [];
      const staffType = roleToStaffType(parsed.data.role);
      const existingInvite = userId
        ? await tx.invites.findFirst({
          where: {
            type: 'TEAM',
            teamId: canonicalTeamId,
            userId,
          },
        })
        : resolvedUser.email
          ? await tx.invites.findFirst({
            where: {
              type: 'TEAM',
              teamId: canonicalTeamId,
              userId: null,
              email: resolvedUser.email,
            },
          })
          : null;
      if (parsed.data.role === 'player') {
        if (userId && activePlayerIdsForInvite.includes(userId)) {
          throw new Error('User is already on this team');
        }
        const anonymousPendingInviteCount = typeof tx.invites.count === 'function'
          ? await tx.invites.count({
            where: {
              type: 'TEAM',
              teamId: canonicalTeamId,
              status: 'PENDING',
              userId: null,
              ...(existingInvite ? { id: { not: existingInvite.id } } : {}),
            },
          })
          : 0;
        assertPlayerInviteCapacity(canonicalTeam as Record<string, any>, userId, anonymousPendingInviteCount);
      }
      const wasCreated = !existingInvite;
      const linkExpiresAt = new Date(now.getTime() + TEAM_INVITE_LINK_TTL_MS);
      const invite = existingInvite
        ? await tx.invites.update({
          where: { id: existingInvite.id },
          data: {
            email: resolvedUser.email,
            phone: normalizedPhone,
            status: 'PENDING',
            createdBy: session.userId,
            firstName: normalizeOptionalName(parsed.data.firstName) ?? existingInvite.firstName,
            lastName: normalizeOptionalName(parsed.data.lastName) ?? existingInvite.lastName,
            staffTypes: staffType ? [staffType] : normalizeIdList(existingInvite.staffTypes),
            linkExpiresAt,
            claimedBy: null,
            updatedAt: now,
          },
        })
        : await tx.invites.create({
          data: {
            id: crypto.randomUUID(),
            type: 'TEAM',
            email: resolvedUser.email,
            phone: normalizedPhone,
            status: 'PENDING',
            teamId: canonicalTeamId,
            userId,
            createdBy: session.userId,
            firstName: normalizeOptionalName(parsed.data.firstName),
            lastName: normalizeOptionalName(parsed.data.lastName),
            staffTypes: staffType ? [staffType] : [],
            linkVersion: 1,
            linkExpiresAt,
            createdAt: now,
            updatedAt: now,
          },
        });

      const shouldSendEmail = resolvedUser.isUserIdInvite || resolvedUser.shouldSendEmail;
      inviteForEmail = wasCreated && shouldSendEmail ? invite : null;

      await rollbackTeamInviteEventSyncs(tx, invite, 'CANCELLED', now);

      if (parsed.data.role === 'player' && userId) {
        await syncCanonicalTeamRoster({
          teamId: canonicalTeamId,
          captainId: (canonicalTeam as any).captainId,
          playerIds: activePlayerIdsForInvite,
          pendingPlayerIds: uniqueStrings([...normalizeIdList((canonicalTeam as any).pending), userId]),
          managerId: (canonicalTeam as any).managerId,
          headCoachId: (canonicalTeam as any).headCoachId,
          assistantCoachIds: normalizeIdList((canonicalTeam as any).coachIds),
          actingUserId: session.userId,
          now,
          preserveInvitedStaffAssignments: true,
        }, tx);

      } else if (userId) {
        await updateStaffInviteAssignment(tx, parsed.data.role, canonicalTeamId, userId, session.userId, now);
      }

      return {
        invite,
        team: await loadCanonicalTeamById(canonicalTeamId, tx),
      };
    });

    const baseUrl = getRequestOrigin(req);
    if (inviteForEmail) {
      await sendInviteEmails([inviteForEmail], baseUrl);
    }

    return NextResponse.json({
      ok: true,
      invite: mapInviteRecord(result.invite),
      team: result.team,
      shareUrl: buildTeamInviteShareUrl(result.invite, baseUrl),
    }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create member invite';
    const status = message === 'Forbidden'
      ? 403
      : message === 'Team not found'
        ? 404
        : message === 'User is already on this team'
          ? 409
          : message === 'Team is full. Player invite was not sent.'
            ? 409
            : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
