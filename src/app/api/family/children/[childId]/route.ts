import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

const updateSchema = z.object({
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().optional(),
  dateOfBirth: z.string(),
  relationship: z.string().optional(),
}).passthrough();

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ childId: string }> }) {
  const session = await requireSession(req);
  const { childId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const link = await prisma.parentChildLinks.findFirst({
    where: {
      parentId: session.userId,
      childId,
      status: { in: ['ACTIVE', 'PENDING'] },
    },
  });

  if (!link) {
    return NextResponse.json({ error: 'Child link not found' }, { status: 404 });
  }

  const dob = new Date(parsed.data.dateOfBirth);
  if (Number.isNaN(dob.getTime())) {
    return NextResponse.json({ error: 'Invalid dateOfBirth' }, { status: 400 });
  }

  const now = new Date();
  const normalizedEmail = parsed.data.email?.trim().toLowerCase();

  await prisma.$transaction(async (tx) => {
    await tx.userData.update({
      where: { id: childId },
      data: {
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        dateOfBirth: dob,
        updatedAt: now,
      },
    });

    if (parsed.data.relationship !== undefined) {
      await tx.parentChildLinks.update({
        where: { id: link.id },
        data: {
          relationship: parsed.data.relationship || null,
          updatedAt: now,
        },
      });
    }

    if (normalizedEmail !== undefined) {
      const existingSensitive = await tx.sensitiveUserData.findFirst({
        where: { userId: childId },
      });

      if (normalizedEmail) {
        if (existingSensitive) {
          await tx.sensitiveUserData.update({
            where: { id: existingSensitive.id },
            data: {
              email: normalizedEmail,
              updatedAt: now,
            },
          });
        } else {
          await tx.sensitiveUserData.create({
            data: {
              id: childId,
              userId: childId,
              email: normalizedEmail,
              createdAt: now,
              updatedAt: now,
            },
          });
        }
      }
    }
  });

  return NextResponse.json(
    {
      childUserId: childId,
      linkId: link.id,
      status: link.status.toLowerCase(),
    },
    { status: 200 },
  );
}
