import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { calculateAgeOnDate } from '@/lib/age';
import { hasOrganizationStaffAccess } from '@/server/accessControl';
import { canManageCanonicalTeam } from '@/server/teams/teamMembership';
import {
  buildRequiredSignatureTasks,
  buildSignatureCompletionKey,
  isSignedDocumentStatus,
  normalizeSignerRoleContext,
  type ComplianceTemplate,
  type TeamCompliancePaymentSummary,
  type TeamComplianceRequiredDocument,
  type TeamComplianceUserSummary,
  type TeamMemberComplianceResponse,
} from '@/lib/eventTeamCompliance';

export const dynamic = 'force-dynamic';

const ACTIVE_REGISTRATION_STATUSES = ['ACTIVE', 'PENDING', 'STARTED'] as const;

const normalizeId = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length ? normalized : null;
};

const normalizeIdList = (value: unknown): string[] => (
  Array.isArray(value)
    ? Array.from(new Set(value.map(normalizeId).filter((entry): entry is string => Boolean(entry))))
    : []
);

const toTimestamp = (value: unknown): number => {
  if (!value) return 0;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? 0 : value.getTime();
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
  if (fullName) return fullName;
  return user.userName?.trim() || user.id;
};

const emptyPayment = (paymentPending = false): TeamCompliancePaymentSummary => ({
  hasBill: false,
  billId: null,
  totalAmountCents: 0,
  paidAmountCents: 0,
  status: null,
  isPaidInFull: false,
  paymentPending,
});

const paymentSummaryFromPayments = (
  payments: Array<{
    id: string;
    billId: string;
    amountCents: number;
    status: string | null;
    refundedAmountCents: number | null;
    createdAt: Date | null;
    updatedAt: Date | null;
  }>,
  paymentPending: boolean,
): TeamCompliancePaymentSummary => {
  if (!payments.length) {
    return emptyPayment(paymentPending);
  }
  const paidPayments = payments.filter((payment) => String(payment.status ?? '').toUpperCase() === 'PAID');
  const totalAmountCents = payments.reduce((sum, payment) => sum + Math.max(0, Number(payment.amountCents ?? 0)), 0);
  const paidAmountCents = paidPayments.reduce((sum, payment) => sum + Math.max(0, Number(payment.amountCents ?? 0)), 0);
  const latest = payments.reduce((current, payment) => (
    Math.max(toTimestamp(payment.updatedAt), toTimestamp(payment.createdAt))
      > Math.max(toTimestamp(current.updatedAt), toTimestamp(current.createdAt))
      ? payment
      : current
  ), payments[0]);

  const isPaidInFull = totalAmountCents > 0 && paidAmountCents >= totalAmountCents;
  return {
    hasBill: true,
    billId: latest.billId,
    totalAmountCents,
    paidAmountCents,
    status: isPaidInFull ? 'PAID' : latest.status,
    isPaidInFull,
    paymentPending,
  };
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession(req);
  const { id } = await params;
  const teamId = normalizeId(id);
  if (!teamId) {
    return NextResponse.json({ error: 'Invalid team id' }, { status: 400 });
  }

  const team = await prisma.canonicalTeams.findUnique({
    where: { id: teamId },
    select: {
      id: true,
      name: true,
      organizationId: true,
      requiredTemplateIds: true,
      registrationPriceCents: true,
    },
  });
  if (!team) {
    return NextResponse.json({ error: 'Team not found' }, { status: 404 });
  }

  const [canManageTeam, organization] = await Promise.all([
    canManageCanonicalTeam({ teamId: team.id, userId: session.userId, isAdmin: session.isAdmin }),
    team.organizationId
      ? prisma.organizations.findUnique({
        where: { id: team.organizationId },
        select: { id: true, ownerId: true },
      })
      : Promise.resolve(null),
  ]);
  const canManageOrganization = organization
    ? await hasOrganizationStaffAccess(
      { userId: session.userId, isAdmin: session.isAdmin },
      organization,
      ['HOST', 'STAFF'],
    )
    : false;
  if (!canManageTeam && !canManageOrganization) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const registrations = await prisma.teamRegistrations.findMany({
    where: {
      teamId: team.id,
      status: { in: [...ACTIVE_REGISTRATION_STATUSES] },
    },
    select: {
      userId: true,
      parentId: true,
      registrantType: true,
      status: true,
      updatedAt: true,
      createdAt: true,
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });

  const latestRegistrationByUserId = new Map<string, (typeof registrations)[number]>();
  registrations.forEach((registration) => {
    const userId = normalizeId(registration.userId);
    if (!userId) return;
    const existing = latestRegistrationByUserId.get(userId);
    const existingTs = Math.max(toTimestamp(existing?.updatedAt), toTimestamp(existing?.createdAt));
    const nextTs = Math.max(toTimestamp(registration.updatedAt), toTimestamp(registration.createdAt));
    if (!existing || nextTs >= existingTs) {
      latestRegistrationByUserId.set(userId, registration);
    }
  });

  const userIds = Array.from(latestRegistrationByUserId.keys());
  const parentUserIds = Array.from(
    new Set(
      registrations
        .map((registration) => normalizeId(registration.parentId))
        .filter((parentId): parentId is string => Boolean(parentId)),
    ),
  );
  const requiredTemplateIds = normalizeIdList(team.requiredTemplateIds);
  const [users, templates, bills] = await Promise.all([
    userIds.length
      ? prisma.userData.findMany({
        where: { id: { in: userIds } },
        select: { id: true, firstName: true, lastName: true, userName: true, dateOfBirth: true },
      })
      : Promise.resolve([]),
    requiredTemplateIds.length
      ? prisma.templateDocuments.findMany({
        where: { id: { in: requiredTemplateIds } },
        select: { id: true, title: true, type: true, signOnce: true, requiredSignerType: true },
      })
      : Promise.resolve<ComplianceTemplate[]>([]),
    prisma.bills.findMany({
      where: {
        ownerType: 'TEAM',
        ownerId: team.id,
        eventId: null,
      },
      select: { id: true },
    }),
  ]);

  const billIds = bills.map((bill) => bill.id);
  const payments = billIds.length
    ? await prisma.billPayments.findMany({
      where: { billId: { in: billIds } },
      select: {
        id: true,
        billId: true,
        amountCents: true,
        status: true,
        payerUserId: true,
        refundedAmountCents: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    })
    : [];
  const paymentsByPayerUserId = new Map<string, typeof payments>();
  payments.forEach((payment) => {
    const payerUserId = normalizeId(payment.payerUserId);
    if (!payerUserId) return;
    const existing = paymentsByPayerUserId.get(payerUserId) ?? [];
    existing.push(payment);
    paymentsByPayerUserId.set(payerUserId, existing);
  });

  const signerUserIds = Array.from(new Set([...userIds, ...parentUserIds]));
  const signedDocuments = templates.length
    ? await prisma.signedDocuments.findMany({
      where: {
        templateId: { in: templates.map((template) => template.id) },
        OR: [
          ...(signerUserIds.length ? [{ userId: { in: signerUserIds } }] : []),
          ...(userIds.length ? [{ hostId: { in: userIds } }] : []),
        ],
        AND: [{
          OR: [
            { teamId: team.id },
            { teamId: null },
          ],
        }],
      },
      select: {
        id: true,
        templateId: true,
        userId: true,
        hostId: true,
        signerRole: true,
        status: true,
        teamId: true,
        signedAt: true,
        createdAt: true,
      },
    })
    : [];

  const templatesById = new Map(templates.map((template) => [template.id, template]));
  const signedDocumentByCompletionKey = new Map<string, { id: string; signedAt?: string }>();
  signedDocuments.forEach((document) => {
    if (!isSignedDocumentStatus(document.status)) return;
    const template = templatesById.get(document.templateId);
    if (!template) return;
    if (!template.signOnce && normalizeId(document.teamId) !== team.id) return;

    const signerContext = normalizeSignerRoleContext(document.signerRole);
    const hostUserId = signerContext === 'participant' ? null : normalizeId(document.hostId);
    if (signerContext !== 'participant' && !hostUserId) return;
    const completionKey = buildSignatureCompletionKey({
      scopeKey: template.signOnce ? 'once' : `team:${team.id}`,
      templateId: template.id,
      signerContext,
      hostUserId,
    });
    const existing = signedDocumentByCompletionKey.get(completionKey);
    const nextSignedAt = document.signedAt ?? document.createdAt?.toISOString();
    if (!existing || toTimestamp(nextSignedAt) > toTimestamp(existing.signedAt)) {
      signedDocumentByCompletionKey.set(completionKey, { id: document.id, signedAt: nextSignedAt });
    }
  });

  const usersById = new Map(users.map((user) => [user.id, user]));
  const userSummaries = userIds
    .reduce<TeamComplianceUserSummary[]>((summaries, userId) => {
      const user = usersById.get(userId);
      const registration = latestRegistrationByUserId.get(userId);
      if (!user || !registration) return summaries;

      const isChildRegistration = String(registration.registrantType ?? '').toUpperCase() === 'CHILD';
      const ageAtToday = calculateAgeOnDate(user.dateOfBirth, new Date());
      const isMinorAtEvent = Number.isFinite(ageAtToday) && ageAtToday < 18;
      const parentUserId = normalizeId(registration.parentId);
      const signatureTasks = buildRequiredSignatureTasks({
        templates,
        context: {
          userId,
          isChildRegistration: isChildRegistration || isMinorAtEvent,
          parentUserId,
        },
      });
      const requiredDocuments: TeamComplianceRequiredDocument[] = signatureTasks.map((task) => {
        const completionKey = buildSignatureCompletionKey({
          scopeKey: task.signOnce ? 'once' : `team:${team.id}`,
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
      const paymentPending = String(registration.status ?? '').toUpperCase() === 'PENDING'
        || (String(registration.status ?? '').toUpperCase() === 'STARTED' && Math.max(0, team.registrationPriceCents) > 0);
      const payment = paymentSummaryFromPayments(paymentsByPayerUserId.get(userId) ?? [], paymentPending);

      summaries.push({
        userId,
        fullName: toDisplayName(user),
        userName: normalizeId(user.userName) ?? undefined,
        isMinorAtEvent,
        registrationType: isChildRegistration ? 'CHILD' : 'ADULT',
        payment,
        documents: {
          signedCount: requiredDocuments.filter((document) => document.status === 'SIGNED').length,
          requiredCount: requiredDocuments.length,
        },
        requiredDocuments: requiredDocuments.sort((left, right) => left.title.localeCompare(right.title)),
      });
      return summaries;
    }, [])
    .sort((left, right) => left.fullName.localeCompare(right.fullName, undefined, { sensitivity: 'base' }));

  const teamPayment = paymentSummaryFromPayments(payments, false);
  const payload: TeamMemberComplianceResponse = {
    team: {
      teamId: team.id,
      teamName: team.name || 'Unnamed Team',
      payment: teamPayment,
      documents: {
        signedCount: userSummaries.reduce((sum, summary) => sum + summary.documents.signedCount, 0),
        requiredCount: userSummaries.reduce((sum, summary) => sum + summary.documents.requiredCount, 0),
      },
      users: userSummaries,
    },
  };

  return NextResponse.json(payload, { status: 200 });
}
