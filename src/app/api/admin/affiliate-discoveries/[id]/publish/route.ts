import { NextRequest, NextResponse } from 'next/server';
import { withLegacyFields } from '@/server/legacyFormat';
import { requireRazumlyAdmin } from '@/server/razumlyAdmin';
import { publishAffiliateCandidate } from '@/server/affiliateImports/service';

const normalizeId = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRazumlyAdmin(req);
    const { id: rawCandidateId } = await params;
    const candidateId = normalizeId(rawCandidateId);
    if (!candidateId) {
      return NextResponse.json({ error: 'Candidate id is required.' }, { status: 400 });
    }

    const published = await publishAffiliateCandidate(candidateId, { publishedByUserId: session.userId });
    return NextResponse.json({ published: withLegacyFields(published) }, { status: 200 });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : 'Failed to publish affiliate discovery.';
    const status = message.includes('not found')
      ? 404
      : message.includes('must be linked') || message.includes('organization')
        ? 409
        : 500;
    if (status === 500) {
      console.error('Failed to publish affiliate discovery', error);
    }
    return NextResponse.json({ error: message }, { status });
  }
}
