import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { withLegacyFields } from '@/server/legacyFormat';
import { calculateAgeOnDate, formatAgeRange, isAgeWithinRange } from '@/lib/age';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const session = await requireSession(req);
  const { eventId } = await params;
  const event = await prisma.events.findUnique({ where: { id: eventId } });
  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  const user = await prisma.userData.findUnique({
    where: { id: session.userId },
    select: { dateOfBirth: true },
  });
  if (!user) {
    return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
  }

  const ageAtEvent = calculateAgeOnDate(user.dateOfBirth, event.start);
  if (!Number.isFinite(ageAtEvent)) {
    return NextResponse.json({ error: 'Invalid date of birth' }, { status: 400 });
  }

  // Product rule: minors must be registered by a parent/guardian.
  if (ageAtEvent < 18) {
    return NextResponse.json(
      { error: 'Only adults can register themselves. A parent must register you.' },
      { status: 403 },
    );
  }

  if (!isAgeWithinRange(ageAtEvent, event.minAge, event.maxAge)) {
    return NextResponse.json(
      { error: `This event is limited to ages ${formatAgeRange(event.minAge, event.maxAge)}.` },
      { status: 403 },
    );
  }

  const registration = await prisma.eventRegistrations.create({
    data: {
      id: crypto.randomUUID(),
      eventId,
      registrantId: session.userId,
      registrantType: 'SELF',
      status: Array.isArray(event.requiredTemplateIds) && event.requiredTemplateIds.length > 0 ? 'PENDINGCONSENT' : 'ACTIVE',
      ageAtEvent,
      createdBy: session.userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  return NextResponse.json({ registration: withLegacyFields(registration) }, { status: 200 });
}
