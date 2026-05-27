import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { listActiveChildIdsForParent } from '@/server/teams/teamGuardianInvites';

export const dynamic = 'force-dynamic';

const normalizeText = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const toIso = (value?: Date | string | null): string | null => {
  if (!value) {
    return null;
  }
  const asDate = value instanceof Date ? value : new Date(value);
  return Number.isFinite(asDate.getTime()) ? asDate.toISOString() : null;
};

export async function GET(req: NextRequest) {
  const session = await requireSession(req);

  const [requests, activeChildIds] = await Promise.all([
    prisma.eventRegistrations.findMany({
      where: {
        parentId: session.userId,
        registrantType: 'CHILD',
        status: 'STARTED',
        consentStatus: {
          in: ['guardian_approval_required'],
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
      select: {
        id: true,
        eventId: true,
        registrantId: true,
        divisionId: true,
        divisionTypeId: true,
        divisionTypeKey: true,
        consentStatus: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    listActiveChildIdsForParent(prisma, session.userId),
  ]);

  const teamInvites = activeChildIds.length
    ? await prisma.invites.findMany({
      where: {
        type: 'TEAM',
        status: 'PENDING',
        userId: { in: activeChildIds },
      },
      orderBy: {
        updatedAt: 'desc',
      },
      select: {
        id: true,
        teamId: true,
        userId: true,
        createdBy: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    })
    : [];

  if (!requests.length && !teamInvites.length) {
    return NextResponse.json({ requests: [] }, { status: 200 });
  }

  const eventIds = Array.from(new Set(
    requests
      .map((request) => normalizeText(request.eventId))
      .filter((value): value is string => Boolean(value)),
  ));
  const childIds = Array.from(new Set(
    [
      ...requests.map((request) => normalizeText(request.registrantId)),
      ...teamInvites.map((invite) => normalizeText(invite.userId)),
    ]
      .filter((value): value is string => Boolean(value)),
  ));
  const teamIds = Array.from(new Set(
    teamInvites
      .map((invite) => normalizeText(invite.teamId))
      .filter((value): value is string => Boolean(value)),
  ));

  const [events, teams, children, childSensitive] = await Promise.all([
    eventIds.length
      ? prisma.events.findMany({
        where: { id: { in: eventIds } },
        select: {
          id: true,
          name: true,
          start: true,
        },
      })
      : Promise.resolve([]),
    teamIds.length
      ? prisma.canonicalTeams.findMany({
        where: { id: { in: teamIds } },
        select: {
          id: true,
          name: true,
          registrationPriceCents: true,
          openRegistration: true,
        },
      })
      : Promise.resolve([]),
    childIds.length
      ? prisma.userData.findMany({
        where: { id: { in: childIds } },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          dateOfBirth: true,
        },
      })
      : Promise.resolve([]),
    childIds.length
      ? prisma.sensitiveUserData.findMany({
        where: { userId: { in: childIds } },
        select: {
          userId: true,
          email: true,
        },
      })
      : Promise.resolve([]),
  ]);

  const eventById = new Map(events.map((event) => [event.id, event]));
  const teamById = new Map(teams.map((team) => [team.id, team]));
  const childById = new Map(children.map((child) => [child.id, child]));
  const childEmailById = new Map(
    childSensitive.map((row) => [row.userId, normalizeText(row.email)]),
  );

  const eventPayload = requests.map((request) => {
    const child = childById.get(request.registrantId);
    const event = eventById.get(request.eventId);
    const firstName = normalizeText(child?.firstName) ?? '';
    const lastName = normalizeText(child?.lastName) ?? '';
    const fullName = `${firstName} ${lastName}`.trim() || 'Child';
    const childEmail = childEmailById.get(request.registrantId) ?? null;

    return {
      requestType: 'EVENT',
      registrationId: request.id,
      eventId: request.eventId,
      eventName: normalizeText(event?.name) ?? 'Event',
      eventStart: toIso(event?.start),
      childUserId: request.registrantId,
      childFirstName: firstName,
      childLastName: lastName,
      childFullName: fullName,
      childDateOfBirth: toIso(child?.dateOfBirth),
      childEmail,
      childHasEmail: Boolean(childEmail),
      consentStatus: normalizeText(request.consentStatus) ?? 'guardian_approval_required',
      divisionId: normalizeText(request.divisionId),
      divisionTypeId: normalizeText(request.divisionTypeId),
      divisionTypeKey: normalizeText(request.divisionTypeKey),
      requestedAt: toIso(request.createdAt),
      updatedAt: toIso(request.updatedAt),
    };
  });

  const teamPayload = teamInvites.map((invite) => {
    const childId = normalizeText(invite.userId) ?? '';
    const child = childById.get(childId);
    const team = invite.teamId ? teamById.get(invite.teamId) : null;
    const firstName = normalizeText(child?.firstName) ?? '';
    const lastName = normalizeText(child?.lastName) ?? '';
    const fullName = `${firstName} ${lastName}`.trim() || 'Child';
    const childEmail = childEmailById.get(childId) ?? null;
    const isOpenRegistrationRequest = normalizeText(invite.createdBy) === childId;
    const teamName = normalizeText(team?.name) ?? 'Team';

    return {
      requestType: 'TEAM',
      requestSource: isOpenRegistrationRequest ? 'TEAM_JOIN_REQUEST' : 'TEAM_INVITE',
      registrationId: invite.id,
      inviteId: invite.id,
      teamId: invite.teamId,
      teamName,
      teamRegistrationPriceCents: Math.max(0, Math.round(Number(team?.registrationPriceCents ?? 0))),
      teamOpenRegistration: Boolean(team?.openRegistration),
      eventId: null,
      eventName: teamName,
      eventStart: null,
      childUserId: childId,
      childFirstName: firstName,
      childLastName: lastName,
      childFullName: fullName,
      childDateOfBirth: toIso(child?.dateOfBirth),
      childEmail,
      childHasEmail: Boolean(childEmail),
      consentStatus: isOpenRegistrationRequest
        ? 'guardian_approval_required'
        : 'team_invite_guardian_approval_required',
      divisionId: null,
      divisionTypeId: null,
      divisionTypeKey: null,
      requestedAt: toIso(invite.createdAt),
      updatedAt: toIso(invite.updatedAt),
    };
  });

  const payload = [...eventPayload, ...teamPayload].sort((left, right) => {
    const leftTime = left.updatedAt ? new Date(left.updatedAt).getTime() : 0;
    const rightTime = right.updatedAt ? new Date(right.updatedAt).getTime() : 0;
    return rightTime - leftTime;
  });

  return NextResponse.json({ requests: payload }, { status: 200 });
}
