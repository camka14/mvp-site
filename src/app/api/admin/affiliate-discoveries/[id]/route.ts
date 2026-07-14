import { NextRequest, NextResponse } from 'next/server';
import { requireRazumlyAdmin } from '@/server/razumlyAdmin';
import {
  deleteAffiliateCandidate,
  getAffiliateCandidate,
  reclassifyAffiliateCandidate,
} from '@/server/affiliateImports/service';

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

    return NextResponse.json({ candidate: candidate }, { status: 200 });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Failed to load affiliate discovery', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRazumlyAdmin(req);
    const { id: rawCandidateId } = await params;
    const candidateId = normalizeId(rawCandidateId);
    if (!candidateId) {
      return NextResponse.json({ error: 'Candidate id is required.' }, { status: 400 });
    }

    const candidate = await deleteAffiliateCandidate(candidateId);
    return NextResponse.json({ deleted: true, candidate: candidate }, { status: 200 });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : 'Failed to delete affiliate discovery.';
    const status = message.includes('not found') ? 404 : 500;
    if (status === 500) {
      console.error('Failed to delete affiliate discovery', error);
    }
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRazumlyAdmin(req);
    const { id: rawCandidateId } = await params;
    const candidateId = normalizeId(rawCandidateId);
    if (!candidateId) {
      return NextResponse.json({ error: 'Candidate id is required.' }, { status: 400 });
    }

    const body = await req.json().catch(() => null);
    const listingKind = typeof body?.listingKind === 'string' ? body.listingKind : null;
    if (!listingKind) {
      return NextResponse.json({ error: 'Listing kind is required.' }, { status: 400 });
    }

    const result = await reclassifyAffiliateCandidate(candidateId, listingKind);
    return NextResponse.json({
      candidate: result.candidate,
      target: result.target,
    }, { status: 200 });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : 'Failed to update affiliate discovery.';
    const status = message.includes('not found')
      ? 404
      : message.includes('must be linked')
        || message.includes('organization')
        || message.includes('must include')
        || message.includes('must start')
        || message.includes('deadline has passed')
        || message.includes('cannot be evergreen')
        || message.includes('listing kind')
          ? 409
          : 500;
    if (status === 500) {
      console.error('Failed to update affiliate discovery', error);
    }
    return NextResponse.json({ error: message }, { status });
  }
}
