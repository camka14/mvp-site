import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withLegacyFields } from '@/server/legacyFormat';
import { requireRazumlyAdmin } from '@/server/razumlyAdmin';

const reviewUpdateSchema = z.object({
  reviewStatus: z.enum(['NONE', 'OPEN', 'IN_PROGRESS', 'RESOLVED']).optional(),
  reviewNotes: z.string().nullable().optional(),
}).refine(
  (value) => Object.keys(value).length > 0,
  { message: 'At least one review field must be provided.' },
);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRazumlyAdmin(req);
    const body = await req.json().catch(() => null);
    const parsed = reviewUpdateSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
    }

    const { id } = await params;
    const organization = await prisma.organizations.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!organization) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    const updatedOrganization = await prisma.organizations.update({
      where: { id },
      data: {
        ...(parsed.data.reviewStatus ? { verificationReviewStatus: parsed.data.reviewStatus } : {}),
        ...(Object.prototype.hasOwnProperty.call(parsed.data, 'reviewNotes')
          ? { verificationReviewNotes: parsed.data.reviewNotes?.trim() || null }
          : {}),
        verificationReviewUpdatedAt: new Date(),
        updatedAt: new Date(),
      },
    });

    return NextResponse.json(withLegacyFields(updatedOrganization), { status: 200 });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Failed to update organization verification review', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
