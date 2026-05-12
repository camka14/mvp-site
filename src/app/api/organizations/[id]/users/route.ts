import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import {
  canAccessOrganizationUsers,
  listOrganizationUsersScopeEvents,
  type OrganizationUsersScopeEvent,
} from '@/server/organizationUsersAccess';

export const dynamic = 'force-dynamic';

type EventSummary = {
  eventId: string;
  eventName: string;
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
  ownerType: 'USER' | 'TEAM';
  ownerId: string;
  ownerName: string;
  eventId?: string | null;
  eventName?: string;
  parentBillId?: string | null;
  totalAmountCents: number;
  paidAmountCents: number;
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

type UserSummaryInternal = {
  userId: string;
  firstName: string;
  lastName: string;
  fullName: string;
  userName?: string;
  profileImageId?: string | null;
  eventsById: Map<string, EventSummary>;
  documents: DocumentSummary[];
};

type TeamSummaryInternal = {
  canonicalTeamId: string;
  name: string;
  division?: string;
  sport?: string;
  profileImageId?: string | null;
  memberCount: number;
  teamSize?: number;
  registrationsByEventTeamId: Map<string, TeamRegistrationSummary>;
  documents: DocumentSummary[];
  bills: BillSummary[];
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

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(req);
  const { id } = await params;

  const org = await prisma.organizations.findUnique({
    where: { id },
    select: { id: true, ownerId: true, hostIds: true, officialIds: true },
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
      where: { id: { in: registeredTeamIds } },
      select: {
        id: true,
        name: true,
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
	  const teamMemberIdsByTeamId = new Map<string, string[]>();
	  teams.forEach((team) => {
	    const memberIds = normalizeIdList([
	      ...normalizeIdList(team.playerIds),
      team.captainId,
      team.managerId,
      team.headCoachId,
      ...normalizeIdList(team.coachIds),
	    ]);
	    teamMemberIdsByTeamId.set(team.id, memberIds);
	  });
	  const eventTeamById = new Map(teams.map((team) => [team.id, team] as const));
	  const canonicalTeamIdByEventTeamId = new Map<string, string>();
	  registrations.forEach((registration) => {
	    if (!isTeamRegistrantType(registration.registrantType)) {
	      return;
	    }
	    const eventTeamId = normalizeId(registration.eventTeamId) ?? normalizeId(registration.registrantId);
	    if (!eventTeamId) {
	      return;
	    }
	    const canonicalTeamId = normalizeId(registration.parentId)
	      ?? normalizeId(eventTeamById.get(eventTeamId)?.parentTeamId)
	      ?? eventTeamId;
	    canonicalTeamIdByEventTeamId.set(eventTeamId, canonicalTeamId);
	  });
	  teams.forEach((team) => {
	    if (!canonicalTeamIdByEventTeamId.has(team.id)) {
	      canonicalTeamIdByEventTeamId.set(team.id, normalizeId(team.parentTeamId) ?? team.id);
	    }
	  });

	  const canonicalTeamIds = Array.from(new Set(Array.from(canonicalTeamIdByEventTeamId.values())));
	  const canonicalTeamsDelegate = (prisma as any).canonicalTeams;
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
	  const canonicalTeamRegistrationRows = canonicalTeamIds.length && typeof teamRegistrationsDelegate?.findMany === 'function'
	    ? await teamRegistrationsDelegate.findMany({
	      where: {
	        teamId: { in: canonicalTeamIds },
	        status: { in: ['ACTIVE', 'STARTED'] },
	      },
	      select: {
	        teamId: true,
	        userId: true,
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
	  canonicalTeams.forEach((team: Record<string, any>) => {
	    const canonicalTeamId = String(team.id ?? '').trim();
	    if (!canonicalTeamId) {
	      return;
	    }
	    teamSummariesByCanonicalTeamId.set(canonicalTeamId, {
	      canonicalTeamId,
	      name: typeof team.name === 'string' && team.name.trim() ? team.name.trim() : canonicalTeamId,
	      division: typeof team.division === 'string' && team.division.trim() ? team.division.trim() : undefined,
	      sport: typeof team.sport === 'string' && team.sport.trim() ? team.sport.trim() : undefined,
	      profileImageId: typeof team.profileImageId === 'string' && team.profileImageId.trim() ? team.profileImageId : null,
	      memberCount: memberCountByCanonicalTeamId.get(canonicalTeamId) ?? 0,
	      teamSize: typeof team.teamSize === 'number' ? team.teamSize : undefined,
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
	      division: typeof eventTeam.division === 'string' && eventTeam.division.trim() ? eventTeam.division.trim() : undefined,
	      sport: typeof eventTeam.sport === 'string' && eventTeam.sport.trim() ? eventTeam.sport.trim() : undefined,
	      profileImageId: typeof eventTeam.profileImageId === 'string' && eventTeam.profileImageId.trim() ? eventTeam.profileImageId : null,
	      memberCount: memberCountByCanonicalTeamId.get(canonicalTeamId) ?? teamMemberIdsByTeamId.get(eventTeamId)?.length ?? 0,
	      teamSize: typeof eventTeam.teamSize === 'number' ? eventTeam.teamSize : undefined,
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

  const userIds = Array.from(participantUserIds);
  if (!userIds.length && registeredTeamIds.length === 0) {
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
	    ...(registeredTeamIds.length || canonicalTeamIds.length
	      ? [{ teamId: { in: Array.from(new Set([...registeredTeamIds, ...canonicalTeamIds])) } }]
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
	    });
	  });
	  const usersById = new Map(users.map((user) => [user.id, user] as const));

	  const teamBillOwnerIds = Array.from(new Set([...canonicalTeamIds, ...registeredTeamIds]));
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
	  const userBills = parentBillIds.length
	    ? await prisma.bills.findMany({
	      where: {
	        organizationId: id,
	        parentBillId: { in: parentBillIds },
	        ownerType: 'USER',
	      },
	      select: {
	        id: true,
	        ownerType: true,
	        ownerId: true,
	        eventId: true,
	        parentBillId: true,
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
	  userBills.forEach((bill) => {
	    const parentBillId = normalizeId(bill.parentBillId);
	    const canonicalTeamId = parentBillId ? teamBillCanonicalTeamIdByBillId.get(parentBillId) : undefined;
	    const summary = canonicalTeamId ? teamSummariesByCanonicalTeamId.get(canonicalTeamId) : undefined;
	    const billSummary = billSummariesById.get(bill.id);
	    if (!summary || !billSummary) {
	      return;
	    }
	    summary.bills.push(billSummary);
	  });

  eventRows.forEach((event) => {
    event.userIds.forEach((userId) => {
      const summary = summariesByUserId.get(userId);
      if (!summary) return;
      if (!summary.eventsById.has(event.id)) {
        summary.eventsById.set(event.id, {
          eventId: event.id,
          eventName: event.name,
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
	        teamSummary.registrationsByEventTeamId.set(teamId, {
	          eventId: event.id,
	          eventName: event.name,
	          eventTeamId: teamId,
	          eventTeamName: typeof eventTeam?.name === 'string' && eventTeam.name.trim() ? eventTeam.name.trim() : teamId,
	          start: event.start.toISOString(),
	          end: event.end.toISOString(),
	          status: teamStatus,
	          division: typeof eventTeam?.division === 'string' && eventTeam.division.trim() ? eventTeam.division.trim() : undefined,
	          sport: typeof eventTeam?.sport === 'string' && eventTeam.sport.trim() ? eventTeam.sport.trim() : undefined,
	          memberCount: teamMemberIdsByTeamId.get(teamId)?.length ?? 0,
	          billIds: registrationBills.map((bill) => bill.billId),
	          totalAmountCents,
	          paidAmountCents,
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

  const usersPayload = Array.from(summariesByUserId.values())
    .map((summary) => {
      const eventsList = Array.from(summary.eventsById.values())
        .sort((a, b) => getSortTimestamp(b.start) - getSortTimestamp(a.start));
      const documentsList = [...summary.documents]
        .sort((a, b) => getSortTimestamp(b.signedAt) - getSortTimestamp(a.signedAt));

      return {
        userId: summary.userId,
        firstName: summary.firstName,
        lastName: summary.lastName,
        fullName: summary.fullName,
        userName: summary.userName,
        profileImageId: summary.profileImageId,
        events: eventsList,
        documents: documentsList,
      };
    })
    .filter((summary) => summary.events.length > 0 || summary.documents.length > 0)
    .sort((a, b) => a.fullName.localeCompare(b.fullName, undefined, { sensitivity: 'base' }));

	  const teamsPayload = Array.from(teamSummariesByCanonicalTeamId.values())
	    .map((summary) => {
	      const registrationsList = Array.from(summary.registrationsByEventTeamId.values())
	        .sort((a, b) => getSortTimestamp(b.start) - getSortTimestamp(a.start));
	      const documentsList = [...summary.documents]
	        .sort((a, b) => getSortTimestamp(b.signedAt) - getSortTimestamp(a.signedAt));
	      const billsList = [...summary.bills]
	        .sort((a, b) => getSortTimestamp(b.createdAt) - getSortTimestamp(a.createdAt));
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

