import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { withLegacyFields } from '@/server/legacyFormat';
import { calculateAgeOnDate } from '@/lib/age';
import {
  inferTeamDivisionTypeId,
  resolveEventDivisionSelection,
} from '@/app/api/events/[eventId]/registrationDivisionUtils';

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

  const userId = parsed.data.userId ?? extractId(parsed.data.user);
  const teamId = parsed.data.teamId ?? extractId(parsed.data.team);

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
    }
    | null = null;

  if (teamId && mode === 'add') {
    const team = await prisma.teams.findUnique({
      where: { id: teamId },
      select: {
        id: true,
        division: true,
        divisionTypeId: true,
        sport: true,
        playerIds: true,
      },
    });

    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }
    teamForRegistration = {
      ...team,
      playerIds: normalizeUserIdList(team.playerIds),
    };
  }

  if (teamForRegistration && mode === 'add') {
    const team = teamForRegistration;

    const teamDivisionTypeId = inferTeamDivisionTypeId({
      divisionTypeId: team.divisionTypeId,
      division: team.division,
      sport: team.sport,
    });

    if (divisionSelection.divisionTypeId && !teamDivisionTypeId) {
      return NextResponse.json(
        { error: 'This team must be assigned a division type before registering.' },
        { status: 403 },
      );
    }

    if (
      divisionSelection.divisionTypeId
      && teamDivisionTypeId
      && divisionSelection.divisionTypeId !== teamDivisionTypeId
    ) {
      return NextResponse.json(
        { error: 'This team cannot register for the selected division type.' },
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
    } else {
      await prisma.eventRegistrations.deleteMany({
        where: {
          eventId,
          registrantId: teamId,
          registrantType: 'TEAM',
        },
      });
    }
  }

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
