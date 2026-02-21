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
import {
  getRequiredSignerTypeLabel,
  normalizeRequiredSignerType,
  normalizeSignerContext,
  templateMatchesSignerContext,
  type SignerContext,
} from '@/lib/templateSignerTypes';
import { resolveBoldSignRedirectUrl } from '@/lib/signRedirect';

export const dynamic = 'force-dynamic';

const schema = z.object({
  userId: z.string().optional(),
  userEmail: z.string().optional(),
  redirectUrl: z.string().optional(),
  templateId: z.string().optional(),
  user: z.record(z.string(), z.any()).optional(),
  signerContext: z.string().optional(),
  childUserId: z.string().optional(),
  childEmail: z.string().optional(),
  targetUserId: z.string().optional(),
  targetUserEmail: z.string().optional(),
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
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (!normalized || !normalized.includes('@')) {
    return undefined;
  }
  return normalized;
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

type ResolvedSignerIdentity = {
  userId: string;
  email?: string;
  name: string;
};

const resolveSignerIdentity = async (params: {
  userId: string;
  providedEmail?: string;
  userPayload?: Record<string, unknown>;
}): Promise<ResolvedSignerIdentity> => {
  const email = await resolveSignerEmail({
    providedEmail: params.providedEmail,
    userPayload: params.userPayload,
    userId: params.userId,
  });
  const profile = await prisma.userData.findUnique({
    where: { id: params.userId },
    select: {
      firstName: true,
      lastName: true,
      userName: true,
    },
  });
  const name = resolveSignerName({
    userPayload: params.userPayload,
    signerEmail: email,
    userId: params.userId,
    profile,
  });
  return {
    userId: params.userId,
    email,
    name,
  };
};

const resolveSignerContext = (raw: unknown): SignerContext => normalizeSignerContext(raw, 'participant');

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
  eventId: string;
  childId: string;
}): Promise<string | null> => {
  const registration = await prisma.eventRegistrations.findFirst({
    where: {
      eventId: params.eventId,
      registrantId: params.childId,
      registrantType: 'CHILD',
      status: { in: ['PENDINGCONSENT', 'ACTIVE'] },
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
  return link?.parentId ?? null;
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

const normalizeSignedDocumentStatus = (value: unknown): string => {
  return (typeof value === 'string' ? value : '').trim().toLowerCase();
};

const isSignedDocumentStatus = (value: unknown): boolean => {
  const normalized = normalizeSignedDocumentStatus(value);
  return normalized === 'signed' || normalized === 'completed';
};

const pickRoleForSignerContext = (
  roles: Array<{ roleIndex: number; signerRole: string }>,
  signerContext: SignerContext,
): { roleIndex: number; signerRole: string } => {
  return roles.find((role) => roleMatchesSignerContext(role.signerRole, signerContext))
    ?? roles[0]
    ?? { roleIndex: 1, signerRole: 'Participant' };
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const { eventId } = await params;
  const event = await prisma.events.findUnique({ where: { id: eventId } });
  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  const signerContext = resolveSignerContext(parsed.data.signerContext);
  const redirectUrl = resolveBoldSignRedirectUrl(parsed.data.redirectUrl);
  const requestedUserId = pickString(parsed.data.userId, parsed.data.targetUserId);
  const childUserId = pickString(parsed.data.childUserId, parsed.data.targetUserId);
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

  const required = Array.isArray(event.requiredTemplateIds) ? event.requiredTemplateIds : [];
  if (!required.length) {
    return NextResponse.json({ signLinks: [] }, { status: 200 });
  }

  const userPayload = parsed.data.user as Record<string, unknown> | undefined;
  const templates = await prisma.templateDocuments.findMany({
    where: { id: { in: required } },
  });
  const templatesById = new Map(templates.map((template) => [template.id, template]));
  const missingTemplateIds = required.filter((templateId) => !templatesById.has(templateId));
  if (missingTemplateIds.length > 0) {
    return NextResponse.json({
      error: `Required templates are missing: ${missingTemplateIds.join(', ')}`,
    }, { status: 400 });
  }

  const eligibleTemplateIds = required.filter((requiredTemplateId) => {
    const template = templatesById.get(requiredTemplateId);
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

  const requestedTemplateId = pickString(parsed.data.templateId);
  const templateIdsToSign = requestedTemplateId
    ? eligibleTemplateIds.filter((templateId) => templateId === requestedTemplateId)
    : eligibleTemplateIds;
  if (requestedTemplateId && !templateIdsToSign.length) {
    return NextResponse.json({ error: 'Template is not available for this signer context.' }, { status: 400 });
  }

  const providedEmail = signerContext === 'child'
    ? pickString(parsed.data.childEmail, parsed.data.targetUserEmail, parsed.data.userEmail)
    : pickString(parsed.data.userEmail, parsed.data.targetUserEmail);
  let signerIdentity = await resolveSignerIdentity({
    userId: signerUserId,
    providedEmail,
    userPayload,
  });

  const linkedParentUserId = isChildRegistration && childUserId
    ? await resolveLinkedParentUserId({ eventId, childId: childUserId })
    : null;

  const parentSignerUserId = isChildRegistration
    ? (
      signerContext === 'parent_guardian'
        ? (session.isAdmin ? (requestedUserId ?? linkedParentUserId ?? session.userId) : session.userId)
        : (linkedParentUserId ?? (session.userId !== signerUserId ? session.userId : undefined))
    )
    : undefined;
  const parentProvidedEmail = pickString(parsed.data.userEmail, parsed.data.targetUserEmail);
  const childProvidedEmail = pickString(parsed.data.childEmail, parsed.data.targetUserEmail, parsed.data.userEmail);
  const [parentSignerIdentity, childSignerIdentity] = await Promise.all([
    isChildRegistration && parentSignerUserId
      ? resolveSignerIdentity({
        userId: parentSignerUserId,
        providedEmail: parentProvidedEmail,
        userPayload,
      })
      : Promise.resolve<ResolvedSignerIdentity | null>(null),
    isChildRegistration && childUserId
      ? resolveSignerIdentity({
        userId: childUserId,
        providedEmail: childProvidedEmail,
        userPayload,
      })
      : Promise.resolve<ResolvedSignerIdentity | null>(null),
  ]);

  if (!session.isAdmin && signerContext === 'child' && signerUserId !== session.userId) {
    const sessionSignerIdentity = await resolveSignerIdentity({
      userId: session.userId,
      providedEmail: pickString(parsed.data.userEmail, parsed.data.targetUserEmail),
      userPayload,
    });
    const sessionEmail = normalizeEmail(sessionSignerIdentity.email);
    const childEmail = normalizeEmail(childSignerIdentity?.email ?? signerIdentity.email);
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
  }> = [];

  try {
    const scopedChildUserId = isChildRegistration ? (childUserId ?? null) : null;
    for (const requiredTemplateId of templateIdsToSign) {
      const template = templatesById.get(requiredTemplateId);
      if (!template) {
        continue;
      }

      const requiredSignerType = normalizeRequiredSignerType(template.requiredSignerType);
      const requiredSignerLabel = getRequiredSignerTypeLabel(requiredSignerType);
      const sharedScopeWhere = {
        templateId: template.id,
        hostId: scopedChildUserId,
        ...(template.signOnce ? {} : { eventId }),
      };
      const [existingSignerRows, existingSharedRows] = await Promise.all([
        prisma.signedDocuments.findMany({
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
        }),
        isChildRegistration && scopedChildUserId
          ? prisma.signedDocuments.findMany({
            where: sharedScopeWhere,
            orderBy: { updatedAt: 'desc' },
            take: 20,
            select: {
              id: true,
              signedDocumentId: true,
              status: true,
            },
          })
          : Promise.resolve([]),
      ]);
      const signedRow = existingSignerRows.find((row) => isSignedDocumentStatus(row.status));
      if (signedRow) {
        continue;
      }
      const signerRowWithDocument = existingSignerRows.find((row) => Boolean(pickString(row.signedDocumentId)));
      const signerRowToReuse = existingSignerRows[0];
      const sharedRowWithDocument = existingSharedRows.find((row) => Boolean(pickString(row.signedDocumentId)));
      const pendingDocumentId = pickString(
        signerRowWithDocument?.signedDocumentId,
        sharedRowWithDocument?.signedDocumentId,
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
              hostId: scopedChildUserId,
              organizationId: event.organizationId ?? null,
              eventId,
              status: 'UNSIGNED',
              signedAt: null,
              signerEmail: signerIdentity.email ?? null,
              roleIndex: null,
              signerRole: signerContext,
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
              hostId: scopedChildUserId,
              organizationId: event.organizationId ?? null,
              eventId,
              signerEmail: signerIdentity.email ?? null,
              roleIndex: null,
              signerRole: signerContext,
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
      if (!template.templateId) {
        throw new Error(`Template "${template.title}" is missing a BoldSign template id.`);
      }

      let templateRoles: Array<{ roleIndex: number; signerRole: string }> = [];

      if (Array.isArray(template.roleIndexes) && template.roleIndexes.length > 0) {
        templateRoles = template.roleIndexes
          .map((index, position) => ({
            roleIndex: Number(index),
            signerRole: String(template.signerRoles?.[position] ?? template.signerRoles?.[0] ?? '').trim(),
          }))
          .filter((role) => Number.isFinite(role.roleIndex) && role.roleIndex > 0 && role.signerRole.length > 0);
      } else if (typeof template.roleIndex === 'number' && Number.isFinite(template.roleIndex)) {
        const fallbackRole = String(template.signerRoles?.[0] ?? '').trim() || 'Participant';
        templateRoles = [{ roleIndex: template.roleIndex, signerRole: fallbackRole }];
      }

      try {
        const rolesFromBoldSign = await getTemplateRoles(template.templateId);
        if (rolesFromBoldSign.length > 0) {
          templateRoles = rolesFromBoldSign;
        }
      } catch {
        // Keep database role fallback when BoldSign role metadata cannot be read.
      }

      const selectedRole = pickRoleForSignerContext(templateRoles, signerContext);
      type RoleAssignment = {
        roleIndex: number;
        signerRole: string;
        signerEmail: string;
        signerName: string;
        signerOrder?: number;
      };
      const buildRoleAssignment = (role: { roleIndex: number; signerRole: string }): RoleAssignment => {
        let signerEmailForRole: string | undefined = signerIdentity.email;
        let signerNameForRole = signerIdentity.name;
        const next = {
          roleIndex: role.roleIndex,
          signerRole: role.signerRole,
        };

        if (isChildRegistration) {
          if (roleMatchesSignerContext(role.signerRole, 'parent_guardian')) {
            signerEmailForRole = parentSignerIdentity?.email
              ?? (signerContext === 'parent_guardian' ? signerIdentity.email : undefined);
            signerNameForRole = parentSignerIdentity?.name
              ?? (signerContext === 'parent_guardian' ? signerIdentity.name : 'Parent/Guardian');
          } else if (roleMatchesSignerContext(role.signerRole, 'child')) {
            signerEmailForRole = childSignerIdentity?.email
              ?? (signerContext === 'child' ? signerIdentity.email : undefined);
            signerNameForRole = childSignerIdentity?.name
              ?? (signerContext === 'child' ? signerIdentity.name : 'Child');
          }
        }

        if (!signerEmailForRole) {
          if (isChildRegistration && roleMatchesSignerContext(role.signerRole, 'parent_guardian')) {
            throw new Error('Parent/guardian signer email is required for this document.');
          }
          if (isChildRegistration && roleMatchesSignerContext(role.signerRole, 'child')) {
            throw new Error('Child signer email is required for this document.');
          }
          throw new Error('A signer email is required for PDF signing.');
        }

        return {
          ...next,
          signerEmail: signerEmailForRole,
          signerName: signerNameForRole,
        };
      };
      const rolesToAssign = requiredSignerType === 'PARENT_GUARDIAN_CHILD' && !pendingDocumentId
        ? (templateRoles.length > 0 ? templateRoles : [selectedRole])
        : [selectedRole];
      const roleAssignments: RoleAssignment[] = rolesToAssign.map(buildRoleAssignment);
      const selectedRoleAssignment: RoleAssignment | undefined = roleAssignments.find(
        (role) => role.roleIndex === selectedRole.roleIndex && role.signerRole === selectedRole.signerRole,
      ) ?? roleAssignments[0];
      if (!selectedRoleAssignment) {
        throw new Error('Unable to resolve signer role assignment.');
      }

      let documentId = pendingDocumentId;
      if (!documentId) {
        const signerEmails = roleAssignments.map((role) => role.signerEmail.trim().toLowerCase());
        const hasDuplicateSignerEmails = new Set(signerEmails).size !== signerEmails.length;
        const roleAssignmentsForSend = hasDuplicateSignerEmails
          ? roleAssignments.map((role, index) => ({
            ...role,
            signerOrder: roleMatchesSignerContext(role.signerRole, 'parent_guardian')
              ? 1
              : roleMatchesSignerContext(role.signerRole, 'child')
                ? 2
                : index + 1,
          }))
          : roleAssignments;
        const sent = await sendDocumentFromTemplate({
          templateId: template.templateId,
          signerEmail: selectedRoleAssignment.signerEmail,
          signerName: selectedRoleAssignment.signerName,
          roleIndex: selectedRole.roleIndex,
          signerRole: selectedRole.signerRole,
          roles: roleAssignmentsForSend,
          enableSigningOrder: hasDuplicateSignerEmails,
          title: template.title,
          message: template.description ?? undefined,
        });
        documentId = sent.documentId;
      }
      const now = new Date();
      if (signerRowToReuse) {
        await prisma.signedDocuments.update({
          where: { id: signerRowToReuse.id },
          data: {
            updatedAt: now,
            signedDocumentId: documentId,
            status: 'UNSIGNED',
            userId: signerUserId,
            hostId: scopedChildUserId,
            organizationId: event.organizationId ?? null,
            eventId,
            signerEmail: selectedRoleAssignment.signerEmail,
            roleIndex: selectedRole.roleIndex,
            signerRole: signerContext,
          },
        });
      } else {
        await prisma.signedDocuments.create({
          data: {
            id: crypto.randomUUID(),
            createdAt: now,
            updatedAt: now,
            signedDocumentId: documentId,
            templateId: template.id,
            userId: signerUserId,
            documentName: template.title ?? 'Signed Document',
            hostId: scopedChildUserId,
            organizationId: event.organizationId ?? null,
            eventId,
            status: 'UNSIGNED',
            signedAt: null,
            signerEmail: selectedRoleAssignment.signerEmail,
            roleIndex: selectedRole.roleIndex,
            signerRole: signerContext,
            ipAddress: null,
            requestId: null,
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
        requiredSignerLabel,
        signerContext,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create signing links.';
    const status = message.includes('not configured') ? 503 : 400;
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json({ signLinks }, { status: 200 });
}
