import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { withLegacyFields } from '@/server/legacyFormat';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const session = await requireSession(req);
  const { eventId } = await params;
  const event = await prisma.events.findUnique({ where: { id: eventId } });
  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  const registration = await prisma.eventRegistrations.create({
    data: {
      id: crypto.randomUUID(),
      eventId,
      registrantId: session.userId,
      registrantType: 'SELF',
      status: Array.isArray(event.requiredTemplateIds) && event.requiredTemplateIds.length > 0 ? 'PENDINGCONSENT' : 'ACTIVE',
      createdBy: session.userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  return NextResponse.json({ registration: withLegacyFields(registration) }, { status: 200 });
}
