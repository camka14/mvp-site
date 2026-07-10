import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import {
  getOrganizationReviewEligibility,
  getOrganizationReviewsPayload,
  upsertOrganizationReview,
} from '@/server/organizationReviews';

const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  body: z.string().trim().max(2000).nullable().optional(),
});

const requireOwnedReview = async (organizationId: string, reviewId: string, reviewerUserId: string) => {
  const review = await prisma.organizationReviews.findUnique({ where: { id: reviewId } });
  if (!review || review.organizationId !== organizationId) {
    throw new Response('Not found', { status: 404 });
  }
  if (review.reviewerUserId !== reviewerUserId) {
    throw new Response('Forbidden', { status: 403 });
  }
  return review;
};

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; reviewId: string }> },
) {
  try {
    const session = await requireSession(req);
    const [{ id, reviewId }, body] = await Promise.all([params, req.json().catch(() => null)]);
    const parsed = reviewSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid review', details: parsed.error.flatten() }, { status: 400 });
    }
    await requireOwnedReview(id, reviewId, session.userId);
    const eligibility = await getOrganizationReviewEligibility(id, session);
    if (!eligibility.canReview) {
      return NextResponse.json({ error: eligibility.cannotReviewReason ?? 'Forbidden' }, { status: 403 });
    }
    await upsertOrganizationReview(id, session.userId, parsed.data);
    return NextResponse.json(await getOrganizationReviewsPayload(id, session), { status: 200 });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Failed to update organization review', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; reviewId: string }> },
) {
  try {
    const session = await requireSession(req);
    const { id, reviewId } = await params;
    await requireOwnedReview(id, reviewId, session.userId);
    await prisma.organizationReviews.delete({ where: { id: reviewId } });
    return NextResponse.json(await getOrganizationReviewsPayload(id, session), { status: 200 });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Failed to delete organization review', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
