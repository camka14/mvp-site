import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

const schema = z.object({
  userId: z.string().optional(),
  userEmail: z.string().optional(),
  redirectUrl: z.string().optional(),
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

  const userId = parsed.data.userId ?? session.userId;
  if (!session.isAdmin && session.userId !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const required = Array.isArray(event.requiredTemplateIds) ? event.requiredTemplateIds : [];
  if (!required.length) {
    return NextResponse.json({ signLinks: [] }, { status: 200 });
  }

  const templates = await prisma.templateDocuments.findMany({
    where: { id: { in: required } },
  });

  const signed = await prisma.signedDocuments.findMany({
    where: {
      userId,
      templateId: { in: required },
      status: { in: ['SIGNED', 'signed'] },
    },
    select: { templateId: true },
  });

  const signedIds = new Set(signed.map((doc) => doc.templateId));

  const signLinks = templates
    .filter((template) => !(template.signOnce && signedIds.has(template.id)))
    .map((template) => {
      const type = template.type === 'TEXT' ? 'TEXT' : 'TEXT';
      const content = template.content ?? `Please acknowledge ${template.title ?? 'this document'}.`;
      return {
        templateId: template.id,
        type,
        title: template.title,
        signOnce: template.signOnce ?? false,
        content,
      };
    });

  return NextResponse.json({ signLinks }, { status: 200 });
}
