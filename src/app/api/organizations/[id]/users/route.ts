import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import {
  canAccessOrganizationUsers,
  listOrganizationUsersScopeEvents,
  type OrganizationUsersScopeEvent,
} from '@/server/organizationUsersAccess';
import { loadBillDiscountSummaries, withBillDiscountAmounts } from '@/server/billing/billDiscountSummaries';
import type { BillDiscountSummary } from '@/types';

export const dynamic = 'force-dynamic';

type EventSummary = {
  eventId: string;
  eventName: string;
  imageId?: string | null;
  start: string;
  end: string;
  status?: string;
};

type TeamRegistrationSummary = EventSummary & {
  eventTeamId: string;
  eventTeamName: string;
  division?: string;
  sport?: string;
  memberCount: number;
  billIds: string[];
  totalAmountCents: number;
  paidAmountCents: number;
  originalAmountCents: number;
  discountAmountCents: number;
  discountedAmountCents: number;
};

type BillPaymentSummary = {
  paymentId: string;
  billId: string;
  sequence: number;
  dueDate?: string;
  amountCents: number;
  status?: string;
  paidAt?: string;
  paymentIntentId?: string | null;
  payerUserId?: string | null;
  refundedAmountCents: number;
  refundableAmountCents: number;
  isRefundable: boolean;
};

type BillSummary = {
  billId: string;
  ownerType: 'USER' | 'TEAM' | 'ORGANIZATION';
  ownerId: string;
  ownerName: string;
  eventId?: string | null;
  eventName?: string;
  parentBillId?: string | null;
  totalAmountCents: number;
  paidAmountCents: number;
  originalAmountCents: number;
  discountAmountCents: number;
  discountedAmountCents: number;
  discounts: BillDiscountSummary[];
  refundedAmountCents: number;
  refundableAmountCents: number;
  status?: string;
  allowSplit?: boolean | null;
  paymentPlanEnabled?: boolean | null;
  lineItems?: unknown;
  createdAt?: string;
  updatedAt?: string;
  payments: BillPaymentSummary[];
};

type DocumentSummary = {
  signedDocumentRecordId: string;
  documentId: string;
  templateId: string;
  eventId?: string;
  eventName?: string;
  teamId?: string;
  title: string;
  type: 'PDF' | 'TEXT';
  status?: string;
  signedAt?: string;
  viewUrl?: string;
  content?: string;
};

type TeamMembershipSummary = {
  teamId: string;
  teamName: string;
  division?: string;
  sport?: string;
  status?: string;
  rosterRole?: string;
  jerseyNumber?: string | null;
  position?: string | null;
  isCaptain: boolean;
};

type TeamMemberSummary = {
  userId: string;
  firstName: string;
  lastName: string;
  fullName: string;
  userName?: string;
  profileImageId?: string | null;
  status?: string;
  rosterRole?: string;
  jerseyNumber?: string | null;
  position?: string | null;
  isCaptain: boolean;
  bills: BillSummary[];
  documents: DocumentSummary[];
};

type TeamStaffSummary = {
  userId: string;
  firstName: string;
  lastName: string;
  fullName: string;
  userName?: string;
  profileImageId?: string | null;
  role: 'MANAGER' | 'HEAD_COACH' | 'ASSISTANT_COACH';
  status?: string;
};

type UserSummaryInternal = {
  userId: string;
  firstName: string;
  lastName: string;
  fullName: string;
  userName?: string;
  profileImageId?: string | null;
  eventsById: Map<string, EventSummary>;
  documents: DocumentSummary[];
  bills: BillSummary[];
  teamMembershipsByTeamId: Map<string, TeamMembershipSummary>;
};

type TeamSummaryInternal = {
  canonicalTeamId: string;
  name: string;
  division?: string;
  sport?: string;
  profileImageId?: string | null;
  memberCount: number;
  teamSize?: number;
  captainId?: string;
  managerId?: string;
  headCoachId?: string;
  assistantCoachIds: string[];
  registrationsByEventTeamId: Map<string, TeamRegistrationSummary>;
  documents: DocumentSummary[];
  bills: BillSummary[];
};

type CanonicalTeamRegistrationRow = {
  teamId?: string | null;
  userId?: string | null;
  status?: string | null;
  rosterRole?: string | null;
  jerseyNumber?: string | null;
  position?: string | null;
  isCaptain?: boolean | null;
};

type TeamStaffAssignmentRow = {
  teamId?: string | null;
  userId?: string | null;
  role?: string | null;
  status?: string | null;
};

const toDisplayName = (user: {
  firstName?: string | null;
  lastName?: string | null;
  userName?: string | null;
  id: string;
}): string => {
  const fullName = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
  if (fullName) {
    return fullName;
  }
  if (user.userName?.trim()) {
    return user.userName.trim();
  }
  return user.id;
};

const normalizeStatus = (value: string | null | undefined): string | undefined => {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.toUpperCase();
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

const isTeamRegistrantType = (value: unknown): boolean => {
  const normalized = normalizeId(value);
  if (!normalized) {
    return false;
  }
  return normalized.toUpperCase() === 'TEAM';
};

const isPlaceholderEventTeamKind = (value: unknown): boolean => {
  const normalized = normalizeId(value);
  return normalized?.toUpperCase() === 'PLACEHOLDER';
};

const toEventTeamKey = (eventId: string, teamId: string): string => `${eventId}::${teamId}`;

const getSortTimestamp = (value: string | undefined): number => {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toIsoString = (value: Date | string | null | undefined): string | undefined => {
  if (!value) return undefined;
  if (value instanceof Date) {
    return value.toISOString();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
};

const normalizeAmountCents = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
};

const isRentalScopeEvent = (
  event: Pick<OrganizationUsersScopeEvent, 'organizationId'>,
  organizationId: string,
): boolean => event.organizationId !== organizationId;

const normalizeDivisionLookupKey = (value: unknown): string | null => normalizeId(value)?.toLowerCase() ?? null;

const extractScopedDivisionToken = (value: unknown): string | null => {
  const normalized = normalizeDivisionLookupKey(value);
  if (!normalized) {
    return null;
  }
  const marker = '__division__';
  const markerIndex = normalized.lastIndexOf(marker);
  if (markerIndex < 0) {
    return null;
  }
  const token = normalized.slice(markerIndex + marker.length).trim();
  return token.length ? token.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') : null;
};

const looksLikeOpaqueDivisionId = (value: string): boolean => (
  value.includes('__DIVISION__')
  || value.toLowerCase().startsWith('division_')
  || value.toLowerCase().includes('_division_')
  || value.length > 36
  || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
);

const formatDivisionTokenLabel = (value: string): string | undefined => {
  const label = value
    .replace(/[_-]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
    .trim();
  return label.length ? label : undefined;
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(req);
  const { id } = await params;

  const org = await prisma.organizations.findUnique({
    where: { id },
    select: { id: true, ownerId: true },
  });
  if (!org) {
    return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
  }

  const eventRows = await listOrganizationUsersScopeEvents(id);

  const canAccess = await canAccessOrganizationUsers({
    session,
    organization: org,
    events: eventRows,
  });

  if (!canAccess) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const eventIds = eventRows.map((event) => event.id);
  const rentalEventIds = eventRows
    .filter((event) => isRentalScopeEvent(event, id))
    .map((event) => event.id);
  const rentalEventIdSet = new Set(rentalEventIds);
  const registrations = eventIds.length
    ? await prisma.eventRegistrations.findMany({
      where: { eventId: { in: eventIds } },
	      select: {
	        eventId: true,
	        registrantId: true,
	        parentId: true,
	        registrantType: true,
	        eventTeamId: true,
	        status: true,
	      },
      orderBy: { updatedAt: 'desc' },
    })
    : [];
  const eventOfficials = rentalEventIds.length
    ? await prisma.eventOfficials.findMany({
      where: {
        eventId: { in: rentalEventIds },
        isActive: { not: false },
      },
      select: {
        eventId: true,
        userId: true,
      },
    })
    : [];

  const teamIdsByEventId = new Map<string, Set<string>>();
  eventRows.forEach((event) => {
    teamIdsByEventId.set(event.id, new Set(event.teamIds));
  });
  registrations.forEach((registration) => {
    if (!isTeamRegistrantType(registration.registrantType)) {
      return;
    }
    const teamId = normalizeId(registration.eventTeamId) ?? normalizeId(registration.registrantId);
    if (!teamId) {
      return;
    }
    const teamIdsForEvent = teamIdsByEventId.get(registration.eventId);
    if (teamIdsForEvent) {
      teamIdsForEvent.add(teamId);
      return;
    }
    teamIdsByEventId.set(registration.eventId, new Set([teamId]));
  });

  const registeredTeamIds = Array.from(
    new Set(
      Array.from(teamIdsByEventId.values())
        .flatMap((teamIds) => Array.from(teamIds)),
    ),
  );
  const teams = registeredTeamIds.length
    ? await prisma.teams.findMany({
      where: {
        id: { in: registeredTeamIds },
        OR: [
          { kind: { not: 'PLACEHOLDER' } },
          { kind: null },
        ],
      },
      select: {
        id: true,
        name: true,
        kind: true,
        division: true,
        divisionTypeId: true,
        sport: true,
        profileImageId: true,
        teamSize: true,
        playerIds: true,
        captainId: true,
	        managerId: true,
	        headCoachId: true,
	        coachIds: true,
	        parentTeamId: true,
      },
    })
    : [];
	  const eventTeams = teams.filter((team) => !isPlaceholderEventTeamKind(team.kind));
	  const activeEventTeamIds = eventTeams.map((team) => team.id);
	  const activeEventTeamIdSet = new Set(activeEventTeamIds);
	  teamIdsByEventId.forEach((teamIds) => {
	    Array.from(teamIds).forEach((teamId) => {
	      if (!activeEventTeamIdSet.has(teamId)) {
	        teamIds.delete(teamId);
	      }
	    });
	  });
	  const teamMemberIdsByTeamId = new Map<string, string[]>();
	  eventTeams.forEach((team) => {
	    const memberIds = normalizeIdList([
	      ...normalizeIdList(team.playerIds),
      team.captainId,
      team.managerId,
      team.headCoachId,
      ...normalizeIdList(team.coachIds),
	    ]);
	    teamMemberIdsByTeamId.set(team.id, memberIds);
	  });
	  const eventTeamById = new Map(eventTeams.map((team) => [team.id, team] as const));
	  const canonicalTeamIdByEventTeamId = new Map<string, string>();
	  registrations.forEach((registration) => {
	    if (!isTeamRegistrantType(registration.registrantType)) {
	      return;
	    }
	    const eventTeamId = normalizeId(registration.eventTeamId) ?? normalizeId(registration.registrantId);
	    if (!eventTeamId) {
	      return;
	    }
	    if (!eventTeamById.has(eventTeamId)) {
	      return;
	    }
	    const canonicalTeamId = normalizeId(registration.parentId)
	      ?? normalizeId(eventTeamById.get(eventTeamId)?.parentTeamId)
	      ?? eventTeamId;
	    canonicalTeamIdByEventTeamId.set(eventTeamId, canonicalTeamId);
	  });
	  eventTeams.forEach((team) => {
	    if (!canonicalTeamIdByEventTeamId.has(team.id)) {
	      canonicalTeamIdByEventTeamId.set(team.id, normalizeId(team.parentTeamId) ?? team.id);
	    }
	  });

	  const eventCanonicalTeamIds = Array.from(new Set(Array.from(canonicalTeamIdByEventTeamId.values())));
	  const canonicalTeamsDelegate = (prisma as any).canonicalTeams;
	  const organizationCanonicalTeams = typeof canonicalTeamsDelegate?.findMany === 'function'
	    ? await canonicalTeamsDelegate.findMany({
	      where: { organizationId: id },
	      select: {
	        id: true,
	        name: true,
	        division: true,
	        divisionTypeId: true,
	        sport: true,
	        profileImageId: true,
	        teamSize: true,
	      },
	    })
	    : [];
	  const organizationCanonicalTeamIds = organizationCanonicalTeams
	    .map((team: Record<string, any>) => normalizeId(team.id))
	    .filter((teamId: string | null): teamId is string => Boolean(teamId));
	  const canonicalTeamIds = Array.from(new Set([...eventCanonicalTeamIds, ...organizationCanonicalTeamIds]));
	  const canonicalTeams = canonicalTeamIds.length && typeof canonicalTeamsDelegate?.findMany === 'function'
	    ? await canonicalTeamsDelegate.findMany({
	      where: { id: { in: canonicalTeamIds } },
	      select: {
	        id: true,
	        name: true,
	        division: true,
	        divisionTypeId: true,
	        sport: true,
	        profileImageId: true,
	        teamSize: true,
	      },
	    })
	    : [];
	  const teamRegistrationsDelegate = (prisma as any).teamRegistrations;
	  const canonicalTeamRegistrationRows: CanonicalTeamRegistrationRow[] = canonicalTeamIds.length && typeof teamRegistrationsDelegate?.findMany === 'function'
	    ? await teamRegistrationsDelegate.findMany({
	      where: {
	        teamId: { in: canonicalTeamIds },
	        status: { in: ['ACTIVE', 'PENDING', 'STARTED'] },
	      },
	      select: {
	        teamId: true,
	        userId: true,
	        status: true,
	        rosterRole: true,
	        jerseyNumber: true,
	        position: true,
	        isCaptain: true,
	      },
	    })
	    : [];
	  const teamStaffAssignmentsDelegate = (prisma as any).teamStaffAssignments;
	  const canonicalTeamStaffRows: TeamStaffAssignmentRow[] = canonicalTeamIds.length && typeof teamStaffAssignmentsDelegate?.findMany === 'function'
	    ? await teamStaffAssignmentsDelegate.findMany({
	      where: {
	        teamId: { in: canonicalTeamIds },
	        status: { in: ['ACTIVE', 'PENDING', 'STARTED'] },
	      },
	      select: {
	        teamId: true,
	        userId: true,
	        role: true,
	        status: true,
	      },
	    })
	    : [];
	  const memberCountByCanonicalTeamId = new Map<string, number>();
	  canonicalTeamRegistrationRows.forEach((row: { teamId?: string | null; userId?: string | null }) => {
	    const teamId = normalizeId(row.teamId);
	    const userId = normalizeId(row.userId);
	    if (!teamId || !userId) {
	      return;
	    }
	    memberCountByCanonicalTeamId.set(teamId, (memberCountByCanonicalTeamId.get(teamId) ?? 0) + 1);
	  });

	  const teamSummariesByCanonicalTeamId = new Map<string, TeamSummaryInternal>();
	  const divisionLookupValues = new Set<string>();
	  const addDivisionLookupValue = (value: unknown) => {
	    const normalized = normalizeId(value);
	    if (normalized) {
	      divisionLookupValues.add(normalized);
	      const lookupKey = normalizeDivisionLookupKey(normalized);
	      if (lookupKey) {
	        divisionLookupValues.add(lookupKey);
	      }
	    }
	  };
	  const collectDivisionLookupValues = (row: { division?: unknown; divisionTypeId?: unknown }) => {
	    addDivisionLookupValue(row.division);
	    addDivisionLookupValue(row.divisionTypeId);
	    addDivisionLookupValue(extractScopedDivisionToken(row.division));
	  };
	  eventTeams.forEach(collectDivisionLookupValues);
	  canonicalTeams.forEach((team: Record<string, any>) => collectDivisionLookupValues(team));
	  const divisionLookupList = Array.from(divisionLookupValues);
	  const divisionsDelegate = (prisma as any).divisions;
	  const divisionRows = divisionLookupList.length && typeof divisionsDelegate?.findMany === 'function'
	    ? await divisionsDelegate.findMany({
	      where: {
	        OR: [
	          { id: { in: divisionLookupList } },
	          { key: { in: divisionLookupList } },
	          { divisionTypeId: { in: divisionLookupList } },
	        ],
	      },
	      select: {
	        id: true,
	        key: true,
	        name: true,
	        divisionTypeId: true,
	      },
	    })
	    : [];
	  const divisionNameByLookupKey = new Map<string, string>();
	  const addDivisionNameAlias = (value: unknown, name: unknown) => {
	    const lookupKey = normalizeDivisionLookupKey(value);
	    const label = normalizeId(name);
	    if (lookupKey && label && !looksLikeOpaqueDivisionId(label)) {
	      divisionNameByLookupKey.set(lookupKey, label);
	    }
	  };
	  divisionRows.forEach((row: Record<string, any>) => {
	    addDivisionNameAlias(row.id, row.name);
	    addDivisionNameAlias(row.key, row.name);
	    addDivisionNameAlias(row.divisionTypeId, row.name);
	    addDivisionNameAlias(extractScopedDivisionToken(row.id), row.name);
	    addDivisionNameAlias(extractScopedDivisionToken(row.key), row.name);
	  });
	  const resolveTeamDivisionName = (row: { division?: unknown; divisionTypeId?: unknown }): string | undefined => {
	    const division = normalizeId(row.division);
	    const divisionTypeId = normalizeId(row.divisionTypeId);
	    const scopedToken = extractScopedDivisionToken(division);
	    const lookupValues = [division, scopedToken, divisionTypeId];
	    for (const value of lookupValues) {
	      const lookupKey = normalizeDivisionLookupKey(value);
	      const label = lookupKey ? divisionNameByLookupKey.get(lookupKey) : undefined;
	      if (label) {
	        return label;
	      }
	    }
	    if (scopedToken && !scopedToken.includes('_')) {
	      return formatDivisionTokenLabel(scopedToken);
	    }
	    if (division && !looksLikeOpaqueDivisionId(division)) {
	      return division;
	    }
	    return undefined;
	  };

	  canonicalTeams.forEach((team: Record<string, any>) => {
	    const canonicalTeamId = String(team.id ?? '').trim();
	    if (!canonicalTeamId) {
	      return;
	    }
	    teamSummariesByCanonicalTeamId.set(canonicalTeamId, {
	      canonicalTeamId,
	      name: typeof team.name === 'string' && team.name.trim() ? team.name.trim() : canonicalTeamId,
	      division: resolveTeamDivisionName(team),
	      sport: typeof team.sport === 'string' && team.sport.trim() ? team.sport.trim() : undefined,
	      profileImageId: typeof team.profileImageId === 'string' && team.profileImageId.trim() ? team.profileImageId : null,
	      memberCount: memberCountByCanonicalTeamId.get(canonicalTeamId) ?? 0,
	      teamSize: typeof team.teamSize === 'number' ? team.teamSize : undefined,
	      assistantCoachIds: [],
	      registrationsByEventTeamId: new Map<string, TeamRegistrationSummary>(),
	      documents: [],
	      bills: [],
	    });
	  });
	  canonicalTeamIdByEventTeamId.forEach((canonicalTeamId, eventTeamId) => {
	    if (teamSummariesByCanonicalTeamId.has(canonicalTeamId)) {
	      return;
	    }
	    const eventTeam = eventTeamById.get(eventTeamId);
	    if (!eventTeam) {
	      return;
	    }
	    teamSummariesByCanonicalTeamId.set(canonicalTeamId, {
	      canonicalTeamId,
	      name: typeof eventTeam.name === 'string' && eventTeam.name.trim() ? eventTeam.name.trim() : canonicalTeamId,
	      division: resolveTeamDivisionName(eventTeam),
	      sport: typeof eventTeam.sport === 'string' && eventTeam.sport.trim() ? eventTeam.sport.trim() : undefined,
	      profileImageId: typeof eventTeam.profileImageId === 'string' && eventTeam.profileImageId.trim() ? eventTeam.profileImageId : null,
	      memberCount: memberCountByCanonicalTeamId.get(canonicalTeamId) ?? teamMemberIdsByTeamId.get(eventTeamId)?.length ?? 0,
	      teamSize: typeof eventTeam.teamSize === 'number' ? eventTeam.teamSize : undefined,
	      captainId: normalizeId(eventTeam.captainId) ?? undefined,
	      managerId: normalizeId(eventTeam.managerId) ?? undefined,
	      headCoachId: normalizeId(eventTeam.headCoachId) ?? undefined,
	      assistantCoachIds: normalizeIdList(eventTeam.coachIds),
	      registrationsByEventTeamId: new Map<string, TeamRegistrationSummary>(),
	      documents: [],
	      bills: [],
	    });
	  });

	  const teamRegistrationStatusByEventTeam = new Map<string, string | undefined>();
	  registrations.forEach((registration) => {
	    if (!isTeamRegistrantType(registration.registrantType)) {
	      return;
	    }
	    const teamId = normalizeId(registration.eventTeamId) ?? normalizeId(registration.registrantId);
	    if (!teamId) {
	      return;
	    }
	    if (!eventTeamById.has(teamId)) {
	      return;
	    }
    const key = toEventTeamKey(registration.eventId, teamId);
    if (!teamRegistrationStatusByEventTeam.has(key)) {
      teamRegistrationStatusByEventTeam.set(key, normalizeStatus(registration.status));
    }
  });

  const participantUserIds = new Set<string>();
  eventRows.forEach((event) => {
    event.userIds.forEach((userId) => participantUserIds.add(userId));
    if (!rentalEventIdSet.has(event.id)) {
      return;
    }
    if (event.hostId) {
      participantUserIds.add(event.hostId);
    }
    event.assistantHostIds.forEach((userId) => participantUserIds.add(userId));
    event.officialIds.forEach((userId) => participantUserIds.add(userId));
  });
  eventOfficials.forEach((assignment) => {
    const userId = normalizeId(assignment.userId);
    if (userId) {
      participantUserIds.add(userId);
    }
  });
  registrations.forEach((registration) => {
    if (isTeamRegistrantType(registration.registrantType)) {
      return;
    }
    const registrantId = normalizeId(registration.registrantId);
    if (registrantId) {
      participantUserIds.add(registrantId);
    }
  });
  teamMemberIdsByTeamId.forEach((memberIds) => {
    memberIds.forEach((memberId) => participantUserIds.add(memberId));
  });
  const organizationTeamMemberUserIds = new Set<string>();
	  canonicalTeamRegistrationRows.forEach((row: { userId?: string | null }) => {
	    const userId = normalizeId(row.userId);
	    if (!userId) {
	      return;
	    }
	    const teamId = normalizeId((row as CanonicalTeamRegistrationRow).teamId);
	    const teamSummary = teamId ? teamSummariesByCanonicalTeamId.get(teamId) : undefined;
	    if (teamSummary && (row as CanonicalTeamRegistrationRow).isCaptain) {
	      teamSummary.captainId = userId;
	    }
	    organizationTeamMemberUserIds.add(userId);
	    participantUserIds.add(userId);
	  });
	  canonicalTeamStaffRows.forEach((row) => {
	    const teamId = normalizeId(row.teamId);
	    const userId = normalizeId(row.userId);
	    if (!teamId || !userId) {
	      return;
	    }
	    const teamSummary = teamSummariesByCanonicalTeamId.get(teamId);
	    const role = normalizeStatus(row.role);
	    if (teamSummary) {
	      if (role === 'MANAGER') {
	        teamSummary.managerId = userId;
	      } else if (role === 'HEAD_COACH') {
	        teamSummary.headCoachId = userId;
	      } else if (role === 'ASSISTANT_COACH' && !teamSummary.assistantCoachIds.includes(userId)) {
	        teamSummary.assistantCoachIds.push(userId);
	      }
	    }
	    participantUserIds.add(userId);
	  });

  const userIds = Array.from(participantUserIds);
  if (!userIds.length && activeEventTeamIds.length === 0) {
    return NextResponse.json({ users: [], teams: [] }, { status: 200 });
  }

  const [users, templates] = await Promise.all([
    userIds.length
      ? prisma.userData.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        userName: true,
        profileImageId: true,
      },
    })
      : Promise.resolve([]),
    prisma.templateDocuments.findMany({
      where: { organizationId: id },
      select: {
        id: true,
        title: true,
        type: true,
        content: true,
      },
    }),
  ]);

  const templateById = new Map(templates.map((template) => [template.id, template]));
  const templateIds = templates.map((template) => template.id);
		  const documentParticipantScopes = [
		    ...(userIds.length ? [{ userId: { in: userIds } }] : []),
		    ...(activeEventTeamIds.length || canonicalTeamIds.length
		      ? [{ teamId: { in: Array.from(new Set([...activeEventTeamIds, ...canonicalTeamIds])) } }]
		      : []),
		  ];
  const documentEventOrTemplateScopes = [
    ...(eventIds.length ? [{ eventId: { in: eventIds } }] : []),
    ...(templateIds.length ? [{ templateId: { in: templateIds } }] : []),
  ];

  const signedDocuments = documentParticipantScopes.length && documentEventOrTemplateScopes.length
    ? await prisma.signedDocuments.findMany({
      where: {
        OR: documentParticipantScopes,
        AND: [
          {
            OR: documentEventOrTemplateScopes,
          },
        ],
      },
      select: {
        id: true,
        signedDocumentId: true,
        templateId: true,
        userId: true,
        teamId: true,
        documentName: true,
        eventId: true,
        status: true,
        signedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })
    : [];

  const eventsById = new Map(eventRows.map((event) => [event.id, event]));
  const summariesByUserId = new Map<string, UserSummaryInternal>();

	  users.forEach((user) => {
	    summariesByUserId.set(user.id, {
	      userId: user.id,
	      firstName: user.firstName ?? '',
      lastName: user.lastName ?? '',
      fullName: toDisplayName(user),
      userName: user.userName ?? undefined,
      profileImageId: user.profileImageId ?? null,
      eventsById: new Map<string, EventSummary>(),
	      documents: [],
	      bills: [],
	      teamMembershipsByTeamId: new Map<string, TeamMembershipSummary>(),
	    });
	  });
	  const usersById = new Map(users.map((user) => [user.id, user] as const));

	  const teamPlayerRowsByCanonicalTeamId = new Map<string, CanonicalTeamRegistrationRow[]>();
	  const teamPlayerRowKeys = new Set<string>();
	  const addTeamPlayerRow = (row: CanonicalTeamRegistrationRow) => {
	    const teamId = normalizeId(row.teamId);
	    const userId = normalizeId(row.userId);
	    if (!teamId || !userId) {
	      return;
	    }
	    const key = `${teamId}::${userId}`;
	    if (teamPlayerRowKeys.has(key)) {
	      return;
	    }
	    teamPlayerRowKeys.add(key);
	    const existingRows = teamPlayerRowsByCanonicalTeamId.get(teamId);
	    if (existingRows) {
	      existingRows.push(row);
	      return;
	    }
	    teamPlayerRowsByCanonicalTeamId.set(teamId, [row]);
	  };
	  canonicalTeamRegistrationRows.forEach((row) => {
	    const teamId = normalizeId(row.teamId);
	    const userId = normalizeId(row.userId);
	    if (!teamId || !userId) {
	      return;
	    }
	    addTeamPlayerRow(row);
	    const userSummary = summariesByUserId.get(userId);
	    const teamSummary = teamSummariesByCanonicalTeamId.get(teamId);
	    if (!userSummary || !teamSummary) {
	      return;
	    }
	    userSummary.teamMembershipsByTeamId.set(teamId, {
	      teamId,
	      teamName: teamSummary.name,
	      division: teamSummary.division,
	      sport: teamSummary.sport,
	      status: normalizeStatus(row.status),
	      rosterRole: normalizeStatus(row.rosterRole),
	      jerseyNumber: row.jerseyNumber ?? null,
	      position: row.position ?? null,
	      isCaptain: Boolean(row.isCaptain),
	    });
	  });
	  eventTeams.forEach((team) => {
	    const canonicalTeamId = canonicalTeamIdByEventTeamId.get(team.id);
	    if (!canonicalTeamId) {
	      return;
	    }
	    normalizeIdList(team.playerIds).forEach((userId) => {
	      addTeamPlayerRow({
	        teamId: canonicalTeamId,
	        userId,
	        status: 'ACTIVE',
	        rosterRole: 'PARTICIPANT',
	        jerseyNumber: null,
	        position: null,
	        isCaptain: normalizeId(team.captainId) === userId,
	      });
	    });
	  });

		  const teamBillOwnerIds = Array.from(new Set([...canonicalTeamIds, ...activeEventTeamIds]));
	  const teamBills = eventIds.length && teamBillOwnerIds.length
	    ? await prisma.bills.findMany({
	      where: {
	        organizationId: id,
	        eventId: { in: eventIds },
	        ownerType: 'TEAM',
	        ownerId: { in: teamBillOwnerIds },
	      },
	      select: {
	        id: true,
	        ownerType: true,
	        ownerId: true,
	        eventId: true,
	        parentBillId: true,
	        sourceType: true,
	        sourceId: true,
	        totalAmountCents: true,
	        paidAmountCents: true,
	        status: true,
	        allowSplit: true,
	        paymentPlanEnabled: true,
	        lineItems: true,
	        createdAt: true,
	        updatedAt: true,
	      },
	      orderBy: { createdAt: 'desc' },
	    })
	    : [];
	  const parentBillIds = teamBills
	    .map((bill) => normalizeId(bill.id))
	    .filter((billId): billId is string => Boolean(billId));
	  const userBillFilters = [
	    ...(userIds.length ? [{ ownerId: { in: userIds } }] : []),
	    ...(parentBillIds.length ? [{ parentBillId: { in: parentBillIds } }] : []),
	  ];
	  const userBills = eventIds.length && userBillFilters.length
	    ? await prisma.bills.findMany({
	      where: {
	        organizationId: id,
	        eventId: { in: eventIds },
	        ownerType: 'USER',
	        OR: userBillFilters,
	      },
	      select: {
	        id: true,
	        ownerType: true,
	        ownerId: true,
	        eventId: true,
	        parentBillId: true,
	        sourceType: true,
	        sourceId: true,
	        totalAmountCents: true,
	        paidAmountCents: true,
	        status: true,
	        allowSplit: true,
	        paymentPlanEnabled: true,
	        lineItems: true,
	        createdAt: true,
	        updatedAt: true,
	      },
	      orderBy: { createdAt: 'desc' },
	    })
	    : [];
	  const allBills = Array.from(new Map([...teamBills, ...userBills].map((bill) => [bill.id, bill])).values());
	  const billIds = allBills
	    .map((bill) => normalizeId(bill.id))
	    .filter((billId): billId is string => Boolean(billId));
	  const billPayments = billIds.length
	    ? await prisma.billPayments.findMany({
	      where: { billId: { in: billIds } },
	      select: {
	        id: true,
	        billId: true,
	        sequence: true,
	        dueDate: true,
	        amountCents: true,
	        status: true,
	        paidAt: true,
	        paymentIntentId: true,
	        payerUserId: true,
	        refundedAmountCents: true,
	        createdAt: true,
	        updatedAt: true,
	      },
	      orderBy: [{ sequence: 'asc' }, { createdAt: 'asc' }],
	    })
	    : [];
	  const paymentsByBillId = new Map<string, typeof billPayments>();
	  billPayments.forEach((payment) => {
	    const existing = paymentsByBillId.get(payment.billId);
	    if (existing) {
	      existing.push(payment);
	      return;
	    }
	    paymentsByBillId.set(payment.billId, [payment]);
	  });
	  const discountAmountsByBillId = await loadBillDiscountSummaries(
	    prisma,
	    allBills.map((bill) => ({
	      ...bill,
	      payments: paymentsByBillId.get(bill.id) ?? [],
	    })),
	  );
	  const teamBillCanonicalTeamIdByBillId = new Map<string, string>();
	  teamBills.forEach((bill) => {
	    const ownerId = normalizeId(bill.ownerId);
	    if (!ownerId) {
	      return;
	    }
	    const canonicalTeamId = teamSummariesByCanonicalTeamId.has(ownerId)
	      ? ownerId
	      : canonicalTeamIdByEventTeamId.get(ownerId);
	    if (canonicalTeamId) {
	      teamBillCanonicalTeamIdByBillId.set(bill.id, canonicalTeamId);
	    }
	  });
	  const billSummariesById = new Map<string, BillSummary>();
	  allBills.forEach((bill) => {
	    const discountAmounts = withBillDiscountAmounts(bill, discountAmountsByBillId);
	    const payments = (paymentsByBillId.get(bill.id) ?? []).map((payment): BillPaymentSummary => {
	      const refundedAmountCents = normalizeAmountCents(payment.refundedAmountCents);
	      const amountCents = normalizeAmountCents(payment.amountCents);
	      const refundableAmountCents = Math.max(0, amountCents - refundedAmountCents);
	      const status = normalizeStatus(payment.status) ?? undefined;
	      return {
	        paymentId: payment.id,
	        billId: payment.billId,
	        sequence: Number.isFinite(Number(payment.sequence)) ? Number(payment.sequence) : 0,
	        dueDate: toIsoString(payment.dueDate),
	        amountCents,
	        status,
	        paidAt: toIsoString(payment.paidAt),
	        paymentIntentId: payment.paymentIntentId ?? null,
	        payerUserId: payment.payerUserId ?? null,
	        refundedAmountCents,
	        refundableAmountCents,
	        isRefundable: refundableAmountCents > 0 && status === 'PAID',
	      };
	    });
	    const paidAmountCents = payments.reduce((sum, payment) => (
	      payment.status === 'PAID' ? sum + payment.amountCents : sum
	    ), 0);
	    const refundedAmountCents = payments.reduce((sum, payment) => sum + payment.refundedAmountCents, 0);
	    const ownerName = bill.ownerType === 'TEAM'
	      ? (
	          teamSummariesByCanonicalTeamId.get(bill.ownerId)?.name
	          ?? teamSummariesByCanonicalTeamId.get(canonicalTeamIdByEventTeamId.get(bill.ownerId) ?? '')?.name
	          ?? bill.ownerId
	        )
	      : (() => {
	          const owner = usersById.get(bill.ownerId);
	          return owner ? toDisplayName(owner) : bill.ownerId;
	        })();
	    const event = bill.eventId ? eventsById.get(bill.eventId) : undefined;
	    billSummariesById.set(bill.id, {
	      billId: bill.id,
	      ownerType: bill.ownerType,
	      ownerId: bill.ownerId,
	      ownerName,
	      eventId: bill.eventId,
	      eventName: event?.name,
	      parentBillId: bill.parentBillId ?? null,
	      totalAmountCents: normalizeAmountCents(bill.totalAmountCents),
	      paidAmountCents,
	      originalAmountCents: discountAmounts.originalAmountCents,
	      discountAmountCents: discountAmounts.discountAmountCents,
	      discountedAmountCents: discountAmounts.discountedAmountCents,
	      discounts: discountAmounts.discounts,
	      refundedAmountCents,
	      refundableAmountCents: Math.max(0, paidAmountCents - refundedAmountCents),
	      status: normalizeStatus(bill.status) ?? undefined,
	      allowSplit: bill.allowSplit ?? null,
	      paymentPlanEnabled: bill.paymentPlanEnabled ?? null,
	      lineItems: bill.lineItems,
	      createdAt: toIsoString(bill.createdAt),
	      updatedAt: toIsoString(bill.updatedAt),
	      payments,
	    });
	  });
	  teamBills.forEach((bill) => {
	    const canonicalTeamId = teamBillCanonicalTeamIdByBillId.get(bill.id);
	    const summary = canonicalTeamId ? teamSummariesByCanonicalTeamId.get(canonicalTeamId) : undefined;
	    const billSummary = billSummariesById.get(bill.id);
	    if (!summary || !billSummary) {
	      return;
	    }
	    summary.bills.push(billSummary);
	  });
	  const appendUserBillSummary = (userId: unknown, billSummary: BillSummary | undefined) => {
	    const normalizedUserId = normalizeId(userId);
	    if (!normalizedUserId || !billSummary) {
	      return;
	    }
	    const userSummary = summariesByUserId.get(normalizedUserId);
	    if (!userSummary) {
	      return;
	    }
	    if (userSummary.bills.some((candidate) => candidate.billId === billSummary.billId)) {
	      return;
	    }
	    userSummary.bills.push(billSummary);
	  };
	  userBills.forEach((bill) => {
	    const parentBillId = normalizeId(bill.parentBillId);
	    const canonicalTeamId = parentBillId ? teamBillCanonicalTeamIdByBillId.get(parentBillId) : undefined;
	    const summary = canonicalTeamId ? teamSummariesByCanonicalTeamId.get(canonicalTeamId) : undefined;
	    const billSummary = billSummariesById.get(bill.id);
	    appendUserBillSummary(bill.ownerId, billSummary);
	    if (!summary || !billSummary) {
	      return;
	    }
	    summary.bills.push(billSummary);
	  });
	  billPayments.forEach((payment) => {
	    appendUserBillSummary(payment.payerUserId, billSummariesById.get(payment.billId));
	  });

  eventRows.forEach((event) => {
    event.userIds.forEach((userId) => {
      const summary = summariesByUserId.get(userId);
      if (!summary) return;
      if (!summary.eventsById.has(event.id)) {
        summary.eventsById.set(event.id, {
          eventId: event.id,
          eventName: event.name,
          imageId: event.imageId,
          start: event.start.toISOString(),
          end: event.end.toISOString(),
        });
      }
    });
    if (!rentalEventIdSet.has(event.id)) {
      return;
    }
    const assignmentUserIds = [
      event.hostId,
      ...event.assistantHostIds,
      ...event.officialIds,
    ];
    assignmentUserIds.forEach((userId) => {
      const normalizedUserId = normalizeId(userId);
      if (!normalizedUserId) {
        return;
      }
      const summary = summariesByUserId.get(normalizedUserId);
      if (!summary) return;
      if (!summary.eventsById.has(event.id)) {
        summary.eventsById.set(event.id, {
          eventId: event.id,
          eventName: event.name,
          imageId: event.imageId,
          start: event.start.toISOString(),
          end: event.end.toISOString(),
        });
      }
    });
  });

  eventOfficials.forEach((assignment) => {
    const userId = normalizeId(assignment.userId);
    if (!userId) {
      return;
    }
    const event = eventsById.get(assignment.eventId);
    if (!event) {
      return;
    }
    const summary = summariesByUserId.get(userId);
    if (!summary) {
      return;
    }
    if (!summary.eventsById.has(event.id)) {
      summary.eventsById.set(event.id, {
        eventId: event.id,
        eventName: event.name,
        imageId: event.imageId,
        start: event.start.toISOString(),
        end: event.end.toISOString(),
      });
    }
  });

	  eventRows.forEach((event) => {
	    const teamIds = teamIdsByEventId.get(event.id);
	    if (!teamIds) {
	      return;
	    }
	    teamIds.forEach((teamId) => {
	      const teamStatus = teamRegistrationStatusByEventTeam.get(toEventTeamKey(event.id, teamId));
	      const canonicalTeamId = canonicalTeamIdByEventTeamId.get(teamId);
	      const teamSummary = canonicalTeamId ? teamSummariesByCanonicalTeamId.get(canonicalTeamId) : undefined;
	      if (teamSummary) {
	        const eventTeam = eventTeamById.get(teamId);
	        const registrationBills = teamSummary.bills.filter((bill) => (
	          bill.eventId === event.id
	          && (
	            bill.ownerId === teamSummary.canonicalTeamId
	            || bill.ownerId === teamId
	            || (
	              bill.parentBillId
	              && teamSummary.bills.some((candidate) => (
	                candidate.billId === bill.parentBillId
	                && (candidate.ownerId === teamSummary.canonicalTeamId || candidate.ownerId === teamId)
	              ))
	            )
	          )
	        ));
	        const totalAmountCents = registrationBills.reduce((sum, bill) => sum + bill.totalAmountCents, 0);
	        const paidAmountCents = registrationBills.reduce((sum, bill) => sum + bill.paidAmountCents, 0);
	        const originalAmountCents = registrationBills.reduce((sum, bill) => sum + bill.originalAmountCents, 0);
	        const discountAmountCents = registrationBills.reduce((sum, bill) => sum + bill.discountAmountCents, 0);
	        const discountedAmountCents = registrationBills.reduce((sum, bill) => sum + bill.discountedAmountCents, 0);
	        teamSummary.registrationsByEventTeamId.set(teamId, {
	          eventId: event.id,
	          eventName: event.name,
	          imageId: event.imageId,
	          eventTeamId: teamId,
	          eventTeamName: typeof eventTeam?.name === 'string' && eventTeam.name.trim() ? eventTeam.name.trim() : teamId,
	          start: event.start.toISOString(),
	          end: event.end.toISOString(),
	          status: teamStatus,
	          division: eventTeam ? resolveTeamDivisionName(eventTeam) : undefined,
	          sport: typeof eventTeam?.sport === 'string' && eventTeam.sport.trim() ? eventTeam.sport.trim() : undefined,
	          memberCount: teamMemberIdsByTeamId.get(teamId)?.length ?? 0,
	          billIds: registrationBills.map((bill) => bill.billId),
	          totalAmountCents,
	          paidAmountCents,
	          originalAmountCents,
	          discountAmountCents,
	          discountedAmountCents,
	        });
	      }
      const memberIds = teamMemberIdsByTeamId.get(teamId);
      if (!memberIds) {
        return;
      }
      memberIds.forEach((userId) => {
        const summary = summariesByUserId.get(userId);
        if (!summary) {
          return;
        }
        const existing = summary.eventsById.get(event.id);
        summary.eventsById.set(event.id, {
          eventId: event.id,
          eventName: event.name,
          imageId: event.imageId,
          start: event.start.toISOString(),
          end: event.end.toISOString(),
          status: teamStatus ?? existing?.status,
        });
      });
    });
  });

  registrations.forEach((registration) => {
    if (isTeamRegistrantType(registration.registrantType)) {
      return;
    }
    const registrantId = normalizeId(registration.registrantId);
    if (!registrantId) {
      return;
    }
    const summary = summariesByUserId.get(registrantId);
    const event = eventsById.get(registration.eventId);
    if (!summary || !event) return;

    const existing = summary.eventsById.get(event.id);
    summary.eventsById.set(event.id, {
      eventId: event.id,
      eventName: event.name,
      imageId: event.imageId,
      start: event.start.toISOString(),
      end: event.end.toISOString(),
      status: normalizeStatus(registration.status) ?? existing?.status,
    });
  });

  signedDocuments.forEach((document) => {
    const summary = summariesByUserId.get(document.userId);
    const template = templateById.get(document.templateId);
    const type: 'PDF' | 'TEXT' = template?.type === 'TEXT' ? 'TEXT' : 'PDF';
    const event = document.eventId ? eventsById.get(document.eventId) : undefined;
    const documentSummary = {
      signedDocumentRecordId: document.id,
      documentId: document.signedDocumentId,
      templateId: document.templateId,
      eventId: document.eventId ?? undefined,
      eventName: event?.name,
      teamId: document.teamId ?? undefined,
      title: template?.title?.trim() || document.documentName || 'Signed Document',
      type,
      status: normalizeStatus(document.status),
      signedAt: document.signedAt ?? document.createdAt?.toISOString() ?? undefined,
      viewUrl: type === 'PDF' ? `/api/documents/signed/${document.id}/file` : undefined,
      content: type === 'TEXT' ? template?.content ?? undefined : undefined,
    };
	    if (summary) {
	      summary.documents.push(documentSummary);
	    }
	    const teamId = normalizeId(document.teamId);
	    const canonicalTeamId = teamId
	      ? (teamSummariesByCanonicalTeamId.has(teamId) ? teamId : canonicalTeamIdByEventTeamId.get(teamId))
	      : undefined;
	    const teamSummary = canonicalTeamId ? teamSummariesByCanonicalTeamId.get(canonicalTeamId) : undefined;
	    if (teamSummary) {
	      teamSummary.documents.push(documentSummary);
	    }
  });

  const buildPersonFields = (userId: string) => {
    const user = usersById.get(userId);
    const fullName = user ? toDisplayName(user) : userId;
    return {
      userId,
      firstName: user?.firstName ?? '',
      lastName: user?.lastName ?? '',
      fullName,
      userName: user?.userName ?? undefined,
      profileImageId: user?.profileImageId ?? null,
    };
  };

  const staffStatusByTeamRoleUser = new Map<string, string | undefined>();
  canonicalTeamStaffRows.forEach((row) => {
    const teamId = normalizeId(row.teamId);
    const userId = normalizeId(row.userId);
    const role = normalizeStatus(row.role);
    if (!teamId || !userId || !role) {
      return;
    }
    staffStatusByTeamRoleUser.set(`${teamId}::${role}::${userId}`, normalizeStatus(row.status));
  });

  const buildStaffSummary = (
    teamId: string,
    userId: string | undefined,
    role: TeamStaffSummary['role'],
  ): TeamStaffSummary | null => {
    if (!userId) {
      return null;
    }
    return {
      ...buildPersonFields(userId),
      role,
      status: staffStatusByTeamRoleUser.get(`${teamId}::${role}::${userId}`),
    };
  };

  const usersPayload = Array.from(summariesByUserId.values())
    .map((summary) => {
      const eventsList = Array.from(summary.eventsById.values())
        .sort((a, b) => getSortTimestamp(b.start) - getSortTimestamp(a.start));
      const documentsList = [...summary.documents]
        .sort((a, b) => getSortTimestamp(b.signedAt) - getSortTimestamp(a.signedAt));
      const billsList = [...summary.bills]
        .sort((a, b) => getSortTimestamp(b.createdAt) - getSortTimestamp(a.createdAt));
      const teamsList = Array.from(summary.teamMembershipsByTeamId.values())
        .sort((a, b) => a.teamName.localeCompare(b.teamName, undefined, { sensitivity: 'base' }));

      return {
        userId: summary.userId,
        firstName: summary.firstName,
        lastName: summary.lastName,
        fullName: summary.fullName,
        userName: summary.userName,
        profileImageId: summary.profileImageId,
        events: eventsList,
        documents: documentsList,
        bills: billsList,
        teams: teamsList,
      };
    })
    .filter((summary) => (
      summary.events.length > 0
      || summary.documents.length > 0
      || summary.bills.length > 0
      || summary.teams.length > 0
      || organizationTeamMemberUserIds.has(summary.userId)
    ))
    .sort((a, b) => a.fullName.localeCompare(b.fullName, undefined, { sensitivity: 'base' }));

	  const teamsPayload = Array.from(teamSummariesByCanonicalTeamId.values())
	    .map((summary) => {
	      const registrationsList = Array.from(summary.registrationsByEventTeamId.values())
	        .sort((a, b) => getSortTimestamp(b.start) - getSortTimestamp(a.start));
	      const documentsList = [...summary.documents]
	        .sort((a, b) => getSortTimestamp(b.signedAt) - getSortTimestamp(a.signedAt));
	      const billsList = [...summary.bills]
	        .sort((a, b) => getSortTimestamp(b.createdAt) - getSortTimestamp(a.createdAt));
	      const teamEventIds = new Set(registrationsList.map((registration) => registration.eventId));
	      const teamRelatedTeamIds = new Set<string>([
	        summary.canonicalTeamId,
	        ...registrationsList.map((registration) => registration.eventTeamId),
	      ]);
	      const parentTeamBillIds = new Set(
	        billsList
	          .filter((bill) => bill.ownerType === 'TEAM')
	          .map((bill) => bill.billId),
	      );
	      const members = (teamPlayerRowsByCanonicalTeamId.get(summary.canonicalTeamId) ?? [])
	        .map((row): TeamMemberSummary | null => {
	          const userId = normalizeId(row.userId);
	          if (!userId) {
	            return null;
	          }
	          const userSummary = summariesByUserId.get(userId);
	          const memberBills = (userSummary?.bills ?? [])
	            .filter((bill) => (
	              (bill.parentBillId ? parentTeamBillIds.has(bill.parentBillId) : false)
	              || (bill.eventId ? teamEventIds.has(bill.eventId) : false)
	            ))
	            .sort((a, b) => getSortTimestamp(b.createdAt) - getSortTimestamp(a.createdAt));
	          const memberDocuments = (userSummary?.documents ?? [])
	            .filter((document) => (
	              (document.teamId ? teamRelatedTeamIds.has(document.teamId) : false)
	              || (document.eventId ? teamEventIds.has(document.eventId) : false)
	            ))
	            .sort((a, b) => getSortTimestamp(b.signedAt) - getSortTimestamp(a.signedAt));
	          return {
	            ...buildPersonFields(userId),
	            status: normalizeStatus(row.status),
	            rosterRole: normalizeStatus(row.rosterRole),
	            jerseyNumber: row.jerseyNumber ?? null,
	            position: row.position ?? null,
	            isCaptain: Boolean(row.isCaptain) || summary.captainId === userId,
	            bills: memberBills,
	            documents: memberDocuments,
	          };
	        })
	        .filter((member): member is TeamMemberSummary => Boolean(member))
	        .sort((a, b) => {
	          if (a.isCaptain !== b.isCaptain) {
	            return a.isCaptain ? -1 : 1;
	          }
	          return a.fullName.localeCompare(b.fullName, undefined, { sensitivity: 'base' });
	        });
	      const manager = buildStaffSummary(summary.canonicalTeamId, summary.managerId, 'MANAGER');
	      const headCoach = buildStaffSummary(summary.canonicalTeamId, summary.headCoachId, 'HEAD_COACH');
	      const assistantCoaches = summary.assistantCoachIds
	        .map((userId) => buildStaffSummary(summary.canonicalTeamId, userId, 'ASSISTANT_COACH'))
	        .filter((staff): staff is TeamStaffSummary => Boolean(staff));
	      const totals = billsList.reduce(
	        (aggregate, bill) => ({
	          totalAmountCents: aggregate.totalAmountCents + bill.totalAmountCents,
	          paidAmountCents: aggregate.paidAmountCents + bill.paidAmountCents,
	          refundedAmountCents: aggregate.refundedAmountCents + bill.refundedAmountCents,
	          refundableAmountCents: aggregate.refundableAmountCents + bill.refundableAmountCents,
	        }),
	        {
	          totalAmountCents: 0,
	          paidAmountCents: 0,
	          refundedAmountCents: 0,
	          refundableAmountCents: 0,
	        },
	      );

	      return {
	        canonicalTeamId: summary.canonicalTeamId,
	        name: summary.name,
	        division: summary.division,
	        sport: summary.sport,
	        profileImageId: summary.profileImageId,
	        memberCount: summary.memberCount,
	        teamSize: summary.teamSize,
	        captainId: summary.captainId,
	        manager,
	        headCoach,
	        assistantCoaches,
	        members,
	        registrations: registrationsList,
	        documents: documentsList,
	        bills: billsList,
	        totals,
	      };
	    })
	    .filter((summary) => summary.registrations.length > 0 || summary.documents.length > 0 || summary.bills.length > 0)
	    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

  return NextResponse.json({ users: usersPayload, teams: teamsPayload }, { status: 200 });
}

