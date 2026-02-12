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

export const dynamic = 'force-dynamic';

const schema = z.object({
  userId: z.string().optional(),
  userEmail: z.string().optional(),
  redirectUrl: z.string().optional(),
  user: z.record(z.string(), z.any()).optional(),
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
}): string => {
  const userPayload = params.userPayload ?? {};
  const fullName = pickString(
    userPayload.fullName,
    userPayload.name,
    [userPayload.firstName, userPayload.lastName].filter(Boolean).join(' ').trim(),
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

  const userId = parsed.data.userId ?? session.userId;
  if (!session.isAdmin && session.userId !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
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

  const signed = await prisma.signedDocuments.findMany({
    where: {
      userId,
      templateId: { in: required },
      status: { in: ['SIGNED', 'signed'] },
    },
    select: { templateId: true },
  });

  const signedIds = new Set(signed.map((doc) => doc.templateId));
  const signerEmail = await resolveSignerEmail({
    providedEmail: parsed.data.userEmail,
    userPayload,
    userId,
  });
  const signerName = resolveSignerName({
    userPayload,
    signerEmail,
    userId,
  });

  const signLinks: Array<{
    templateId: string;
    type: 'PDF' | 'TEXT';
    title: string;
    signOnce: boolean;
    content?: string;
    documentId?: string;
    url?: string;
  }> = [];

  try {
    for (const requiredTemplateId of required) {
      const template = templatesById.get(requiredTemplateId);
      if (!template) {
        continue;
      }
      if (template.signOnce && signedIds.has(template.id)) {
        continue;
      }

      const templateType = template.type === 'TEXT' ? 'TEXT' : 'PDF';
      if (templateType === 'TEXT') {
        const content = template.content ?? `Please acknowledge ${template.title ?? 'this document'}.`;
        signLinks.push({
          templateId: template.id,
          type: 'TEXT',
          title: template.title,
          signOnce: template.signOnce ?? false,
          content,
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

      let roleIndex = template.roleIndex ?? template.roleIndexes?.[0] ?? 1;
      let signerRole = template.signerRoles?.[0];

      try {
        const templateRoles = await getTemplateRoles(template.templateId);
        if (templateRoles.length > 0) {
          roleIndex = templateRoles[0].roleIndex;
          signerRole = templateRoles[0].signerRole;
        }
      } catch {
        // Keep database role fallback when BoldSign role metadata cannot be read.
      }

      const sent = await sendDocumentFromTemplate({
        templateId: template.templateId,
        signerEmail,
        signerName,
        roleIndex,
        signerRole,
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
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create signing links.';
    const status = message.includes('not configured') ? 503 : 400;
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json({ signLinks }, { status: 200 });
}
