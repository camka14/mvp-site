import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { canManageOrganization } from '@/server/accessControl';
import {
  deleteTemplate,
  isBoldSignConfigured,
  isBoldSignForbiddenError,
  isBoldSignInvalidTemplateIdError,
  isBoldSignNotFoundError,
} from '@/lib/boldsignServer';
import {
  BOLDSIGN_OPERATION_STATUSES,
  BOLDSIGN_OPERATION_TYPES,
  createOrUpdateBoldSignOperation,
} from '@/lib/boldsignSyncOperations';

export const dynamic = 'force-dynamic';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; templateDocumentId: string }> },
) {
  const session = await requireSession(req);
  const { id, templateDocumentId } = await params;

  const org = await prisma.organizations.findUnique({ where: { id } });
  if (!org) {
    return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
  }
  if (!(await canManageOrganization(session, org))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const template = await prisma.templateDocuments.findUnique({
    where: { id: templateDocumentId },
  });
  if (!template || template.organizationId !== id) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  if (template.type !== 'TEXT') {
    if (!template.templateId) {
      return NextResponse.json({ error: 'Template is missing BoldSign template id.' }, { status: 400 });
    }
    if (!isBoldSignConfigured()) {
      return NextResponse.json({
        error: 'BoldSign is not configured on the server. Set BOLDSIGN_API_KEY.',
      }, { status: 503 });
    }

    let deleteSkippedReason: string | null = null;
    try {
      await deleteTemplate({ templateId: template.templateId });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete template in BoldSign.';
      const canDeleteLocallyViaReconcile = isBoldSignNotFoundError(error)
        || isBoldSignForbiddenError(error)
        || isBoldSignInvalidTemplateIdError(error);
      if (!canDeleteLocallyViaReconcile) {
        return NextResponse.json({ error: message }, { status: 400 });
      }
      deleteSkippedReason = message;
    }

    const operation = await createOrUpdateBoldSignOperation({
      operationType: BOLDSIGN_OPERATION_TYPES.TEMPLATE_DELETE,
      status: BOLDSIGN_OPERATION_STATUSES.PENDING_RECONCILE,
      idempotencyKey: `template-delete:${templateDocumentId}`,
      organizationId: id,
      templateDocumentId: template.id,
      templateId: template.templateId,
      userId: session.userId,
      payload: {
        templateDocumentId: template.id,
        templateId: template.templateId,
        title: template.title,
        requiredSignerType: template.requiredSignerType,
        remoteDeleteSkipped: Boolean(deleteSkippedReason),
        remoteDeleteSkippedReason: deleteSkippedReason,
      },
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    return NextResponse.json(
      {
        deleted: false,
        operationId: operation.id,
        syncStatus: BOLDSIGN_OPERATION_STATUSES.PENDING_RECONCILE,
      },
      { status: 202 },
    );
  }

  const [eventsToUpdate, timeSlotsToUpdate] = await Promise.all([
    prisma.events.findMany({
      where: { requiredTemplateIds: { has: templateDocumentId } },
      select: { id: true, requiredTemplateIds: true },
    }),
    prisma.timeSlots.findMany({
      where: {
        OR: [
          { requiredTemplateIds: { has: templateDocumentId } },
          { hostRequiredTemplateIds: { has: templateDocumentId } },
        ],
      },
      select: { id: true, requiredTemplateIds: true, hostRequiredTemplateIds: true },
    }),
  ]);

  const now = new Date();
  await prisma.$transaction([
    ...eventsToUpdate.map((event) => prisma.events.update({
      where: { id: event.id },
      data: {
        requiredTemplateIds: event.requiredTemplateIds.filter((entry) => entry !== templateDocumentId),
        updatedAt: now,
      },
    })),
    ...timeSlotsToUpdate.map((timeSlot) => prisma.timeSlots.update({
      where: { id: timeSlot.id },
      data: {
        requiredTemplateIds: timeSlot.requiredTemplateIds.filter((entry) => entry !== templateDocumentId),
        hostRequiredTemplateIds: timeSlot.hostRequiredTemplateIds.filter((entry) => entry !== templateDocumentId),
        updatedAt: now,
      },
    })),
    prisma.templateDocuments.delete({
      where: { id: templateDocumentId },
    }),
  ]);

  return NextResponse.json({ deleted: true }, { status: 200 });
}
