import { NextRequest, NextResponse } from 'next/server';
import { requireRazumlyAdmin } from '@/server/razumlyAdmin';
import { listAffiliateMappingHumanReviewJobs } from '@/server/affiliateImports/sourceMappingHumanReview';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    await requireRazumlyAdmin(req);
    const jobs = await listAffiliateMappingHumanReviewJobs();
    return NextResponse.json({ jobs, total: jobs.length }, { status: 200 });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Failed to load affiliate mapping human-review jobs', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
