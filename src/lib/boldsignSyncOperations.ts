import { prisma } from '@/lib/prisma';

export const BOLDSIGN_SYNC_TIMEOUT_MS = 24 * 60 * 60 * 1000;

export const BOLDSIGN_OPERATION_TYPES = {
  TEMPLATE_CREATE: 'TEMPLATE_CREATE',
  TEMPLATE_DELETE: 'TEMPLATE_DELETE',
  DOCUMENT_SEND: 'DOCUMENT_SEND',
} as const;

export const BOLDSIGN_OPERATION_STATUSES = {
  PENDING_WEBHOOK: 'PENDING_WEBHOOK',
  PENDING_RECONCILE: 'PENDING_RECONCILE',
  CONFIRMED: 'CONFIRMED',
  FAILED: 'FAILED',
  FAILED_RETRYABLE: 'FAILED_RETRYABLE',
  TIMED_OUT: 'TIMED_OUT',
} as const;

export type BoldSignOperationType =
  (typeof BOLDSIGN_OPERATION_TYPES)[keyof typeof BOLDSIGN_OPERATION_TYPES];

export type BoldSignOperationStatus =
  (typeof BOLDSIGN_OPERATION_STATUSES)[keyof typeof BOLDSIGN_OPERATION_STATUSES];

export type BoldSignSyncOperation = {
  id: string;
  createdAt?: Date | null;
  updatedAt?: Date | null;
  operationType: BoldSignOperationType;
  status: BoldSignOperationStatus;
  idempotencyKey: string;
  organizationId?: string | null;
  eventId?: string | null;
  teamId?: string | null;
  templateDocumentId?: string | null;
  signedDocumentRecordId?: string | null;
  templateId?: string | null;
  documentId?: string | null;
  userId?: string | null;
  childUserId?: string | null;
  signerRole?: string | null;
  signerEmail?: string | null;
  roleIndex?: number | null;
  requestId?: string | null;
  ipAddress?: string | null;
  payload?: Record<string, unknown> | null;
  lastError?: string | null;
  completedAt?: Date | null;
  expiresAt?: Date | null;
};

type PrismaAny = typeof prisma & {
  boldSignSyncOperations: {
    findUnique: (args: any) => Promise<any>;
    findFirst: (args: any) => Promise<any>;
    findMany: (args: any) => Promise<any[]>;
    create: (args: any) => Promise<any>;
    update: (args: any) => Promise<any>;
    updateMany: (args: any) => Promise<any>;
  };
  boldSignWebhookEvents: {
    findUnique: (args: any) => Promise<any>;
    create: (args: any) => Promise<any>;
    update: (args: any) => Promise<any>;
  };
};

const prismaAny = prisma as PrismaAny;

const normalizeText = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const normalizeRecord = (value: unknown): Record<string, unknown> | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
};

export const createOrUpdateBoldSignOperation = async (params: {
  operationType: BoldSignOperationType;
  status: BoldSignOperationStatus;
  idempotencyKey: string;
  organizationId?: string | null;
  eventId?: string | null;
  teamId?: string | null;
  templateDocumentId?: string | null;
  signedDocumentRecordId?: string | null;
  templateId?: string | null;
  documentId?: string | null;
  userId?: string | null;
  childUserId?: string | null;
  signerRole?: string | null;
  signerEmail?: string | null;
  roleIndex?: number | null;
  requestId?: string | null;
  ipAddress?: string | null;
  payload?: Record<string, unknown> | null;
  lastError?: string | null;
  completedAt?: Date | null;
  expiresAt?: Date | null;
}): Promise<BoldSignSyncOperation> => {
  const now = new Date();
  const existing = await prismaAny.boldSignSyncOperations.findUnique({
    where: { idempotencyKey: params.idempotencyKey },
  });

  const data = {
    operationType: params.operationType,
    status: params.status,
    organizationId: normalizeText(params.organizationId) ?? null,
    eventId: normalizeText(params.eventId) ?? null,
    teamId: normalizeText(params.teamId) ?? null,
    templateDocumentId: normalizeText(params.templateDocumentId) ?? null,
    signedDocumentRecordId: normalizeText(params.signedDocumentRecordId) ?? null,
    templateId: normalizeText(params.templateId) ?? null,
    documentId: normalizeText(params.documentId) ?? null,
    userId: normalizeText(params.userId) ?? null,
    childUserId: normalizeText(params.childUserId) ?? null,
    signerRole: normalizeText(params.signerRole) ?? null,
    signerEmail: normalizeText(params.signerEmail) ?? null,
    roleIndex: typeof params.roleIndex === 'number' && Number.isFinite(params.roleIndex)
      ? params.roleIndex
      : null,
    requestId: normalizeText(params.requestId) ?? null,
    ipAddress: normalizeText(params.ipAddress) ?? null,
    payload: normalizeRecord(params.payload) ?? null,
    lastError: normalizeText(params.lastError) ?? null,
    completedAt: params.completedAt ?? null,
    expiresAt: params.expiresAt ?? new Date(now.getTime() + BOLDSIGN_SYNC_TIMEOUT_MS),
    updatedAt: now,
  };

  if (!existing) {
    const created = await prismaAny.boldSignSyncOperations.create({
      data: {
        id: crypto.randomUUID(),
        idempotencyKey: params.idempotencyKey,
        createdAt: now,
        ...data,
      },
    });
    return created as BoldSignSyncOperation;
  }

  const updated = await prismaAny.boldSignSyncOperations.update({
    where: { id: existing.id },
    data,
  });
  return updated as BoldSignSyncOperation;
};

export const updateBoldSignOperationById = async (
  operationId: string,
  patch: Partial<Omit<BoldSignSyncOperation, 'id' | 'createdAt'>>,
): Promise<BoldSignSyncOperation | null> => {
  const normalizedId = normalizeText(operationId);
  if (!normalizedId) {
    return null;
  }

  const existing = await prismaAny.boldSignSyncOperations.findUnique({
    where: { id: normalizedId },
  });
  if (!existing) {
    return null;
  }

  const updated = await prismaAny.boldSignSyncOperations.update({
    where: { id: normalizedId },
    data: {
      ...(patch.operationType ? { operationType: patch.operationType } : {}),
      ...(patch.status ? { status: patch.status } : {}),
      ...(patch.idempotencyKey ? { idempotencyKey: patch.idempotencyKey } : {}),
      ...(patch.organizationId !== undefined ? { organizationId: normalizeText(patch.organizationId) ?? null } : {}),
      ...(patch.eventId !== undefined ? { eventId: normalizeText(patch.eventId) ?? null } : {}),
      ...(patch.teamId !== undefined ? { teamId: normalizeText(patch.teamId) ?? null } : {}),
      ...(patch.templateDocumentId !== undefined
        ? { templateDocumentId: normalizeText(patch.templateDocumentId) ?? null }
        : {}),
      ...(patch.signedDocumentRecordId !== undefined
        ? { signedDocumentRecordId: normalizeText(patch.signedDocumentRecordId) ?? null }
        : {}),
      ...(patch.templateId !== undefined ? { templateId: normalizeText(patch.templateId) ?? null } : {}),
      ...(patch.documentId !== undefined ? { documentId: normalizeText(patch.documentId) ?? null } : {}),
      ...(patch.userId !== undefined ? { userId: normalizeText(patch.userId) ?? null } : {}),
      ...(patch.childUserId !== undefined ? { childUserId: normalizeText(patch.childUserId) ?? null } : {}),
      ...(patch.signerRole !== undefined ? { signerRole: normalizeText(patch.signerRole) ?? null } : {}),
      ...(patch.signerEmail !== undefined ? { signerEmail: normalizeText(patch.signerEmail) ?? null } : {}),
      ...(patch.roleIndex !== undefined
        ? {
          roleIndex: typeof patch.roleIndex === 'number' && Number.isFinite(patch.roleIndex)
            ? patch.roleIndex
            : null,
        }
        : {}),
      ...(patch.requestId !== undefined ? { requestId: normalizeText(patch.requestId) ?? null } : {}),
      ...(patch.ipAddress !== undefined ? { ipAddress: normalizeText(patch.ipAddress) ?? null } : {}),
      ...(patch.payload !== undefined ? { payload: normalizeRecord(patch.payload) ?? null } : {}),
      ...(patch.lastError !== undefined ? { lastError: normalizeText(patch.lastError) ?? null } : {}),
      ...(patch.completedAt !== undefined ? { completedAt: patch.completedAt ?? null } : {}),
      ...(patch.expiresAt !== undefined ? { expiresAt: patch.expiresAt ?? null } : {}),
      updatedAt: new Date(),
    },
  });

  return updated as BoldSignSyncOperation;
};

export const getBoldSignOperationById = async (operationId: string): Promise<BoldSignSyncOperation | null> => {
  const normalizedId = normalizeText(operationId);
  if (!normalizedId) {
    return null;
  }
  const row = await prismaAny.boldSignSyncOperations.findUnique({ where: { id: normalizedId } });
  return (row as BoldSignSyncOperation | null) ?? null;
};

export const findLatestBoldSignOperation = async (params: {
  operationType?: BoldSignOperationType;
  templateId?: string | null;
  documentId?: string | null;
  idempotencyKey?: string | null;
  teamId?: string | null;
}): Promise<BoldSignSyncOperation | null> => {
  if (params.idempotencyKey) {
    const row = await prismaAny.boldSignSyncOperations.findUnique({
      where: { idempotencyKey: params.idempotencyKey },
    });
    return (row as BoldSignSyncOperation | null) ?? null;
  }

  const where: Record<string, unknown> = {};
  if (params.operationType) {
    where.operationType = params.operationType;
  }
  const templateId = normalizeText(params.templateId);
  const documentId = normalizeText(params.documentId);
  if (templateId) {
    where.templateId = templateId;
  }
  if (documentId) {
    where.documentId = documentId;
  }
  const teamId = normalizeText(params.teamId);
  if (teamId) {
    where.teamId = teamId;
  }
  if (!Object.keys(where).length) {
    return null;
  }

  const row = await prismaAny.boldSignSyncOperations.findFirst({
    where,
    orderBy: { updatedAt: 'desc' },
  });
  return (row as BoldSignSyncOperation | null) ?? null;
};

export const listBoldSignOperationsForReconcile = async (params?: {
  limit?: number;
  statuses?: BoldSignOperationStatus[];
  operationId?: string;
}): Promise<BoldSignSyncOperation[]> => {
  const statuses = params?.statuses ?? [
    BOLDSIGN_OPERATION_STATUSES.PENDING_WEBHOOK,
    BOLDSIGN_OPERATION_STATUSES.PENDING_RECONCILE,
    BOLDSIGN_OPERATION_STATUSES.FAILED_RETRYABLE,
  ];

  const rows = await prismaAny.boldSignSyncOperations.findMany({
    where: {
      ...(params?.operationId ? { id: params.operationId } : {}),
      status: { in: statuses },
    },
    orderBy: { updatedAt: 'asc' },
    take: Math.max(1, Math.min(params?.limit ?? 100, 500)),
  });

  return rows as BoldSignSyncOperation[];
};

export type BoldSignWebhookEventRecord = {
  id: string;
  boldSignEventId: string;
  eventType: string;
  objectType?: string | null;
  templateId?: string | null;
  documentId?: string | null;
  eventTimestamp?: number | null;
  signatureTimestamp?: number | null;
  processingStatus: string;
  processingError?: string | null;
};

export const createBoldSignWebhookEvent = async (params: {
  boldSignEventId: string;
  eventType: string;
  objectType?: string | null;
  templateId?: string | null;
  documentId?: string | null;
  eventTimestamp?: number | null;
  signatureTimestamp?: number | null;
  payload: Record<string, unknown>;
  headers?: Record<string, unknown>;
}): Promise<{ duplicate: boolean; event: BoldSignWebhookEventRecord | null }> => {
  const now = new Date();
  try {
    const created = await prismaAny.boldSignWebhookEvents.create({
      data: {
        id: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
        boldSignEventId: params.boldSignEventId,
        eventType: params.eventType,
        objectType: normalizeText(params.objectType) ?? null,
        templateId: normalizeText(params.templateId) ?? null,
        documentId: normalizeText(params.documentId) ?? null,
        eventTimestamp: typeof params.eventTimestamp === 'number' ? params.eventTimestamp : null,
        signatureTimestamp: typeof params.signatureTimestamp === 'number' ? params.signatureTimestamp : null,
        processingStatus: 'PROCESSING',
        processingError: null,
        payload: normalizeRecord(params.payload) ?? {},
        headers: normalizeRecord(params.headers) ?? null,
      },
    });

    return {
      duplicate: false,
      event: created as BoldSignWebhookEventRecord,
    };
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === 'P2002') {
      return { duplicate: true, event: null };
    }
    const message = error instanceof Error ? error.message : String(error ?? '');
    if (message.includes('Unique constraint') || message.includes('boldSignEventId')) {
      return { duplicate: true, event: null };
    }
    throw error;
  }
};

export const updateBoldSignWebhookEventStatus = async (params: {
  id: string;
  status: 'PROCESSED' | 'FAILED' | 'PROCESSING';
  error?: string | null;
}) => {
  await prismaAny.boldSignWebhookEvents.update({
    where: { id: params.id },
    data: {
      processingStatus: params.status,
      processingError: normalizeText(params.error) ?? null,
      updatedAt: new Date(),
    },
  });
};
