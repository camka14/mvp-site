import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { parseDateInput, withLegacyFields } from '@/server/legacyFormat';

export const dynamic = 'force-dynamic';

const schema = z.object({
  id: z.string(),
  body: z.string(),
  userId: z.string(),
  chatId: z.string(),
  sentTime: z.string().optional(),
  readByIds: z.array(z.string()).optional(),
  attachmentUrls: z.array(z.string()).optional(),
}).passthrough();

export async function POST(req: NextRequest) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  if (!session.isAdmin && parsed.data.userId !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const sentTime = parseDateInput(parsed.data.sentTime) ?? new Date();

  const message = await prisma.messages.create({
    data: {
      id: parsed.data.id,
      body: parsed.data.body,
      userId: parsed.data.userId,
      chatId: parsed.data.chatId,
      sentTime,
      readByIds: parsed.data.readByIds ?? [],
      attachmentUrls: parsed.data.attachmentUrls ?? [],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  return NextResponse.json(withLegacyFields(message), { status: 201 });
}
