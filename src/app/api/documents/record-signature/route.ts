import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { normalizeSignerContext, type SignerContext } from '@/lib/templateSignerTypes';
import { syncChildRegistrationConsentStatus } from '@/lib/childConsentProgress';

const schema = z.object({
  templateId: z.string(),
  documentId: z.string(),
  eventId: z.string().optional(),
  userId: z.string().optional(),
  childUserId: z.string().optional(),
  signerContext: z.string().optional(),
  user: z.record(z.string(), z.any()).optional(),
  type: z.string().optional(),
}).passthrough();

const normalizeText = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const normalizeEmail = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
};

const resolveUserEmail = async (userId: string): Promise<string | null> => {
  const [sensitive, auth] = await Promise.all([
    prisma.sensitiveUserData.findFirst({
      where: { userId },
      select: { email: true },
    }),
    prisma.authUser.findUnique({
      where: { id: userId },
      select: { email: true },
    }),
  ]);
  return normalizeEmail(sensitive?.email) ?? normalizeEmail(auth?.email) ?? null;
};

const resolveSignerContext = (params: {
  providedSignerContext?: string;
  userId: string;
  childUserId?: string;
}): SignerContext => {
  const explicit = normalizeSignerContext(params.providedSignerContext, 'participant');
  if (normalizeText(params.providedSignerContext)) {
    return explicit;
  }
  if (params.childUserId && params.userId === params.childUserId) {
    return 'child';
  }
  if (params.childUserId) {
    return 'parent_guardian';
  }
  return 'participant';
};

const resolveIpAddress = (request: NextRequest): string => {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const candidate = forwarded.split(',')[0]?.trim();
    if (candidate) {
      return candidate;
    }
  }

  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp.trim();
  }

  const cfIp = request.headers.get('cf-connecting-ip');
  if (cfIp) {
    return cfIp.trim();
  }

  return '127.0.0.1';
};

export async function POST(request: NextRequest) {
  const session = await requireSession(request);
  const body = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'templateId and documentId are required.' }, { status: 400 });
  }

  const userId = normalizeText(parsed.data.userId) ?? session.userId;
  const eventId = normalizeText(parsed.data.eventId);
  const childUserId = normalizeText(parsed.data.childUserId);
  const signerContext = resolveSignerContext({
    providedSignerContext: normalizeText(parsed.data.signerContext),
    userId,
    childUserId,
  });

  if (!session.isAdmin && signerContext === 'child' && userId !== session.userId) {
    return NextResponse.json({ error: 'Child signatures must be completed by the child account.' }, { status: 403 });
  }

  if (!session.isAdmin && userId !== session.userId) {
    const parentLink = await prisma.parentChildLinks.findFirst({
      where: {
        parentId: session.userId,
        childId: userId,
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    if (!parentLink) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  if (!session.isAdmin && signerContext === 'parent_guardian' && childUserId) {
    const parentLink = await prisma.parentChildLinks.findFirst({
      where: {
        parentId: session.userId,
        childId: childUserId,
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    if (!parentLink) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  if (!session.isAdmin && signerContext === 'child') {
    const resolvedChildUserId = childUserId ?? userId;
    if (session.userId !== resolvedChildUserId) {
      const parentLink = await prisma.parentChildLinks.findFirst({
        where: {
          parentId: session.userId,
          childId: resolvedChildUserId,
          status: 'ACTIVE',
        },
        select: { id: true },
      });
      if (!parentLink) {
        return NextResponse.json({ error: 'Child signatures must be completed by the child account.' }, { status: 403 });
      }
      const [parentEmail, childEmail] = await Promise.all([
        resolveUserEmail(session.userId),
        resolveUserEmail(resolvedChildUserId),
      ]);
      if (!parentEmail || !childEmail || parentEmail !== childEmail) {
        return NextResponse.json(
          { error: 'Child signatures must be completed by the child account unless parent and child share the same email.' },
          { status: 403 },
        );
      }
    }
  }

  const event = eventId
    ? await prisma.events.findUnique({
      where: { id: eventId },
      select: { organizationId: true },
    })
    : null;

  const scopedChildUserId = childUserId ?? (signerContext === 'child' ? userId : null);
  const now = new Date();
  const signedAt = now.toISOString();
  const existing = await prisma.signedDocuments.findFirst({
    where: {
      templateId: parsed.data.templateId,
      userId,
      signerRole: signerContext,
      hostId: scopedChildUserId,
      ...(eventId ? { eventId } : {}),
    },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      organizationId: true,
    },
  });

  if (existing) {
    await prisma.signedDocuments.update({
      where: { id: existing.id },
      data: {
        updatedAt: now,
        signedDocumentId: parsed.data.documentId,
        status: 'SIGNED',
        signedAt,
        signerEmail: normalizeText(parsed.data.user?.email) ?? null,
        signerRole: signerContext,
        hostId: scopedChildUserId,
        organizationId: existing.organizationId ?? event?.organizationId ?? null,
        eventId: eventId ?? null,
        ipAddress: resolveIpAddress(request),
        requestId: request.headers.get('x-request-id') ?? null,
      },
    });
  } else {
    await prisma.signedDocuments.create({
      data: {
        id: crypto.randomUUID(),
        signedDocumentId: parsed.data.documentId,
        templateId: parsed.data.templateId,
        userId,
        documentName: parsed.data.type === 'TEXT' ? 'Text Waiver' : 'Signed Document',
        hostId: scopedChildUserId,
        organizationId: event?.organizationId ?? null,
        eventId: eventId ?? null,
        status: 'SIGNED',
        signedAt,
        signerEmail: normalizeText(parsed.data.user?.email) ?? null,
        roleIndex: null,
        signerRole: signerContext,
        ipAddress: resolveIpAddress(request),
        requestId: request.headers.get('x-request-id') ?? null,
        createdAt: now,
        updatedAt: now,
      },
    });
  }

  const signedTemplate = await prisma.templateDocuments.findUnique({
    where: { id: parsed.data.templateId },
    select: { signOnce: true },
  });

  if (scopedChildUserId && signedTemplate?.signOnce) {
    const registrations = await prisma.eventRegistrations.findMany({
      where: {
        registrantId: scopedChildUserId,
        registrantType: 'CHILD',
        status: { in: ['PENDINGCONSENT', 'ACTIVE'] },
      },
      select: {
        eventId: true,
        parentId: true,
      },
    });

    const syncTargetMap = new Map<string, { eventId: string; parentUserId?: string }>();
    for (const registration of registrations) {
      const normalizedEventId = normalizeText(registration.eventId);
      if (!normalizedEventId) {
        continue;
      }
      const parentUserId = normalizeText(registration.parentId);
      const targetKey = `${normalizedEventId}:${parentUserId ?? ''}`;
      if (!syncTargetMap.has(targetKey)) {
        syncTargetMap.set(targetKey, {
          eventId: normalizedEventId,
          parentUserId,
        });
      }
    }
    const syncTargets = Array.from(syncTargetMap.values());

    await Promise.all(syncTargets.map((target) => syncChildRegistrationConsentStatus({
      eventId: target.eventId,
      childUserId: scopedChildUserId,
      parentUserId: target.parentUserId,
    })));
  } else {
    await syncChildRegistrationConsentStatus({
      eventId,
      childUserId: scopedChildUserId,
    });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
