import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import {
  getEmbeddedSignLink,
  getTemplateRoles,
  isBoldSignConfigured,
  sendDocumentFromTemplate,
} from '@/lib/boldsignServer';
import { createDocumentSendOperation } from '@/lib/boldsignWebhookSync';
import {
  BOLDSIGN_OPERATION_STATUSES,
  findLatestBoldSignOperation,
} from '@/lib/boldsignSyncOperations';
import { resolveBoldSignRedirectUrl } from '@/lib/signRedirect';
import {
  getRequiredSignerTypeLabel,
  normalizeRequiredSignerType,
  normalizeSignerContext,
  templateMatchesSignerContext,
  type SignerContext,
} from '@/lib/templateSignerTypes';
import {
  assertPublicWidgetEvent,
  normalizeGuestText,
  normalizeRequiredTemplateIds,
  verifyGuestRegistrationToken,
} from '@/server/publicGuestRegistration';

export const dynamic = 'force-dynamic';

const payloadSchema = z.object({
  registrationToken: z.string().min(1),
  signerContext: z.string().optional(),
  templateId: z.string().optional(),
  childUserId: z.string().optional(),
  redirectUrl: z.string().optional(),
}).strict();

type RouteContext = {
  params: Promise<{
    slug: string;
    eventId: string;
  }>;
};

type SignerIdentity = {
  userId: string;
  email?: string;
  name: string;
};

const normalizeEmail = (value: unknown): string | undefined => {
  const normalized = normalizeGuestText(value)?.toLowerCase();
  return normalized && normalized.includes('@') ? normalized : undefined;
};

const resolveSignerIdentity = async (userId: string): Promise<SignerIdentity> => {
  const [profile, sensitive, auth] = await Promise.all([
    (prisma as any).userData.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true, userName: true },
    }),
    (prisma as any).sensitiveUserData.findFirst({
      where: { userId },
      select: { email: true },
    }),
    (prisma as any).authUser.findUnique({
      where: { id: userId },
      select: { email: true },
    }),
  ]);
  const email = normalizeEmail(sensitive?.email) ?? normalizeEmail(auth?.email);
  const profileName = [
    normalizeGuestText(profile?.firstName) ?? '',
    normalizeGuestText(profile?.lastName) ?? '',
  ].join(' ').trim();
  return {
    userId,
    email,
    name: profileName || normalizeGuestText(profile?.userName) || email?.split('@')[0] || userId,
  };
};

const normalizeRoleToken = (value: string | undefined): string => (
  (value ?? '').trim().toLowerCase().replace(/[^a-z]/g, '')
);

const roleMatchesSignerContext = (signerRole: string | undefined, signerContext: SignerContext): boolean => {
  const token = normalizeRoleToken(signerRole);
  if (!token) return false;
  if (signerContext === 'child') return token.includes('child');
  if (signerContext === 'parent_guardian') return token.includes('parent') || token.includes('guardian');
  return token.includes('participant') || token.includes('player') || token.includes('self');
};

const templateRolesCoverRequiredSignerType = (
  roles: Array<{ roleIndex: number; signerRole: string }>,
  requiredSignerType: unknown,
): boolean => {
  if (!roles.length) return false;
  const normalized = normalizeRequiredSignerType(requiredSignerType);
  if (normalized === 'PARENT_GUARDIAN') {
    return roles.some((role) => roleMatchesSignerContext(role.signerRole, 'parent_guardian'));
  }
  if (normalized === 'CHILD') {
    return roles.some((role) => roleMatchesSignerContext(role.signerRole, 'child'));
  }
  if (normalized === 'PARENT_GUARDIAN_CHILD') {
    return roles.some((role) => roleMatchesSignerContext(role.signerRole, 'parent_guardian'))
      && roles.some((role) => roleMatchesSignerContext(role.signerRole, 'child'));
  }
  return roles.some((role) => roleMatchesSignerContext(role.signerRole, 'participant'));
};

const pickRoleForSignerContext = (
  roles: Array<{ roleIndex: number; signerRole: string }>,
  signerContext: SignerContext,
): { roleIndex: number; signerRole: string } => (
  roles.find((role) => roleMatchesSignerContext(role.signerRole, signerContext))
  ?? roles[0]
  ?? { roleIndex: 1, signerRole: 'Participant' }
);

const toTemplateRoles = (template: Record<string, any>): Array<{ roleIndex: number; signerRole: string }> => {
  if (Array.isArray(template.roleIndexes) && template.roleIndexes.length > 0) {
    return template.roleIndexes
      .map((index: unknown, position: number) => ({
        roleIndex: Number(index),
        signerRole: String(template.signerRoles?.[position] ?? template.signerRoles?.[0] ?? '').trim(),
      }))
      .filter((role: { roleIndex: number; signerRole: string }) => Number.isFinite(role.roleIndex) && role.roleIndex > 0 && role.signerRole.length > 0);
  }
  if (typeof template.roleIndex === 'number' && Number.isFinite(template.roleIndex)) {
    const fallbackRole = String(template.signerRoles?.[0] ?? '').trim() || 'Participant';
    return [{ roleIndex: template.roleIndex, signerRole: fallbackRole }];
  }
  return [];
};

const signedStatus = (value: unknown): boolean => {
  const normalized = normalizeGuestText(value)?.toLowerCase();
  return normalized === 'signed' || normalized === 'completed';
};

export async function POST(req: NextRequest, context: RouteContext) {
  const params = await context.params;
  const body = await req.json().catch(() => null);
  const parsed = payloadSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'registrationToken is required.' }, { status: 400 });
  }

  const token = verifyGuestRegistrationToken(parsed.data.registrationToken);
  if (!token || token.eventId !== params.eventId) {
    return NextResponse.json({ error: 'Invalid or expired guest registration token.' }, { status: 403 });
  }

  const publicContext = await assertPublicWidgetEvent(params.slug, params.eventId);
  if (!publicContext || publicContext.organization.id !== token.organizationId) {
    return NextResponse.json({ error: 'Public widget event not found.' }, { status: 404 });
  }

  const { organization, event } = publicContext;
  const registration = await (prisma as any).eventRegistrations.findUnique({
    where: { id: token.registrationId },
  });
  if (!registration || registration.eventId !== event.id) {
    return NextResponse.json({ error: 'Guest registration not found.' }, { status: 404 });
  }

  const registrationType = String(registration.registrantType ?? '').toUpperCase();
  const requestedChildUserId = normalizeGuestText(parsed.data.childUserId);
  const childUserId = requestedChildUserId
    ?? (registrationType === 'CHILD' ? String(registration.registrantId) : null);
  const isChildRegistration = Boolean(childUserId);
  const signerContext = normalizeSignerContext(
    parsed.data.signerContext,
    isChildRegistration ? 'parent_guardian' : 'participant',
  );

  if (childUserId) {
    const linked = await (prisma as any).parentChildLinks.findFirst({
      where: {
        parentId: token.parentUserId,
        childId: childUserId,
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    if (!linked) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const signerUserId = signerContext === 'child'
    ? childUserId
    : signerContext === 'parent_guardian'
      ? token.parentUserId
      : registrationType === 'SELF'
        ? String(registration.registrantId)
        : token.parentUserId;
  if (!signerUserId) {
    return NextResponse.json({ error: 'Signer user id is required.' }, { status: 400 });
  }

  const requiredTemplateIds = normalizeRequiredTemplateIds(event.requiredTemplateIds);
  if (!requiredTemplateIds.length) {
    return NextResponse.json({ signLinks: [] }, { status: 200 });
  }

  const templates = await (prisma as any).templateDocuments.findMany({
    where: { id: { in: requiredTemplateIds } },
  });
  const templatesById = new Map<string, Record<string, any>>(
    templates.map((template: Record<string, any>) => [String(template.id), template]),
  );
  const requestedTemplateId = normalizeGuestText(parsed.data.templateId);
  const templateIdsToSign = requiredTemplateIds.filter((templateId) => {
    if (requestedTemplateId && requestedTemplateId !== templateId) {
      return false;
    }
    const template = templatesById.get(templateId);
    return Boolean(template && templateMatchesSignerContext({
      requiredSignerType: template.requiredSignerType,
      signerContext,
      isChildRegistration,
    }));
  });
  if (requestedTemplateId && !templateIdsToSign.length) {
    return NextResponse.json({ error: 'Template is not available for this signer context.' }, { status: 400 });
  }

  const signerIdentity = await resolveSignerIdentity(signerUserId);
  const parentIdentity = isChildRegistration ? await resolveSignerIdentity(token.parentUserId) : null;
  const childIdentity = childUserId ? await resolveSignerIdentity(childUserId) : null;
  const redirectUrl = resolveBoldSignRedirectUrl(normalizeGuestText(parsed.data.redirectUrl) ?? undefined);
  const signLinks: Array<Record<string, unknown>> = [];

  try {
    for (const templateId of templateIdsToSign) {
      const template = templatesById.get(templateId);
      if (!template) {
        continue;
      }

      const requiredSignerType = normalizeRequiredSignerType(template.requiredSignerType);
      const existingSignedRows = await (prisma as any).signedDocuments.findMany({
        where: {
          templateId: template.id,
          userId: signerUserId,
          signerRole: signerContext,
          hostId: childUserId ?? null,
          ...(template.signOnce ? {} : { eventId: event.id }),
        },
        orderBy: { updatedAt: 'desc' },
        take: 20,
        select: {
          id: true,
          status: true,
          signedDocumentId: true,
        },
      });
      if (existingSignedRows.some((row: Record<string, unknown>) => signedStatus(row.status))) {
        continue;
      }

      const templateType = template.type === 'TEXT' ? 'TEXT' : 'PDF';
      if (templateType === 'TEXT') {
        const documentId = normalizeGuestText(existingSignedRows[0]?.signedDocumentId) ?? `text-${crypto.randomUUID()}`;
        const now = new Date();
        if (existingSignedRows[0]?.id) {
          await (prisma as any).signedDocuments.update({
            where: { id: existingSignedRows[0].id },
            data: {
              updatedAt: now,
              signedDocumentId: documentId,
              status: 'UNSIGNED',
              userId: signerUserId,
              hostId: childUserId ?? null,
              organizationId: organization.id,
              eventId: event.id,
              signerEmail: signerIdentity.email ?? null,
              signerRole: signerContext,
            },
          });
        } else {
          await (prisma as any).signedDocuments.create({
            data: {
              id: crypto.randomUUID(),
              createdAt: now,
              updatedAt: now,
              signedDocumentId: documentId,
              templateId: template.id,
              userId: signerUserId,
              documentName: template.title ?? 'Text Waiver',
              hostId: childUserId ?? null,
              organizationId: organization.id,
              eventId: event.id,
              status: 'UNSIGNED',
              signedAt: null,
              signerEmail: signerIdentity.email ?? null,
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
          title: template.title,
          signOnce: template.signOnce ?? false,
          documentId,
          content: template.content ?? `Please acknowledge ${template.title ?? 'this document'}.`,
          requiredSignerType,
          requiredSignerLabel: getRequiredSignerTypeLabel(requiredSignerType),
          signerContext,
        });
        continue;
      }

      if (!isBoldSignConfigured()) {
        throw new Error('BoldSign is not configured on the server. Set BOLDSIGN_API_KEY.');
      }
      if (!signerIdentity.email) {
        throw new Error('A signer email is required for PDF signing.');
      }
      const boldSignTemplateId = normalizeGuestText(template.templateId);
      if (!boldSignTemplateId) {
        throw new Error(`Template "${template.title}" is missing a BoldSign template id.`);
      }

      let templateRoles = toTemplateRoles(template);
      const rolesFromDb = templateRoles;
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
        // Keep stored role metadata when BoldSign role inspection fails.
      }

      const selectedRole = pickRoleForSignerContext(templateRoles, signerContext);
      const rolesToAssign = requiredSignerType === 'PARENT_GUARDIAN_CHILD'
        ? (templateRoles.length ? templateRoles : [selectedRole])
        : [selectedRole];
      const roleAssignments = rolesToAssign.map((role) => {
        const contextForRole = roleMatchesSignerContext(role.signerRole, 'parent_guardian')
          ? 'parent_guardian'
          : roleMatchesSignerContext(role.signerRole, 'child')
            ? 'child'
            : 'participant';
        const identity = contextForRole === 'parent_guardian'
          ? parentIdentity
          : contextForRole === 'child'
            ? childIdentity
            : signerIdentity;
        if (!identity?.email) {
          throw new Error(`${contextForRole === 'child' ? 'Child' : 'Signer'} email is required for this PDF document.`);
        }
        return {
          roleIndex: role.roleIndex,
          signerRole: role.signerRole,
          signerContext: contextForRole,
          signerEmail: identity.email,
          signerName: identity.name,
        };
      });
      const selectedRoleAssignment = roleAssignments.find((role) => (
        role.roleIndex === selectedRole.roleIndex && role.signerRole === selectedRole.signerRole
      )) ?? roleAssignments[0];
      if (!selectedRoleAssignment) {
        throw new Error('Unable to resolve signer assignment.');
      }

      const idempotencyKey = [
        'public-guest-document-send',
        event.id,
        registration.id,
        template.id,
        signerContext,
        signerUserId,
        childUserId ?? '',
      ].join(':');
      let operation = await findLatestBoldSignOperation({ idempotencyKey });
      let documentId = normalizeGuestText(operation?.documentId);
      if (!documentId) {
        const signerEmails = roleAssignments.map((role) => role.signerEmail.toLowerCase());
        const hasDuplicateSignerEmails = new Set(signerEmails).size !== signerEmails.length;
        const rolesForSend = hasDuplicateSignerEmails
          ? roleAssignments.map((role, index) => ({
            ...role,
            signerOrder: role.signerContext === 'parent_guardian'
              ? 1
              : role.signerContext === 'child'
                ? 2
                : index + 1,
          }))
          : roleAssignments;
        const sent = await sendDocumentFromTemplate({
          templateId: boldSignTemplateId,
          signerEmail: selectedRoleAssignment.signerEmail,
          signerName: selectedRoleAssignment.signerName,
          roleIndex: selectedRoleAssignment.roleIndex,
          signerRole: selectedRoleAssignment.signerRole,
          roles: rolesForSend,
          enableSigningOrder: hasDuplicateSignerEmails,
          title: template.title,
          message: template.description ?? undefined,
        });
        documentId = sent.documentId;
        operation = await createDocumentSendOperation({
          idempotencyKey,
          organizationId: organization.id,
          eventId: event.id,
          templateDocumentId: template.id,
          templateId: boldSignTemplateId,
          documentId,
          userId: signerUserId,
          childUserId,
          signerRole: signerContext,
          signerEmail: selectedRoleAssignment.signerEmail,
          roleIndex: selectedRoleAssignment.roleIndex,
          payload: {
            templateDocumentId: template.id,
            templateTitle: template.title,
            requiredSignerType,
            signerContext,
            source: 'public_guest_widget',
            roleAssignments,
          },
        });
      }

      const embedded = await getEmbeddedSignLink({
        documentId,
        signerEmail: selectedRoleAssignment.signerEmail,
        redirectUrl,
      });
      signLinks.push({
        templateId: template.id,
        type: 'PDF',
        title: template.title,
        signOnce: template.signOnce ?? false,
        documentId,
        url: embedded.signLink,
        requiredSignerType,
        requiredSignerLabel: getRequiredSignerTypeLabel(requiredSignerType),
        signerContext,
        operationId: operation?.id,
        syncStatus: operation?.status ?? BOLDSIGN_OPERATION_STATUSES.PENDING_WEBHOOK,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create signing links.';
    return NextResponse.json({ error: message }, { status: message.includes('not configured') ? 503 : 400 });
  }

  return NextResponse.json({ signLinks }, { status: 200 });
}
