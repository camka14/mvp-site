import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  OrganizationClaimMethodEnum,
  OrganizationClaimRequestTypeEnum,
  OrganizationOwnershipIssueReasonEnum,
  OrganizationOwnershipRequestedOutcomeEnum,
} from '@/generated/prisma/client';
import { requireSession } from '@/lib/permissions';
import { getRequestOrigin } from '@/lib/requestOrigin';
import { applyRateLimit, RATE_LIMIT_POLICIES } from '@/server/rateLimit';
import { createOrganizationClaim } from '@/server/organizationClaims/service';
import { organizationClaimErrorResponse } from '@/server/organizationClaims/http';

export const dynamic = 'force-dynamic';

const schema = z.object({
  requestType: z.nativeEnum(OrganizationClaimRequestTypeEnum),
  method: z.nativeEnum(OrganizationClaimMethodEnum).refine(
    (method) => method !== OrganizationClaimMethodEnum.LEGACY_OWNER,
    'Legacy ownership cannot be requested.',
  ),
  verificationEmail: z.string().email().max(320).nullable().optional(),
  roleTitle: z.string().max(200).nullable().optional(),
  explanation: z.string().max(4000).nullable().optional(),
  publicEvidenceUrl: z.string().url().max(2000).nullable().optional(),
  officialContactName: z.string().max(200).nullable().optional(),
  officialContactEmail: z.string().email().max(320).nullable().optional(),
  officialContactPhone: z.string().max(100).nullable().optional(),
  officialContactUrl: z.string().url().max(2000).nullable().optional(),
  issueReason: z.nativeEnum(OrganizationOwnershipIssueReasonEnum).nullable().optional(),
  requestedOutcome: z.nativeEnum(OrganizationOwnershipRequestedOutcomeEnum).nullable().optional(),
  parentRequestId: z.string().max(200).nullable().optional(),
  certified: z.boolean().optional(),
}).strict();

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession(req);
    const [{ id }, body] = await Promise.all([
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
    const rateLimited = await applyRateLimit(
      req,
      RATE_LIMIT_POLICIES.organizationClaimCreate,
      `${session.userId}:${id}:${parsed.data.verificationEmail ?? parsed.data.method}`,
    );
    if (rateLimited) return rateLimited;

    const claim = await createOrganizationClaim(
      {
        organizationId: id,
        ...parsed.data,
        baseUrl: getRequestOrigin(req),
      },
      session,
    );
    return NextResponse.json({ claim }, { status: 201 });
  } catch (error) {
    return organizationClaimErrorResponse(error);
  }
}
