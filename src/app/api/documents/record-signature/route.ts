import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';

const schema = z.object({
  templateId: z.string(),
  documentId: z.string(),
  eventId: z.string().optional(),
  userId: z.string().optional(),
  user: z.record(z.string(), z.any()).optional(),
  type: z.string().optional(),
}).passthrough();

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

export async function POST(request: NextRequest) {
  const session = await requireSession(request);
  const body = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'templateId and documentId are required.' }, { status: 400 });
  }

  const userId = parsed.data.userId ?? session.userId;
  if (!session.isAdmin && userId !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await prisma.signedDocuments.create({
    data: {
      id: crypto.randomUUID(),
      signedDocumentId: parsed.data.documentId,
      templateId: parsed.data.templateId,
      userId,
      documentName: parsed.data.type === 'TEXT' ? 'Text Waiver' : 'Signed Document',
      hostId: null,
      organizationId: null,
      eventId: parsed.data.eventId ?? null,
      status: 'SIGNED',
      signedAt: new Date().toISOString(),
      signerEmail: parsed.data.user?.email ?? null,
      roleIndex: null,
      signerRole: null,
      ipAddress: resolveIpAddress(request),
      requestId: request.headers.get('x-request-id') ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true }, { status: 200 });
}
