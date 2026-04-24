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
import { normalizeRequiredSignerType, type SignerContext } from '@/lib/templateSignerTypes';

type PrismaLike = any;

export type TeamRegistrationRegistrantType = 'SELF' | 'CHILD';

type TeamTemplateRecord = {
  id: string;
  organizationId?: string | null;
  title?: string | null;
  description?: string | null;
  type?: string | null;
  signOnce?: boolean | null;
  requiredSignerType?: string | null;
  templateId?: string | null;
  roleIndex?: number | null;
  roleIndexes?: number[] | null;
  signerRoles?: string[] | null;
  content?: string | null;
};

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

export type TeamRegistrationSignatureState = {
  teamId: string;
  organizationId: string | null;
  registrationPriceCents: number;
  requiredTemplateIds: string[];
  eligibleTemplateIds: string[];
  missingTemplateIds: string[];
  missingTemplateLabels: string[];
  missingChildEmail: boolean;
  hasCompletedRequiredSignatures: boolean;
  consentStatus: string | null;
};

export type DispatchRequiredTeamDocumentsParams = {
  teamId: string;
  organizationId?: string | null;
  requiredTemplateIds: string[];
  participantUserId?: string | null;
  parentUserId?: string | null;
  childUserId?: string | null;
};

export type DispatchRequiredTeamDocumentsResult = {
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

const isSignedDocumentStatus = (value: unknown): boolean => {
  const normalized = normalizeText(value)?.toLowerCase();
  return normalized === 'signed' || normalized === 'completed';
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

const normalizeTemplateIds = (value: unknown): string[] => (
  Array.from(new Set(
    (Array.isArray(value) ? value : [])
      .map((entry) => normalizeText(entry))
      .filter((entry): entry is string => Boolean(entry)),
  ))
);

const filterEligibleTemplateIds = (
  requiredTemplateIds: string[],
  templatesById: Map<string, TeamTemplateRecord>,
  registrantType: TeamRegistrationRegistrantType,
): string[] => {
  return requiredTemplateIds.filter((templateId) => {
    const template = templatesById.get(templateId);
    if (!template) {
      return false;
    }
    const requiredSignerType = normalizeRequiredSignerType(template.requiredSignerType);
    if (registrantType === 'CHILD') {
      return requiredSignerType !== 'PARTICIPANT';
    }
    return requiredSignerType === 'PARTICIPANT';
  });
};

export const loadRequiredTeamTemplates = async (
  teamId: string,
  client: PrismaLike = prisma,
): Promise<{
  teamId: string;
  organizationId: string | null;
  registrationPriceCents: number;
  requiredTemplateIds: string[];
  templates: TeamTemplateRecord[];
  templatesById: Map<string, TeamTemplateRecord>;
}> => {
  const team = await client.canonicalTeams.findUnique({
    where: { id: teamId },
    select: {
      id: true,
      organizationId: true,
      registrationPriceCents: true,
      requiredTemplateIds: true,
    },
  });
  if (!team) {
    throw new Error('Team not found.');
  }

  const requiredTemplateIds = normalizeTemplateIds(team.requiredTemplateIds);
  const templates = requiredTemplateIds.length
    ? await client.templateDocuments.findMany({
      where: { id: { in: requiredTemplateIds } },
      select: {
        id: true,
        organizationId: true,
        title: true,
        description: true,
        type: true,
        signOnce: true,
        requiredSignerType: true,
        templateId: true,
        roleIndex: true,
        roleIndexes: true,
        signerRoles: true,
        content: true,
      },
    })
    : [];

  return {
    teamId: team.id,
    organizationId: normalizeText(team.organizationId),
    registrationPriceCents: Math.max(0, Math.round(Number(team.registrationPriceCents ?? 0))),
    requiredTemplateIds,
    templates,
    templatesById: new Map(templates.map((template: TeamTemplateRecord) => [template.id, template])),
  };
};

export const getTeamRegistrationSignatureState = async (params: {
  teamId: string;
  registrantId: string;
  registrantType: TeamRegistrationRegistrantType;
  parentId?: string | null;
  client?: PrismaLike;
}): Promise<TeamRegistrationSignatureState> => {
  const client = params.client ?? prisma;
  const registrantId = normalizeText(params.registrantId);
  const parentId = normalizeText(params.parentId);
  if (!registrantId) {
    throw new Error('Registrant id is required.');
  }

  const teamTemplates = await loadRequiredTeamTemplates(params.teamId, client);
  const eligibleTemplateIds = filterEligibleTemplateIds(
    teamTemplates.requiredTemplateIds,
    teamTemplates.templatesById,
    params.registrantType,
  );

  if (!eligibleTemplateIds.length) {
    return {
      teamId: teamTemplates.teamId,
      organizationId: teamTemplates.organizationId,
      registrationPriceCents: teamTemplates.registrationPriceCents,
      requiredTemplateIds: teamTemplates.requiredTemplateIds,
      eligibleTemplateIds,
      missingTemplateIds: [],
      missingTemplateLabels: [],
      missingChildEmail: false,
      hasCompletedRequiredSignatures: true,
      consentStatus: null,
    };
  }

  if (params.registrantType === 'SELF') {
    const participantTemplates = eligibleTemplateIds
      .map((templateId) => teamTemplates.templatesById.get(templateId))
      .filter((template): template is TeamTemplateRecord => Boolean(template));
    const signOnceTemplateIds = participantTemplates
      .filter((template) => template.signOnce === true)
      .map((template) => template.id);
    const teamScopedTemplateIds = participantTemplates
      .filter((template) => template.signOnce !== true)
      .map((template) => template.id);

    const signedRows = (signOnceTemplateIds.length || teamScopedTemplateIds.length)
      ? await client.signedDocuments.findMany({
        where: {
          userId: registrantId,
          signerRole: 'participant',
          OR: [
            ...(signOnceTemplateIds.length
              ? [{ templateId: { in: signOnceTemplateIds } }]
              : []),
            ...(teamScopedTemplateIds.length
              ? [{ templateId: { in: teamScopedTemplateIds }, teamId: params.teamId }]
              : []),
          ],
        },
        select: {
          templateId: true,
          status: true,
        },
      })
      : [];

    const signedTemplateIds = new Set(
      signedRows
        .filter((row: { status?: string | null }) => isSignedDocumentStatus(row.status))
        .map((row: { templateId: string }) => row.templateId),
    );
    const missingTemplateIds = eligibleTemplateIds.filter((templateId) => !signedTemplateIds.has(templateId));
    return {
      teamId: teamTemplates.teamId,
      organizationId: teamTemplates.organizationId,
      registrationPriceCents: teamTemplates.registrationPriceCents,
      requiredTemplateIds: teamTemplates.requiredTemplateIds,
      eligibleTemplateIds,
      missingTemplateIds,
      missingTemplateLabels: missingTemplateIds.map((templateId) => (
        normalizeText(teamTemplates.templatesById.get(templateId)?.title) ?? templateId
      )),
      missingChildEmail: false,
      hasCompletedRequiredSignatures: missingTemplateIds.length === 0,
      consentStatus: missingTemplateIds.length === 0 ? 'completed' : 'sent',
    };
  }

  const parentTemplateIds = new Set<string>();
  const childTemplateIds = new Set<string>();
  const signOnceTemplateIds = new Set<string>();
  const teamScopedTemplateIds = new Set<string>();

  eligibleTemplateIds.forEach((templateId) => {
    const template = teamTemplates.templatesById.get(templateId);
    if (!template) {
      return;
    }
    const signerType = normalizeRequiredSignerType(template.requiredSignerType);
    if (signerType === 'PARENT_GUARDIAN' || signerType === 'PARENT_GUARDIAN_CHILD') {
      parentTemplateIds.add(template.id);
    }
    if (signerType === 'CHILD' || signerType === 'PARENT_GUARDIAN_CHILD') {
      childTemplateIds.add(template.id);
    }
    if (template.signOnce) {
      signOnceTemplateIds.add(template.id);
    } else {
      teamScopedTemplateIds.add(template.id);
    }
  });

  let childEmail: string | undefined;
  if (childTemplateIds.size > 0) {
    const childSensitive = await client.sensitiveUserData.findFirst({
      where: { userId: registrantId },
      select: { email: true },
    });
    childEmail = normalizeEmail(childSensitive?.email) ?? undefined;
  }

  const templateScopeFilters: Array<Record<string, unknown>> = [];
  if (signOnceTemplateIds.size > 0) {
    templateScopeFilters.push({
      templateId: { in: Array.from(signOnceTemplateIds) },
    });
  }
  if (teamScopedTemplateIds.size > 0) {
    templateScopeFilters.push({
      templateId: { in: Array.from(teamScopedTemplateIds) },
      teamId: params.teamId,
    });
  }

  const signedRowsWhere: Record<string, unknown> = {
    OR: [
      ...(parentId ? [{
        userId: parentId,
        signerRole: 'parent_guardian',
        hostId: registrantId,
      }] : []),
      {
        userId: registrantId,
        signerRole: 'child',
        hostId: registrantId,
      },
    ],
  };
  if (templateScopeFilters.length === 1) {
    Object.assign(signedRowsWhere, templateScopeFilters[0]);
  } else if (templateScopeFilters.length > 1) {
    signedRowsWhere.AND = [{ OR: templateScopeFilters }];
  } else {
    signedRowsWhere.templateId = { in: eligibleTemplateIds };
  }

  const signedRows = await client.signedDocuments.findMany({
    where: signedRowsWhere,
    select: {
      templateId: true,
      status: true,
      userId: true,
      signerRole: true,
    },
  });

  const parentSignedTemplates = new Set<string>();
  const childSignedTemplates = new Set<string>();
  signedRows.forEach((row: { templateId: string; status?: string | null; userId?: string | null; signerRole?: string | null }) => {
    if (!isSignedDocumentStatus(row.status)) {
      return;
    }
    if (parentId && row.userId === parentId && row.signerRole === 'parent_guardian') {
      parentSignedTemplates.add(row.templateId);
    }
    if (row.userId === registrantId && row.signerRole === 'child') {
      childSignedTemplates.add(row.templateId);
    }
  });

  const missingTemplateIds = eligibleTemplateIds.filter((templateId) => {
    if (parentTemplateIds.has(templateId) && !parentSignedTemplates.has(templateId)) {
      return true;
    }
    if (childTemplateIds.has(templateId) && !childSignedTemplates.has(templateId)) {
      return true;
    }
    return false;
  });
  const parentComplete = Array.from(parentTemplateIds).every((templateId) => parentSignedTemplates.has(templateId));
  const childComplete = Array.from(childTemplateIds).every((templateId) => childSignedTemplates.has(templateId));
  const consentComplete = missingTemplateIds.length === 0;

  let consentStatus = 'sent';
  if (childTemplateIds.size > 0 && !childEmail) {
    consentStatus = 'child_email_required';
  } else if (consentComplete) {
    consentStatus = 'completed';
  } else if (childTemplateIds.size > 0 && !childComplete) {
    if (parentTemplateIds.size > 0 && parentComplete) {
      consentStatus = 'parentSigned';
    } else if (parentTemplateIds.size > 0 && !parentComplete) {
      consentStatus = 'guardian_approval_required';
    }
  } else if (parentTemplateIds.size > 0 && !parentComplete) {
    if (childTemplateIds.size > 0 && childComplete) {
      consentStatus = 'childSigned';
    } else {
      consentStatus = 'guardian_approval_required';
    }
  }

  return {
    teamId: teamTemplates.teamId,
    organizationId: teamTemplates.organizationId,
    registrationPriceCents: teamTemplates.registrationPriceCents,
    requiredTemplateIds: teamTemplates.requiredTemplateIds,
    eligibleTemplateIds,
    missingTemplateIds,
    missingTemplateLabels: missingTemplateIds.map((templateId) => (
      normalizeText(teamTemplates.templatesById.get(templateId)?.title) ?? templateId
    )),
    missingChildEmail: childTemplateIds.size > 0 && !childEmail,
    hasCompletedRequiredSignatures: consentComplete,
    consentStatus,
  };
};

const buildDispatchScopeKey = (params: {
  teamId: string;
  templateDocumentId: string;
  requiredSignerType: ReturnType<typeof normalizeRequiredSignerType>;
  participantUserId?: string | null;
  parentUserId?: string | null;
  childUserId?: string | null;
}): string => {
  return [
    'team-registration-send',
    params.teamId,
    params.templateDocumentId,
    params.requiredSignerType,
    params.participantUserId ?? '',
    params.parentUserId ?? '',
    params.childUserId ?? '',
  ].join(':');
};

export const dispatchRequiredTeamDocuments = async (
  params: DispatchRequiredTeamDocumentsParams,
): Promise<DispatchRequiredTeamDocumentsResult> => {
  const requiredTemplateIds = normalizeTemplateIds(params.requiredTemplateIds);
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
      // Fall back to stored role metadata.
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
      teamId: params.teamId,
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
        teamId: params.teamId,
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
          dispatchSource: 'team_registration',
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

export const syncTeamRegistrationConsentStatus = async (params: {
  teamId?: string | null;
  registrantId?: string | null;
  parentUserId?: string | null;
  client?: PrismaLike;
}) => {
  const client = params.client ?? prisma;
  const teamId = normalizeText(params.teamId);
  const registrantId = normalizeText(params.registrantId);
  if (!teamId || !registrantId) {
    return;
  }

  const registration = await client.teamRegistrations.findFirst({
    where: {
      teamId,
      userId: registrantId,
      status: { in: ['STARTED', 'ACTIVE'] },
      ...(normalizeText(params.parentUserId) ? { parentId: normalizeText(params.parentUserId) } : {}),
    },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      status: true,
      parentId: true,
      registrantType: true,
    },
  });
  if (!registration) {
    return;
  }

  const registrantType = normalizeText(registration.registrantType)?.toUpperCase() === 'CHILD' ? 'CHILD' : 'SELF';
  const signatureState = await getTeamRegistrationSignatureState({
    teamId,
    registrantId,
    registrantType,
    parentId: normalizeText(registration.parentId),
    client,
  });

  const nextStatus = registration.status === 'ACTIVE'
    ? 'ACTIVE'
    : signatureState.hasCompletedRequiredSignatures && signatureState.registrationPriceCents <= 0
      ? 'ACTIVE'
      : 'STARTED';

  await client.teamRegistrations.update({
    where: { id: registration.id },
    data: {
      status: nextStatus,
      consentStatus: signatureState.consentStatus,
      updatedAt: new Date(),
    },
  });
};

export const syncAllTeamRegistrationConsentStatusesForRegistrant = async (params: {
  registrantId?: string | null;
  client?: PrismaLike;
}) => {
  const client = params.client ?? prisma;
  const registrantId = normalizeText(params.registrantId);
  if (!registrantId) {
    return;
  }

  const registrations = await client.teamRegistrations.findMany({
    where: {
      userId: registrantId,
      status: { in: ['STARTED', 'ACTIVE'] },
    },
    select: {
      teamId: true,
      userId: true,
      parentId: true,
    },
  });

  const seen = new Set<string>();
  for (const registration of registrations) {
    const teamId = normalizeText(registration.teamId);
    const userId = normalizeText(registration.userId);
    if (!teamId || !userId) {
      continue;
    }
    const key = `${teamId}:${userId}:${normalizeText(registration.parentId) ?? ''}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    await syncTeamRegistrationConsentStatus({
      teamId,
      registrantId: userId,
      parentUserId: normalizeText(registration.parentId),
      client,
    });
  }
};
