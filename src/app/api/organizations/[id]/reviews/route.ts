import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getOptionalSession, requireSession } from '@/lib/permissions';
import {
  getOrganizationReviewEligibility,
  getOrganizationReviewsPayload,
  upsertOrganizationReview,
} from '@/server/organizationReviews';

export const dynamic = 'force-dynamic';

const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  body: z.string().trim().max(2000).nullable().optional(),
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [{ id }, session] = await Promise.all([params, getOptionalSession(req)]);
    const payload = await getOrganizationReviewsPayload(id, session);
    return NextResponse.json(payload, { status: 200 });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Failed to load organization reviews', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(req);
    const [{ id }, body] = await Promise.all([params, req.json().catch(() => null)]);
    const parsed = reviewSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid review', details: parsed.error.flatten() }, { status: 400 });
    }

    const eligibility = await getOrganizationReviewEligibility(id, session);
    if (!eligibility.organizationExists) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (!eligibility.canReview) {
      return NextResponse.json({ error: eligibility.cannotReviewReason ?? 'Forbidden' }, { status: 403 });
    }

    await upsertOrganizationReview(id, session.userId, parsed.data);
    const payload = await getOrganizationReviewsPayload(id, session);
    return NextResponse.json(payload, { status: 200 });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Failed to save organization review', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
