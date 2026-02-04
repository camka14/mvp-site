import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

const schema = z.object({
  eventRegistrationId: z.string(),
  templateId: z.string().optional(),
  consentTemplateId: z.string().optional(),
  redirectUrl: z.string().optional(),
}).passthrough();

export async function POST(req: NextRequest) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const registration = await prisma.eventRegistrations.findUnique({
    where: { id: parsed.data.eventRegistrationId },
  });
  if (!registration) {
    return NextResponse.json({ error: 'Registration not found' }, { status: 404 });
  }
  if (registration.registrantType !== 'CHILD') {
    return NextResponse.json({ error: 'Registration is not for a child' }, { status: 400 });
  }
  if (!session.isAdmin && registration.parentId !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const event = await prisma.events.findUnique({ where: { id: registration.eventId } });
  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  const templateId = parsed.data.templateId ?? parsed.data.consentTemplateId ?? event.requiredTemplateIds?.[0];
  if (!templateId) {
    return NextResponse.json({ error: 'templateId is required' }, { status: 400 });
  }

  const documentId = crypto.randomUUID();
  const now = new Date();

  await prisma.eventRegistrations.update({
    where: { id: registration.id },
    data: {
      consentDocumentId: documentId,
      consentStatus: 'sent',
      status: 'PENDINGCONSENT',
      updatedAt: now,
    },
  });

  return NextResponse.json({
    registration: registration.id,
    consent: {
      documentId,
      status: 'sent',
      parentSignLink: null,
      childSignLink: null,
    },
  }, { status: 200 });
}
