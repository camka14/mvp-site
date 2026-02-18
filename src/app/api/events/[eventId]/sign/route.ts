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
    const hasActiveLink = await verifyActiveParentLink({
      parentId: session.userId,
      childId: childUserId,
    });
    if (!hasActiveLink) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
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

  const signed = await prisma.signedDocuments.findMany({
    where: {
      userId: signerUserId,
      templateId: { in: eligibleTemplateIds },
      status: { in: ['SIGNED', 'signed'] },
    },
    select: { templateId: true },
  });

  const signedIds = new Set(signed.map((doc) => doc.templateId));
  const providedEmail = signerContext === 'child'
    ? pickString(parsed.data.childEmail, parsed.data.targetUserEmail, parsed.data.userEmail)
    : pickString(parsed.data.userEmail, parsed.data.targetUserEmail);
  let signerEmail = await resolveSignerEmail({
    providedEmail,
    userPayload,
    userId: signerUserId,
  });
  if (!signerEmail && signerContext === 'child' && childUserId && !session.isAdmin) {
    const actingAsLinkedChildSigner = await verifyActiveParentLink({
      parentId: session.userId,
      childId: childUserId,
    });
    if (actingAsLinkedChildSigner) {
      signerEmail = await resolveSignerEmail({
        providedEmail: pickString(parsed.data.userEmail, parsed.data.targetUserEmail),
        userPayload,
        userId: session.userId,
      });
    }
  }

  const signerProfile = await prisma.userData.findUnique({
    where: { id: signerUserId },
    select: {
      firstName: true,
      lastName: true,
      userName: true,
    },
  });

  const signerName = resolveSignerName({
    userPayload,
    signerEmail,
    userId: signerUserId,
    profile: signerProfile,
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
  }> = [];

  try {
    for (const requiredTemplateId of templateIdsToSign) {
      const template = templatesById.get(requiredTemplateId);
      if (!template) {
        continue;
      }
      if (template.signOnce && signedIds.has(template.id)) {
        continue;
      }

      const requiredSignerType = normalizeRequiredSignerType(template.requiredSignerType);
      const requiredSignerLabel = getRequiredSignerTypeLabel(requiredSignerType);
      const templateType = template.type === 'TEXT' ? 'TEXT' : 'PDF';
      if (templateType === 'TEXT') {
        const content = template.content ?? `Please acknowledge ${template.title ?? 'this document'}.`;
        signLinks.push({
          templateId: template.id,
          type: 'TEXT',
          title: template.title,
          signOnce: template.signOnce ?? false,
          content,
          requiredSignerType,
          requiredSignerLabel,
        });
        continue;
      }

      if (!isBoldSignConfigured()) {
        throw new Error('BoldSign is not configured on the server. Set BOLDSIGN_API_KEY.');
      }
      if (!signerEmail) {
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

      const sent = await sendDocumentFromTemplate({
        templateId: template.templateId,
        signerEmail,
        signerName,
        roleIndex: selectedRole.roleIndex,
        signerRole: selectedRole.signerRole,
        title: template.title,
        message: template.description ?? undefined,
      });

      const embedded = await getEmbeddedSignLink({
        documentId: sent.documentId,
        signerEmail,
        redirectUrl: parsed.data.redirectUrl,
      });

      signLinks.push({
        templateId: template.id,
        type: 'PDF',
        title: template.title,
        signOnce: template.signOnce ?? false,
        documentId: sent.documentId,
        url: embedded.signLink,
        requiredSignerType,
        requiredSignerLabel,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create signing links.';
    const status = message.includes('not configured') ? 503 : 400;
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json({ signLinks }, { status: 200 });
}
