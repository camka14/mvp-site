import { NextRequest, NextResponse } from 'next/server';
import { withLegacyList, withLegacyFields } from '@/server/legacyFormat';
import { requireRazumlyAdmin } from '@/server/razumlyAdmin';
import { runAffiliateSourceScrape } from '@/server/affiliateImports/service';

const normalizeId = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRazumlyAdmin(req);
    const { id: rawSourceId } = await params;
    const sourceId = normalizeId(rawSourceId);
    if (!sourceId) {
      return NextResponse.json({ error: 'Source id is required.' }, { status: 400 });
    }

    const result = await runAffiliateSourceScrape(sourceId, { requestedByUserId: session.userId });
    return NextResponse.json(
      {
        run: withLegacyFields(result.run),
        candidates: withLegacyList(result.candidates),
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : 'Failed to scrape affiliate source.';
    const status = message.includes('not found') ? 404 : message.includes('No active scrape mapping') ? 409 : 500;
    if (status === 500) {
      console.error('Failed to scrape affiliate source', error);
    }
    return NextResponse.json({ error: message }, { status });
  }
}
