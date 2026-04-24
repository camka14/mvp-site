import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import {
  getEmbeddedSignLink,
  isBoldSignConfigured,
} from '@/lib/boldsignServer';
import { resolveBoldSignRedirectUrl } from '@/lib/signRedirect';
import {
  BOLDSIGN_OPERATION_STATUSES,
  type BoldSignSyncOperation,
} from '@/lib/boldsignSyncOperations';
import { handleApiRouteError } from '@/server/http/routeErrors';
import {
  getRequiredSignerTypeLabel,
  normalizeRequiredSignerType,
  normalizeSignerContext,
  templateMatchesSignerContext,
  type SignerContext,
} from '@/lib/templateSignerTypes';
import { dispatchRequiredTeamDocuments } from '@/server/teams/teamRegistrationDocuments';

export const dynamic = 'force-dynamic';

const normalizeText = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const normalizeEmail = (value: unknown): string | undefined => {
  const normalized = normalizeText(value)?.toLowerCase();
  if (!normalized || !normalized.includes('@')) {
    return undefined;
  }
  return normalized;
};

const isSignedStatus = (value: unknown): boolean => {
  const normalized = normalizeText(value)?.toLowerCase();
  return normalized === 'signed' || normalized === 'completed';
};

const resolveSignerContext = (raw: unknown): SignerContext => normalizeSignerContext(raw, 'participant');

const parseRequestBody = async (req: NextRequest): Promise<Record<string, unknown>> => {
  const body = await req.json().catch(() => null);
  return body && typeof body === 'object' && !Array.isArray(body)
    ? body as Record<string, unknown>
    : {};
};

const resolveUserEmail = async (userId: string, providedEmail?: string): Promise<string | undefined> => {
  const direct = normalizeEmail(providedEmail);
  if (direct) {
    return direct;
  }

  const [sensitive, auth] = await Promise.all([
    prisma.sensitiveUserData.findFirst({
      where: { userId },
      select: { email: true },
    }),
    prisma.authUser.findUnique({
      where: { id: userId },
      select: { email: true },
    }),
  ]);
  return normalizeEmail(sensitive?.email) ?? normalizeEmail(auth?.email);
};

const verifyActiveParentLink = async (params: {
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

const resolveLinkedParentUserId = async (params: {
  teamId: string;
  childId: string;
}): Promise<string | null> => {
  const registration = await prisma.teamRegistrations.findFirst({
    where: {
      teamId: params.teamId,
      userId: params.childId,
      registrantType: 'CHILD',
      status: { in: ['STARTED', 'ACTIVE'] },
      parentId: { not: null },
    },
    orderBy: { updatedAt: 'desc' },
    select: { parentId: true },
  });
  if (registration?.parentId) {
    return registration.parentId;
  }

  const link = await prisma.parentChildLinks.findFirst({
    where: {
      childId: params.childId,
      status: 'ACTIVE',
    },
    orderBy: { updatedAt: 'desc' },
    select: { parentId: true },
  });
  return registration?.parentId ?? link?.parentId ?? null;
};

const extractRoleAssignments = (operation: BoldSignSyncOperation | null): Array<{
  signerContext: SignerContext;
  signerEmail: string;
  signerName: string;
}> => {
  const payload = operation?.payload;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return [];
  }
  const rawAssignments = (payload as Record<string, unknown>).roleAssignments;
  if (!Array.isArray(rawAssignments)) {
    return [];
  }
  return rawAssignments
    .map((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return null;
      }
      const row = entry as Record<string, unknown>;
      const signerContext = resolveSignerContext(row.signerContext);
      const signerEmail = normalizeEmail(row.signerEmail);
      const signerName = normalizeText(row.signerName) ?? 'Signer';
      if (!signerEmail) {
        return null;
      }
      return {
        signerContext,
        signerEmail,
        signerName,
      };
    })
    .filter((entry): entry is { signerContext: SignerContext; signerEmail: string; signerName: string } => Boolean(entry));
};

const loadReusableOperation = async (params: {
  teamId: string;
  templateDocumentId: string;
  signerContext: SignerContext;
  signerUserId: string;
  childUserId?: string;
}): Promise<BoldSignSyncOperation | null> => {
  const activeStatuses = [
    BOLDSIGN_OPERATION_STATUSES.PENDING_WEBHOOK,
    BOLDSIGN_OPERATION_STATUSES.PENDING_RECONCILE,
    BOLDSIGN_OPERATION_STATUSES.CONFIRMED,
  ];

  const scopedChildUserId = normalizeText(params.childUserId) ?? null;
  const strictOperation = await prisma.boldSignSyncOperations.findFirst({
    where: {
      operationType: 'DOCUMENT_SEND',
      teamId: params.teamId,
      templateDocumentId: params.templateDocumentId,
      status: { in: activeStatuses },
      documentId: { not: null },
      ...(params.signerContext === 'participant'
        ? {
          userId: params.signerUserId,
          signerRole: params.signerContext,
        }
        : {
          childUserId: scopedChildUserId,
        }),
    },
    orderBy: { updatedAt: 'desc' },
  });
  if (strictOperation) {
    return strictOperation as BoldSignSyncOperation;
  }

  if (!scopedChildUserId) {
    return null;
  }

  const sharedChildOperation = await prisma.boldSignSyncOperations.findFirst({
    where: {
      operationType: 'DOCUMENT_SEND',
      teamId: params.teamId,
      templateDocumentId: params.templateDocumentId,
      childUserId: scopedChildUserId,
      status: { in: activeStatuses },
      documentId: { not: null },
    },
    orderBy: { updatedAt: 'desc' },
  });
  return (sharedChildOperation as BoldSignSyncOperation | null) ?? null;
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(req);
    const payload = await parseRequestBody(req);
    const { id: teamId } = await params;

    const team = await prisma.canonicalTeams.findUnique({
      where: { id: teamId },
      select: {
        id: true,
        organizationId: true,
        requiredTemplateIds: true,
      },
    });
    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    const signerContext = resolveSignerContext(payload.signerContext);
    const redirectUrl = resolveBoldSignRedirectUrl(normalizeText(payload.redirectUrl));
    const requestedUserId = normalizeText(payload.userId) ?? normalizeText(payload.targetUserId);
    const childUserId = normalizeText(payload.childUserId) ?? normalizeText(payload.targetUserId);
    const isChildRegistration = Boolean(childUserId);

    let signerUserId: string;
    switch (signerContext) {
      case 'child':
        signerUserId = childUserId ?? requestedUserId ?? '';
        if (!signerUserId) {
          return NextResponse.json({ error: 'childUserId is required when signerContext is child.' }, { status: 400 });
        }
        break;
      case 'parent_guardian':
        signerUserId = session.isAdmin
          ? (requestedUserId ?? session.userId)
          : session.userId;
        break;
      case 'participant':
      default:
        signerUserId = requestedUserId ?? session.userId;
        break;
    }

    if (!session.isAdmin && signerContext === 'participant' && signerUserId !== session.userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!session.isAdmin && isChildRegistration && childUserId) {
      const isChildSigningSelf = signerContext === 'child' && session.userId === childUserId;
      if (!isChildSigningSelf) {
        const hasActiveLink = await verifyActiveParentLink({
          parentId: session.userId,
          childId: childUserId,
        });
        if (!hasActiveLink) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
      }
    }

    const requiredTemplateIds = Array.isArray(team.requiredTemplateIds)
      ? team.requiredTemplateIds.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : [];
    if (!requiredTemplateIds.length) {
      return NextResponse.json({ signLinks: [] }, { status: 200 });
    }

    const templates = await prisma.templateDocuments.findMany({
      where: { id: { in: requiredTemplateIds } },
      select: {
        id: true,
        title: true,
        description: true,
        type: true,
        signOnce: true,
        requiredSignerType: true,
        content: true,
      },
    });
    const templateById = new Map(templates.map((template) => [template.id, template]));
    const eligibleTemplateIds = requiredTemplateIds.filter((templateId) => {
      const template = templateById.get(templateId);
      if (!template) {
        return false;
      }
      return templateMatchesSignerContext({
        requiredSignerType: template.requiredSignerType,
        signerContext,
        isChildRegistration,
      });
    });
    if (!eligibleTemplateIds.length) {
      return NextResponse.json({ signLinks: [] }, { status: 200 });
    }

    const requestedTemplateId = normalizeText(payload.templateId);
    const templateIdsToSign = requestedTemplateId
      ? eligibleTemplateIds.filter((templateId) => templateId === requestedTemplateId)
      : eligibleTemplateIds;
    if (requestedTemplateId && !templateIdsToSign.length) {
      return NextResponse.json({ error: 'Template is not available for this signer context.' }, { status: 400 });
    }

    const linkedParentUserId = isChildRegistration && childUserId
      ? await resolveLinkedParentUserId({ teamId, childId: childUserId })
      : null;
    const parentSignerUserId = isChildRegistration
      ? (
        signerContext === 'parent_guardian'
          ? (session.isAdmin ? (requestedUserId ?? linkedParentUserId ?? session.userId) : session.userId)
          : (linkedParentUserId ?? (session.userId !== signerUserId ? session.userId : undefined))
      )
      : undefined;

    if (!session.isAdmin && signerContext === 'child' && signerUserId !== session.userId) {
      const [sessionEmail, childEmail] = await Promise.all([
        resolveUserEmail(session.userId, normalizeText(payload.userEmail)),
        resolveUserEmail(signerUserId, normalizeText(payload.childEmail) ?? normalizeText(payload.userEmail)),
      ]);
      if (!sessionEmail || !childEmail || sessionEmail !== childEmail) {
        return NextResponse.json(
          { error: 'Child signatures must be completed by the child account unless parent and child share the same email.' },
          { status: 403 },
        );
      }
    }

    const signLinks: Array<{
      templateId: string;
      type: 'PDF' | 'TEXT';
      title: string;
      signOnce: boolean;
      content?: string;
      documentId?: string;
      url?: string;
      requiredSignerType: string;
      requiredSignerLabel: string;
      signerContext: SignerContext;
      operationId?: string;
      syncStatus?: string;
    }> = [];

    for (const templateId of templateIdsToSign) {
      const template = templateById.get(templateId);
      if (!template) {
        continue;
      }

      const requiredSignerType = normalizeRequiredSignerType(template.requiredSignerType);
      const requiredSignerLabel = getRequiredSignerTypeLabel(requiredSignerType);
      const scopedChildUserId = isChildRegistration ? (childUserId ?? null) : null;
      const sharedScopeWhere = {
        templateId: template.id,
        hostId: scopedChildUserId,
        ...(template.signOnce ? {} : { teamId }),
      };
      const existingSignerRows = await prisma.signedDocuments.findMany({
        where: {
          ...sharedScopeWhere,
          userId: signerUserId,
          signerRole: signerContext,
        },
        orderBy: { updatedAt: 'desc' },
        take: 20,
        select: {
          id: true,
          signedDocumentId: true,
          status: true,
        },
      });

      const signedRow = existingSignerRows.find((row) => isSignedStatus(row.status));
      if (signedRow) {
        continue;
      }

      if ((template.type ?? 'PDF').toUpperCase() === 'TEXT') {
        const documentId = normalizeText(existingSignerRows[0]?.signedDocumentId) ?? `text-${crypto.randomUUID()}`;
        const signerEmail = await resolveUserEmail(
          signerUserId,
          signerContext === 'child'
            ? normalizeText(payload.childEmail) ?? normalizeText(payload.userEmail)
            : normalizeText(payload.userEmail),
        );
        const existingRow = existingSignerRows[0];
        if (existingRow) {
          await prisma.signedDocuments.update({
            where: { id: existingRow.id },
            data: {
              updatedAt: new Date(),
              signedDocumentId: documentId,
              status: 'UNSIGNED',
              userId: signerUserId,
              hostId: scopedChildUserId,
              organizationId: team.organizationId ?? null,
              teamId,
              signerEmail: signerEmail ?? null,
              signerRole: signerContext,
            },
          });
        } else {
          await prisma.signedDocuments.create({
            data: {
              id: crypto.randomUUID(),
              createdAt: new Date(),
              updatedAt: new Date(),
              signedDocumentId: documentId,
              templateId: template.id,
              userId: signerUserId,
              documentName: template.title ?? 'Text Waiver',
              hostId: scopedChildUserId,
              organizationId: team.organizationId ?? null,
              eventId: null,
              teamId,
              status: 'UNSIGNED',
              signedAt: null,
              signerEmail: signerEmail ?? null,
              roleIndex: null,
              signerRole: signerContext,
              ipAddress: null,
              requestId: null,
            },
          });
        }

        signLinks.push({
          templateId: template.id,
          type: 'TEXT',
          title: template.title ?? 'Required Document',
          signOnce: template.signOnce ?? false,
          documentId,
          content: template.content ?? `Please acknowledge ${template.title ?? 'this document'}.`,
          requiredSignerType,
          requiredSignerLabel,
          signerContext,
        });
        continue;
      }

      if (!isBoldSignConfigured()) {
        return NextResponse.json(
          { error: 'BoldSign is not configured on the server. Set BOLDSIGN_API_KEY.' },
          { status: 503 },
        );
      }

      let operation = await loadReusableOperation({
        teamId,
        templateDocumentId: template.id,
        signerContext,
        signerUserId,
        childUserId,
      });
      if (!normalizeText(operation?.documentId)) {
        const dispatch = await dispatchRequiredTeamDocuments({
          teamId,
          organizationId: team.organizationId ?? null,
          requiredTemplateIds: [template.id],
          ...(isChildRegistration
            ? {
              parentUserId: parentSignerUserId ?? session.userId,
              childUserId,
            }
            : {
              participantUserId: signerUserId,
            }),
        });
        if (dispatch.missingChildEmail) {
          return NextResponse.json(
            { error: 'Child email is required before child signer links can be sent.' },
            { status: 400 },
          );
        }
        if (dispatch.errors.length > 0) {
          return NextResponse.json({ error: dispatch.errors[0] }, { status: 400 });
        }

        operation = await loadReusableOperation({
          teamId,
          templateDocumentId: template.id,
          signerContext,
          signerUserId,
          childUserId,
        });
      }

      const documentId = normalizeText(operation?.documentId);
      if (!documentId) {
        return NextResponse.json(
          { error: `Failed to create signing request for "${template.title ?? template.id}".` },
          { status: 400 },
        );
      }

      const roleAssignments = extractRoleAssignments(operation);
      let signerEmail = roleAssignments.find((entry) => entry.signerContext === signerContext)?.signerEmail;
      if (!signerEmail) {
        signerEmail = await resolveUserEmail(
          signerUserId,
          signerContext === 'child'
            ? normalizeText(payload.childEmail) ?? normalizeText(payload.userEmail)
            : normalizeText(payload.userEmail),
        );
      }
      if (!signerEmail) {
        return NextResponse.json({ error: 'A signer email is required for PDF signing.' }, { status: 400 });
      }

      const embedded = await getEmbeddedSignLink({
        documentId,
        signerEmail,
        redirectUrl,
      });

      signLinks.push({
        templateId: template.id,
        type: 'PDF',
        title: template.title ?? 'Required Document',
        signOnce: template.signOnce ?? false,
        documentId,
        url: embedded.signLink,
        requiredSignerType,
        requiredSignerLabel,
        signerContext,
        operationId: operation?.id,
        syncStatus: operation?.status ?? BOLDSIGN_OPERATION_STATUSES.PENDING_WEBHOOK,
      });
    }

    return NextResponse.json({ signLinks }, { status: 200 });
  } catch (error) {
    return handleApiRouteError(error, 'Failed to create team sign links');
  }
}
