import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { canManageOrganization } from '@/server/accessControl';
import {
  BOLDSIGN_OPERATION_TYPES,
  BOLDSIGN_OPERATION_STATUSES,
  getBoldSignOperationById,
  updateBoldSignOperationById,
} from '@/lib/boldsignSyncOperations';
import { reconcileBoldSignOperations } from '@/lib/boldsignWebhookSync';

export const dynamic = 'force-dynamic';

const normalizeText = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const isPendingStatus = (status: string): boolean => {
  return status === BOLDSIGN_OPERATION_STATUSES.PENDING_WEBHOOK
    || status === BOLDSIGN_OPERATION_STATUSES.PENDING_RECONCILE
    || status === BOLDSIGN_OPERATION_STATUSES.FAILED_RETRYABLE;
};

const getReconcileDelayMs = (operationType: string): number => {
  if (operationType === BOLDSIGN_OPERATION_TYPES.TEMPLATE_CREATE) {
    return 15_000;
  }
  return 1_500;
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ operationId: string }> },
) {
  const session = await requireSession(req);
  const { operationId } = await params;

  let operation = await getBoldSignOperationById(operationId);
  if (!operation) {
    return NextResponse.json({ error: 'Operation not found.' }, { status: 404 });
  }

  if (!session.isAdmin) {
    const operationUserId = normalizeText(operation.userId);
    const childUserId = normalizeText(operation.childUserId);

    let authorized = operationUserId === session.userId;

    if (!authorized && childUserId) {
      const parentLink = await prisma.parentChildLinks.findFirst({
        where: {
          parentId: session.userId,
          childId: childUserId,
          status: 'ACTIVE',
        },
        select: { id: true },
      });
      authorized = Boolean(parentLink);
    }

    if (!authorized && operation.organizationId) {
      const org = await prisma.organizations.findUnique({ where: { id: operation.organizationId } });
      authorized = Boolean(org && canManageOrganization(session, org));
    }

    if (!authorized) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const isPending = isPendingStatus(operation.status);
  const lastUpdatedAt = operation.updatedAt?.getTime() ?? 0;
  const shouldTryReconcile = isPending && Date.now() - lastUpdatedAt >= getReconcileDelayMs(operation.operationType);
  if (shouldTryReconcile) {
    await reconcileBoldSignOperations({
      operationId: operation.id,
      limit: 10,
    });
    operation = await getBoldSignOperationById(operationId);
  }

  if (!operation) {
    return NextResponse.json({ error: 'Operation not found.' }, { status: 404 });
  }

  if (isPendingStatus(operation.status) && operation.expiresAt && operation.expiresAt.getTime() <= Date.now()) {
    await updateBoldSignOperationById(operation.id, {
      status: BOLDSIGN_OPERATION_STATUSES.TIMED_OUT,
      lastError: operation.lastError ?? 'BoldSign synchronization timed out.',
      completedAt: new Date(),
    });
    operation = await getBoldSignOperationById(operation.id);
  }

  return NextResponse.json({
    operationId: operation?.id,
    operationType: operation?.operationType,
    status: operation?.status,
    error: operation?.lastError ?? null,
    templateDocumentId: operation?.templateDocumentId ?? null,
    signedDocumentRecordId: operation?.signedDocumentRecordId ?? null,
    templateId: operation?.templateId ?? null,
    documentId: operation?.documentId ?? null,
    updatedAt: operation?.updatedAt?.toISOString() ?? null,
  }, { status: 200 });
}
