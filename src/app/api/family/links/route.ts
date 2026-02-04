import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

const schema = z.object({
  childUserId: z.string().optional(),
  childEmail: z.string().optional(),
  relationship: z.string().optional(),
}).passthrough();

export async function POST(req: NextRequest) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  let childId = parsed.data.childUserId;
  if (!childId && parsed.data.childEmail) {
    const sensitive = await prisma.sensitiveUserData.findFirst({
      where: { email: parsed.data.childEmail.toLowerCase() },
    });
    childId = sensitive?.userId;
  }

  if (!childId) {
    return NextResponse.json({ error: 'Child not found' }, { status: 404 });
  }

  const link = await prisma.parentChildLinks.create({
    data: {
      id: crypto.randomUUID(),
      parentId: session.userId,
      childId,
      status: 'PENDING',
      relationship: parsed.data.relationship ?? null,
      createdBy: session.userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  const child = await prisma.userData.findUnique({ where: { id: childId } });

  return NextResponse.json({
    linkId: link.id,
    status: 'pending',
    child: child
      ? {
          userId: childId,
          firstName: child.firstName ?? '',
          lastName: child.lastName ?? '',
        }
      : undefined,
  }, { status: 200 });
}
