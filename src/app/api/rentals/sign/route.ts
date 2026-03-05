import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import {
  getEmbeddedSignLink,
  getTemplateRoles,
  isBoldSignConfigured,
  sendDocumentFromTemplate,
} from '@/lib/boldsignServer';
import { createDocumentSendOperation } from '@/lib/boldsignWebhookSync';
import { BOLDSIGN_OPERATION_STATUSES, findLatestBoldSignOperation } from '@/lib/boldsignSyncOperations';
import { getRequiredSignerTypeLabel, normalizeRequiredSignerType } from '@/lib/templateSignerTypes';
import { resolveBoldSignRedirectUrl } from '@/lib/signRedirect';

export const dynamic = 'force-dynamic';

const schema = z.object({
  userId: z.string().optional(),
  userEmail: z.string().optional(),
  eventId: z.string().optional(),
  organizationId: z.string().optional(),
  redirectUrl: z.string().optional(),
  templateId: z.string().optional(),
  templateIds: z.array(z.string()).optional(),
  user: z.record(z.string(), z.any()).optional(),
}).passthrough();

const pickString = (...values: unknown[]): string | undefined => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
};

const normalizeEmail = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (!normalized || !normalized.includes('@')) {
    return undefined;
  }
  return normalized;
};

const normalizeRoleToken = (value: string | undefined): string => {
  return (value ?? '').trim().toLowerCase().replace(/[^a-z]/g, '');
};

const isParticipantRole = (role: string | undefined): boolean => {
  const token = normalizeRoleToken(role);
  return token.includes('participant') || token.includes('player') || token.includes('self');
};

const normalizeSignedDocumentStatus = (value: unknown): string => {
  return (typeof value === 'string' ? value : '').trim().toLowerCase();
};

const isSignedDocumentStatus = (value: unknown): boolean => {
  const normalized = normalizeSignedDocumentStatus(value);
  return normalized === 'signed' || normalized === 'completed';
};

const isInvalidSignerRecipientError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : '';
  const normalized = message.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  return normalized.includes('invalid signer email id or phone number')
    || normalized.includes('invalid signer email')
    || normalized.includes('invalid signer');
};

const resolveSignerName = (params: {
  userPayload?: Record<string, unknown>;
  signerEmail?: string;
  userId: string;
  profile?: {
    firstName?: string | null;
    lastName?: string | null;
    userName?: string | null;
  } | null;
}): string => {
  const userPayload = params.userPayload ?? {};
  const profileName = [
    params.profile?.firstName ?? '',
    params.profile?.lastName ?? '',
  ].join(' ').trim();

  const fullName = pickString(
    profileName,
    userPayload.fullName,
    userPayload.name,
    [userPayload.firstName, userPayload.lastName].filter(Boolean).join(' ').trim(),
    params.profile?.userName,
    userPayload.userName,
  );

  if (fullName) {
    return fullName;
  }

  if (params.signerEmail) {
    return params.signerEmail.split('@')[0] || params.userId;
  }

  return params.userId;
};

const resolveSignerEmail = async (params: {
  providedEmail?: string;
  userPayload?: Record<string, unknown>;
  userId: string;
}): Promise<string | undefined> => {
  const direct = normalizeEmail(params.providedEmail)
    ?? normalizeEmail(params.userPayload?.email);
  if (direct) {
    return direct;
  }

  const fromSensitive = await prisma.sensitiveUserData.findFirst({
    where: { userId: params.userId },
    select: { email: true },
  });
  const sensitiveEmail = normalizeEmail(fromSensitive?.email);
  if (sensitiveEmail) {
    return sensitiveEmail;
  }

  const fromAuth = await prisma.authUser.findUnique({
    where: { id: params.userId },
    select: { email: true },
  });
  return normalizeEmail(fromAuth?.email);
};

const toRolesFromTemplateRecord = (template: {
  roleIndex?: number | null;
  roleIndexes?: number[] | null;
  signerRoles?: string[] | null;
}): Array<{ roleIndex: number; signerRole: string }> => {
  if (Array.isArray(template.roleIndexes) && template.roleIndexes.length > 0) {
    return template.roleIndexes
      .map((index, position) => ({
        roleIndex: Number(index),
        signerRole: String(template.signerRoles?.[position] ?? template.signerRoles?.[0] ?? '').trim(),
      }))
      .filter((row) => Number.isFinite(row.roleIndex) && row.roleIndex > 0 && row.signerRole.length > 0);
  }

  if (typeof template.roleIndex === 'number' && Number.isFinite(template.roleIndex)) {
    const fallbackRole = String(template.signerRoles?.[0] ?? '').trim() || 'Participant';
    return [{ roleIndex: template.roleIndex, signerRole: fallbackRole }];
  }

  return [];
};

export async function POST(req: NextRequest) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const userPayload = parsed.data.user as Record<string, unknown> | undefined;
  const signerUserId = pickString(parsed.data.userId) ?? session.userId;
  if (!session.isAdmin && signerUserId !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const requestedTemplateIds = Array.from(
    new Set(
      [
        pickString(parsed.data.templateId),
        ...(Array.isArray(parsed.data.templateIds) ? parsed.data.templateIds.map((value) => pickString(value)) : []),
      ].filter((value): value is string => Boolean(value)),
    ),
  );
  if (!requestedTemplateIds.length) {
    return NextResponse.json({ error: 'templateId is required.' }, { status: 400 });
  }

  const normalizedEventId = pickString(parsed.data.eventId);
  const normalizedOrganizationId = pickString(parsed.data.organizationId);
  const redirectUrl = resolveBoldSignRedirectUrl(parsed.data.redirectUrl);
  const providedEmail = pickString(parsed.data.userEmail);

  const templates = await prisma.templateDocuments.findMany({
    where: { id: { in: requestedTemplateIds } },
  });
  const templateById = new Map(templates.map((template) => [template.id, template]));
  const missingTemplateIds = requestedTemplateIds.filter((templateId) => !templateById.has(templateId));
  if (missingTemplateIds.length > 0) {
    return NextResponse.json({
      error: `Templates not found: ${missingTemplateIds.join(', ')}`,
    }, { status: 404 });
  }

  const profile = await prisma.userData.findUnique({
    where: { id: signerUserId },
    select: {
      firstName: true,
      lastName: true,
      userName: true,
    },
  });
  const signerEmail = await resolveSignerEmail({
    providedEmail,
    userPayload,
    userId: signerUserId,
  });
  const signerName = resolveSignerName({
    userPayload,
    signerEmail,
    userId: signerUserId,
    profile,
  });

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
    signerContext: 'participant';
    operationId?: string;
    syncStatus?: string;
  }> = [];

  try {
    for (const templateId of requestedTemplateIds) {
      const template = templateById.get(templateId);
      if (!template) {
        continue;
      }

      const requiredSignerType = normalizeRequiredSignerType(template.requiredSignerType);
      if (requiredSignerType !== 'PARTICIPANT') {
        return NextResponse.json({
          error: `Rental template "${template.title}" requires ${getRequiredSignerTypeLabel(requiredSignerType)} signatures. Rental checkout templates must use Participant signer type.`,
        }, { status: 400 });
      }

      if (!template.signOnce && !normalizedEventId) {
        return NextResponse.json({
          error: `eventId is required for event-scoped rental template "${template.title}".`,
        }, { status: 400 });
      }

      const requiredSignerLabel = getRequiredSignerTypeLabel(requiredSignerType);
      const sharedScopeWhere = {
        templateId: template.id,
        ...(template.signOnce ? {} : { eventId: normalizedEventId }),
      };
      const existingSignerRows = await prisma.signedDocuments.findMany({
        where: {
          ...sharedScopeWhere,
          userId: signerUserId,
          signerRole: 'participant',
        },
        orderBy: { updatedAt: 'desc' },
        take: 20,
        select: {
          id: true,
          signedDocumentId: true,
          status: true,
        },
      });

      const operationDelegate = (prisma as unknown as {
        boldSignSyncOperations?: {
          findFirst?: (args: unknown) => Promise<{ documentId?: string | null } | null>;
        };
      }).boldSignSyncOperations;
      let operationDocumentId: string | undefined;
      if (operationDelegate?.findFirst) {
        const activeStatuses = [
          BOLDSIGN_OPERATION_STATUSES.PENDING_WEBHOOK,
          BOLDSIGN_OPERATION_STATUSES.PENDING_RECONCILE,
          BOLDSIGN_OPERATION_STATUSES.CONFIRMED,
        ];
        const activeOperation = await operationDelegate.findFirst({
          where: {
            operationType: 'DOCUMENT_SEND',
            templateDocumentId: template.id,
            userId: signerUserId,
            signerRole: 'participant',
            ...(normalizedEventId ? { eventId: normalizedEventId } : {}),
            status: { in: activeStatuses },
            documentId: { not: null },
          },
          orderBy: { updatedAt: 'desc' },
          select: { documentId: true },
        });
        operationDocumentId = pickString(activeOperation?.documentId);
      }

      const signedRow = existingSignerRows.find((row) => isSignedDocumentStatus(row.status));
      if (signedRow) {
        continue;
      }
      const signerRowWithDocument = existingSignerRows.find((row) => Boolean(pickString(row.signedDocumentId)));
      const signerRowToReuse = existingSignerRows[0];
      const pendingDocumentId = pickString(
        signerRowWithDocument?.signedDocumentId,
        operationDocumentId,
      );

      const templateType = template.type === 'TEXT' ? 'TEXT' : 'PDF';
      if (templateType === 'TEXT') {
        const textDocumentId = pendingDocumentId ?? `text-${crypto.randomUUID()}`;
        const now = new Date();
        if (!signerRowToReuse) {
          await prisma.signedDocuments.create({
            data: {
              id: crypto.randomUUID(),
              createdAt: now,
              updatedAt: now,
              signedDocumentId: textDocumentId,
              templateId: template.id,
              userId: signerUserId,
              documentName: template.title ?? 'Text Waiver',
              hostId: null,
              organizationId: normalizedOrganizationId ?? null,
              eventId: normalizedEventId ?? null,
              status: 'UNSIGNED',
              signedAt: null,
              signerEmail: signerEmail ?? null,
              roleIndex: null,
              signerRole: 'participant',
              ipAddress: null,
              requestId: null,
            },
          });
        } else {
          await prisma.signedDocuments.update({
            where: { id: signerRowToReuse.id },
            data: {
              updatedAt: now,
              signedDocumentId: textDocumentId,
              status: 'UNSIGNED',
              userId: signerUserId,
              hostId: null,
              organizationId: normalizedOrganizationId ?? null,
              eventId: normalizedEventId ?? null,
              signerEmail: signerEmail ?? null,
              roleIndex: null,
              signerRole: 'participant',
            },
          });
        }

        const content = template.content ?? `Please acknowledge ${template.title ?? 'this document'}.`;
        signLinks.push({
          templateId: template.id,
          type: 'TEXT',
          title: template.title,
          signOnce: template.signOnce ?? false,
          documentId: textDocumentId,
          content,
          requiredSignerType,
          requiredSignerLabel,
          signerContext: 'participant',
        });
        continue;
      }

      if (!isBoldSignConfigured()) {
        throw new Error('BoldSign is not configured on the server. Set BOLDSIGN_API_KEY.');
      }
      if (!signerEmail) {
        throw new Error('A signer email is required for PDF signing.');
      }
      const boldSignTemplateId = pickString(template.templateId);
      if (!boldSignTemplateId) {
        throw new Error(`Template "${template.title}" is missing a BoldSign template id.`);
      }

      let templateRoles = toRolesFromTemplateRecord(template);
      try {
        const rolesFromBoldSign = await getTemplateRoles(boldSignTemplateId);
        if (rolesFromBoldSign.length > 0) {
          templateRoles = rolesFromBoldSign;
        }
      } catch {
        // Keep stored role fallbacks when BoldSign role metadata cannot be read.
      }

      const selectedRole = templateRoles.find((role) => isParticipantRole(role.signerRole))
        ?? templateRoles[0]
        ?? { roleIndex: 1, signerRole: 'Participant' };

      const sendFreshDocument = async (): Promise<string> => {
        const sent = await sendDocumentFromTemplate({
          templateId: boldSignTemplateId,
          signerEmail,
          signerName,
          roleIndex: selectedRole.roleIndex,
          signerRole: selectedRole.signerRole,
          title: template.title,
          message: template.description ?? undefined,
        });
        return sent.documentId;
      };

      let documentId = pendingDocumentId;
      if (!documentId) {
        documentId = await sendFreshDocument();
      }

      const buildOperationIdempotencyKey = (nextDocumentId: string): string => {
        return [
          'rental-document-send',
          normalizedEventId ?? 'no-event',
          template.id,
          nextDocumentId,
          signerUserId,
        ].join(':');
      };

      let operation = await findLatestBoldSignOperation({
        documentId,
      });
      if (!operation) {
        operation = await createDocumentSendOperation({
          idempotencyKey: buildOperationIdempotencyKey(documentId),
          organizationId: normalizedOrganizationId ?? null,
          eventId: normalizedEventId ?? null,
          templateDocumentId: template.id,
          templateId: boldSignTemplateId,
          documentId,
          userId: signerUserId,
          childUserId: null,
          signerRole: 'participant',
          signerEmail,
          roleIndex: selectedRole.roleIndex,
          payload: {
            templateDocumentId: template.id,
            templateTitle: template.title,
            requiredSignerType,
            requiredSignerLabel,
            signOnce: template.signOnce ?? false,
            signerContext: 'participant',
          },
        });
      }

      let embedded;
      try {
        embedded = await getEmbeddedSignLink({
          documentId,
          signerEmail,
          redirectUrl,
        });
      } catch (embeddedError) {
        if (!documentId || !isInvalidSignerRecipientError(embeddedError)) {
          throw embeddedError;
        }

        documentId = await sendFreshDocument();
        operation = await createDocumentSendOperation({
          idempotencyKey: buildOperationIdempotencyKey(documentId),
          organizationId: normalizedOrganizationId ?? null,
          eventId: normalizedEventId ?? null,
          templateDocumentId: template.id,
          templateId: boldSignTemplateId,
          documentId,
          userId: signerUserId,
          childUserId: null,
          signerRole: 'participant',
          signerEmail,
          roleIndex: selectedRole.roleIndex,
          payload: {
            templateDocumentId: template.id,
            templateTitle: template.title,
            requiredSignerType,
            requiredSignerLabel,
            signOnce: template.signOnce ?? false,
            signerContext: 'participant',
          },
        });
        embedded = await getEmbeddedSignLink({
          documentId,
          signerEmail,
          redirectUrl,
        });
      }

      signLinks.push({
        templateId: template.id,
        type: 'PDF',
        title: template.title,
        signOnce: template.signOnce ?? false,
        documentId,
        url: embedded.signLink,
        requiredSignerType,
        requiredSignerLabel,
        signerContext: 'participant',
        operationId: operation?.id,
        syncStatus: operation?.status ?? BOLDSIGN_OPERATION_STATUSES.PENDING_WEBHOOK,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create rental signing links.';
    const status = message.includes('not configured') ? 503 : 400;
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json({ signLinks }, { status: 200 });
}
