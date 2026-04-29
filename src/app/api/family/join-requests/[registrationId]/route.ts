import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { withLegacyFields } from '@/server/legacyFormat';
import { calculateAgeOnDate } from '@/lib/age';
import { dispatchRequiredEventDocuments } from '@/lib/eventConsentDispatch';

export const dynamic = 'force-dynamic';

const schema = z.object({
  action: z.enum(['approve', 'decline']),
}).passthrough();

const normalizeEmail = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return normalized.length ? normalized : null;
};

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ registrationId: string }> }) {
  const session = await requireSession(req);
  const { registrationId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body ?? {});

  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const registration = await prisma.eventRegistrations.findFirst({
    where: {
      id: registrationId,
      parentId: session.userId,
      registrantType: 'CHILD',
    },
  });

  if (!registration) {
    return NextResponse.json({ error: 'Registration request not found.' }, { status: 404 });
  }

  if (parsed.data.action === 'decline') {
    const declined = await prisma.eventRegistrations.update({
      where: { id: registration.id },
      data: {
        status: 'CANCELLED',
        consentStatus: 'guardian_declined',
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({
      registration: withLegacyFields(declined),
      action: 'declined',
    }, { status: 200 });
  }

  const [event, childProfile, childSensitive] = await Promise.all([
    prisma.events.findUnique({
      where: { id: registration.eventId },
      select: {
        id: true,
        teamSignup: true,
        requiredTemplateIds: true,
        organizationId: true,
        start: true,
      },
    }),
    prisma.userData.findUnique({
      where: { id: registration.registrantId },
      select: {
        dateOfBirth: true,
      },
    }),
    prisma.sensitiveUserData.findFirst({
      where: { userId: registration.registrantId },
      select: {
        email: true,
      },
    }),
  ]);

  if (!event) {
    return NextResponse.json({ error: 'Event not found.' }, { status: 404 });
  }

  const childEmail = normalizeEmail(childSensitive?.email);
  const requiredTemplateIds = Array.isArray(event.requiredTemplateIds)
    ? event.requiredTemplateIds.filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
    : [];
  const needsConsent = requiredTemplateIds.length > 0;
  const consentDispatch = needsConsent
    ? await dispatchRequiredEventDocuments({
      eventId: event.id,
      organizationId: event.organizationId ?? null,
      requiredTemplateIds,
      parentUserId: session.userId,
      childUserId: registration.registrantId,
    })
    : null;

  const approvedStatus = needsConsent ? 'STARTED' : 'ACTIVE';
  const approvedConsentStatus = !needsConsent
    ? null
    : consentDispatch?.missingChildEmail
      ? 'child_email_required'
      : (consentDispatch?.errors.length ?? 0) > 0
        ? 'send_failed'
        : 'sent';

  const approved = await prisma.eventRegistrations.update({
    where: { id: registration.id },
    data: {
      status: approvedStatus,
      consentDocumentId: consentDispatch?.firstDocumentId ?? registration.consentDocumentId ?? null,
      consentStatus: approvedConsentStatus,
      updatedAt: new Date(),
    },
  });

  await prisma.events.update({
    where: { id: event.id },
    data: { updatedAt: new Date() },
  });

  const childAgeAtEvent = childProfile?.dateOfBirth
    ? calculateAgeOnDate(childProfile.dateOfBirth, event.start)
    : Number.NaN;
  const warnings = [
    ...(needsConsent
      && approvedConsentStatus === 'child_email_required'
      && Number.isFinite(childAgeAtEvent)
      && childAgeAtEvent < 13
      ? ['Under-13 child profile is missing email; child signature cannot be completed until email is added.']
      : []),
    ...(consentDispatch?.errors ?? []),
  ].filter((value) => value.trim().length > 0);

  return NextResponse.json({
    registration: withLegacyFields(approved),
    action: 'approved',
    consent: needsConsent
      ? {
          status: approvedConsentStatus,
          childEmail,
          requiresChildEmail: !childEmail,
        }
      : undefined,
    warnings: warnings.length ? warnings : undefined,
  }, { status: 200 });
}
