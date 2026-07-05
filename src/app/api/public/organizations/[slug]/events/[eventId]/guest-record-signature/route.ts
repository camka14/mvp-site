import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { syncChildRegistrationConsentStatus } from '@/lib/childConsentProgress';
import {
  getSignerContextsForRequiredSignerType,
  normalizeRequiredSignerType,
  normalizeSignerContext,
  templateMatchesSignerContext,
} from '@/lib/templateSignerTypes';
import { resolveEventRegistrationPriceCents } from '@/server/paidRegistrationGate';
import {
  assertPublicWidgetEvent,
  normalizeGuestText,
  normalizeRequiredTemplateIds,
  verifyGuestRegistrationToken,
} from '@/server/publicGuestRegistration';
import { sendEventRegistrationHostNotification } from '@/server/registrationHostNotifications';

export const dynamic = 'force-dynamic';

const payloadSchema = z.object({
  registrationToken: z.string().min(1),
  templateId: z.string().min(1),
  documentId: z.string().min(1),
  signerContext: z.string().optional(),
  childUserId: z.string().optional(),
  type: z.string().optional(),
}).strict();

type RouteContext = {
  params: Promise<{
    slug: string;
    eventId: string;
  }>;
};

const isSignedStatus = (value: unknown): boolean => {
  const normalized = normalizeGuestText(value)?.toLowerCase();
  return normalized === 'signed' || normalized === 'completed';
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

const resolveSignerEmail = async (userId: string): Promise<string | null> => {
  const [sensitive, auth] = await Promise.all([
    (prisma as any).sensitiveUserData.findFirst({
      where: { userId },
      select: { email: true },
    }),
    (prisma as any).authUser.findUnique({
      where: { id: userId },
      select: { email: true },
    }),
  ]);
  return normalizeGuestText(sensitive?.email)?.toLowerCase()
    ?? normalizeGuestText(auth?.email)?.toLowerCase()
    ?? null;
};

type RequiredSignatureCheck = {
  templateId: string;
  userId: string;
  signerRole: 'participant' | 'parent_guardian' | 'child';
  hostId: string | null;
  eventScoped: boolean;
};

const signatureKey = (check: RequiredSignatureCheck, eventId: string): string => [
  check.templateId,
  check.userId,
  check.signerRole,
  check.hostId ?? '',
  check.eventScoped ? eventId : '*',
].join('::');

const buildGuestCompletionSignatureChecks = async (params: {
  eventId: string;
  registration: Record<string, any>;
  parentUserId: string;
  requiredTemplateIds: string[];
}): Promise<RequiredSignatureCheck[]> => {
  if (!params.requiredTemplateIds.length) {
    return [];
  }

  const templates = await (prisma as any).templateDocuments.findMany({
    where: { id: { in: params.requiredTemplateIds } },
    select: {
      id: true,
      requiredSignerType: true,
      signOnce: true,
    },
  });
  const templateById = new Map<string, Record<string, any>>(
    templates.map((template: Record<string, any>) => [String(template.id), template]),
  );
  const registrationType = String(params.registration.registrantType ?? '').toUpperCase();

  const targets: Array<
    | { kind: 'participant'; userId: string }
    | { kind: 'child'; childUserId: string; parentUserId: string }
  > = [];

  if (registrationType === 'CHILD') {
    const childUserId = normalizeGuestText(params.registration.registrantId);
    const parentUserId = normalizeGuestText(params.registration.parentId) ?? params.parentUserId;
    if (childUserId && parentUserId) {
      targets.push({ kind: 'child', childUserId, parentUserId });
    }
  } else if (registrationType === 'TEAM') {
    targets.push({ kind: 'participant', userId: params.parentUserId });
  } else {
    const userId = normalizeGuestText(params.registration.registrantId);
    if (userId) {
      targets.push({ kind: 'participant', userId });
    }
  }

  return params.requiredTemplateIds.flatMap((templateId) => {
    const template = templateById.get(templateId);
    if (!template) {
      return [];
    }
    const signerContexts = getSignerContextsForRequiredSignerType(template.requiredSignerType);
    return targets.flatMap((target) => signerContexts.map((context): RequiredSignatureCheck | null => {
      if (target.kind === 'participant') {
        return context === 'participant'
          ? {
            templateId,
            userId: target.userId,
            signerRole: 'participant',
            hostId: null,
            eventScoped: !template.signOnce,
          }
          : null;
      }
      if (context === 'parent_guardian') {
        return {
          templateId,
          userId: target.parentUserId,
          signerRole: 'parent_guardian',
          hostId: target.childUserId,
          eventScoped: !template.signOnce,
        };
      }
      if (context === 'child') {
        return {
          templateId,
          userId: target.childUserId,
          signerRole: 'child',
          hostId: target.childUserId,
          eventScoped: !template.signOnce,
        };
      }
      return null;
    }).filter((check): check is RequiredSignatureCheck => Boolean(check)));
  });
};

const promoteGuestRegistrationIfComplete = async (params: {
  event: Record<string, any>;
  registration: Record<string, any>;
  parentUserId: string;
  requiredTemplateIds: string[];
}) => {
  const checks = await buildGuestCompletionSignatureChecks({
    eventId: params.event.id,
    registration: params.registration,
    parentUserId: params.parentUserId,
    requiredTemplateIds: params.requiredTemplateIds,
  });

  if (!checks.length) {
    return;
  }

  const signedRows = await (prisma as any).signedDocuments.findMany({
    where: {
      OR: checks.map((check) => ({
        templateId: check.templateId,
        userId: check.userId,
        signerRole: check.signerRole,
        hostId: check.hostId,
        ...(check.eventScoped ? { eventId: params.event.id } : {}),
      })),
    },
    select: {
      templateId: true,
      userId: true,
      signerRole: true,
      hostId: true,
      eventId: true,
      status: true,
    },
  });
  const signedKeys = new Set<string>();
  signedRows.forEach((row: Record<string, any>) => {
    if (!isSignedStatus(row.status)) {
      return;
    }
    checks.forEach((check) => {
      if (
        row.templateId === check.templateId
        && row.userId === check.userId
        && row.signerRole === check.signerRole
        && (row.hostId ?? null) === check.hostId
        && (!check.eventScoped || row.eventId === params.event.id)
      ) {
        signedKeys.add(signatureKey(check, params.event.id));
      }
    });
  });

  const docsComplete = checks.every((check) => signedKeys.has(signatureKey(check, params.event.id)));
  if (!docsComplete) {
    return;
  }

  const priceCents = await resolveEventRegistrationPriceCents({
    event: params.event,
    selection: {
      divisionId: normalizeGuestText(params.registration.divisionId),
      divisionTypeId: normalizeGuestText(params.registration.divisionTypeId),
      divisionTypeKey: normalizeGuestText(params.registration.divisionTypeKey),
    },
    client: prisma,
  });
  const nextStatus = priceCents > 0 ? (params.registration.status ?? 'STARTED') : 'ACTIVE';
  await (prisma as any).eventRegistrations.update({
    where: { id: params.registration.id },
    data: {
      status: nextStatus,
      consentStatus: 'completed',
      updatedAt: new Date(),
    },
  });
  if (nextStatus === 'ACTIVE' && String(params.registration.status ?? '').toUpperCase() !== 'ACTIVE') {
    await sendEventRegistrationHostNotification({
      eventId: params.event.id,
      registrationId: params.registration.id,
    });
  }
};

export async function POST(req: NextRequest, context: RouteContext) {
  const params = await context.params;
  const body = await req.json().catch(() => null);
  const parsed = payloadSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'registrationToken, templateId, and documentId are required.' }, { status: 400 });
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

  const requiredTemplateIds = normalizeRequiredTemplateIds(event.requiredTemplateIds);
  if (!requiredTemplateIds.includes(parsed.data.templateId)) {
    return NextResponse.json({ error: 'Template is not required for this event.' }, { status: 400 });
  }

  const template = await (prisma as any).templateDocuments.findUnique({
    where: { id: parsed.data.templateId },
  });
  if (!template || !requiredTemplateIds.includes(String(template.id))) {
    return NextResponse.json({ error: 'Template not found.' }, { status: 404 });
  }
  if (template.type !== 'TEXT' || normalizeGuestText(parsed.data.type)?.toUpperCase() !== 'TEXT') {
    return NextResponse.json({ error: 'Only text acknowledgements can be recorded through this endpoint.' }, { status: 400 });
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

  if (!templateMatchesSignerContext({
    requiredSignerType: template.requiredSignerType,
    signerContext,
    isChildRegistration,
  })) {
    return NextResponse.json({ error: 'Template is not available for this signer context.' }, { status: 400 });
  }

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

  const now = new Date();
  const signedAt = now.toISOString();
  const scopedChildUserId = childUserId ?? null;
  const scopedEventId = template.signOnce ? null : event.id;
  const existing = await (prisma as any).signedDocuments.findFirst({
    where: {
      templateId: template.id,
      userId: signerUserId,
      signerRole: signerContext,
      hostId: scopedChildUserId,
      ...(scopedEventId ? { eventId: scopedEventId } : {}),
    },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      organizationId: true,
      teamId: true,
      status: true,
      signedAt: true,
    },
  });
  const signerEmail = await resolveSignerEmail(signerUserId);
  const baseData = {
    signedDocumentId: parsed.data.documentId,
    userId: signerUserId,
    hostId: scopedChildUserId,
    organizationId: organization.id,
    eventId: event.id,
    status: 'SIGNED',
    signedAt,
    signerEmail,
    roleIndex: null,
    signerRole: signerContext,
    ipAddress: resolveIpAddress(req),
    requestId: req.headers.get('x-request-id') ?? null,
    updatedAt: now,
  };

  if (existing) {
    const existingIsSigned = isSignedStatus(existing.status);
    await (prisma as any).signedDocuments.update({
      where: { id: existing.id },
      data: {
        ...baseData,
        organizationId: existing.organizationId ?? organization.id,
        teamId: existing.teamId ?? null,
        signedAt: existingIsSigned ? (normalizeGuestText(existing.signedAt) ?? signedAt) : signedAt,
      },
    });
  } else {
    await (prisma as any).signedDocuments.create({
      data: {
        id: crypto.randomUUID(),
        templateId: template.id,
        documentName: template.title ?? 'Text Waiver',
        teamId: null,
        ...baseData,
        createdAt: now,
      },
    });
  }

  if (scopedChildUserId) {
    await syncChildRegistrationConsentStatus({
      eventId: event.id,
      childUserId: scopedChildUserId,
      parentUserId: token.parentUserId,
    });
  }
  await promoteGuestRegistrationIfComplete({
    event: event as Record<string, any>,
    registration: registration as Record<string, any>,
    parentUserId: token.parentUserId,
    requiredTemplateIds,
  });

  return NextResponse.json({
    ok: true,
    requiredSignerType: normalizeRequiredSignerType(template.requiredSignerType),
  }, { status: 200 });
}
