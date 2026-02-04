import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { withLegacyFields } from '@/server/legacyFormat';

export const dynamic = 'force-dynamic';

const schema = z.object({
  childId: z.string().optional(),
}).passthrough();

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

  const childId = parsed.data.childId;
  if (!childId) {
    return NextResponse.json({ error: 'childId is required' }, { status: 400 });
  }

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
        }
      : undefined,
  }, { status: 200 });
}
