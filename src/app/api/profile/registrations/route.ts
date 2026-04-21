import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { getCanonicalTeamIdsByUserIds } from '@/server/teams/teamMembership';

export const dynamic = 'force-dynamic';

const normalizeId = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const uniqueIds = (values: Array<string | null | undefined>): string[] => (
  Array.from(
    new Set(
      values
        .map((value) => normalizeId(value))
        .filter((value): value is string => Boolean(value)),
    ),
  )
);

const getTeamsDelegate = (client: any) => client?.teams ?? client?.volleyBallTeams;

const parseUpdatedAfter = (value: string | null): Date | null => {
  const normalized = normalizeId(value);
  if (!normalized) {
    return null;
  }
  const parsed = new Date(normalized);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
};

export async function GET(req: NextRequest) {
  const session = await requireSession(req);
  const updatedAfter = parseUpdatedAfter(req.nextUrl.searchParams.get('updatedAfter'));
  const eventId = normalizeId(req.nextUrl.searchParams.get('eventId'));
  const futureOnly = req.nextUrl.searchParams.get('futureOnly') === 'true';

  const [profile, linkedChildren] = await Promise.all([
    prisma.userData.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
      },
    }),
    prisma.parentChildLinks.findMany({
      where: {
        parentId: session.userId,
        status: 'ACTIVE',
      },
      select: {
        childId: true,
      },
    }),
  ]);

  const teamIdsByUserId = await getCanonicalTeamIdsByUserIds(
    profile?.id ? [profile.id] : [],
    prisma,
  );
  const teamIds = profile?.id
    ? (teamIdsByUserId.get(profile.id) ?? [])
    : [];
  const childIds = uniqueIds(linkedChildren.map((link) => normalizeId(link.childId)));

  const teamsDelegate = getTeamsDelegate(prisma);
  const slotTeamRows = teamIds.length && teamsDelegate?.findMany
    ? await teamsDelegate.findMany({
        where: { parentTeamId: { in: teamIds } },
        select: { id: true },
      })
    : [];
  const slotTeamIds = uniqueIds(slotTeamRows.map((row: { id?: unknown }) => String(row.id ?? '').trim()));
  const relevantTeamIds = uniqueIds([...teamIds, ...slotTeamIds]);

  const todayIso = new Date().toISOString().slice(0, 10);
  const andConditions: Record<string, unknown>[] = [
    {
      OR: [
        { registrantId: session.userId },
        { parentId: session.userId },
        ...(childIds.length ? [{ registrantId: { in: childIds } }] : []),
        ...(relevantTeamIds.length ? [{ registrantType: 'TEAM', registrantId: { in: relevantTeamIds } }] : []),
      ],
    },
  ];

  if (updatedAfter) {
    andConditions.push({ updatedAt: { gt: updatedAfter } });
  }
  if (eventId) {
    andConditions.push({ eventId });
  }
  if (futureOnly) {
    andConditions.push({
      OR: [
        { occurrenceDate: null },
        { occurrenceDate: { gte: todayIso } },
      ],
    });
  }

  const where: Record<string, unknown> = andConditions.length == 1
    ? andConditions[0]
    : { AND: andConditions };

  const registrations = await prisma.eventRegistrations.findMany({
    where,
    orderBy: [
      { updatedAt: 'desc' },
      { createdAt: 'desc' },
    ],
    select: {
      id: true,
      eventId: true,
      registrantId: true,
      parentId: true,
      registrantType: true,
      rosterRole: true,
      status: true,
      eventTeamId: true,
      sourceTeamRegistrationId: true,
      divisionId: true,
      divisionTypeId: true,
      divisionTypeKey: true,
      jerseyNumber: true,
      position: true,
      isCaptain: true,
      slotId: true,
      occurrenceDate: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({
    registrations: registrations.map((registration) => ({
      id: registration.id,
      eventId: registration.eventId,
      registrantId: registration.registrantId,
      parentId: registration.parentId,
      registrantType: registration.registrantType,
      rosterRole: registration.rosterRole,
      status: registration.status,
      eventTeamId: registration.eventTeamId,
      sourceTeamRegistrationId: registration.sourceTeamRegistrationId,
      divisionId: registration.divisionId,
      divisionTypeId: registration.divisionTypeId,
      divisionTypeKey: registration.divisionTypeKey,
      jerseyNumber: registration.jerseyNumber,
      position: registration.position,
      isCaptain: registration.isCaptain,
      slotId: registration.slotId,
      occurrenceDate: registration.occurrenceDate,
      createdAt: registration.createdAt?.toISOString() ?? null,
      updatedAt: registration.updatedAt?.toISOString() ?? null,
    })),
  });
}
