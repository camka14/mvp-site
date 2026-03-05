import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { canManageEvent } from '@/server/accessControl';
import { calculateAgeOnDate } from '@/lib/age';
import {
  buildRequiredSignatureTasks,
  buildSignatureCompletionKey,
  isSignedDocumentStatus,
  normalizeSignerRoleContext,
  pickPrimaryBill,
  type ComplianceTemplate,
  type EventUserComplianceResponse,
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
} | null): TeamCompliancePaymentSummary => {
  if (!bill) {
    return {
      hasBill: false,
      billId: null,
      totalAmountCents: 0,
      paidAmountCents: 0,
      status: null,
      isPaidInFull: false,
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
      start: true,
      teamSignup: true,
      hostId: true,
      assistantHostIds: true,
      organizationId: true,
      userIds: true,
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

  if (event.teamSignup) {
    const payload: EventUserComplianceResponse = { users: [] };
    return NextResponse.json(payload, { status: 200 });
  }

  const participantUserIds = normalizeIdList(event.userIds);
  if (!participantUserIds.length) {
    const payload: EventUserComplianceResponse = { users: [] };
    return NextResponse.json(payload, { status: 200 });
  }

  const [users, registrations, templates, userBills] = await Promise.all([
    prisma.userData.findMany({
      where: { id: { in: participantUserIds } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        userName: true,
        dateOfBirth: true,
      },
    }),
    prisma.eventRegistrations.findMany({
      where: {
        eventId,
        registrantId: { in: participantUserIds },
      },
      select: {
        registrantId: true,
        registrantType: true,
        parentId: true,
        updatedAt: true,
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
    prisma.bills.findMany({
      where: {
        eventId,
        ownerType: 'USER',
        ownerId: { in: participantUserIds },
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
    }),
  ]);

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
  const signerUserIds = Array.from(new Set([...participantUserIds, ...parentUserIds]));
  const canQuerySignedDocuments = templates.length > 0 && (signerUserIds.length > 0 || participantUserIds.length > 0);
  const signOnceTemplateIds = templates
    .filter((template) => Boolean(template.signOnce))
    .map((template) => template.id);
  const eventScopedTemplateIds = templates
    .filter((template) => !template.signOnce)
    .map((template) => template.id);

  const signedDocuments = canQuerySignedDocuments
    ? await prisma.signedDocuments.findMany({
      where: {
        templateId: { in: templates.map((template) => template.id) },
        OR: [
          ...(signerUserIds.length ? [{ userId: { in: signerUserIds } }] : []),
          ...(participantUserIds.length ? [{ hostId: { in: participantUserIds } }] : []),
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

  const templatesById = new Map(templates.map((template) => [template.id, template]));
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
  const userBillsByOwnerId = new Map<string, Array<(typeof userBills)[number]>>();
  userBills.forEach((bill) => {
    const existing = userBillsByOwnerId.get(bill.ownerId);
    if (existing) {
      existing.push(bill);
    } else {
      userBillsByOwnerId.set(bill.ownerId, [bill]);
    }
  });

  const responseUsers = participantUserIds
    .map((participantUserId) => {
      const user = usersById.get(participantUserId);
      if (!user) {
        return null;
      }

      const registration = latestRegistrationByUserId.get(participantUserId);
      const ageAtEvent = calculateAgeOnDate(user.dateOfBirth, event.start);
      const isMinorAtEvent = Number.isFinite(ageAtEvent) && ageAtEvent < 18;
      const isChildRegistration = registration?.registrantType === 'CHILD' || isMinorAtEvent;
      const parentUserId = normalizeId(registration?.parentId);

      const signatureTasks = buildRequiredSignatureTasks({
        templates,
        context: {
          userId: participantUserId,
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

      const bill = pickPrimaryBill(userBillsByOwnerId.get(participantUserId) ?? []);
      const userSummary: TeamComplianceUserSummary = {
        userId: user.id,
        fullName: toDisplayName(user),
        userName: normalizeId(user.userName) ?? undefined,
        isMinorAtEvent,
        registrationType: isChildRegistration ? 'CHILD' : 'ADULT',
        payment: toPaymentSummary(bill),
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
    .filter((userSummary): userSummary is TeamComplianceUserSummary => Boolean(userSummary))
    .sort((left, right) => left.fullName.localeCompare(right.fullName, undefined, { sensitivity: 'base' }));

  const payload: EventUserComplianceResponse = {
    users: responseUsers,
  };
  return NextResponse.json(payload, { status: 200 });
}
