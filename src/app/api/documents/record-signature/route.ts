import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { normalizeSignerContext, type SignerContext } from '@/lib/templateSignerTypes';
import { syncChildRegistrationConsentStatus } from '@/lib/childConsentProgress';
import {
  syncAllTeamRegistrationConsentStatusesForRegistrant,
  syncTeamRegistrationConsentStatus,
} from '@/server/teams/teamRegistrationDocuments';
import {
  BOLDSIGN_OPERATION_TYPES,
  findLatestBoldSignOperation,
  updateBoldSignOperationById,
} from '@/lib/boldsignSyncOperations';

const schema = z.object({
  templateId: z.string(),
  documentId: z.string(),
  eventId: z.string().optional(),
  teamId: z.string().optional(),
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

const isSignedStatus = (value: unknown): boolean => {
  const normalized = normalizeText(value)?.toLowerCase();
  return normalized === 'signed' || normalized === 'completed';
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
  if (eventId && !event) {
    return NextResponse.json({ error: 'Event not found.' }, { status: 404 });
  }
  const teamId = normalizeText(parsed.data.teamId);
  const team = teamId
    ? await prisma.canonicalTeams.findUnique({
      where: { id: teamId },
      select: { organizationId: true },
    })
    : null;
  if (teamId && !team) {
    return NextResponse.json({ error: 'Team not found.' }, { status: 404 });
  }
  const signedTemplate = await prisma.templateDocuments.findUnique({
    where: { id: parsed.data.templateId },
    select: { signOnce: true, type: true },
  });
  if (!signedTemplate) {
    return NextResponse.json({ error: 'Template not found.' }, { status: 404 });
  }

  const scopedChildUserId = childUserId ?? (signerContext === 'child' ? userId : null);
  const isTextSignature = String(signedTemplate.type ?? '').toUpperCase() === 'TEXT';
  if (!isTextSignature) {
    const operation = await findLatestBoldSignOperation({
      operationType: BOLDSIGN_OPERATION_TYPES.DOCUMENT_SEND,
      documentId: parsed.data.documentId,
    });
    const operationMatchesScope = Boolean(
      operation
      && operation.templateDocumentId === parsed.data.templateId
      && operation.documentId === parsed.data.documentId
      && (operation.eventId ?? null) === (eventId ?? null)
      && (operation.teamId ?? null) === (teamId ?? null)
      && (operation.userId ?? null) === userId
      && (operation.childUserId ?? null) === scopedChildUserId
      && (operation.signerRole ?? null) === signerContext,
    );
    if (!operationMatchesScope || !operation) {
      return NextResponse.json(
        { error: 'Signature confirmation must use a server-issued signing operation.' },
        { status: 403 },
      );
    }

    await updateBoldSignOperationById(operation.id, {
      payload: {
        ...(operation.payload ?? {}),
        acknowledgedAt: new Date().toISOString(),
      },
    });

    return NextResponse.json({
      ok: true,
      operationId: operation.id,
      syncStatus: operation.status,
    }, { status: 200 });
  }

  // Text acknowledgements are issued as UNSIGNED rows by the scoped event,
  // team, rental, or profile signing endpoints. This legacy acknowledgement
  // endpoint may only transition that exact server-issued row; it can never
  // create a caller-defined waiver or broaden its event/team scope.
  const existing = await prisma.signedDocuments.findFirst({
    where: {
      signedDocumentId: parsed.data.documentId,
      templateId: parsed.data.templateId,
      userId,
      signerRole: signerContext,
      hostId: scopedChildUserId,
      eventId: eventId ?? null,
      teamId: teamId ?? null,
      status: { in: ['UNSIGNED', 'SIGNED'] },
    },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      status: true,
      signedAt: true,
    },
  });

  if (!existing) {
    return NextResponse.json(
      { error: 'Text acknowledgement must use a server-issued signing document.' },
      { status: 403 },
    );
  }

  const existingIsSigned = isSignedStatus(existing.status);
  if (!existingIsSigned) {
    const now = new Date();
    await prisma.signedDocuments.update({
      where: { id: existing.id },
      data: {
        updatedAt: now,
        status: 'SIGNED',
        signedAt: new Date().toISOString(),
        ipAddress: resolveIpAddress(request),
        requestId: request.headers.get('x-request-id') ?? null,
      },
    });
  }

  if (scopedChildUserId && signedTemplate?.signOnce) {
    const registrations = await prisma.eventRegistrations.findMany({
      where: {
        registrantId: scopedChildUserId,
        registrantType: 'CHILD',
        status: { in: ['STARTED', 'PENDING', 'ACTIVE'] },
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

  if (teamId) {
    const teamRegistrantId = scopedChildUserId ?? userId;
    if (signedTemplate?.signOnce) {
      await syncAllTeamRegistrationConsentStatusesForRegistrant({
        registrantId: teamRegistrantId,
      });
    } else {
      await syncTeamRegistrationConsentStatus({
        teamId,
        registrantId: teamRegistrantId,
        parentUserId: signerContext === 'parent_guardian' ? userId : undefined,
      });
    }
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
