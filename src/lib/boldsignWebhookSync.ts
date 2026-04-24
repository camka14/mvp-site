import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { syncChildRegistrationConsentStatus } from '@/lib/childConsentProgress';
import { syncAllTeamRegistrationConsentStatusesForRegistrant } from '@/server/teams/teamRegistrationDocuments';
import {
  BOLDSIGN_OPERATION_STATUSES,
  BOLDSIGN_OPERATION_TYPES,
  BOLDSIGN_SYNC_TIMEOUT_MS,
  createOrUpdateBoldSignOperation,
  findLatestBoldSignOperation,
  getBoldSignOperationById,
  listBoldSignOperationsForReconcile,
  type BoldSignSyncOperation,
  type BoldSignOperationStatus,
  updateBoldSignOperationById,
} from '@/lib/boldsignSyncOperations';
import {
  getDocumentProperties,
  getTemplateProperties,
  isBoldSignForbiddenError,
  isBoldSignInvalidTemplateIdError,
  isBoldSignNotFoundError,
} from '@/lib/boldsignServer';
import { normalizeRequiredSignerType } from '@/lib/templateSignerTypes';

type JsonRecord = Record<string, unknown>;

const BOLDSIGN_SIGNATURE_TOLERANCE_SECONDS = 300;
const TEMPLATE_CREATE_RECONCILE_MIN_AGE_MS = 15_000;

const AUTH_EVENT_TYPES = new Set([
  'authenticationfailed',
  'identityverificationinitiated',
  'identityverificationsucceeded',
  'identityverificationfailed',
]);

const TEMPLATE_EVENT_TYPES = new Set([
  'templatecreated',
  'templateedited',
  'templatedraftcreated',
  'templatecreatefailed',
  'templatesendfailed',
]);

const DOCUMENT_EVENT_TYPES = new Set([
  'sent',
  'viewed',
  'reminder',
  'edited',
  'reassigned',
  'deliveryfailed',
  'editfailed',
  'signed',
  'completed',
  'declined',
  'revoked',
  'expired',
  'sendfailed',
  'draftcreated',
]);

const TERMINAL_FAILURE_STATUS_TOKENS = new Set([
  'declined',
  'revoked',
  'expired',
  'sendfailed',
]);

const UNSIGNED_EVENT_TYPES = new Set([
  'sent',
  'viewed',
  'reminder',
  'edited',
  'reassigned',
  'deliveryfailed',
  'editfailed',
  'draftcreated',
]);

const SIGNED_EVENT_TYPES = new Set([
  'signed',
  'completed',
]);

const normalizeText = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const asRecord = (value: unknown): JsonRecord | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as JsonRecord;
};

const pickString = (...values: unknown[]): string | null => {
  for (const value of values) {
    const next = normalizeText(value);
    if (next) {
      return next;
    }
  }
  return null;
};

const parseNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
};

const parseBoolean = (value: unknown): boolean | null => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    if (value === 'true') return true;
    if (value === 'false') return false;
  }
  return null;
};

const parseRoles = (value: unknown): Array<{ roleIndex: number; signerRole: string }> => {
  if (!Array.isArray(value)) {
    return [];
  }

  const rows = value
    .map((entry, index) => {
      const row = asRecord(entry);
      if (!row) {
        return null;
      }
      const roleIndex = parseNumber(row.roleIndex ?? row.RoleIndex ?? row.index ?? row.Index) ?? (index + 1);
      const signerRole = pickString(row.signerRole, row.SignerRole, row.name, row.Name);
      if (!roleIndex || !signerRole) {
        return null;
      }
      return {
        roleIndex,
        signerRole,
      };
    })
    .filter((entry): entry is { roleIndex: number; signerRole: string } => Boolean(entry));

  rows.sort((a, b) => a.roleIndex - b.roleIndex);
  return rows;
};

const normalizeEventToken = (value: string | null): string => {
  return (value ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
};

const parseTimestampSeconds = (value: unknown): number | null => {
  const asNumber = parseNumber(value);
  if (asNumber !== null) {
    if (asNumber > 1_000_000_000_000) {
      return Math.floor(asNumber / 1000);
    }
    if (asNumber > 1_000_000_000) {
      return Math.floor(asNumber);
    }
  }

  if (typeof value === 'string') {
    const parsedDate = Date.parse(value);
    if (!Number.isNaN(parsedDate)) {
      return Math.floor(parsedDate / 1000);
    }
  }

  return null;
};

const toIsoTimestamp = (timestampSeconds: number | null | undefined): string | null => {
  if (typeof timestampSeconds !== 'number' || !Number.isFinite(timestampSeconds)) {
    return null;
  }
  return new Date(timestampSeconds * 1000).toISOString();
};

const hashPayload = (rawBody: string): string => {
  return crypto.createHash('sha256').update(rawBody).digest('hex');
};

const secureCompareHex = (expectedHex: string, providedHex: string): boolean => {
  if (expectedHex.length !== providedHex.length) {
    return false;
  }
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expectedHex, 'hex'),
      Buffer.from(providedHex, 'hex'),
    );
  } catch {
    return false;
  }
};

const getWebhookSecrets = (): string[] => {
  const fromEnv = pickString(
    process.env.BOLDSIGN_WEBHOOK_SECRET,
    process.env.BOLDSIGN_WEBHOOK_SIGNING_KEY,
  );
  if (!fromEnv) {
    return [];
  }

  return fromEnv
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
};

const parseSignatureHeader = (value: string | null): {
  timestamp: number | null;
  signatures: string[];
} => {
  if (!value) {
    return { timestamp: null, signatures: [] };
  }

  const entries = value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  let timestamp: number | null = null;
  const signatures: string[] = [];

  for (const entry of entries) {
    const separatorIndex = entry.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }
    const key = entry.slice(0, separatorIndex).trim();
    const rawValue = entry.slice(separatorIndex + 1).trim();
    if (!rawValue) {
      continue;
    }

    if (key === 't') {
      const parsedTimestamp = parseNumber(rawValue);
      if (parsedTimestamp !== null) {
        timestamp = Math.floor(parsedTimestamp);
      }
      continue;
    }

    if (key === 's0' || key === 's1') {
      signatures.push(rawValue.toLowerCase());
    }
  }

  return { timestamp, signatures };
};

export const verifyBoldSignWebhookSignature = (params: {
  rawBody: string;
  signatureHeader: string | null;
  now?: Date;
}): {
  valid: boolean;
  signatureTimestamp: number | null;
  error?: string;
} => {
  const secrets = getWebhookSecrets();
  if (secrets.length === 0) {
    return {
      valid: false,
      signatureTimestamp: null,
      error: 'BoldSign webhook secret is not configured.',
    };
  }

  const parsed = parseSignatureHeader(params.signatureHeader);
  if (!parsed.timestamp || parsed.signatures.length === 0) {
    return {
      valid: false,
      signatureTimestamp: parsed.timestamp,
      error: 'Missing or invalid BoldSign signature header.',
    };
  }

  const nowSeconds = Math.floor((params.now?.getTime() ?? Date.now()) / 1000);
  if (Math.abs(nowSeconds - parsed.timestamp) > BOLDSIGN_SIGNATURE_TOLERANCE_SECONDS) {
    return {
      valid: false,
      signatureTimestamp: parsed.timestamp,
      error: 'BoldSign webhook signature timestamp is outside tolerance.',
    };
  }

  const signedPayload = `${parsed.timestamp}.${params.rawBody}`;
  for (const secret of secrets) {
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(signedPayload)
      .digest('hex')
      .toLowerCase();

    const matched = parsed.signatures.some((provided) => secureCompareHex(expectedSignature, provided));
    if (matched) {
      return {
        valid: true,
        signatureTimestamp: parsed.timestamp,
      };
    }
  }

  return {
    valid: false,
    signatureTimestamp: parsed.timestamp,
    error: 'BoldSign webhook signature verification failed.',
  };
};

export type ParsedBoldSignWebhookEvent = {
  eventId: string;
  eventType: string;
  eventToken: string;
  objectType: string | null;
  templateId: string | null;
  documentId: string | null;
  status: string | null;
  eventTimestamp: number | null;
  errorMessage: string | null;
  payload: JsonRecord;
  dataObject: JsonRecord | null;
};

export const parseBoldSignWebhookEvent = (params: {
  payload: JsonRecord;
  rawBody: string;
  headerEventType: string | null;
}): ParsedBoldSignWebhookEvent => {
  const event = asRecord(params.payload.event) ?? asRecord(params.payload.Event) ?? null;
  const data = asRecord(params.payload.data) ?? asRecord(params.payload.Data) ?? null;
  const object = asRecord(data?.object) ?? asRecord(data?.Object) ?? asRecord(params.payload.object) ?? null;

  const eventType = pickString(
    event?.eventType,
    event?.EventType,
    params.payload.eventType,
    params.payload.EventType,
    data?.eventType,
    data?.EventType,
    params.headerEventType,
  ) ?? 'Unknown';

  const eventTimestamp = parseTimestampSeconds(
    event?.timestamp
      ?? event?.createdAt
      ?? event?.createdDate
      ?? event?.eventTimestamp
      ?? params.payload.timestamp
      ?? params.payload.createdAt
      ?? data?.timestamp
      ?? object?.timestamp,
  );

  const templateId = pickString(
    object?.templateId,
    object?.templateID,
    object?.TemplateId,
    object?.TemplateID,
    data?.templateId,
    data?.templateID,
    params.payload.templateId,
    params.payload.templateID,
  );

  const documentId = pickString(
    object?.documentId,
    object?.documentID,
    object?.DocumentId,
    object?.DocumentID,
    data?.documentId,
    data?.documentID,
    params.payload.documentId,
    params.payload.documentID,
  );

  const errorMessage = pickString(
    object?.error,
    object?.message,
    data?.error,
    data?.message,
    params.payload.error,
    params.payload.message,
  );

  const eventId = pickString(
    event?.id,
    event?.eventId,
    event?.EventId,
    params.payload.id,
    params.payload.eventId,
    params.payload.EventId,
    data?.id,
    data?.eventId,
  ) ?? hashPayload(params.rawBody);

  const objectType = pickString(
    object?.objectType,
    object?.ObjectType,
    data?.objectType,
    data?.ObjectType,
  );

  const status = pickString(
    object?.status,
    object?.Status,
    data?.status,
    data?.Status,
    params.payload.status,
    params.payload.Status,
  );

  return {
    eventId,
    eventType,
    eventToken: normalizeEventToken(eventType),
    objectType,
    templateId,
    documentId,
    status,
    eventTimestamp,
    errorMessage,
    payload: params.payload,
    dataObject: object,
  };
};

const resolveDocumentStatusFromEventToken = (eventToken: string, fallbackStatus: string | null): string => {
  if (eventToken === 'sent') return 'UNSIGNED';
  if (eventToken === 'signed' || eventToken === 'completed') return 'SIGNED';
  if (eventToken === 'declined') return 'DECLINED';
  if (eventToken === 'revoked') return 'REVOKED';
  if (eventToken === 'expired') return 'EXPIRED';
  if (eventToken === 'sendfailed') return 'SENDFAILED';
  if (eventToken === 'viewed') return 'VIEWED';
  if (eventToken === 'edited') return 'EDITED';
  if (eventToken === 'reassigned') return 'REASSIGNED';
  if (eventToken === 'deliveryfailed') return 'DELIVERYFAILED';
  if (eventToken === 'editfailed') return 'EDITFAILED';
  if (eventToken === 'reminder') return 'REMINDER';
  if (eventToken === 'draftcreated') return 'DRAFT';

  const normalizedFallback = normalizeText(fallbackStatus)?.toUpperCase();
  return normalizedFallback ?? 'UNSIGNED';
};

const isSignedStatus = (value: string | null | undefined): boolean => {
  const normalized = normalizeText(value)?.toLowerCase();
  return normalized === 'signed' || normalized === 'completed';
};

const resolveDocumentSignedAtIso = (event: ParsedBoldSignWebhookEvent): string | null => {
  const direct = pickString(
    event.dataObject?.signedAt,
    event.dataObject?.SignedAt,
    event.dataObject?.completedAt,
    event.dataObject?.CompletedAt,
    event.dataObject?.signedDate,
    event.dataObject?.SignedDate,
    event.payload.signedAt,
    event.payload.completedAt,
  );
  if (direct) {
    const parsed = Date.parse(direct);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed).toISOString();
    }
  }

  return toIsoTimestamp(event.eventTimestamp);
};

const mapConsentStatusUpdate = (eventToken: string): {
  consentStatus: string;
  registrationStatus?: 'ACTIVE' | 'CONSENTFAILED';
} => {
  if (SIGNED_EVENT_TYPES.has(eventToken)) {
    return {
      consentStatus: 'completed',
      registrationStatus: 'ACTIVE',
    };
  }

  if (TERMINAL_FAILURE_STATUS_TOKENS.has(eventToken)) {
    return {
      consentStatus: eventToken,
      registrationStatus: 'CONSENTFAILED',
    };
  }

  if (eventToken === 'sent') {
    return {
      consentStatus: 'sent',
    };
  }

  return {
    consentStatus: eventToken,
  };
};

const maybeResolveUserIdFromSignerEmail = async (email: string | null): Promise<string | null> => {
  const normalizedEmail = normalizeText(email)?.toLowerCase();
  if (!normalizedEmail) {
    return null;
  }

  const sensitive = await prisma.sensitiveUserData.findFirst({
    where: { email: normalizedEmail },
    select: { userId: true },
  });
  if (sensitive?.userId) {
    return sensitive.userId;
  }

  const auth = await prisma.authUser.findUnique({
    where: { email: normalizedEmail },
    select: { id: true },
  });
  return auth?.id ?? null;
};

const normalizeSignerRoleForProjection = (value: string | null): string | null => {
  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }
  const token = normalizeEventToken(normalized);
  if (token.includes('parent') || token.includes('guardian')) {
    return 'parent_guardian';
  }
  if (token.includes('child')) {
    return 'child';
  }
  if (token.includes('participant') || token.includes('player') || token.includes('self')) {
    return 'participant';
  }
  return normalized.toLowerCase().replace(/[\s/]+/g, '_');
};

const toRecordArray = (value: unknown): JsonRecord[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry) => asRecord(entry)).filter((entry): entry is JsonRecord => Boolean(entry));
};

const toIsoDateFromValue = (value: unknown): string | null => {
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed).toISOString();
    }
  }
  const seconds = parseTimestampSeconds(value);
  return toIsoTimestamp(seconds);
};

type EventSignerProjection = {
  signerEmail: string | null;
  signerRole: string | null;
  roleIndex: number | null;
  signerStatusToken: string | null;
  signedAt: string | null;
  userId: string | null;
};

const extractSignerProjectionsFromEvent = (params: {
  event: ParsedBoldSignWebhookEvent;
  operation: BoldSignSyncOperation | null;
  operationPayload: JsonRecord;
}): EventSignerProjection[] => {
  const payloadData = asRecord(params.event.payload.data) ?? asRecord(params.event.payload.Data) ?? null;
  const payloadDocument = asRecord(params.event.payload.document) ?? asRecord(params.event.payload.Document) ?? null;

  const signerRows = [
    ...toRecordArray(payloadData?.signerDetails),
    ...toRecordArray(payloadData?.SignerDetails),
    ...toRecordArray(payloadDocument?.signerDetails),
    ...toRecordArray(payloadDocument?.SignerDetails),
    ...toRecordArray(params.event.dataObject?.signerDetails),
    ...toRecordArray(params.event.dataObject?.SignerDetails),
  ];

  const rowsFromPayload = signerRows
    .map((row, index) => ({
      signerEmail: pickString(
        row.signerEmail,
        row.SignerEmail,
        row.email,
        row.Email,
        row.emailAddress,
        row.EmailAddress,
      )?.toLowerCase() ?? null,
      signerRole: normalizeSignerRoleForProjection(
        pickString(row.signerRole, row.SignerRole, row.role, row.Role),
      ),
      roleIndex: parseNumber(row.order ?? row.Order ?? row.roleIndex ?? row.RoleIndex) ?? (index + 1),
      signerStatusToken: normalizeEventToken(pickString(row.status, row.Status)),
      signedAt: toIsoDateFromValue(
        row.signedAt
        ?? row.SignedAt
        ?? row.completedAt
        ?? row.CompletedAt
        ?? row.signedDate
        ?? row.SignedDate
        ?? row.lastActivityDate
        ?? row.LastActivityDate,
      ),
      userId: null,
    }))
    .sort((left, right) => (left.roleIndex ?? 0) - (right.roleIndex ?? 0));

  if (rowsFromPayload.length > 0) {
    return rowsFromPayload;
  }

  const roleAssignments = toRecordArray(params.operationPayload.roleAssignments);
  const rowsFromRoleAssignments = roleAssignments
    .map((row, index) => ({
      signerEmail: pickString(row.signerEmail, row.SignerEmail)?.toLowerCase() ?? null,
      signerRole: normalizeSignerRoleForProjection(
        pickString(row.signerContext, row.SignerContext, row.signerRole, row.SignerRole),
      ),
      roleIndex: parseNumber(row.roleIndex ?? row.RoleIndex) ?? (index + 1),
      signerStatusToken: null,
      signedAt: null,
      userId: pickString(row.userId, row.UserId),
    }))
    .sort((left, right) => (left.roleIndex ?? 0) - (right.roleIndex ?? 0));

  if (rowsFromRoleAssignments.length > 0) {
    return rowsFromRoleAssignments;
  }

  return [{
    signerEmail: pickString(
      params.operation?.signerEmail,
      params.operationPayload.signerEmail,
      params.event.dataObject?.signerEmail,
      params.event.dataObject?.SignerEmail,
    )?.toLowerCase() ?? null,
    signerRole: normalizeSignerRoleForProjection(
      pickString(
        params.operation?.signerRole,
        params.operationPayload.signerRole,
        params.event.dataObject?.signerRole,
        params.event.dataObject?.SignerRole,
      ),
    ),
    roleIndex: parseNumber(
      params.operation?.roleIndex
      ?? params.operationPayload.roleIndex
      ?? params.event.dataObject?.roleIndex
      ?? params.event.dataObject?.RoleIndex,
    ),
    signerStatusToken: null,
    signedAt: null,
    userId: pickString(params.operation?.userId, params.operationPayload.userId),
  }];
};

const mapStatusTokenToDocumentStatus = (token: string | null): string | null => {
  if (!token) {
    return null;
  }
  if (token === 'signed' || token === 'completed') return 'SIGNED';
  if (token === 'declined') return 'DECLINED';
  if (token === 'revoked') return 'REVOKED';
  if (token === 'expired') return 'EXPIRED';
  if (token === 'sendfailed') return 'SENDFAILED';
  if (UNSIGNED_EVENT_TYPES.has(token)) return 'UNSIGNED';
  return null;
};

const resolveSignerDocumentStatus = (params: {
  eventToken: string;
  fallbackStatus: string;
  signerStatusToken: string | null;
}): string => {
  if (TERMINAL_FAILURE_STATUS_TOKENS.has(params.eventToken)) {
    return params.fallbackStatus;
  }

  if (SIGNED_EVENT_TYPES.has(params.eventToken) && params.signerStatusToken) {
    const statusFromSigner = mapStatusTokenToDocumentStatus(params.signerStatusToken);
    if (statusFromSigner === 'SIGNED') {
      return 'SIGNED';
    }
    if (statusFromSigner) {
      return statusFromSigner;
    }
    return 'UNSIGNED';
  }

  const statusFromSigner = mapStatusTokenToDocumentStatus(params.signerStatusToken);
  if (statusFromSigner) {
    return statusFromSigner;
  }

  return params.fallbackStatus;
};

const inferEventContextForDocumentProjection = async (params: {
  explicitEventId: string | null;
  explicitTeamId: string | null;
  explicitOrganizationId: string | null;
  templateDocumentId: string | null;
  childUserId: string | null;
  representativeUserId: string | null;
}): Promise<{ eventId: string | null; teamId: string | null; organizationId: string | null }> => {
  if (params.explicitTeamId) {
    const team = await prisma.canonicalTeams.findUnique({
      where: { id: params.explicitTeamId },
      select: { organizationId: true },
    });
    return {
      eventId: params.explicitEventId,
      teamId: params.explicitTeamId,
      organizationId: params.explicitOrganizationId ?? team?.organizationId ?? null,
    };
  }

  if (!params.templateDocumentId) {
    return {
      eventId: params.explicitEventId,
      teamId: params.explicitTeamId,
      organizationId: params.explicitOrganizationId,
    };
  }

  const candidateEvents = await prisma.events.findMany({
    where: { requiredTemplateIds: { has: params.templateDocumentId } },
    select: {
      id: true,
      organizationId: true,
    },
    orderBy: { updatedAt: 'desc' },
    take: 25,
  });

  if (candidateEvents.length === 0) {
    return {
      eventId: params.explicitEventId,
      teamId: params.explicitTeamId,
      organizationId: params.explicitOrganizationId,
    };
  }

  const candidateEventIds = candidateEvents.map((row) => row.id);
  const selectEvent = (eventId: string | null): { eventId: string | null; teamId: string | null; organizationId: string | null } => {
    const selected = eventId
      ? candidateEvents.find((row) => row.id === eventId)
      : candidateEvents[0];
    return {
      eventId: selected?.id ?? eventId,
      teamId: null,
      organizationId: params.explicitOrganizationId ?? selected?.organizationId ?? null,
    };
  };

  if (params.explicitEventId && candidateEventIds.includes(params.explicitEventId)) {
    return selectEvent(params.explicitEventId);
  }

  if (params.childUserId) {
    const childRegistration = await prisma.eventRegistrations.findFirst({
      where: {
        eventId: { in: candidateEventIds },
        registrantType: 'CHILD',
        registrantId: params.childUserId,
        status: { in: ['STARTED', 'ACTIVE'] },
      },
      orderBy: { updatedAt: 'desc' },
      select: { eventId: true },
    });
    if (childRegistration?.eventId) {
      return selectEvent(childRegistration.eventId);
    }
  }

  if (params.representativeUserId) {
    const userRegistration = await prisma.eventRegistrations.findFirst({
      where: {
        eventId: { in: candidateEventIds },
        status: { in: ['STARTED', 'ACTIVE'] },
        OR: [
          { registrantId: params.representativeUserId },
          { parentId: params.representativeUserId },
        ],
      },
      orderBy: { updatedAt: 'desc' },
      select: { eventId: true },
    });
    if (userRegistration?.eventId) {
      return selectEvent(userRegistration.eventId);
    }
  }

  return selectEvent(candidateEvents[0]?.id ?? null);
};

const getOperationPayload = (operation: BoldSignSyncOperation | null): JsonRecord => {
  if (!operation?.payload || typeof operation.payload !== 'object' || Array.isArray(operation.payload)) {
    return {};
  }
  return operation.payload;
};

const updateOperationState = async (
  operationId: string | null | undefined,
  patch: Partial<Parameters<typeof updateBoldSignOperationById>[1]>,
) => {
  const normalizedId = normalizeText(operationId);
  if (!normalizedId) {
    return;
  }
  await updateBoldSignOperationById(normalizedId, patch);
};

const createOrUpdateTemplateProjectionFromOperation = async (params: {
  event: ParsedBoldSignWebhookEvent;
  operation: BoldSignSyncOperation | null;
  status: string;
}) => {
  const operationPayload = getOperationPayload(params.operation);
  const payloadRoles = parseRoles(operationPayload.roles ?? params.event.dataObject?.roles ?? params.event.dataObject?.Roles);

  const existing = params.event.templateId
    ? await prisma.templateDocuments.findFirst({
      where: { templateId: params.event.templateId },
      orderBy: { updatedAt: 'desc' },
    })
    : null;

  const organizationId = pickString(
    params.operation?.organizationId,
    operationPayload.organizationId,
    existing?.organizationId,
  );

  const title = pickString(
    operationPayload.title,
    params.event.dataObject?.title,
    params.event.dataObject?.Title,
    params.event.payload.title,
    existing?.title,
  );

  if (!organizationId || !title || !params.event.templateId) {
    return null;
  }

  const requiredSignerType = normalizeRequiredSignerType(
    operationPayload.requiredSignerType
      ?? existing?.requiredSignerType
      ?? 'PARTICIPANT',
  );

  const signOnce = parseBoolean(operationPayload.signOnce) ?? existing?.signOnce ?? false;
  const description = pickString(
    operationPayload.description,
    params.event.dataObject?.description,
    params.event.dataObject?.Description,
    existing?.description,
  );

  const now = new Date();

  if (existing) {
    const updated = await prisma.templateDocuments.update({
      where: { id: existing.id },
      data: {
        updatedAt: now,
        templateId: params.event.templateId,
        type: 'PDF',
        organizationId,
        title,
        description,
        signOnce,
        requiredSignerType,
        status: params.status,
        createdBy: pickString(params.operation?.userId, operationPayload.createdBy, existing.createdBy) ?? null,
        roleIndex: payloadRoles[0]?.roleIndex ?? existing.roleIndex ?? null,
        roleIndexes: payloadRoles.map((entry) => entry.roleIndex),
        signerRoles: payloadRoles.map((entry) => entry.signerRole),
        content: null,
      },
    });
    return updated;
  }

  const created = await prisma.templateDocuments.create({
    data: {
      id: pickString(params.operation?.templateDocumentId, operationPayload.templateDocumentId) ?? crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
      templateId: params.event.templateId,
      type: 'PDF',
      organizationId,
      title,
      description,
      signOnce,
      requiredSignerType,
      status: params.status,
      createdBy: pickString(params.operation?.userId, operationPayload.createdBy) ?? null,
      roleIndex: payloadRoles[0]?.roleIndex ?? null,
      roleIndexes: payloadRoles.map((entry) => entry.roleIndex),
      signerRoles: payloadRoles.map((entry) => entry.signerRole),
      content: null,
    },
  });

  return created;
};

const projectTemplateEvent = async (event: ParsedBoldSignWebhookEvent): Promise<void> => {
  const operation = event.templateId
    ? await findLatestBoldSignOperation({
      operationType: BOLDSIGN_OPERATION_TYPES.TEMPLATE_CREATE,
      templateId: event.templateId,
    })
    : null;

  if (event.eventToken === 'templatecreatefailed' || event.eventToken === 'templatesendfailed') {
    await updateOperationState(operation?.id, {
      status: BOLDSIGN_OPERATION_STATUSES.FAILED,
      lastError: event.errorMessage ?? 'BoldSign template operation failed.',
      completedAt: new Date(),
    });

    if (event.templateId) {
      const existing = await prisma.templateDocuments.findFirst({
        where: { templateId: event.templateId },
        orderBy: { updatedAt: 'desc' },
      });
      if (existing) {
        await prisma.templateDocuments.update({
          where: { id: existing.id },
          data: {
            status: 'FAILED',
            updatedAt: new Date(),
          },
        });
      }
    }
    return;
  }

  let templateStatus = 'ACTIVE';
  if (event.eventToken === 'templatedraftcreated') {
    templateStatus = 'DRAFT';
  }

  const projectedTemplate = await createOrUpdateTemplateProjectionFromOperation({
    event,
    operation,
    status: templateStatus,
  });

  if (event.eventToken === 'templateedited' && event.templateId && !projectedTemplate) {
    const existing = await prisma.templateDocuments.findFirst({
      where: { templateId: event.templateId },
      orderBy: { updatedAt: 'desc' },
    });
    if (existing) {
      const roles = parseRoles(event.dataObject?.roles ?? event.dataObject?.Roles);
      await prisma.templateDocuments.update({
        where: { id: existing.id },
        data: {
          title: pickString(event.dataObject?.title, event.dataObject?.Title, existing.title) ?? existing.title,
          description: pickString(
            event.dataObject?.description,
            event.dataObject?.Description,
            existing.description,
          ),
          roleIndex: roles[0]?.roleIndex ?? existing.roleIndex,
          roleIndexes: roles.length > 0 ? roles.map((entry) => entry.roleIndex) : existing.roleIndexes,
          signerRoles: roles.length > 0 ? roles.map((entry) => entry.signerRole) : existing.signerRoles,
          status: templateStatus,
          updatedAt: new Date(),
        },
      });
    }
  }

  await updateOperationState(operation?.id, {
    status: BOLDSIGN_OPERATION_STATUSES.CONFIRMED,
    templateId: event.templateId ?? operation?.templateId ?? null,
    templateDocumentId: projectedTemplate?.id ?? operation?.templateDocumentId ?? null,
    lastError: null,
    completedAt: new Date(),
  });
};

const resolveDocumentOperation = async (event: ParsedBoldSignWebhookEvent): Promise<BoldSignSyncOperation | null> => {
  if (!event.documentId) {
    return null;
  }

  const byDocumentId = await findLatestBoldSignOperation({
    operationType: BOLDSIGN_OPERATION_TYPES.DOCUMENT_SEND,
    documentId: event.documentId,
  });
  if (byDocumentId) {
    return byDocumentId;
  }

  return null;
};

const updateRegistrationConsentByDocumentId = async (params: {
  documentId: string;
  eventToken: string;
}) => {
  const update = mapConsentStatusUpdate(params.eventToken);
  const now = new Date();

  const data: Record<string, unknown> = {
    consentStatus: update.consentStatus,
    updatedAt: now,
  };
  if (update.registrationStatus) {
    data.status = update.registrationStatus;
  }

  await prisma.eventRegistrations.updateMany({
    where: { consentDocumentId: params.documentId },
    data,
  });

  await prisma.teamRegistrations.updateMany({
    where: { consentDocumentId: params.documentId },
    data: {
      consentStatus: update.consentStatus,
      updatedAt: now,
    },
  });
};

const syncChildConsentFromRows = async (rows: Array<{
  eventId: string | null;
  hostId: string | null;
  signerRole: string | null;
}>) => {
  for (const row of rows) {
    if (!row.eventId || !row.hostId) {
      continue;
    }

    const normalizedSignerRole = normalizeText(row.signerRole)?.toLowerCase();
    if (normalizedSignerRole !== 'parent_guardian' && normalizedSignerRole !== 'child') {
      continue;
    }

    await syncChildRegistrationConsentStatus({
      eventId: row.eventId,
      childUserId: row.hostId,
    });
  }
};

const syncTeamConsentFromRows = async (rows: Array<{
  teamId: string | null;
  userId: string | null;
  hostId: string | null;
  signerRole: string | null;
}>) => {
  const registrantIds = new Set<string>();

  for (const row of rows) {
    if (!row.teamId) {
      continue;
    }

    const normalizedSignerRole = normalizeText(row.signerRole)?.toLowerCase();
    const registrantId = normalizedSignerRole === 'participant'
      ? pickString(row.userId)
      : pickString(row.hostId);
    if (!registrantId) {
      continue;
    }
    registrantIds.add(registrantId);
  }

  for (const registrantId of registrantIds) {
    await syncAllTeamRegistrationConsentStatusesForRegistrant({ registrantId });
  }
};

const createOrUpdateSignedDocumentProjection = async (params: {
  event: ParsedBoldSignWebhookEvent;
  operation: BoldSignSyncOperation | null;
}): Promise<{
  rowId: string | null;
  updatedRows: number;
  projectionContext: {
    templateId: string | null;
    templateDocumentId: string | null;
    eventId: string | null;
    teamId: string | null;
    organizationId: string | null;
    userId: string | null;
    childUserId: string | null;
    signerRole: string | null;
    signerEmail: string | null;
    roleIndex: number | null;
  };
}> => {
  const { event, operation } = params;
  const operationPayload = getOperationPayload(operation);

  if (!event.documentId) {
    return {
      rowId: null,
      updatedRows: 0,
      projectionContext: {
        templateId: null,
        templateDocumentId: null,
        eventId: null,
        teamId: null,
        organizationId: null,
        userId: null,
        childUserId: null,
        signerRole: null,
        signerEmail: null,
        roleIndex: null,
      },
    };
  }

  const fallbackStatus = resolveDocumentStatusFromEventToken(event.eventToken, event.status);
  const eventSignedAt = resolveDocumentSignedAtIso(event);
  const payloadData = asRecord(event.payload.data) ?? asRecord(event.payload.Data) ?? null;
  const payloadDocument = asRecord(event.payload.document) ?? asRecord(event.payload.Document) ?? null;

  let templateId = pickString(
    operation?.templateId,
    operationPayload.templateId,
    event.templateId,
  );
  if (!templateId) {
    try {
      const remoteDocument = await getDocumentProperties({ documentId: event.documentId });
      templateId = pickString(remoteDocument.templateId);
    } catch {
      templateId = null;
    }
  }

  const templateRow = templateId
    ? await prisma.templateDocuments.findFirst({
      where: { templateId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        organizationId: true,
        title: true,
      },
    })
    : null;

  const templateDocumentId = pickString(
    operation?.templateDocumentId,
    operationPayload.templateDocumentId,
    templateRow?.id,
  );
  const documentName = pickString(
    operationPayload.templateTitle,
    event.dataObject?.title,
    event.dataObject?.Title,
    payloadData?.messageTitle,
    payloadData?.MessageTitle,
    payloadDocument?.messageTitle,
    payloadDocument?.MessageTitle,
    event.payload.title,
    event.payload.Title,
    templateRow?.title,
  ) ?? 'Signed Document';

  const signerRows = extractSignerProjectionsFromEvent({
    event,
    operation,
    operationPayload,
  });
  for (const signerRow of signerRows) {
    let resolvedUserId = pickString(signerRow.userId);
    if (!resolvedUserId && signerRow.signerEmail) {
      const sameAsOperationSigner = Boolean(
        operation?.signerEmail
        && signerRow.signerEmail.toLowerCase() === operation.signerEmail.toLowerCase(),
      );
      if (sameAsOperationSigner) {
        resolvedUserId = pickString(operation?.userId, operationPayload.userId);
      }
      if (!resolvedUserId) {
        resolvedUserId = await maybeResolveUserIdFromSignerEmail(signerRow.signerEmail);
      }
    }
    if (!resolvedUserId && signerRows.length === 1) {
      resolvedUserId = pickString(operation?.userId, operationPayload.userId);
    }
    signerRow.userId = resolvedUserId;
  }

  const childSignerRow = signerRows.find((row) => normalizeSignerRoleForProjection(row.signerRole) === 'child');
  const childUserId = pickString(
    operation?.childUserId,
    operationPayload.childUserId,
    childSignerRow?.userId,
  );
  const representativeUserId = pickString(
    operation?.userId,
    operationPayload.userId,
    signerRows.find((row) => pickString(row.userId))?.userId,
  );

  const inferredContext = await inferEventContextForDocumentProjection({
    explicitEventId: pickString(operation?.eventId, operationPayload.eventId),
    explicitTeamId: pickString(operation?.teamId, operationPayload.teamId),
    explicitOrganizationId: pickString(
      operation?.organizationId,
      operationPayload.organizationId,
      templateRow?.organizationId,
    ),
    templateDocumentId,
    childUserId,
    representativeUserId,
  });

  let updatedRows = 0;
  const projectedRows: Array<{
    id: string;
    userId: string | null;
    signerRole: string | null;
    signerEmail: string | null;
    roleIndex: number | null;
  }> = [];

  for (const signerRow of signerRows) {
    const signerRole = normalizeSignerRoleForProjection(
      pickString(signerRow.signerRole),
    ) ?? normalizeSignerRoleForProjection(pickString(operation?.signerRole, operationPayload.signerRole))
      ?? 'participant';
    const signerEmail = pickString(signerRow.signerEmail, operation?.signerEmail, operationPayload.signerEmail)?.toLowerCase() ?? null;
    const userId = pickString(signerRow.userId);
    const roleIndex = parseNumber(
      signerRow.roleIndex
      ?? operation?.roleIndex
      ?? operationPayload.roleIndex,
    );
    const hostId = signerRole === 'child'
      ? (childUserId ?? userId)
      : signerRole === 'parent_guardian'
        ? childUserId
        : pickString(operation?.childUserId, operationPayload.childUserId);

    const signerStatus = resolveSignerDocumentStatus({
      eventToken: event.eventToken,
      fallbackStatus,
      signerStatusToken: signerRow.signerStatusToken,
    });
    const defaultSignedAt = signerStatus === 'SIGNED'
      ? (signerRow.signedAt ?? eventSignedAt)
      : null;

    let existing = await prisma.signedDocuments.findFirst({
      where: {
        signedDocumentId: event.documentId,
        ...(templateDocumentId ? { templateId: templateDocumentId } : {}),
        ...(userId ? { userId } : {}),
        ...(signerRole ? { signerRole } : {}),
        ...(hostId ? { hostId } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        status: true,
        signedAt: true,
      },
    });

    if (!existing && signerEmail) {
      existing = await prisma.signedDocuments.findFirst({
        where: {
          signedDocumentId: event.documentId,
          ...(templateDocumentId ? { templateId: templateDocumentId } : {}),
          signerEmail,
          ...(signerRole ? { signerRole } : {}),
        },
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          status: true,
          signedAt: true,
        },
      });
    }

    const preserveSignedState = Boolean(
      existing
      && isSignedStatus(existing.status)
      && !isSignedStatus(signerStatus)
      && !TERMINAL_FAILURE_STATUS_TOKENS.has(event.eventToken),
    );
    const nextStatus = preserveSignedState ? 'SIGNED' : signerStatus;
    const nextSignedAt = nextStatus === 'SIGNED'
      ? (normalizeText(existing?.signedAt) ?? defaultSignedAt)
      : null;

    if (existing) {
      await prisma.signedDocuments.update({
        where: { id: existing.id },
        data: {
          updatedAt: new Date(),
          signedDocumentId: event.documentId,
          templateId: templateDocumentId ?? undefined,
          userId: userId ?? undefined,
          documentName,
          hostId,
          organizationId: inferredContext.organizationId,
          eventId: inferredContext.eventId,
          teamId: inferredContext.teamId,
          status: nextStatus,
          signedAt: nextSignedAt ?? undefined,
          signerEmail,
          roleIndex,
          signerRole,
        },
      });
      updatedRows += 1;
      projectedRows.push({
        id: existing.id,
        userId: userId ?? null,
        signerRole,
        signerEmail,
        roleIndex,
      });
      continue;
    }

    if (!userId || !templateDocumentId) {
      continue;
    }

    const created = await prisma.signedDocuments.create({
      data: {
        id: crypto.randomUUID(),
        createdAt: new Date(),
        updatedAt: new Date(),
        signedDocumentId: event.documentId,
        templateId: templateDocumentId,
        userId,
        documentName,
        hostId,
        organizationId: inferredContext.organizationId,
        eventId: inferredContext.eventId,
        teamId: inferredContext.teamId,
        status: nextStatus,
        signedAt: nextSignedAt,
        signerEmail,
        roleIndex,
        signerRole,
        ipAddress: null,
        requestId: null,
      },
      select: { id: true },
    });
    updatedRows += 1;
    projectedRows.push({
      id: created.id,
      userId,
      signerRole,
      signerEmail,
      roleIndex,
    });
  }

  let primaryRowId = pickString(operation?.signedDocumentRecordId);
  if (!primaryRowId && projectedRows.length > 0) {
    const preferred = projectedRows.find((row) =>
      (operation?.userId && row.userId === operation.userId)
      || (operation?.signerRole && row.signerRole === normalizeSignerRoleForProjection(operation.signerRole)),
    );
    primaryRowId = preferred?.id ?? projectedRows[0]?.id ?? null;
  }

  if (updatedRows === 0) {
    const existingRows = await prisma.signedDocuments.findMany({
      where: { signedDocumentId: event.documentId },
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    });

    if (existingRows.length > 0) {
      const ids = existingRows.map((row) => row.id);
      await prisma.signedDocuments.updateMany({
        where: { id: { in: ids } },
        data: {
          updatedAt: new Date(),
          status: fallbackStatus,
          signedAt: eventSignedAt ?? undefined,
        },
      });
      primaryRowId = existingRows[0]?.id ?? primaryRowId ?? null;
      updatedRows = existingRows.length;
    }
  }

  const preferredProjection = projectedRows.find((row) => row.id === primaryRowId) ?? projectedRows[0] ?? null;

  return {
    rowId: primaryRowId ?? null,
    updatedRows,
    projectionContext: {
      templateId,
      templateDocumentId,
      eventId: inferredContext.eventId,
      teamId: inferredContext.teamId,
      organizationId: inferredContext.organizationId,
      userId: preferredProjection?.userId ?? representativeUserId,
      childUserId,
      signerRole: preferredProjection?.signerRole ?? normalizeSignerRoleForProjection(
        pickString(operation?.signerRole, operationPayload.signerRole),
      ),
      signerEmail: preferredProjection?.signerEmail ?? pickString(
        operation?.signerEmail,
        operationPayload.signerEmail,
      ),
      roleIndex: preferredProjection?.roleIndex ?? parseNumber(
        operation?.roleIndex
        ?? operationPayload.roleIndex,
      ),
    },
  };
};

const projectDocumentEvent = async (event: ParsedBoldSignWebhookEvent): Promise<void> => {
  if (!event.documentId) {
    return;
  }

  let operation = await resolveDocumentOperation(event);
  const hadOperation = Boolean(operation);
  const projection = await createOrUpdateSignedDocumentProjection({
    event,
    operation,
  });

  await updateRegistrationConsentByDocumentId({
    documentId: event.documentId,
    eventToken: event.eventToken,
  });

  if (SIGNED_EVENT_TYPES.has(event.eventToken) || TERMINAL_FAILURE_STATUS_TOKENS.has(event.eventToken)) {
    const rows = await prisma.signedDocuments.findMany({
      where: { signedDocumentId: event.documentId },
      select: {
        eventId: true,
        teamId: true,
        userId: true,
        hostId: true,
        signerRole: true,
      },
    });
    await syncChildConsentFromRows(rows);
    await syncTeamConsentFromRows(rows);
  }

  const isSignedEvent = SIGNED_EVENT_TYPES.has(event.eventToken);
  const isTerminalFailureEvent = TERMINAL_FAILURE_STATUS_TOKENS.has(event.eventToken) || event.eventToken === 'sendfailed';
  let nextStatus: BoldSignOperationStatus = BOLDSIGN_OPERATION_STATUSES.PENDING_RECONCILE;
  if (isSignedEvent) {
    nextStatus = BOLDSIGN_OPERATION_STATUSES.CONFIRMED;
  } else if (isTerminalFailureEvent) {
    nextStatus = BOLDSIGN_OPERATION_STATUSES.FAILED;
  }

  if (!operation) {
    operation = await createOrUpdateBoldSignOperation({
      operationType: BOLDSIGN_OPERATION_TYPES.DOCUMENT_SEND,
      status: nextStatus,
      idempotencyKey: `webhook-document:${event.documentId}`,
      organizationId: projection.projectionContext.organizationId,
      eventId: projection.projectionContext.eventId,
      teamId: projection.projectionContext.teamId,
      templateDocumentId: projection.projectionContext.templateDocumentId,
      signedDocumentRecordId: projection.rowId,
      templateId: projection.projectionContext.templateId,
      documentId: event.documentId,
      userId: projection.projectionContext.userId,
      childUserId: projection.projectionContext.childUserId,
      signerRole: projection.projectionContext.signerRole,
      signerEmail: projection.projectionContext.signerEmail,
      roleIndex: projection.projectionContext.roleIndex,
      payload: {
        source: 'webhook',
        eventType: event.eventType,
        eventToken: event.eventToken,
        status: event.status,
      },
      completedAt: nextStatus === BOLDSIGN_OPERATION_STATUSES.CONFIRMED
        || nextStatus === BOLDSIGN_OPERATION_STATUSES.FAILED
        ? new Date()
        : null,
      expiresAt: new Date(Date.now() + BOLDSIGN_SYNC_TIMEOUT_MS),
    });
  }

  if (operation) {
    if (!hadOperation) {
      return;
    }

    if (event.eventToken === 'sendfailed') {
      await updateOperationState(operation.id, {
        status: BOLDSIGN_OPERATION_STATUSES.FAILED,
        lastError: event.errorMessage ?? 'BoldSign send failed.',
        completedAt: new Date(),
      });
    } else {
      if (
        operation.status === BOLDSIGN_OPERATION_STATUSES.CONFIRMED
        && nextStatus === BOLDSIGN_OPERATION_STATUSES.PENDING_RECONCILE
      ) {
        nextStatus = BOLDSIGN_OPERATION_STATUSES.CONFIRMED;
      }

      await updateOperationState(operation.id, {
        status: nextStatus,
        documentId: event.documentId,
        teamId: projection.projectionContext.teamId ?? operation.teamId ?? null,
        signedDocumentRecordId: projection.rowId ?? operation.signedDocumentRecordId ?? null,
        lastError: nextStatus === BOLDSIGN_OPERATION_STATUSES.FAILED
          ? (event.errorMessage ?? operation.lastError ?? 'BoldSign document flow failed.')
          : null,
        completedAt:
          nextStatus === BOLDSIGN_OPERATION_STATUSES.CONFIRMED
          || nextStatus === BOLDSIGN_OPERATION_STATUSES.FAILED
            ? new Date()
            : null,
      });
    }
  }
};

export const processBoldSignWebhookEvent = async (event: ParsedBoldSignWebhookEvent): Promise<void> => {
  if (AUTH_EVENT_TYPES.has(event.eventToken)) {
    return;
  }

  if (TEMPLATE_EVENT_TYPES.has(event.eventToken)) {
    await projectTemplateEvent(event);
    return;
  }

  if (DOCUMENT_EVENT_TYPES.has(event.eventToken)) {
    await projectDocumentEvent(event);
  }
};

const resolveRemoteDocumentEventToken = (status: string | null): string => {
  const token = normalizeEventToken(status);
  if (token === 'completed' || token === 'signed') return token;
  if (token === 'declined' || token === 'revoked' || token === 'expired') return token;
  if (token === 'viewed' || token === 'reassigned' || token === 'edited') return token;
  if (token === 'deliveryfailed' || token === 'editfailed' || token === 'sendfailed') return token;
  if (token === 'sent' || token === 'draftcreated' || token === 'reminder') return token;
  return 'sent';
};

const reconcileTemplateCreateOperation = async (operation: BoldSignSyncOperation) => {
  const now = new Date();
  const createdAtMs = operation.createdAt?.getTime() ?? 0;
  if (createdAtMs > 0 && (Date.now() - createdAtMs) < TEMPLATE_CREATE_RECONCILE_MIN_AGE_MS) {
    return;
  }

  const existing = operation.templateId
    ? await prisma.templateDocuments.findFirst({
      where: { templateId: operation.templateId },
      select: { id: true },
      orderBy: { updatedAt: 'desc' },
    })
    : null;

  if (existing) {
    await updateBoldSignOperationById(operation.id, {
      status: BOLDSIGN_OPERATION_STATUSES.CONFIRMED,
      templateDocumentId: existing.id,
      completedAt: now,
      lastError: null,
    });
    return;
  }

  const templateId = normalizeText(operation.templateId);
  if (!templateId) {
    await updateBoldSignOperationById(operation.id, {
      status: BOLDSIGN_OPERATION_STATUSES.FAILED_RETRYABLE,
      lastError: 'Template id is missing for reconciliation.',
    });
    return;
  }

  try {
    const remoteTemplate = await getTemplateProperties(templateId);
    const event = parseBoldSignWebhookEvent({
      payload: {
        eventType: 'TemplateCreated',
        templateId: remoteTemplate.templateId,
        data: {
          object: {
            templateId: remoteTemplate.templateId,
            title: remoteTemplate.title,
            description: remoteTemplate.description,
            status: remoteTemplate.status,
            roles: remoteTemplate.roles,
          },
        },
      },
      rawBody: JSON.stringify({
        templateId: remoteTemplate.templateId,
      }),
      headerEventType: 'TemplateCreated',
    });

    await projectTemplateEvent(event);
  } catch (error) {
    if (isBoldSignNotFoundError(error)) {
      const createdAtMs = operation.createdAt?.getTime() ?? 0;
      const ageMs = Date.now() - createdAtMs;
      if (ageMs > 10 * 60 * 1000) {
        await updateBoldSignOperationById(operation.id, {
          status: BOLDSIGN_OPERATION_STATUSES.FAILED_RETRYABLE,
          lastError: 'Template is not yet available in BoldSign.',
        });
      }
      return;
    }

    await updateBoldSignOperationById(operation.id, {
      status: BOLDSIGN_OPERATION_STATUSES.FAILED_RETRYABLE,
      lastError: error instanceof Error ? error.message : 'Failed to reconcile template create operation.',
    });
  }
};

const reconcileTemplateDeleteOperation = async (operation: BoldSignSyncOperation) => {
  const templateId = normalizeText(operation.templateId);
  const templateDocumentId = normalizeText(operation.templateDocumentId);

  if (!templateDocumentId) {
    await updateBoldSignOperationById(operation.id, {
      status: BOLDSIGN_OPERATION_STATUSES.FAILED_RETRYABLE,
      lastError: 'Template document id is missing for delete reconciliation.',
    });
    return;
  }

  let templateStillExists = false;
  if (templateId) {
    try {
      await getTemplateProperties(templateId);
      templateStillExists = true;
    } catch (error) {
      if (!isBoldSignNotFoundError(error)
        && !isBoldSignForbiddenError(error)
        && !isBoldSignInvalidTemplateIdError(error)) {
        await updateBoldSignOperationById(operation.id, {
          status: BOLDSIGN_OPERATION_STATUSES.FAILED_RETRYABLE,
          lastError: error instanceof Error ? error.message : 'Failed to reconcile template delete operation.',
        });
        return;
      }
      templateStillExists = false;
    }
  }

  if (templateStillExists) {
    return;
  }

  const now = new Date();
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
    prisma.templateDocuments.deleteMany({
      where: { id: templateDocumentId },
    }),
  ]);

  await updateBoldSignOperationById(operation.id, {
    status: BOLDSIGN_OPERATION_STATUSES.CONFIRMED,
    completedAt: now,
    lastError: null,
  });
};

const reconcileDocumentSendOperation = async (operation: BoldSignSyncOperation) => {
  const documentId = normalizeText(operation.documentId);
  if (!documentId) {
    await updateBoldSignOperationById(operation.id, {
      status: BOLDSIGN_OPERATION_STATUSES.FAILED_RETRYABLE,
      lastError: 'Document id is missing for send reconciliation.',
    });
    return;
  }

  try {
    const remote = await getDocumentProperties({ documentId });
    const eventToken = resolveRemoteDocumentEventToken(remote.status);
    const event = parseBoldSignWebhookEvent({
      payload: {
        eventType: eventToken,
        documentId: remote.documentId,
        templateId: remote.templateId,
        status: remote.status,
        data: {
          object: {
            documentId: remote.documentId,
            templateId: remote.templateId,
            status: remote.status,
            completedAt: remote.completedAt,
          },
        },
      },
      rawBody: JSON.stringify({ documentId: remote.documentId, status: remote.status }),
      headerEventType: eventToken,
    });

    await projectDocumentEvent(event);
  } catch (error) {
    if (isBoldSignNotFoundError(error)) {
      const createdAtMs = operation.createdAt?.getTime() ?? 0;
      const ageMs = Date.now() - createdAtMs;
      if (ageMs > 10 * 60 * 1000) {
        await updateBoldSignOperationById(operation.id, {
          status: BOLDSIGN_OPERATION_STATUSES.FAILED_RETRYABLE,
          lastError: 'Document is not yet available in BoldSign.',
        });
      }
      return;
    }

    await updateBoldSignOperationById(operation.id, {
      status: BOLDSIGN_OPERATION_STATUSES.FAILED_RETRYABLE,
      lastError: error instanceof Error ? error.message : 'Failed to reconcile document operation.',
    });
  }
};

const isOperationPending = (status: BoldSignOperationStatus): boolean => {
  return status === BOLDSIGN_OPERATION_STATUSES.PENDING_WEBHOOK
    || status === BOLDSIGN_OPERATION_STATUSES.PENDING_RECONCILE
    || status === BOLDSIGN_OPERATION_STATUSES.FAILED_RETRYABLE;
};

export const reconcileBoldSignOperations = async (params?: {
  limit?: number;
  operationId?: string;
  includeConfirmed?: boolean;
}) => {
  const statuses: BoldSignOperationStatus[] | undefined = params?.includeConfirmed
    ? [
      BOLDSIGN_OPERATION_STATUSES.PENDING_WEBHOOK,
      BOLDSIGN_OPERATION_STATUSES.PENDING_RECONCILE,
      BOLDSIGN_OPERATION_STATUSES.FAILED_RETRYABLE,
      BOLDSIGN_OPERATION_STATUSES.CONFIRMED,
    ]
    : undefined;
  const candidates = await listBoldSignOperationsForReconcile({
    limit: params?.limit,
    operationId: params?.operationId,
    statuses,
  });

  const now = new Date();
  const results = {
    scanned: 0,
    confirmed: 0,
    timedOut: 0,
    failed: 0,
  };

  for (const operation of candidates) {
    if (params?.operationId && operation.id !== params.operationId) {
      continue;
    }

    results.scanned += 1;

    const isPending = isOperationPending(operation.status);
    const isConfirmedDocumentReplay = Boolean(
      params?.includeConfirmed
      && operation.status === BOLDSIGN_OPERATION_STATUSES.CONFIRMED
      && operation.operationType === BOLDSIGN_OPERATION_TYPES.DOCUMENT_SEND,
    );

    if (!isPending && !isConfirmedDocumentReplay) {
      continue;
    }

    if (isPending) {
      const expiresAt = operation.expiresAt;
      if (expiresAt && expiresAt.getTime() <= now.getTime()) {
        await updateBoldSignOperationById(operation.id, {
          status: BOLDSIGN_OPERATION_STATUSES.TIMED_OUT,
          lastError: operation.lastError ?? 'BoldSign synchronization timed out.',
          completedAt: now,
        });
        results.timedOut += 1;
        continue;
      }
    }

    try {
      if (operation.operationType === BOLDSIGN_OPERATION_TYPES.TEMPLATE_CREATE) {
        await reconcileTemplateCreateOperation(operation);
      } else if (operation.operationType === BOLDSIGN_OPERATION_TYPES.TEMPLATE_DELETE) {
        await reconcileTemplateDeleteOperation(operation);
      } else if (operation.operationType === BOLDSIGN_OPERATION_TYPES.DOCUMENT_SEND) {
        await reconcileDocumentSendOperation(operation);
      }

      const refreshed = await getBoldSignOperationById(operation.id);
      if (refreshed?.status === BOLDSIGN_OPERATION_STATUSES.CONFIRMED) {
        results.confirmed += 1;
      }
      if (refreshed?.status === BOLDSIGN_OPERATION_STATUSES.FAILED || refreshed?.status === BOLDSIGN_OPERATION_STATUSES.FAILED_RETRYABLE) {
        results.failed += 1;
      }
    } catch (error) {
      await updateBoldSignOperationById(operation.id, {
        status: BOLDSIGN_OPERATION_STATUSES.FAILED_RETRYABLE,
        lastError: error instanceof Error ? error.message : 'Failed to reconcile BoldSign operation.',
      });
      results.failed += 1;
    }
  }

  return results;
};

export const isAuthEventType = (eventType: string): boolean => {
  return AUTH_EVENT_TYPES.has(normalizeEventToken(eventType));
};

export const isVerificationEvent = (eventTypeHeader: string | null, eventType: string): boolean => {
  const headerToken = normalizeEventToken(eventTypeHeader);
  if (headerToken === 'verification') {
    return true;
  }
  return normalizeEventToken(eventType) === 'verification';
};

export const shouldProcessBoldSignEvent = (eventType: string): boolean => {
  const token = normalizeEventToken(eventType);
  if (!token) {
    return false;
  }
  if (AUTH_EVENT_TYPES.has(token)) {
    return false;
  }
  return TEMPLATE_EVENT_TYPES.has(token) || DOCUMENT_EVENT_TYPES.has(token);
};

export const buildFallbackBoldSignEventId = (payload: JsonRecord, rawBody: string): string => {
  return pickString(payload.id, payload.eventId) ?? hashPayload(rawBody);
};

export const extractSignerRoleFromPayload = (payload: JsonRecord): string | null => {
  const data = asRecord(payload.data) ?? asRecord(payload.Data) ?? null;
  const object = asRecord(data?.object) ?? asRecord(data?.Object) ?? null;
  return pickString(
    object?.signerRole,
    object?.SignerRole,
    payload.signerRole,
    payload.SignerRole,
  );
};

export const createDocumentSendOperation = async (params: {
  idempotencyKey: string;
  organizationId?: string | null;
  eventId?: string | null;
  teamId?: string | null;
  templateDocumentId?: string | null;
  templateId?: string | null;
  documentId: string;
  userId?: string | null;
  childUserId?: string | null;
  signerRole?: string | null;
  signerEmail?: string | null;
  roleIndex?: number | null;
  payload?: JsonRecord;
}) => {
  return createOrUpdateBoldSignOperation({
    operationType: BOLDSIGN_OPERATION_TYPES.DOCUMENT_SEND,
    status: BOLDSIGN_OPERATION_STATUSES.PENDING_WEBHOOK,
    idempotencyKey: params.idempotencyKey,
    organizationId: params.organizationId ?? null,
    eventId: params.eventId ?? null,
    teamId: params.teamId ?? null,
    templateDocumentId: params.templateDocumentId ?? null,
    templateId: params.templateId ?? null,
    documentId: params.documentId,
    userId: params.userId ?? null,
    childUserId: params.childUserId ?? null,
    signerRole: params.signerRole ?? null,
    signerEmail: params.signerEmail ?? null,
    roleIndex: params.roleIndex ?? null,
    payload: params.payload,
    expiresAt: new Date(Date.now() + BOLDSIGN_SYNC_TIMEOUT_MS),
  });
};
