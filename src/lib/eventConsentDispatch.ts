import { prisma } from '@/lib/prisma';
import {
  getTemplateRoles,
  isBoldSignConfigured,
  sendDocumentFromTemplate,
  type BoldSignTemplateRole,
} from '@/lib/boldsignServer';
import { createDocumentSendOperation } from '@/lib/boldsignWebhookSync';
import {
  BOLDSIGN_OPERATION_STATUSES,
  findLatestBoldSignOperation,
} from '@/lib/boldsignSyncOperations';
import { normalizeRequiredSignerType } from '@/lib/templateSignerTypes';

type SignerContext = 'participant' | 'parent_guardian' | 'child';

type SignerIdentity = {
  userId: string;
  email?: string;
  name: string;
};

type RoleAssignment = {
  roleIndex: number;
  signerRole: string;
  signerContext: SignerContext;
  signerEmail: string;
  signerName: string;
  userId: string;
  signerOrder?: number;
};

export type DispatchRequiredEventDocumentsParams = {
  eventId: string;
  organizationId?: string | null;
  requiredTemplateIds: string[];
  participantUserId?: string | null;
  parentUserId?: string | null;
  childUserId?: string | null;
};

export type DispatchRequiredEventDocumentsResult = {
  sentDocumentIds: string[];
  firstDocumentId: string | null;
  missingChildEmail: boolean;
  errors: string[];
};

const normalizeText = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeEmail = (value: unknown): string | null => {
  const normalized = normalizeText(value)?.toLowerCase() ?? null;
  if (!normalized || !normalized.includes('@')) {
    return null;
  }
  return normalized;
};

const normalizeRoleToken = (value: string | undefined): string => {
  return (value ?? '').trim().toLowerCase().replace(/[^a-z]/g, '');
};

const roleMatchesSignerContext = (signerRole: string | undefined, signerContext: SignerContext): boolean => {
  const token = normalizeRoleToken(signerRole);
  if (!token) {
    return false;
  }

  if (signerContext === 'child') {
    return token.includes('child');
  }
  if (signerContext === 'parent_guardian') {
    return token.includes('parent') || token.includes('guardian');
  }
  return token.includes('participant') || token.includes('player') || token.includes('self');
};

const templateRolesCoverRequiredSignerType = (
  roles: Array<{ roleIndex: number; signerRole: string }>,
  requiredSignerType: unknown,
): boolean => {
  if (!roles.length) {
    return false;
  }

  const normalizedRequiredSignerType = normalizeRequiredSignerType(requiredSignerType);
  switch (normalizedRequiredSignerType) {
    case 'PARENT_GUARDIAN':
      return roles.some((role) => roleMatchesSignerContext(role.signerRole, 'parent_guardian'));
    case 'CHILD':
      return roles.some((role) => roleMatchesSignerContext(role.signerRole, 'child'));
    case 'PARENT_GUARDIAN_CHILD':
      return roles.some((role) => roleMatchesSignerContext(role.signerRole, 'parent_guardian'))
        && roles.some((role) => roleMatchesSignerContext(role.signerRole, 'child'));
    case 'PARTICIPANT':
    default:
      return roles.some((role) => roleMatchesSignerContext(role.signerRole, 'participant'));
  }
};

const pickRoleForSignerContext = (
  roles: Array<{ roleIndex: number; signerRole: string }>,
  signerContext: SignerContext,
): { roleIndex: number; signerRole: string } => {
  return roles.find((role) => roleMatchesSignerContext(role.signerRole, signerContext))
    ?? roles[0]
    ?? { roleIndex: 1, signerRole: 'Participant' };
};

const toRolesFromTemplateRecord = (template: {
  roleIndex?: number | null;
  roleIndexes?: number[] | null;
  signerRoles?: string[] | null;
}): BoldSignTemplateRole[] => {
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

const resolveSignerIdentity = async (
  userId: string,
  cache: Map<string, Promise<SignerIdentity>>,
): Promise<SignerIdentity> => {
  const cached = cache.get(userId);
  if (cached) {
    return cached;
  }

  const promise = (async () => {
    const [profile, sensitive, auth] = await Promise.all([
      prisma.userData.findUnique({
        where: { id: userId },
        select: {
          firstName: true,
          lastName: true,
          userName: true,
        },
      }),
      prisma.sensitiveUserData.findFirst({
        where: { userId },
        select: { email: true },
      }),
      prisma.authUser.findUnique({
        where: { id: userId },
        select: { email: true },
      }),
    ]);

    const email = normalizeEmail(sensitive?.email) ?? normalizeEmail(auth?.email) ?? undefined;
    const fullName = `${normalizeText(profile?.firstName) ?? ''} ${normalizeText(profile?.lastName) ?? ''}`.trim();
    const name = fullName
      || normalizeText(profile?.userName)
      || email?.split('@')[0]
      || userId;

    return {
      userId,
      email,
      name,
    };
  })();

  cache.set(userId, promise);
  return promise;
};

const getRequiredContexts = (requiredSignerType: ReturnType<typeof normalizeRequiredSignerType>): SignerContext[] => {
  switch (requiredSignerType) {
    case 'PARENT_GUARDIAN':
      return ['parent_guardian'];
    case 'CHILD':
      return ['child'];
    case 'PARENT_GUARDIAN_CHILD':
      return ['parent_guardian', 'child'];
    case 'PARTICIPANT':
    default:
      return ['participant'];
  }
};

const buildDispatchScopeKey = (params: {
  eventId: string;
  templateDocumentId: string;
  requiredSignerType: ReturnType<typeof normalizeRequiredSignerType>;
  participantUserId?: string | null;
  parentUserId?: string | null;
  childUserId?: string | null;
}): string => {
  const participantToken = params.participantUserId ?? '';
  const parentToken = params.parentUserId ?? '';
  const childToken = params.childUserId ?? '';
  return [
    'registration-send',
    params.eventId,
    params.templateDocumentId,
    params.requiredSignerType,
    participantToken,
    parentToken,
    childToken,
  ].join(':');
};

export const dispatchRequiredEventDocuments = async (
  params: DispatchRequiredEventDocumentsParams,
): Promise<DispatchRequiredEventDocumentsResult> => {
  const requiredTemplateIds = Array.from(new Set(
    params.requiredTemplateIds
      .map((templateId) => normalizeText(templateId))
      .filter((templateId): templateId is string => Boolean(templateId)),
  ));

  if (!requiredTemplateIds.length) {
    return {
      sentDocumentIds: [],
      firstDocumentId: null,
      missingChildEmail: false,
      errors: [],
    };
  }

  if (!isBoldSignConfigured()) {
    return {
      sentDocumentIds: [],
      firstDocumentId: null,
      missingChildEmail: false,
      errors: ['BoldSign is not configured on the server. Set BOLDSIGN_API_KEY.'],
    };
  }

  const isChildRegistration = Boolean(normalizeText(params.childUserId));
  const participantUserId = normalizeText(params.participantUserId) ?? null;
  const parentUserId = normalizeText(params.parentUserId) ?? null;
  const childUserId = normalizeText(params.childUserId) ?? null;
  const identityCache = new Map<string, Promise<SignerIdentity>>();
  const sentDocumentIds: string[] = [];
  const errors: string[] = [];
  let missingChildEmail = false;

  const templates = await prisma.templateDocuments.findMany({
    where: { id: { in: requiredTemplateIds } },
    select: {
      id: true,
      templateId: true,
      title: true,
      description: true,
      type: true,
      requiredSignerType: true,
      roleIndex: true,
      roleIndexes: true,
      signerRoles: true,
    },
  });
  const templateById = new Map(templates.map((template) => [template.id, template]));

  for (const templateId of requiredTemplateIds) {
    const template = templateById.get(templateId);
    if (!template) {
      continue;
    }

    const templateType = normalizeText(template.type)?.toUpperCase();
    if (templateType !== 'PDF') {
      continue;
    }

    const boldSignTemplateId = normalizeText(template.templateId);
    if (!boldSignTemplateId) {
      errors.push(`Template "${template.title}" is missing a BoldSign template id.`);
      continue;
    }

    const requiredSignerType = normalizeRequiredSignerType(template.requiredSignerType);
    if (isChildRegistration && requiredSignerType === 'PARTICIPANT') {
      continue;
    }
    if (!isChildRegistration && requiredSignerType !== 'PARTICIPANT') {
      continue;
    }

    const requiredContexts = getRequiredContexts(requiredSignerType);
    const identitiesByContext = new Map<SignerContext, SignerIdentity>();

    let identityError: string | null = null;
    for (const signerContext of requiredContexts) {
      const targetUserId = signerContext === 'participant'
        ? participantUserId
        : signerContext === 'parent_guardian'
          ? parentUserId
          : childUserId;
      if (!targetUserId) {
        identityError = `Missing ${signerContext.replace('_', '/')} signer user id for template "${template.title}".`;
        break;
      }

      const signerIdentity = await resolveSignerIdentity(targetUserId, identityCache);
      if (!signerIdentity.email) {
        if (signerContext === 'child') {
          missingChildEmail = true;
          identityError = null;
          break;
        }
        identityError = `Missing ${signerContext.replace('_', '/')} signer email for template "${template.title}".`;
        break;
      }
      identitiesByContext.set(signerContext, signerIdentity);
    }

    if (identityError) {
      errors.push(identityError);
      continue;
    }
    if (requiredContexts.some((context) => !identitiesByContext.has(context))) {
      continue;
    }

    const rolesFromDb = toRolesFromTemplateRecord(template);
    let templateRoles = rolesFromDb;
    try {
      const rolesFromBoldSign = await getTemplateRoles(boldSignTemplateId);
      if (
        rolesFromBoldSign.length > 0
        && (
          templateRolesCoverRequiredSignerType(rolesFromBoldSign, requiredSignerType)
          || !templateRolesCoverRequiredSignerType(rolesFromDb, requiredSignerType)
        )
      ) {
        templateRoles = rolesFromBoldSign;
      }
    } catch {
      // Use the template role metadata stored in DB as fallback.
    }

    const roleAssignments: RoleAssignment[] = requiredContexts.map((signerContext) => {
      const identity = identitiesByContext.get(signerContext) as SignerIdentity;
      const selectedRole = pickRoleForSignerContext(templateRoles, signerContext);
      return {
        roleIndex: selectedRole.roleIndex,
        signerRole: selectedRole.signerRole,
        signerContext,
        signerEmail: identity.email as string,
        signerName: identity.name,
        userId: identity.userId,
      };
    });

    const scopeKey = buildDispatchScopeKey({
      eventId: params.eventId,
      templateDocumentId: template.id,
      requiredSignerType,
      participantUserId,
      parentUserId,
      childUserId,
    });
    const existingOperation = await findLatestBoldSignOperation({ idempotencyKey: scopeKey });
    const existingDocumentId = normalizeText(existingOperation?.documentId);
    const reusableExistingOperation = Boolean(
      existingDocumentId
      && existingOperation?.status !== BOLDSIGN_OPERATION_STATUSES.FAILED
      && existingOperation?.status !== BOLDSIGN_OPERATION_STATUSES.TIMED_OUT,
    );
    if (reusableExistingOperation && existingDocumentId) {
      sentDocumentIds.push(existingDocumentId);
      continue;
    }

    const hasDuplicateSignerEmails = new Set(
      roleAssignments.map((row) => row.signerEmail.toLowerCase()),
    ).size !== roleAssignments.length;
    const roleAssignmentsForSend = hasDuplicateSignerEmails
      ? roleAssignments.map((role, index) => ({
        ...role,
        signerOrder: role.signerContext === 'parent_guardian'
          ? 1
          : role.signerContext === 'child'
            ? 2
            : index + 1,
      }))
      : roleAssignments;
    const selectedRoleAssignment = roleAssignmentsForSend.find((row) => row.signerContext === 'participant')
      ?? roleAssignmentsForSend.find((row) => row.signerContext === 'parent_guardian')
      ?? roleAssignmentsForSend[0];

    if (!selectedRoleAssignment) {
      errors.push(`Failed to resolve signer assignments for template "${template.title}".`);
      continue;
    }

    try {
      const sent = await sendDocumentFromTemplate({
        templateId: boldSignTemplateId,
        signerEmail: selectedRoleAssignment.signerEmail,
        signerName: selectedRoleAssignment.signerName,
        roleIndex: selectedRoleAssignment.roleIndex,
        signerRole: selectedRoleAssignment.signerRole,
        roles: roleAssignmentsForSend.map((row) => ({
          roleIndex: row.roleIndex,
          signerEmail: row.signerEmail,
          signerName: row.signerName,
          signerRole: row.signerRole,
          signerOrder: row.signerOrder,
        })),
        enableSigningOrder: hasDuplicateSignerEmails,
        title: normalizeText(template.title) ?? 'Signature request',
        message: normalizeText(template.description) ?? undefined,
      });

      await createDocumentSendOperation({
        idempotencyKey: scopeKey,
        organizationId: params.organizationId ?? null,
        eventId: params.eventId,
        templateDocumentId: template.id,
        templateId: boldSignTemplateId,
        documentId: sent.documentId,
        userId: selectedRoleAssignment.userId,
        childUserId,
        signerRole: selectedRoleAssignment.signerContext,
        signerEmail: selectedRoleAssignment.signerEmail,
        roleIndex: selectedRoleAssignment.roleIndex,
        payload: {
          templateDocumentId: template.id,
          templateTitle: template.title,
          requiredSignerType,
          dispatchSource: 'registration',
          roleAssignments: roleAssignmentsForSend.map((row) => ({
            roleIndex: row.roleIndex,
            signerRole: row.signerRole,
            signerContext: row.signerContext,
            signerEmail: row.signerEmail,
            signerName: row.signerName,
            userId: row.userId,
            signerOrder: row.signerOrder,
          })),
        },
      });

      sentDocumentIds.push(sent.documentId);
    } catch (error) {
      errors.push(
        `Failed to send "${template.title}": ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  return {
    sentDocumentIds,
    firstDocumentId: sentDocumentIds[0] ?? null,
    missingChildEmail,
    errors,
  };
};
