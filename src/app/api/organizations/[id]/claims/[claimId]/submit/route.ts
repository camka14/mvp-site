import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/permissions';
import { submitOrganizationClaim } from '@/server/organizationClaims/service';
import { organizationClaimErrorResponse } from '@/server/organizationClaims/http';

export const dynamic = 'force-dynamic';

const schema = z.object({
  roleTitle: z.string().max(200).nullable().optional(),
  explanation: z.string().max(4000).nullable().optional(),
  publicEvidenceUrl: z.string().url().max(2000).nullable().optional(),
  officialContactName: z.string().max(200).nullable().optional(),
  officialContactEmail: z.string().email().max(320).nullable().optional(),
  officialContactPhone: z.string().max(100).nullable().optional(),
  officialContactUrl: z.string().url().max(2000).nullable().optional(),
  certified: z.boolean().optional(),
}).strict();

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; claimId: string }> },
) {
  try {
    const [session, { id, claimId }, body] = await Promise.all([
      requireSession(req),
      params,
      req.json().catch(() => null),
    ]);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const claim = await submitOrganizationClaim(id, claimId, session, parsed.data);
    return NextResponse.json({ claim }, { status: 200 });
  } catch (error) {
    return organizationClaimErrorResponse(error);
  }
}
