import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { withLegacyList, withLegacyFields } from '@/server/legacyFormat';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  documentId: z.string().optional(),
  templateId: z.string(),
  eventId: z.string().optional(),
  userId: z.string().optional(),
  userEmail: z.string().optional(),
}).passthrough();

export async function GET(req: NextRequest) {
  const session = await requireSession(req);
  const params = req.nextUrl.searchParams;
  const documentId = params.get('documentId');
  const templateId = params.get('templateId');
  const eventId = params.get('eventId');
  const userId = params.get('userId') ?? session.userId;

  if (!session.isAdmin && userId !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const where: any = { userId };
  if (documentId) where.signedDocumentId = documentId;
  if (templateId) where.templateId = templateId;
  if (eventId) where.eventId = eventId;

  const docs = await prisma.signedDocuments.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ signedDocuments: withLegacyList(docs) }, { status: 200 });
}

export async function POST(req: NextRequest) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const userId = parsed.data.userId ?? session.userId;
  if (!session.isAdmin && session.userId !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const record = await prisma.signedDocuments.create({
    data: {
      id: crypto.randomUUID(),
      signedDocumentId: parsed.data.documentId ?? crypto.randomUUID(),
      templateId: parsed.data.templateId,
      userId,
      documentName: 'Signed Document',
      hostId: null,
      organizationId: null,
      eventId: parsed.data.eventId ?? null,
      status: 'SIGNED',
      signedAt: new Date().toISOString(),
      signerEmail: parsed.data.userEmail ?? null,
      roleIndex: null,
      signerRole: null,
      ipAddress: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      requestId: req.headers.get('x-request-id') ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  return NextResponse.json(withLegacyFields(record), { status: 201 });
}
