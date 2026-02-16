import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { withLegacyFields } from '@/server/legacyFormat';
import { calculateAgeOnDate } from '@/lib/age';
import {
  resolveEventDivisionSelection,
  validateRegistrantAgeForSelection,
} from '@/app/api/events/[eventId]/registrationDivisionUtils';

export const dynamic = 'force-dynamic';

const schema = z.object({
  childId: z.string().optional(),
  divisionId: z.string().optional(),
  divisionTypeId: z.string().optional(),
  divisionTypeKey: z.string().optional(),
}).passthrough();

export async function POST(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const { eventId } = await params;
  const event = await prisma.events.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      start: true,
      minAge: true,
      maxAge: true,
      sportId: true,
      registrationByDivisionType: true,
      divisions: true,
      requiredTemplateIds: true,
    },
  });
  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  const childId = parsed.data.childId;
  if (!childId) {
    return NextResponse.json({ error: 'childId is required' }, { status: 400 });
  }

  const divisionSelection = await resolveEventDivisionSelection({
    event,
    input: parsed.data,
  });
  if (!divisionSelection.ok) {
    return NextResponse.json({ error: divisionSelection.error ?? 'Invalid division selection' }, { status: 400 });
  }

  const parent = await prisma.userData.findUnique({
    where: { id: session.userId },
    select: { dateOfBirth: true },
  });
  if (!parent) {
    return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
  }

  const parentAgeAtEvent = calculateAgeOnDate(parent.dateOfBirth, event.start);
  if (!Number.isFinite(parentAgeAtEvent)) {
    return NextResponse.json({ error: 'Invalid date of birth' }, { status: 400 });
  }
  if (parentAgeAtEvent < 18) {
    return NextResponse.json({ error: 'Only adults can register a child.' }, { status: 403 });
  }

  const link = await prisma.parentChildLinks.findFirst({
    where: { parentId: session.userId, childId, status: 'ACTIVE' },
    select: { id: true },
  });
  if (!link) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const child = await prisma.userData.findUnique({
    where: { id: childId },
    select: { dateOfBirth: true },
  });
  if (!child) {
    return NextResponse.json({ error: 'Child profile not found' }, { status: 404 });
  }

  const childSensitive = await prisma.sensitiveUserData.findFirst({
    where: { userId: childId },
    select: { email: true },
  });
  const childEmail = childSensitive?.email?.trim() ?? '';
  if (!childEmail) {
    return NextResponse.json(
      { error: 'Child email is required before registration.' },
      { status: 400 },
    );
  }

  const childAgeCheck = validateRegistrantAgeForSelection({
    dateOfBirth: child.dateOfBirth,
    event,
    selection: divisionSelection.selection,
  });
  if (childAgeCheck.error === 'Invalid date of birth') {
    return NextResponse.json({ error: 'Invalid child date of birth' }, { status: 400 });
  }
  if (childAgeCheck.error) {
    return NextResponse.json({ error: childAgeCheck.error }, { status: 403 });
  }
  const childAgeAtEvent = childAgeCheck.ageAtEvent;

  const needsConsent = Array.isArray(event.requiredTemplateIds) && event.requiredTemplateIds.length > 0;
  const consentDocumentId = needsConsent ? crypto.randomUUID() : null;

  const registration = await prisma.eventRegistrations.create({
    data: {
      id: crypto.randomUUID(),
      eventId,
      registrantId: childId,
      parentId: session.userId,
      registrantType: 'CHILD',
      status: needsConsent ? 'PENDINGCONSENT' : 'ACTIVE',
      ageAtEvent: childAgeAtEvent,
      divisionId: divisionSelection.selection.divisionId,
      divisionTypeId: divisionSelection.selection.divisionTypeId,
      divisionTypeKey: divisionSelection.selection.divisionTypeKey,
      consentDocumentId,
      consentStatus: needsConsent ? 'sent' : null,
      createdBy: session.userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  return NextResponse.json({
    registration: withLegacyFields(registration),
    consent: needsConsent
      ? {
          documentId: consentDocumentId,
          status: 'sent',
          parentSignLink: null,
          childSignLink: null,
          childEmail,
        }
      : undefined,
  }, { status: 200 });
}
