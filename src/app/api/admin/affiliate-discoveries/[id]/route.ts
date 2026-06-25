import { NextRequest, NextResponse } from 'next/server';
import { withLegacyFields } from '@/server/legacyFormat';
import { requireRazumlyAdmin } from '@/server/razumlyAdmin';
import { getAffiliateCandidate } from '@/server/affiliateImports/service';

const normalizeId = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRazumlyAdmin(req);
    const { id: rawCandidateId } = await params;
    const candidateId = normalizeId(rawCandidateId);
    if (!candidateId) {
      return NextResponse.json({ error: 'Candidate id is required.' }, { status: 400 });
    }

    const candidate = await getAffiliateCandidate(candidateId);
    if (!candidate) {
      return NextResponse.json({ error: 'Affiliate discovery not found.' }, { status: 404 });
    }

    return NextResponse.json({ candidate: withLegacyFields(candidate) }, { status: 200 });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Failed to load affiliate discovery', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
