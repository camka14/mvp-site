import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { ORG_PERMISSIONS } from '@/lib/organizationPermissions';
import { hasOrgPermission } from '@/server/accessControl';
import { evaluateRazumlyAdminAccess } from '@/server/razumlyAdmin';
import { withLegacyList } from '@/server/legacyFormat';
import { parseDateInput } from '@/server/requestParsing';
import { withDerivedEventParticipantIds } from '@/server/events/eventRegistrations';
import { getEventOfficialIdsByEventIds } from '@/server/officials/eventOfficials';
import { serializeMatchRecordsLegacy } from '@/server/matches/instantPayloads';
import {
  getEventTeamsDelegate,
  isAdminOnlyCanonicalTeam,
  loadCanonicalTeamById,
  normalizeId,
} from '@/server/teams/teamMembership';

export const dynamic = 'force-dynamic';

const SCHEDULE_REGISTRATION_STATUSES = ['ACTIVE', 'PENDING', 'STARTED', 'BLOCKED'] as const;

const normalizeText = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length ? normalized : null;
};

const uniqueStrings = (values: Array<string | null | undefined>): string[] => (
  Array.from(
    new Set(
      values
        .map((value) => normalizeText(value))
        .filter((value): value is string => Boolean(value)),
    ),
  )
);

const parseLimit = (value: string | null): number => {
  const rawLimit = Number(value || '200');
  return Number.isFinite(rawLimit) ? Math.max(1, Math.min(1000, Math.round(rawLimit))) : 200;
};

const hasGlobalTeamAdminAccess = async (
  session: { userId: string; isAdmin: boolean },
): Promise<boolean> => {
  if (session.isAdmin) {
    return true;
  }
  const status = await evaluateRazumlyAdminAccess(session.userId);
  return status.allowed;
};

const hasOrganizationTeamManagementAccess = async (
  teamId: string,
  session: { userId: string; isAdmin: boolean },
): Promise<boolean> => {
  if (!teamId || !session.userId) return false;
  const canonicalTeamsDelegate: any = (prisma as any).canonicalTeams;
  if (!canonicalTeamsDelegate?.findUnique) {
    return false;
  }
  const team = await canonicalTeamsDelegate.findUnique({
    where: { id: teamId },
    select: { organizationId: true },
  });
  const organizationId = normalizeText(team?.organizationId);
  if (!organizationId) {
    return false;
  }
  const organization = await prisma.organizations.findUnique({
    where: { id: organizationId },
    select: { id: true, ownerId: true },
  });
  if (!organization) {
    return false;
  }
  return hasOrgPermission(session, organization, ORG_PERMISSIONS.TEAMS_MANAGE);
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(req);
  const { id } = await params;
  const team = await loadCanonicalTeamById(id, prisma);
  if (!team) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const teamId = normalizeId((team as any).id) ?? normalizeId(id);
  const parentTeamId = normalizeId((team as any).parentTeamId);
  const canonicalTeamId = parentTeamId ?? teamId;
  if (!canonicalTeamId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (isAdminOnlyCanonicalTeam(team as Record<string, unknown>)) {
    const canReadHiddenTeam = await hasGlobalTeamAdminAccess(session)
      || await hasOrganizationTeamManagementAccess(canonicalTeamId, session);
    if (!canReadHiddenTeam) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
  }

  const searchParams = req.nextUrl.searchParams;
  const from = parseDateInput(searchParams.get('from'));
  const to = parseDateInput(searchParams.get('to'));
  const limit = parseLimit(searchParams.get('limit'));
  const eventTeamsDelegate = getEventTeamsDelegate(prisma);

  const seedTeamIds = uniqueStrings([id, teamId, parentTeamId, canonicalTeamId]);
  const eventTeamRows = seedTeamIds.length && eventTeamsDelegate?.findMany
    ? await eventTeamsDelegate.findMany({
        where: {
          OR: [
            { id: { in: seedTeamIds } },
            { parentTeamId: { in: seedTeamIds } },
          ],
        },
        select: {
          id: true,
          parentTeamId: true,
        },
      })
    : [];
  const relevantTeamIds = uniqueStrings([
    ...seedTeamIds,
    ...eventTeamRows.map((row: { id?: unknown; parentTeamId?: unknown }) => normalizeId(row.id)),
    ...eventTeamRows.map((row: { id?: unknown; parentTeamId?: unknown }) => normalizeId(row.parentTeamId)),
  ]);

  const registrationRows = relevantTeamIds.length
    ? await prisma.eventRegistrations.findMany({
        where: {
          status: { in: [...SCHEDULE_REGISTRATION_STATUSES] },
          registrantId: { in: relevantTeamIds },
          registrantType: 'TEAM',
        },
        select: {
          eventId: true,
        },
      })
    : [];
  const registeredEventIds = uniqueStrings(
    registrationRows.map((row: { eventId?: unknown }) => normalizeId(row.eventId)),
  );

  const matchWhere: Record<string, unknown> = {
    OR: [
      { team1Id: { in: relevantTeamIds } },
      { team2Id: { in: relevantTeamIds } },
      { teamOfficialId: { in: relevantTeamIds } },
    ],
  };
  const matchDateConditions: Record<string, unknown>[] = [];
  if (from) {
    matchDateConditions.push({ end: { gte: from } });
  }
  if (to) {
    matchDateConditions.push({ start: { lte: to } });
  }
  if (matchDateConditions.length) {
    matchWhere.AND = matchDateConditions;
  }

  const candidateMatches = relevantTeamIds.length
    ? await prisma.matches.findMany({
        where: matchWhere,
        take: limit,
        orderBy: { start: 'asc' },
      })
    : [];

  const matchedEventIds = uniqueStrings(
    candidateMatches.map((match: { eventId?: unknown }) => normalizeId(match.eventId)),
  );
  const involvedEventIds = uniqueStrings([...registeredEventIds, ...matchedEventIds]);
  if (!involvedEventIds.length) {
    return NextResponse.json({
      events: [],
      matches: [],
      fields: [],
      teams: [],
    });
  }

  const eventWhere: Record<string, unknown> = {
    NOT: { state: 'TEMPLATE' },
    id: { in: involvedEventIds },
  };
  const eventDateConditions: Record<string, unknown>[] = [];
  if (from) {
    eventDateConditions.push({ end: { gte: from } });
  }
  if (to) {
    eventDateConditions.push({ start: { lte: to } });
  }
  if (eventDateConditions.length) {
    eventWhere.AND = eventDateConditions;
  }

  const events = await prisma.events.findMany({
    where: eventWhere,
    take: limit,
    orderBy: { start: 'asc' },
  });
  const enrichedEvents = await withDerivedEventParticipantIds(events, prisma);
  const eventIds = events.map((event) => event.id);
  const eventIdSet = new Set(eventIds);
  const officialIdsByEventId = await getEventOfficialIdsByEventIds(eventIds, prisma);
  const eventDtos = enrichedEvents.map((event) => ({
    ...event,
    officialIds: officialIdsByEventId.get(event.id) ?? [],
  }));
  const matches = candidateMatches.filter((match: { eventId?: unknown }) => (
    eventIdSet.has(String(match.eventId ?? '').trim())
  ));

  const fieldIds = uniqueStrings([
    ...events.flatMap((event) => (Array.isArray(event.fieldIds) ? event.fieldIds : [])),
    ...matches.map((match) => normalizeId(match.fieldId)),
  ]);

  const relatedTeamIds = uniqueStrings([
    ...relevantTeamIds,
    ...eventDtos.flatMap((event: { teamIds?: unknown }) => (Array.isArray(event.teamIds) ? event.teamIds : [])),
    ...matches.flatMap((match) => [
      normalizeId(match.team1Id),
      normalizeId(match.team2Id),
      normalizeId(match.teamOfficialId),
    ]),
  ]);

  const canonicalTeamsDelegate: any = (prisma as any).canonicalTeams;
  const [fields, eventTeamDetails, canonicalTeamDetails] = await Promise.all([
    fieldIds.length
      ? prisma.fields.findMany({
          where: { id: { in: fieldIds } },
          orderBy: [{ createdAt: 'asc' }, { name: 'asc' }, { id: 'asc' }],
        })
      : Promise.resolve([]),
    relatedTeamIds.length && eventTeamsDelegate?.findMany
      ? eventTeamsDelegate.findMany({
          where: { id: { in: relatedTeamIds } },
          orderBy: { name: 'asc' },
        })
      : Promise.resolve([]),
    relatedTeamIds.length && canonicalTeamsDelegate?.findMany
      ? canonicalTeamsDelegate.findMany({
          where: { id: { in: relatedTeamIds } },
          orderBy: { name: 'asc' },
        })
      : Promise.resolve([]),
  ]);

  const teamsById = new Map<string, Record<string, any>>();
  for (const row of canonicalTeamDetails as Record<string, any>[]) {
    const rowId = normalizeId(row.id);
    if (rowId) teamsById.set(rowId, row);
  }
  for (const row of eventTeamDetails as Record<string, any>[]) {
    const rowId = normalizeId(row.id);
    if (rowId) teamsById.set(rowId, row);
  }
  const teams = Array.from(teamsById.values()).sort((left, right) => (
    String(left.name ?? '').localeCompare(String(right.name ?? ''))
  ));

  return NextResponse.json({
    events: withLegacyList(eventDtos),
    matches: serializeMatchRecordsLegacy(matches),
    fields: withLegacyList(fields),
    teams: withLegacyList(teams),
  });
}
