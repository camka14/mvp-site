import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; templateDocumentId: string }> },
) {
  const session = await requireSession(req);
  const { id, templateDocumentId } = await params;

  const org = await prisma.organizations.findUnique({ where: { id } });
  if (!org) {
    return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
  }
  if (!session.isAdmin && org.ownerId !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const template = await prisma.templateDocuments.findUnique({
    where: { id: templateDocumentId },
  });
  if (!template || template.organizationId !== id) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  const [eventsToUpdate, timeSlotsToUpdate] = await Promise.all([
    prisma.events.findMany({
      where: { requiredTemplateIds: { has: templateDocumentId } },
      select: { id: true, requiredTemplateIds: true },
    }),
    prisma.timeSlots.findMany({
      where: { requiredTemplateIds: { has: templateDocumentId } },
      select: { id: true, requiredTemplateIds: true },
    }),
  ]);

  const now = new Date();
  await prisma.$transaction([
    ...eventsToUpdate.map((event) => prisma.events.update({
      where: { id: event.id },
      data: {
        requiredTemplateIds: event.requiredTemplateIds.filter((entry) => entry !== templateDocumentId),
        updatedAt: now,
      },
    })),
    ...timeSlotsToUpdate.map((timeSlot) => prisma.timeSlots.update({
      where: { id: timeSlot.id },
      data: {
        requiredTemplateIds: timeSlot.requiredTemplateIds.filter((entry) => entry !== templateDocumentId),
        updatedAt: now,
      },
    })),
    prisma.templateDocuments.delete({
      where: { id: templateDocumentId },
    }),
  ]);

  return NextResponse.json({ deleted: true }, { status: 200 });
}
