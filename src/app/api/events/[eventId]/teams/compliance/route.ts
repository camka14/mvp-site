import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { canManageEvent } from '@/server/accessControl';
import { calculateAgeOnDate } from '@/lib/age';
import { getEventParticipantIdsForEvent } from '@/server/events/eventRegistrations';
import {
  buildRequiredSignatureTasks,
  buildSignatureCompletionKey,
  isSignedDocumentStatus,
  normalizeSignerRoleContext,
  pickPrimaryBill,
  type ComplianceTemplate,
  type EventTeamComplianceResponse,
  type TeamCompliancePaymentSummary,
  type TeamComplianceRequiredDocument,
  type TeamComplianceUserSummary,
} from '@/lib/eventTeamCompliance';

export const dynamic = 'force-dynamic';

const normalizeId = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const normalizeIdList = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(
    new Set(
      value
        .map((entry) => normalizeId(entry))
        .filter((entry): entry is string => Boolean(entry)),
    ),
  );
};

const toTimestamp = (value: unknown): number => {
  if (!value) return 0;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? 0 : value.getTime();
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const toDisplayName = (user: {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  userName?: string | null;
}): string => {
  const fullName = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
  if (fullName) {
    return fullName;
  }
  if (typeof user.userName === 'string' && user.userName.trim().length > 0) {
    return user.userName.trim();
  }
  return user.id;
};

const toPaymentSummary = (bill: {
  id: string;
  totalAmountCents: number | null;
  paidAmountCents: number | null;
  status: string | null;
} | null, inheritedFromTeamBill = false): TeamCompliancePaymentSummary => {
  if (!bill) {
    return {
      hasBill: false,
      billId: null,
      totalAmountCents: 0,
      paidAmountCents: 0,
      status: null,
      isPaidInFull: false,
      inheritedFromTeamBill,
    };
  }
  const totalAmountCents = Number.isFinite(bill.totalAmountCents)
    ? Number(bill.totalAmountCents)
    : Number(bill.totalAmountCents ?? 0);
  const paidAmountCents = Number.isFinite(bill.paidAmountCents)
    ? Number(bill.paidAmountCents)
    : Number(bill.paidAmountCents ?? 0);
  return {
    hasBill: true,
    billId: bill.id,
    totalAmountCents,
    paidAmountCents,
    status: bill.status ? String(bill.status) : null,
    isPaidInFull: totalAmountCents > 0 && paidAmountCents >= totalAmountCents,
    inheritedFromTeamBill,
  };
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const session = await requireSession(req);
  const { eventId } = await params;

  const event = await prisma.events.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      name: true,
      start: true,
      teamSignup: true,
      hostId: true,
      assistantHostIds: true,
      organizationId: true,
      requiredTemplateIds: true,
    },
  });

  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  const canManage = await canManageEvent(
    {
      userId: session.userId,
      isAdmin: session.isAdmin,
    },
    event,
  );
  if (!canManage) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!event.teamSignup) {
    const payload: EventTeamComplianceResponse = { teams: [] };
    return NextResponse.json(payload, { status: 200 });
  }

  const participantIds = await getEventParticipantIdsForEvent(event.id);
  const teamIds = participantIds.teamIds;
  if (!teamIds.length) {
    const payload: EventTeamComplianceResponse = { teams: [] };
    return NextResponse.json(payload, { status: 200 });
  }

  const [teams, templates] = await Promise.all([
    prisma.teams.findMany({
      where: { id: { in: teamIds } },
      select: {
        id: true,
        name: true,
        playerIds: true,
        parentTeamId: true,
      },
    }),
    (() => {
      const requiredTemplateIds = normalizeIdList(event.requiredTemplateIds);
      if (!requiredTemplateIds.length) {
        return Promise.resolve<ComplianceTemplate[]>([]);
      }
      return prisma.templateDocuments.findMany({
        where: { id: { in: requiredTemplateIds } },
        select: {
          id: true,
          title: true,
          type: true,
          signOnce: true,
          requiredSignerType: true,
        },
      });
    })(),
  ]);
  const teamOwnerIds = Array.from(
    new Set(
      teamIds.concat(
        normalizeIdList(teams.map((team) => team.parentTeamId)),
      ),
    ),
  );
  const teamBills = teamOwnerIds.length
    ? await prisma.bills.findMany({
      where: {
        eventId,
        ownerType: 'TEAM',
        ownerId: { in: teamOwnerIds },
      },
      select: {
        id: true,
        ownerId: true,
        totalAmountCents: true,
        paidAmountCents: true,
        status: true,
        parentBillId: true,
        createdAt: true,
        updatedAt: true,
      },
    })
    : [];

  const playerIds = Array.from(
    new Set(
      teams.flatMap((team) => normalizeIdList(team.playerIds)),
    ),
  );

  const [users, registrations, userBills] = await Promise.all([
    playerIds.length
      ? prisma.userData.findMany({
        where: { id: { in: playerIds } },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          userName: true,
          dateOfBirth: true,
        },
      })
      : Promise.resolve([]),
    playerIds.length
      ? prisma.eventRegistrations.findMany({
        where: {
          eventId,
          registrantId: { in: playerIds },
        },
        select: {
          registrantId: true,
          registrantType: true,
          parentId: true,
          updatedAt: true,
        },
      })
      : Promise.resolve([]),
    (() => {
      const parentBillIds = teamBills
        .filter((bill) => !normalizeId(bill.parentBillId))
        .map((bill) => bill.id);
      if (!playerIds.length || !parentBillIds.length) {
        return Promise.resolve<Array<{
          id: string;
          ownerId: string;
          totalAmountCents: number;
          paidAmountCents: number;
          status: string;
          parentBillId: string | null;
          createdAt: Date;
          updatedAt: Date;
        }>>([]);
      }
      return prisma.bills.findMany({
        where: {
          eventId,
          ownerType: 'USER',
          ownerId: { in: playerIds },
          parentBillId: { in: parentBillIds },
        },
        select: {
          id: true,
          ownerId: true,
          totalAmountCents: true,
          paidAmountCents: true,
          status: true,
          parentBillId: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    })(),
  ]);

  const templatesById = new Map(templates.map((template) => [template.id, template]));
  const signOnceTemplateIds = templates
    .filter((template) => Boolean(template.signOnce))
    .map((template) => template.id);
  const eventScopedTemplateIds = templates
    .filter((template) => !template.signOnce)
    .map((template) => template.id);

  const latestRegistrationByUserId = new Map<
  string,
  {
    registrantType: string;
    parentId: string | null;
    updatedAt: Date;
  }
  >();
  registrations.forEach((registration) => {
    const userId = normalizeId(registration.registrantId);
    if (!userId) {
      return;
    }
    const registrationUpdatedAt = registration.updatedAt ?? new Date(0);
    const existing = latestRegistrationByUserId.get(userId);
    if (existing && existing.updatedAt >= registrationUpdatedAt) {
      return;
    }
    latestRegistrationByUserId.set(userId, {
      registrantType: registration.registrantType,
      parentId: normalizeId(registration.parentId),
      updatedAt: registrationUpdatedAt,
    });
  });

  const parentUserIds = Array.from(
    new Set(
      Array.from(latestRegistrationByUserId.values())
        .map((registration) => normalizeId(registration.parentId))
        .filter((value): value is string => Boolean(value)),
    ),
  );
  const signerUserIds = Array.from(new Set([...playerIds, ...parentUserIds]));
  const canQuerySignedDocuments = templates.length > 0 && (signerUserIds.length > 0 || playerIds.length > 0);

  const signedDocuments = canQuerySignedDocuments
    ? await prisma.signedDocuments.findMany({
      where: {
        templateId: { in: templates.map((template) => template.id) },
        OR: [
          ...(signerUserIds.length ? [{ userId: { in: signerUserIds } }] : []),
          ...(playerIds.length ? [{ hostId: { in: playerIds } }] : []),
        ],
        ...(signOnceTemplateIds.length || eventScopedTemplateIds.length
          ? {
            AND: [{
              OR: [
                ...(signOnceTemplateIds.length ? [{ templateId: { in: signOnceTemplateIds } }] : []),
                ...(eventScopedTemplateIds.length ? [{ templateId: { in: eventScopedTemplateIds }, eventId }] : []),
              ],
            }],
          }
          : {}),
      },
      select: {
        id: true,
        templateId: true,
        userId: true,
        hostId: true,
        signerRole: true,
        status: true,
        eventId: true,
        signedAt: true,
        createdAt: true,
      },
    })
    : [];

  const signedDocumentByCompletionKey = new Map<string, { id: string; signedAt?: string }>();
  signedDocuments.forEach((document) => {
    if (!isSignedDocumentStatus(document.status)) {
      return;
    }
    const template = templatesById.get(document.templateId);
    if (!template) {
      return;
    }

    const signerContext = normalizeSignerRoleContext(document.signerRole);
    const hostUserId = signerContext === 'participant' ? null : normalizeId(document.hostId);
    if (signerContext !== 'participant' && !hostUserId) {
      return;
    }

    if (!template.signOnce && normalizeId(document.eventId) !== eventId) {
      return;
    }

    const completionKey = buildSignatureCompletionKey({
      scopeKey: template.signOnce ? 'once' : `event:${eventId}`,
      templateId: template.id,
      signerContext,
      hostUserId,
    });
    const existing = signedDocumentByCompletionKey.get(completionKey);
    const existingTs = existing ? toTimestamp(existing.signedAt) : 0;
    const nextSignedAt = document.signedAt
      ?? (document.createdAt ? document.createdAt.toISOString() : undefined);
    const nextTs = toTimestamp(nextSignedAt);
    if (!existing || nextTs > existingTs) {
      signedDocumentByCompletionKey.set(completionKey, {
        id: document.id,
        signedAt: nextSignedAt,
      });
    }
  });

  const usersById = new Map(users.map((user) => [user.id, user]));

  const teamBillsByOwnerId = new Map<string, Array<(typeof teamBills)[number]>>();
  teamBills.forEach((bill) => {
    const billOwnerId = normalizeId(bill.ownerId);
    if (!billOwnerId) {
      return;
    }
    const existing = teamBillsByOwnerId.get(billOwnerId);
    if (existing) {
      existing.push(bill);
    } else {
      teamBillsByOwnerId.set(billOwnerId, [bill]);
    }
  });

  const userBillsByOwnerId = new Map<string, Array<(typeof userBills)[number]>>();
  userBills.forEach((bill) => {
    const existing = userBillsByOwnerId.get(bill.ownerId);
    if (existing) {
      existing.push(bill);
    } else {
      userBillsByOwnerId.set(bill.ownerId, [bill]);
    }
  });

  const teamById = new Map(teams.map((team) => [team.id, team]));

  const responseTeams: EventTeamComplianceResponse['teams'] = teamIds
    .map((teamId) => {
      const team = teamById.get(teamId);
      if (!team) {
        return null;
      }

      const parentTeamId = normalizeId(team.parentTeamId);
      const parentTeamBills = parentTeamId ? (teamBillsByOwnerId.get(parentTeamId) ?? []) : [];
      const slotTeamBills = teamBillsByOwnerId.get(teamId) ?? [];
      const selectedTeamBills = parentTeamBills.length > 0 ? parentTeamBills : slotTeamBills;
      const teamBill = pickPrimaryBill(selectedTeamBills);
      const teamPayment = toPaymentSummary(teamBill, Boolean(teamBill && parentTeamId && parentTeamBills.length > 0));
      const orderedPlayerIds = normalizeIdList(team.playerIds);

      const usersForTeam: TeamComplianceUserSummary[] = orderedPlayerIds
        .map((playerId) => {
          const user = usersById.get(playerId);
          if (!user) {
            return null;
          }
          const registration = latestRegistrationByUserId.get(playerId);
          const ageAtEvent = calculateAgeOnDate(user.dateOfBirth, event.start);
          const isMinorAtEvent = Number.isFinite(ageAtEvent) && ageAtEvent < 18;
          const isChildRegistration = registration?.registrantType === 'CHILD' || isMinorAtEvent;
          const parentUserId = normalizeId(registration?.parentId);

          const signatureTasks = buildRequiredSignatureTasks({
            templates,
            context: {
              userId: playerId,
              isChildRegistration,
              parentUserId,
            },
          });

          const requiredDocuments: TeamComplianceRequiredDocument[] = signatureTasks.map((task) => {
            const completionKey = buildSignatureCompletionKey({
              scopeKey: task.signOnce ? 'once' : `event:${eventId}`,
              templateId: task.templateId,
              signerContext: task.signerContext,
              hostUserId: task.hostUserId,
            });
            const signed = signedDocumentByCompletionKey.get(completionKey);
            return {
              key: completionKey,
              templateId: task.templateId,
              title: task.templateTitle,
              type: task.templateType,
              signerContext: task.signerContext,
              signerLabel: task.signerLabel,
              signOnce: task.signOnce,
              status: signed ? 'SIGNED' : 'UNSIGNED',
              signedDocumentRecordId: signed?.id,
              signedAt: signed?.signedAt,
            };
          });

          const signedCount = requiredDocuments.filter((document) => document.status === 'SIGNED').length;
          const requiredCount = requiredDocuments.length;

          const userBillCandidates = userBillsByOwnerId.get(playerId) ?? [];
          const userBillForTeam = teamBill
            ? pickPrimaryBill(userBillCandidates.filter((bill) => bill.parentBillId === teamBill.id))
            : null;
          const userPayment = userBillForTeam
            ? toPaymentSummary(userBillForTeam)
            : toPaymentSummary(teamBill, Boolean(teamBill));

          const userSummary: TeamComplianceUserSummary = {
            userId: user.id,
            fullName: toDisplayName(user),
            userName: normalizeId(user.userName) ?? undefined,
            isMinorAtEvent,
            registrationType: isChildRegistration ? 'CHILD' : 'ADULT',
            payment: userPayment,
            documents: {
              signedCount,
              requiredCount,
            },
            requiredDocuments: requiredDocuments.sort((left, right) => (
              left.title.localeCompare(right.title, undefined, { sensitivity: 'base' })
              || left.signerLabel.localeCompare(right.signerLabel, undefined, { sensitivity: 'base' })
            )),
          };
          return userSummary;
        })
        .filter((summary): summary is TeamComplianceUserSummary => summary !== null)
        .sort((left, right) => left.fullName.localeCompare(right.fullName, undefined, { sensitivity: 'base' }));

      const teamDocumentSignedCount = usersForTeam.reduce((total, userSummary) => total + userSummary.documents.signedCount, 0);
      const teamDocumentRequiredCount = usersForTeam.reduce((total, userSummary) => total + userSummary.documents.requiredCount, 0);

      return {
        teamId: team.id,
        teamName: team.name || 'Unnamed Team',
        payment: teamPayment,
        documents: {
          signedCount: teamDocumentSignedCount,
          requiredCount: teamDocumentRequiredCount,
        },
        users: usersForTeam,
      };
    })
    .filter((team): team is NonNullable<typeof team> => Boolean(team));

  const payload: EventTeamComplianceResponse = {
    teams: responseTeams,
  };
  return NextResponse.json(payload, { status: 200 });
}
