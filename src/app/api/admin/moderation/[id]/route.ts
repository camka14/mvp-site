import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ModerationReportStatusEnum } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import { withLegacyFields } from '@/server/legacyFormat';
import { requireRazumlyAdmin } from '@/server/razumlyAdmin';

const updateSchema = z.object({
  status: z.nativeEnum(ModerationReportStatusEnum).optional(),
  reviewNotes: z.string().trim().max(4000).nullable().optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: 'At least one moderation field must be provided.',
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRazumlyAdmin(req);
    const body = await req.json().catch(() => null);
    const parsed = updateSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
    }

    const { id } = await params;
    const report = await prisma.moderationReport.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!report) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const nextStatus = parsed.data.status;
    const reviewedStatus = nextStatus && nextStatus !== ModerationReportStatusEnum.OPEN;
    const now = new Date();

    const updated = await prisma.moderationReport.update({
      where: { id },
      data: {
        ...(nextStatus ? { status: nextStatus } : {}),
        ...(Object.prototype.hasOwnProperty.call(parsed.data, 'reviewNotes')
          ? { reviewNotes: parsed.data.reviewNotes?.trim() || null }
          : {}),
        ...(reviewedStatus
          ? {
              reviewedAt: now,
              reviewedByUserId: session.userId,
            }
          : {}),
        updatedAt: now,
      },
    });

    return NextResponse.json(withLegacyFields(updated), { status: 200 });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Failed to update moderation report', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
