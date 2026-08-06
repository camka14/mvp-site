import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRazumlyAdmin } from '@/server/razumlyAdmin';
import { serializeFeedback, selectFeedback } from '../route';

export const dynamic = 'force-dynamic';

const statuses = new Set(['NEW', 'IN_REVIEW', 'PLANNED', 'CLOSED']);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await requireRazumlyAdmin(req);
    const { id: rawId } = await params;
    const id = rawId.trim();
    if (!id) {
      return NextResponse.json({ error: 'Feedback identifier is required.' }, { status: 400 });
    }

    const body = await req.json().catch(() => null);
    const status = typeof body?.status === 'string' ? body.status.trim() : '';
    const hasReviewNotes = Object.prototype.hasOwnProperty.call(body ?? {}, 'reviewNotes');
    const reviewNotes = hasReviewNotes && typeof body?.reviewNotes === 'string'
      ? body.reviewNotes.trim()
      : hasReviewNotes
        ? null
        : undefined;

    if (!statuses.has(status)) {
      return NextResponse.json({ error: 'Invalid feedback status.' }, { status: 400 });
    }
    if (reviewNotes !== undefined && reviewNotes !== null && reviewNotes.length > 5000) {
      return NextResponse.json({ error: 'Review notes are too long.' }, { status: 400 });
    }

    const existing = await prisma.feedbackSubmissions.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Feedback submission not found.' }, { status: 404 });
    }

    const shouldMarkReviewed = status !== 'NEW' || (typeof reviewNotes === 'string' && reviewNotes.length > 0);
    const updated = await prisma.feedbackSubmissions.update({
      where: { id },
      data: {
        status,
        ...(reviewNotes !== undefined ? { reviewNotes: reviewNotes || null } : {}),
        ...(shouldMarkReviewed
          ? { reviewedAt: new Date(), reviewedByUserId: admin.userId }
          : {}),
      },
      select: selectFeedback,
    });

    return NextResponse.json({ item: serializeFeedback(updated) }, { status: 200 });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Failed to update admin feedback', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Unable to update feedback.' }, { status: 500 });
  }
}
