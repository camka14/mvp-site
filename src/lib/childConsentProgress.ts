import { prisma } from '@/lib/prisma';
import { normalizeRequiredSignerType } from '@/lib/templateSignerTypes';

const normalizeText = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const isSignedDocumentStatus = (value: unknown): boolean => {
  const normalized = normalizeText(value)?.toLowerCase();
  return normalized === 'signed' || normalized === 'completed';
};

export const syncChildRegistrationConsentStatus = async (params: {
  eventId?: string | null;
  childUserId?: string | null;
  parentUserId?: string | null;
}) => {
  const eventId = normalizeText(params.eventId);
  const childUserId = normalizeText(params.childUserId);
  if (!eventId || !childUserId) {
    return;
  }

  const registration = await prisma.eventRegistrations.findFirst({
    where: {
      eventId,
      registrantId: childUserId,
      registrantType: 'CHILD',
      status: { in: ['PENDINGCONSENT', 'ACTIVE'] },
      ...(normalizeText(params.parentUserId) ? { parentId: normalizeText(params.parentUserId) } : {}),
    },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      parentId: true,
    },
  });
  if (!registration?.parentId) {
    return;
  }

  const event = await prisma.events.findUnique({
    where: { id: eventId },
    select: { requiredTemplateIds: true },
  });
  if (!event) {
    return;
  }

  const requiredTemplateIds = Array.isArray(event.requiredTemplateIds)
    ? event.requiredTemplateIds.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    : [];

  if (!requiredTemplateIds.length) {
    await prisma.eventRegistrations.update({
      where: { id: registration.id },
      data: {
        status: 'ACTIVE',
        consentStatus: 'completed',
        updatedAt: new Date(),
      },
    });
    return;
  }

  const templates = await prisma.templateDocuments.findMany({
    where: { id: { in: requiredTemplateIds } },
    select: {
      id: true,
      requiredSignerType: true,
      signOnce: true,
    },
  });
  const requiredTemplateSet = new Set(requiredTemplateIds);
  const parentTemplateIds = new Set<string>();
  const childTemplateIds = new Set<string>();
  const signOnceTemplateIds = new Set<string>();
  const eventScopedTemplateIds = new Set<string>();

  templates.forEach((template) => {
    if (!requiredTemplateSet.has(template.id)) {
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
      eventScopedTemplateIds.add(template.id);
    }
  });

  const relevantTemplateIds = Array.from(new Set([
    ...parentTemplateIds,
    ...childTemplateIds,
  ]));
  if (!relevantTemplateIds.length) {
    await prisma.eventRegistrations.update({
      where: { id: registration.id },
      data: {
        status: 'ACTIVE',
        consentStatus: 'completed',
        updatedAt: new Date(),
      },
    });
    return;
  }

  const templateScopeFilters: Array<Record<string, unknown>> = [];
  if (signOnceTemplateIds.size > 0) {
    templateScopeFilters.push({
      templateId: { in: Array.from(signOnceTemplateIds) },
    });
  }
  if (eventScopedTemplateIds.size > 0) {
    templateScopeFilters.push({
      templateId: { in: Array.from(eventScopedTemplateIds) },
      eventId,
    });
  }

  const signedRowsWhere: Record<string, unknown> = {
    OR: [
      {
        userId: registration.parentId,
        signerRole: 'parent_guardian',
        hostId: childUserId,
      },
      {
        userId: childUserId,
        signerRole: 'child',
        hostId: childUserId,
      },
    ],
  };
  if (templateScopeFilters.length === 1) {
    Object.assign(signedRowsWhere, templateScopeFilters[0]);
  } else if (templateScopeFilters.length > 1) {
    signedRowsWhere.AND = [{ OR: templateScopeFilters }];
  } else {
    signedRowsWhere.templateId = { in: relevantTemplateIds };
  }

  const signedRows = await prisma.signedDocuments.findMany({
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
  signedRows.forEach((row) => {
    if (!isSignedDocumentStatus(row.status)) {
      return;
    }
    if (row.userId === registration.parentId && row.signerRole === 'parent_guardian') {
      parentSignedTemplates.add(row.templateId);
    }
    if (row.userId === childUserId && row.signerRole === 'child') {
      childSignedTemplates.add(row.templateId);
    }
  });

  const parentComplete = Array.from(parentTemplateIds).every((templateId) => parentSignedTemplates.has(templateId));
  const childComplete = Array.from(childTemplateIds).every((templateId) => childSignedTemplates.has(templateId));
  const requiresChildSignature = childTemplateIds.size > 0;
  const requiresParentSignature = parentTemplateIds.size > 0;

  let childEmail: string | undefined;
  if (requiresChildSignature) {
    const childSensitive = await prisma.sensitiveUserData.findFirst({
      where: { userId: childUserId },
      select: { email: true },
    });
    childEmail = normalizeText(childSensitive?.email);
  }

  const consentComplete = parentComplete && childComplete;
  let consentStatus = 'sent';
  if (requiresChildSignature && !childEmail) {
    consentStatus = 'child_email_required';
  } else if (consentComplete) {
    consentStatus = 'completed';
  } else if (requiresChildSignature && !childComplete) {
    if (requiresParentSignature && parentComplete) {
      consentStatus = 'parentSigned';
    } else if (requiresParentSignature && !parentComplete) {
      consentStatus = 'guardian_approval_required';
    } else {
      consentStatus = 'sent';
    }
  } else if (requiresParentSignature && !parentComplete) {
    if (requiresChildSignature && childComplete) {
      consentStatus = 'childSigned';
    } else {
      consentStatus = 'guardian_approval_required';
    }
  }

  await prisma.eventRegistrations.update({
    where: { id: registration.id },
    data: {
      status: consentComplete ? 'ACTIVE' : 'PENDINGCONSENT',
      consentStatus,
      updatedAt: new Date(),
    },
  });
};
