import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  OrganizationClaimVerificationLevelEnum,
  OrganizationOwnershipResolutionEnum,
} from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import { requireRazumlyAdmin } from '@/server/razumlyAdmin';
import { decideOrganizationClaim } from '@/server/organizationClaims/service';
import { organizationClaimErrorResponse } from '@/server/organizationClaims/http';

export const dynamic = 'force-dynamic';

const schema = z.object({
  action: z.enum(['APPROVE', 'REJECT', 'MARK_DISPUTED', 'RESOLVE', 'REVOKE', 'RESTORE']),
  verificationLevel: z.nativeEnum(OrganizationClaimVerificationLevelEnum).optional(),
  userDecisionMessage: z.string().min(1).max(2000),
  internalDecisionNotes: z.string().max(4000).nullable().optional(),
  resolution: z.nativeEnum(OrganizationOwnershipResolutionEnum).nullable().optional(),
}).strict();

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ claimId: string }> },
) {
  const admin = await requireRazumlyAdmin(req);
  const { claimId } = await params;
  const claim = await prisma.organizationClaims.findUnique({ where: { id: claimId } });
  if (!claim) {
    return NextResponse.json({ error: 'Claim not found.' }, { status: 404 });
  }
  const [organization, domain, evidence, events, claimant, staff] = await Promise.all([
    prisma.organizations.findUnique({
      where: { id: claim.organizationId },
      select: {
        id: true,
        name: true,
        ownerId: true,
        website: true,
        originType: true,
        ownershipStatus: true,
        claimVerificationLevel: true,
      },
    }),
    prisma.organizationDomains.findMany({
      where: { organizationId: claim.organizationId },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    }),
    prisma.organizationClaimEvidence.findMany({
      where: { claimId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        method: true,
        status: true,
        expiresAt: true,
        verifiedAt: true,
        lastCheckedAt: true,
        failureReason: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.organizationClaimEvents.findMany({
      where: { claimId },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.authUser.findUnique({
      where: { id: claim.claimantUserId },
      select: { id: true, email: true, name: true, emailVerifiedAt: true },
    }),
    prisma.staffMembers.findMany({
      where: { organizationId: claim.organizationId },
      select: { userId: true, types: true, roleId: true },
    }),
  ]);
  const currentOwner = organization?.ownerId
    ? await prisma.authUser.findUnique({
        where: { id: organization.ownerId },
        select: { id: true, email: true, name: true, emailVerifiedAt: true },
      })
    : null;
  return NextResponse.json({
    claim,
    organization,
    domains: domain,
    evidence,
    events,
    claimant,
    currentOwner,
    staff,
    reviewedBy: admin.adminEmail,
  }, { status: 200 });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ claimId: string }> },
) {
  try {
    const [admin, { claimId }, body] = await Promise.all([
      requireRazumlyAdmin(req),
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
    const claim = await decideOrganizationClaim(
      { claimId, ...parsed.data },
      { userId: admin.userId, adminEmail: admin.adminEmail },
    );
    return NextResponse.json({ claim }, { status: 200 });
  } catch (error) {
    return organizationClaimErrorResponse(error);
  }
}
