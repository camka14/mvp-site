import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { withLegacyFields } from '@/server/legacyFormat';
import { calculateAgeOnDate } from '@/lib/age';
import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import {
  resolveEventDivisionSelection,
} from '@/app/api/events/[eventId]/registrationDivisionUtils';
import { canManageEvent } from '@/server/accessControl';
import { extractDivisionTokenFromId } from '@/lib/divisionTypes';
import { dispatchRequiredEventDocuments } from '@/lib/eventConsentDispatch';

export const dynamic = 'force-dynamic';

const payloadSchema = z.object({
  user: z.record(z.string(), z.any()).optional(),
  userId: z.string().optional(),
  team: z.record(z.string(), z.any()).optional(),
  teamId: z.string().optional(),
  divisionId: z.string().optional(),
  divisionTypeId: z.string().optional(),
  divisionTypeKey: z.string().optional(),
}).passthrough();

const withLegacyEvent = (row: any) => {
  const legacy = withLegacyFields(row);
  return legacy;
};

const extractId = (value: any): string | undefined => {
  if (!value) return undefined;
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    if (typeof value.$id === 'string') return value.$id;
    if (typeof value.id === 'string') return value.id;
  }
  return undefined;
};

const ensureUnique = (values: string[]) => Array.from(new Set(values.filter(Boolean)));
const normalizeUserIdList = (values: unknown): string[] => {
  if (!Array.isArray(values)) {
    return [];
  }
  return ensureUnique(
    values
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter(Boolean),
  );
};
const normalizeRequiredTemplateIds = (values: unknown): string[] => {
  if (!Array.isArray(values)) {
    return [];
  }
  return ensureUnique(
    values
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter(Boolean),
  );
};
const normalizeEmail = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return normalized.length ? normalized : null;
};
const normalizeId = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length ? normalized : null;
};
const isSlotProvisionedTeam = (team: { captainId?: unknown; parentTeamId?: unknown }): boolean => (
  String(team.captainId ?? '').trim().length === 0
  || normalizeId(team.parentTeamId) !== null
);
const normalizeSportKey = (value: unknown): string => {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim().toLowerCase();
};

const normalizeDivisionToken = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return normalized.length ? normalized : null;
};

const normalizeDivisionTeamIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return ensureUnique(
    value
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter((entry) => entry.length > 0),
  );
};

const divisionMatchesTarget = (
  row: { id?: string | null; key?: string | null },
  targetDivisionId: string | null,
): boolean => {
  const normalizedTarget = normalizeDivisionToken(targetDivisionId);
  if (!normalizedTarget) {
    return false;
  }
  const aliases = new Set<string>();
  const rowId = normalizeDivisionToken(row.id);
  const rowKey = normalizeDivisionToken(row.key);
  if (rowId) {
    aliases.add(rowId);
    const token = extractDivisionTokenFromId(rowId);
    if (token) {
      aliases.add(token);
    }
  }
  if (rowKey) {
    aliases.add(rowKey);
  }
  return aliases.has(normalizedTarget);
};

type PrismaLike = PrismaClient | Prisma.TransactionClient;

const divisionAliases = (divisionId: string | null): Set<string> => {
  const aliases = new Set<string>();
  const normalized = normalizeDivisionToken(divisionId);
  if (normalized) {
    aliases.add(normalized);
  }
  if (divisionId) {
    const token = extractDivisionTokenFromId(divisionId);
    const normalizedToken = normalizeDivisionToken(token);
    if (normalizedToken) {
      aliases.add(normalizedToken);
    }
  }
  return aliases;
};

const teamDivisionMatchesSelection = (
  teamDivision: string | null,
  targetDivisionId: string | null,
): boolean => {
  const targetAliases = divisionAliases(targetDivisionId);
  if (!targetAliases.size) {
    return true;
  }
  const teamAliases = divisionAliases(teamDivision);
  for (const alias of teamAliases) {
    if (targetAliases.has(alias)) {
      return true;
    }
  }
  return false;
};

const syncDivisionTeamMembership = async (params: {
  event: {
    id: string;
    singleDivision: boolean | null;
    divisions: string[] | null;
  };
  teamId: string;
  mode: 'add' | 'remove';
  targetDivisionId: string | null;
}, client: PrismaLike = prisma) => {
  const eventDivisionIds = normalizeUserIdList(params.event.divisions);
  if (!eventDivisionIds.length) {
    return;
  }
  const rows = await client.divisions.findMany({
    where: {
      eventId: params.event.id,
      OR: [
        { id: { in: eventDivisionIds } },
        { key: { in: eventDivisionIds } },
      ],
    },
    select: {
      id: true,
      key: true,
      teamIds: true,
      kind: true,
    },
  });

  const shouldAssignToDivision = params.mode === 'add' && !Boolean(params.event.singleDivision);
  for (const row of rows) {
    const isPlayoff = typeof row.kind === 'string' && row.kind.toUpperCase() === 'PLAYOFF';
    if (isPlayoff) {
      continue;
    }
    const currentTeamIds = normalizeDivisionTeamIds(row.teamIds).filter((teamId) => teamId !== params.teamId);
    const shouldIncludeTeam = shouldAssignToDivision && divisionMatchesTarget(row, params.targetDivisionId);
    const nextTeamIds = shouldIncludeTeam ? ensureUnique([...currentTeamIds, params.teamId]) : currentTeamIds;
    await client.divisions.update({
      where: { id: row.id },
      data: {
        teamIds: nextTeamIds,
        updatedAt: new Date(),
      },
    });
  }
};

const canManageLinkedChildParticipant = async (params: {
  parentId: string;
  childId: string;
}): Promise<boolean> => {
  const link = await prisma.parentChildLinks.findFirst({
    where: {
      parentId: params.parentId,
      childId: params.childId,
      status: 'ACTIVE',
    },
    select: { id: true },
  });
  return Boolean(link);
};

const hasRefundablePaidTeamEventPayments = async (
  params: {
    eventId: string;
    teamOwnerIds?: string[];
    participantUserIds?: string[];
  },
  client: PrismaLike = prisma,
): Promise<boolean> => {
  const teamOwnerIds = normalizeUserIdList(params.teamOwnerIds ?? []);
  const participantUserIds = normalizeUserIdList(params.participantUserIds ?? []);

  const ownerFilters: Prisma.BillsWhereInput[] = [];
  if (teamOwnerIds.length > 0) {
    ownerFilters.push({
      ownerType: 'TEAM',
      ownerId: { in: teamOwnerIds },
    });
  }
  if (participantUserIds.length > 0) {
    ownerFilters.push({
      ownerType: 'USER',
      ownerId: { in: participantUserIds },
    });
  }
  if (!ownerFilters.length) {
    return false;
  }

  const bills = await client.bills.findMany({
    where: {
      eventId: params.eventId,
      OR: ownerFilters,
    },
    select: {
      id: true,
    },
  });
  if (!bills.length) {
    return false;
  }

  const billPayments = await client.billPayments.findMany({
    where: {
      billId: { in: bills.map((bill) => bill.id) },
      status: 'PAID',
    },
    select: {
      amountCents: true,
      refundedAmountCents: true,
    },
  });

  return billPayments.some((payment) => {
    const amountCents = Number.isFinite(Number(payment.amountCents))
      ? Math.max(0, Number(payment.amountCents))
      : 0;
    const refundedAmountCents = Number.isFinite(Number(payment.refundedAmountCents))
      ? Math.max(0, Number(payment.refundedAmountCents))
      : 0;
    return amountCents > refundedAmountCents;
  });
};

const ensureTeamRefundRequest = async (
  params: {
    eventId: string;
    hostId: string;
    organizationId: string | null;
    teamId: string;
    requestedByUserId: string;
    reason: string;
    teamOwnerIds?: string[];
    participantUserIds?: string[];
  },
  client: PrismaLike = prisma,
): Promise<void> => {
  const hasRefundablePayments = await hasRefundablePaidTeamEventPayments({
    eventId: params.eventId,
    teamOwnerIds: params.teamOwnerIds,
    participantUserIds: params.participantUserIds,
  }, client);
  if (!hasRefundablePayments) {
    return;
  }

  const existing = await client.refundRequests.findFirst({
    where: {
      eventId: params.eventId,
      teamId: params.teamId,
      status: 'WAITING',
    },
    select: { id: true },
  });
  if (existing?.id) {
    return;
  }
  const now = new Date();
  await client.refundRequests.create({
    data: {
      id: crypto.randomUUID(),
      eventId: params.eventId,
      userId: params.requestedByUserId,
      hostId: params.hostId,
      organizationId: params.organizationId,
      teamId: params.teamId,
      reason: params.reason,
      status: 'WAITING',
      createdAt: now,
      updatedAt: now,
    },
  });
};

async function updateParticipants(
  req: NextRequest,
  params: Promise<{ eventId: string }>,
  mode: 'add' | 'remove',
) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = payloadSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const { eventId } = await params;
  const event = await prisma.events.findUnique({
    where: { id: eventId },
  });
  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }
  const isWeeklyParent = (
    String(event.eventType ?? '').toUpperCase() === 'WEEKLY_EVENT'
    && !normalizeId((event as any).parentEvent)
  );
  if (mode === 'add' && isWeeklyParent) {
    return NextResponse.json(
      { error: 'Register through a weekly session instead of the parent weekly event.' },
      { status: 403 },
    );
  }
  const canManageCurrentEvent = await canManageEvent(session, event);

  const userId = parsed.data.userId ?? extractId(parsed.data.user);
  const teamId = parsed.data.teamId ?? extractId(parsed.data.team);

  if (mode === 'add' && userId && !teamId && event.teamSignup) {
    return NextResponse.json(
      { error: 'Individual joins for team events must use the free-agent route.' },
      { status: 403 },
    );
  }

  if (userId && !session.isAdmin && session.userId !== userId) {
    const canManageChild = mode === 'remove'
      ? await canManageLinkedChildParticipant({
        parentId: session.userId,
        childId: userId,
      })
      : false;
    if (!canManageChild) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const divisionSelectionResult = mode === 'add'
    ? await resolveEventDivisionSelection({
      event,
      input: parsed.data,
    })
    : null;

  if (mode === 'add' && divisionSelectionResult && !divisionSelectionResult.ok) {
    return NextResponse.json({ error: divisionSelectionResult.error ?? 'Invalid division selection' }, { status: 400 });
  }
  const divisionSelection = mode === 'add' && divisionSelectionResult?.ok
    ? divisionSelectionResult.selection
    : { divisionId: null, divisionTypeId: null, divisionTypeKey: null };

  const requiredTemplateIds = normalizeRequiredTemplateIds(event.requiredTemplateIds);
  const warnings: string[] = [];

  if (mode === 'add' && userId && !teamId) {
    const registrant = await prisma.userData.findUnique({
      where: { id: userId },
      select: { dateOfBirth: true },
    });
    if (!registrant) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }

    const ageAtEvent = calculateAgeOnDate(registrant.dateOfBirth, event.start);
    if (!Number.isFinite(ageAtEvent)) {
      return NextResponse.json({ error: 'Invalid date of birth' }, { status: 400 });
    }

    if (ageAtEvent < 18) {
      const parentLink = await prisma.parentChildLinks.findFirst({
        where: {
          childId: userId,
          status: 'ACTIVE',
        },
        orderBy: {
          updatedAt: 'desc',
        },
        select: {
          parentId: true,
        },
      });
      if (!parentLink?.parentId) {
        return NextResponse.json(
          { error: 'No linked parent/guardian found. Ask a parent to add you first.' },
          { status: 403 },
        );
      }

      const existingRequest = await prisma.eventRegistrations.findFirst({
        where: {
          eventId,
          registrantId: userId,
          parentId: parentLink.parentId,
          registrantType: 'CHILD',
          status: { in: ['PENDINGCONSENT', 'ACTIVE'] },
        },
        orderBy: {
          updatedAt: 'desc',
        },
      });

      const requestRegistration = existingRequest ?? await prisma.eventRegistrations.create({
        data: {
          id: crypto.randomUUID(),
          eventId,
          registrantId: userId,
          parentId: parentLink.parentId,
          registrantType: 'CHILD',
          status: 'PENDINGCONSENT',
          ageAtEvent,
          divisionId: divisionSelection.divisionId,
          divisionTypeId: divisionSelection.divisionTypeId,
          divisionTypeKey: divisionSelection.divisionTypeKey,
          consentStatus: 'guardian_approval_required',
          createdBy: session.userId,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      await prisma.invites?.deleteMany?.({
        where: {
          type: 'EVENT',
          eventId,
          userId: session.userId,
        },
      });

      return NextResponse.json({
        event: withLegacyEvent(event),
        registration: withLegacyFields(requestRegistration),
        requiresParentApproval: true,
      }, { status: 200 });
    }
  }

  let teamForRegistration:
    | {
      id: string;
      division: string | null;
      divisionTypeId: string | null;
      sport: string | null;
      playerIds: string[];
      managerId: string | null;
    }
    | null = null;
  let teamRefundReason = 'team_refund_requested';
  let teamRefundOwnerIds: string[] = [];
  let teamRefundParticipantUserIds: string[] = [];

  if (teamId) {
    const team = await prisma.teams.findUnique({
      where: { id: teamId },
      select: {
        id: true,
        division: true,
        divisionTypeId: true,
        sport: true,
        playerIds: true,
        captainId: true,
        managerId: true,
        headCoachId: true,
        parentTeamId: true,
      },
    });

    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }
    const teamManagerId = normalizeId(team.managerId);
    const isTeamManager = teamManagerId === session.userId;
    if (!session.isAdmin && !isTeamManager && !canManageCurrentEvent) {
      return NextResponse.json(
        { error: 'Only the team manager can register or withdraw this team.' },
        { status: 403 },
      );
    }
    teamRefundReason = (!isTeamManager && canManageCurrentEvent)
      ? 'team_unregistered_by_host'
      : 'team_refund_requested';
    teamRefundOwnerIds = ensureUnique(
      [team.id, normalizeId(team.parentTeamId) ?? ''].filter(Boolean),
    );
    teamRefundParticipantUserIds = ensureUnique(
      [
        ...normalizeUserIdList(team.playerIds),
        ...normalizeUserIdList([team.captainId, team.managerId, team.headCoachId]),
      ],
    );
    if (mode === 'add') {
      teamForRegistration = {
        ...team,
        playerIds: normalizeUserIdList(team.playerIds),
      };
    }
  }

  if (teamForRegistration && mode === 'add') {
    const team = teamForRegistration;
    const normalizedEventSport = normalizeSportKey(event.sportId);
    const normalizedTeamSport = normalizeSportKey(team.sport);
    if (normalizedEventSport && normalizedTeamSport !== normalizedEventSport) {
      return NextResponse.json(
        { error: 'This team does not match the event sport.' },
        { status: 403 },
      );
    }
  }

  if (mode === 'add' && teamForRegistration && requiredTemplateIds.length > 0 && teamForRegistration.playerIds.length > 0) {
    const [childProfiles, childEmails, activeLinks] = await Promise.all([
      prisma.userData.findMany({
        where: { id: { in: teamForRegistration.playerIds } },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          dateOfBirth: true,
        },
      }),
      prisma.sensitiveUserData.findMany({
        where: { userId: { in: teamForRegistration.playerIds } },
        select: {
          userId: true,
          email: true,
        },
      }),
      prisma.parentChildLinks.findMany({
        where: {
          childId: { in: teamForRegistration.playerIds },
          status: 'ACTIVE',
        },
        select: {
          childId: true,
        },
      }),
    ]);

    const childEmailById = new Map(childEmails.map((row) => [row.userId, normalizeEmail(row.email)]));
    const childIds = new Set(activeLinks.map((row) => row.childId));

    childProfiles.forEach((child) => {
      if (!childIds.has(child.id)) {
        return;
      }
      const ageAtEvent = calculateAgeOnDate(child.dateOfBirth, event.start);
      if (!Number.isFinite(ageAtEvent) || ageAtEvent >= 13) {
        return;
      }
      const childEmail = childEmailById.get(child.id);
      if (childEmail) {
        return;
      }
      const name = `${(child.firstName ?? '').trim()} ${(child.lastName ?? '').trim()}`.trim() || child.id;
      warnings.push(`Under-13 player ${name} is missing an email and cannot complete child signature steps until an email is added.`);
    });
  }

  let nextUserIds = normalizeUserIdList(event.userIds);
  let nextTeamIds = normalizeUserIdList(event.teamIds);
  let nextWaitListIds = normalizeUserIdList(event.waitListIds);
  let nextFreeAgentIds = normalizeUserIdList(event.freeAgentIds);

  const schedulableTeamEvent = Boolean(
    teamId
    && event.teamSignup
    && ['LEAGUE', 'TOURNAMENT'].includes(String(event.eventType ?? '').toUpperCase()),
  );
  if (teamId && schedulableTeamEvent) {
    try {
      const result = await prisma.$transaction(async (tx) => {
        const freshEvent = await tx.events.findUnique({
          where: { id: eventId },
          select: {
            id: true,
            eventType: true,
            teamSignup: true,
            teamIds: true,
            waitListIds: true,
            singleDivision: true,
            divisions: true,
            teamSizeLimit: true,
          },
        });
        if (!freshEvent) {
          return { ok: false as const, status: 404, error: 'Event not found' };
        }

        const rosterTeamIds = normalizeUserIdList(freshEvent.teamIds);
        const canonicalTeamId = teamId;
        const canonical = await tx.teams.findUnique({
          where: { id: canonicalTeamId },
          select: {
            id: true,
            name: true,
            playerIds: true,
            captainId: true,
            managerId: true,
            headCoachId: true,
            coachIds: true,
            pending: true,
            teamSize: true,
            profileImageId: true,
            sport: true,
            divisionTypeId: true,
            divisionTypeName: true,
          },
        });
        if (!canonical) {
          return { ok: false as const, status: 404, error: 'Team not found' };
        }

        const slotTeams = await tx.teams.findMany({
          where: { id: { in: rosterTeamIds } },
          select: {
            id: true,
            captainId: true,
            division: true,
            parentTeamId: true,
            name: true,
          },
        });
        const usesSlotProvisioning = slotTeams.some((team) => isSlotProvisionedTeam(team));
        if (!usesSlotProvisioning) {
          return { ok: 'fallback' as const };
        }

        if (mode === 'add') {
          if (slotTeams.some((team) => team.parentTeamId === canonicalTeamId)) {
            return { ok: false as const, status: 409, error: 'Team is already registered for this event.' };
          }

          const placeholderCandidates = slotTeams
            .filter((team) => String(team.captainId ?? '').trim().length === 0)
            .filter((team) => freshEvent.singleDivision ? true : teamDivisionMatchesSelection(team.division, divisionSelection.divisionId))
            .sort((a, b) => a.id.localeCompare(b.id));

          if (!placeholderCandidates.length) {
            return { ok: false as const, status: 409, error: 'Event/division is full.' };
          }

          const now = new Date();
          const canonicalPlayerIds = normalizeUserIdList(canonical.playerIds);
          let filledSlotTeamId: string | null = null;

          for (const candidate of placeholderCandidates) {
            const slotDivisionId = (() => {
              if (typeof divisionSelection.divisionId === 'string' && divisionSelection.divisionId.trim().length > 0) {
                return divisionSelection.divisionId.trim();
              }
              if (typeof candidate.division === 'string' && candidate.division.trim().length > 0) {
                return candidate.division.trim();
              }
              const fallbackDivisionId = normalizeUserIdList(freshEvent.divisions)[0];
              return fallbackDivisionId ?? 'open';
            })();
            const updateResult = await tx.teams.updateMany({
              where: {
                id: candidate.id,
                captainId: '',
                parentTeamId: null,
              },
              data: {
                name: canonical.name ?? '',
                playerIds: canonicalPlayerIds,
                captainId: canonical.captainId ?? '',
                managerId: canonical.managerId ?? '',
                headCoachId: canonical.headCoachId ?? null,
                coachIds: Array.isArray(canonical.coachIds) ? canonical.coachIds : [],
                pending: [],
                teamSize: canonical.teamSize ?? Math.max(0, Math.trunc(freshEvent.teamSizeLimit ?? 0)),
                profileImageId: canonical.profileImageId ?? null,
                sport: canonical.sport ?? null,
                division: slotDivisionId,
                divisionTypeId: canonical.divisionTypeId ?? null,
                divisionTypeName: canonical.divisionTypeName ?? null,
                parentTeamId: canonicalTeamId,
                updatedAt: now,
              },
            });
            if (updateResult.count === 1) {
              filledSlotTeamId = candidate.id;
              break;
            }
          }

          if (!filledSlotTeamId) {
            return { ok: false as const, status: 409, error: 'Event/division is full.' };
          }

          const nextWaitListIds = normalizeUserIdList(freshEvent.waitListIds).filter((id) => id !== canonicalTeamId);
          const updatedEvent = await tx.events.update({
            where: { id: eventId },
            data: {
              waitListIds: nextWaitListIds,
              updatedAt: now,
            },
          });

          const registrationId = `${eventId}__team__${filledSlotTeamId}`;
          await tx.eventRegistrations.upsert({
            where: { id: registrationId },
            create: {
              id: registrationId,
              eventId,
              registrantId: filledSlotTeamId,
              registrantType: 'TEAM',
              status: 'ACTIVE',
              ageAtEvent: null,
              divisionId: divisionSelection.divisionId,
              divisionTypeId: divisionSelection.divisionTypeId,
              divisionTypeKey: divisionSelection.divisionTypeKey,
              createdBy: session.userId,
              createdAt: now,
              updatedAt: now,
            },
            update: {
              status: 'ACTIVE',
              divisionId: divisionSelection.divisionId,
              divisionTypeId: divisionSelection.divisionTypeId,
              divisionTypeKey: divisionSelection.divisionTypeKey,
              updatedAt: now,
            },
          });

          await syncDivisionTeamMembership({
            event: {
              id: eventId,
              singleDivision: freshEvent.singleDivision,
              divisions: freshEvent.divisions,
            },
            teamId: filledSlotTeamId,
            mode: 'add',
            targetDivisionId: divisionSelection.divisionId,
          }, tx);

          return { ok: true as const, event: updatedEvent };
        }

        // mode === 'remove'
        const now = new Date();
        const inputTeamId = canonicalTeamId;
        const normalizedRosterTeamIds = new Set(rosterTeamIds);

        const slotFromParent = await tx.teams.findFirst({
          where: {
            id: { in: rosterTeamIds },
            parentTeamId: inputTeamId,
          },
          select: { id: true, name: true, parentTeamId: true, captainId: true },
        });
        const directRosterTeam = normalizedRosterTeamIds.has(inputTeamId)
          ? await tx.teams.findUnique({
            where: { id: inputTeamId },
            select: { id: true, name: true, parentTeamId: true, captainId: true },
          })
          : null;
        const slotTeam = slotFromParent
          ?? ((directRosterTeam && isSlotProvisionedTeam(directRosterTeam)) ? directRosterTeam : null);

        if (!slotTeam?.id) {
          return { ok: false as const, status: 404, error: 'Team is not registered for this event.' };
        }

        await tx.teams.update({
          where: { id: slotTeam.id },
          data: {
            name: slotTeam.name?.startsWith('Place Holder') ? slotTeam.name : 'Place Holder',
            captainId: '',
            managerId: '',
            playerIds: [],
            parentTeamId: null,
            divisionTypeId: null,
            divisionTypeName: null,
            sport: null,
            profileImageId: null,
            headCoachId: null,
            coachIds: [],
            pending: [],
            teamSize: Math.max(0, Math.trunc(freshEvent.teamSizeLimit ?? 0)),
            updatedAt: now,
          },
        });

        await tx.eventRegistrations.deleteMany({
          where: {
            eventId,
            registrantId: slotTeam.id,
            registrantType: 'TEAM',
          },
        });

        await syncDivisionTeamMembership({
          event: {
            id: eventId,
            singleDivision: freshEvent.singleDivision,
            divisions: freshEvent.divisions,
          },
          teamId: slotTeam.id,
          mode: 'remove',
          targetDivisionId: null,
        }, tx);

        const updatedEvent = await tx.events.update({
          where: { id: eventId },
          data: { updatedAt: now },
        });

        const refundTeamOwnerIds = ensureUnique(
          [
            ...teamRefundOwnerIds,
            slotTeam.id,
            normalizeId(slotTeam.parentTeamId) ?? '',
            inputTeamId,
          ].filter(Boolean),
        );
        await ensureTeamRefundRequest({
          eventId,
          hostId: event.hostId,
          organizationId: event.organizationId ?? null,
          teamId: slotTeam.id,
          requestedByUserId: session.userId,
          reason: teamRefundReason,
          teamOwnerIds: refundTeamOwnerIds,
          participantUserIds: teamRefundParticipantUserIds,
        }, tx);

        return { ok: true as const, event: updatedEvent };
      });

      if (result.ok === 'fallback') {
        // Event has no scheduler slot teams yet (or uses direct team IDs), so use legacy direct registration.
      } else if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      } else {
        await prisma.invites?.deleteMany?.({
          where: {
            type: 'EVENT',
            eventId,
            userId: session.userId,
          },
        });
        return NextResponse.json({
          event: withLegacyEvent(result.event),
          warnings: warnings.length ? warnings : undefined,
        }, { status: 200 });
      }
    } catch (error) {
      console.error('Event participant update failed', error);
      return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
  }

  if (mode === 'add' && teamId && nextTeamIds.includes(teamId)) {
    if (!canManageCurrentEvent) {
      return NextResponse.json({ error: 'Team is already registered for this event.' }, { status: 409 });
    }
  }
  if (mode === 'add' && userId && nextUserIds.includes(userId)) {
    return NextResponse.json({ error: 'User is already registered for this event.' }, { status: 409 });
  }
  if (mode === 'add' && userId && nextFreeAgentIds.includes(userId)) {
    return NextResponse.json(
      { error: 'User is already registered as a free agent for this event.' },
      { status: 409 },
    );
  }

  if (teamId) {
    if (mode === 'add') {
      nextTeamIds = ensureUnique([...nextTeamIds, teamId]);
      nextWaitListIds = nextWaitListIds.filter((id) => id !== teamId);
    } else {
      nextTeamIds = nextTeamIds.filter((id) => id !== teamId);
      nextWaitListIds = nextWaitListIds.filter((id) => id !== teamId);
    }
  } else if (userId) {
    if (mode === 'add') {
      nextUserIds = ensureUnique([...nextUserIds, userId]);
      nextWaitListIds = nextWaitListIds.filter((id) => id !== userId);
      nextFreeAgentIds = nextFreeAgentIds.filter((id) => id !== userId);
    } else {
      nextUserIds = nextUserIds.filter((id) => id !== userId);
      nextWaitListIds = nextWaitListIds.filter((id) => id !== userId);
      nextFreeAgentIds = nextFreeAgentIds.filter((id) => id !== userId);
    }
  }

  const updated = await prisma.events.update({
    where: { id: eventId },
    data: {
      userIds: nextUserIds,
      teamIds: nextTeamIds,
      waitListIds: nextWaitListIds,
      freeAgentIds: nextFreeAgentIds,
      updatedAt: new Date(),
    },
  });

  if (mode === 'add' && userId && !teamId && requiredTemplateIds.length > 0) {
    const consentDispatch = await dispatchRequiredEventDocuments({
      eventId,
      organizationId: event.organizationId ?? null,
      requiredTemplateIds,
      participantUserId: userId,
    });
    warnings.push(...consentDispatch.errors);
  }

  if (teamId) {
    if (mode === 'add') {
      const now = new Date();
      const registrationId = `${eventId}__team__${teamId}`;
      await prisma.eventRegistrations.upsert({
        where: { id: registrationId },
        create: {
          id: registrationId,
          eventId,
          registrantId: teamId,
          registrantType: 'TEAM',
          status: 'ACTIVE',
          ageAtEvent: null,
          divisionId: divisionSelection.divisionId,
          divisionTypeId: divisionSelection.divisionTypeId,
          divisionTypeKey: divisionSelection.divisionTypeKey,
          createdBy: session.userId,
          createdAt: now,
          updatedAt: now,
        },
        update: {
          status: 'ACTIVE',
          divisionId: divisionSelection.divisionId,
          divisionTypeId: divisionSelection.divisionTypeId,
          divisionTypeKey: divisionSelection.divisionTypeKey,
          updatedAt: now,
        },
      });
      await syncDivisionTeamMembership({
        event: {
          id: eventId,
          singleDivision: event.singleDivision,
          divisions: event.divisions,
        },
        teamId,
        mode,
        targetDivisionId: divisionSelection.divisionId,
      });
    } else {
      await prisma.eventRegistrations.deleteMany({
        where: {
          eventId,
          registrantId: teamId,
          registrantType: 'TEAM',
        },
      });
      await syncDivisionTeamMembership({
        event: {
          id: eventId,
          singleDivision: event.singleDivision,
          divisions: event.divisions,
        },
        teamId,
        mode,
        targetDivisionId: null,
      });
      await ensureTeamRefundRequest({
        eventId,
        hostId: event.hostId,
        organizationId: event.organizationId ?? null,
        teamId,
        requestedByUserId: session.userId,
        reason: teamRefundReason,
        teamOwnerIds: teamRefundOwnerIds,
        participantUserIds: teamRefundParticipantUserIds,
      });
    }
  }

  await prisma.invites?.deleteMany?.({
    where: {
      type: 'EVENT',
      eventId,
      userId: session.userId,
    },
  });

  return NextResponse.json({
    event: withLegacyEvent(updated),
    warnings: warnings.length ? warnings : undefined,
  }, { status: 200 });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  return updateParticipants(req, params, 'add');
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  return updateParticipants(req, params, 'remove');
}
