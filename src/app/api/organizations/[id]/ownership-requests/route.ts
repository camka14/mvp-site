import { NextRequest, NextResponse } from 'next/server';
import { OrganizationClaimRequestTypeEnum } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { ORG_PERMISSIONS } from '@/lib/organizationPermissions';
import { hasOrgPermission } from '@/server/accessControl';
import { organizationClaimErrorResponse } from '@/server/organizationClaims/http';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const [session, { id }] = await Promise.all([requireSession(req), params]);
    const organization = await prisma.organizations.findUnique({
      where: { id },
      select: { id: true, ownerId: true },
    });
    if (!organization) {
      return NextResponse.json({ error: 'Organization not found.' }, { status: 404 });
    }
    if (!(await hasOrgPermission(session, organization, ORG_PERMISSIONS.ORGANIZATION_MANAGE))) {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
    }
    const requests = await prisma.organizationClaims.findMany({
      where: {
        organizationId: id,
        requestType: {
          in: [
            OrganizationClaimRequestTypeEnum.OWNERSHIP_TRANSFER,
            OrganizationClaimRequestTypeEnum.OWNERSHIP_DISPUTE,
          ],
        },
      },
      select: {
        id: true,
        claimantUserId: true,
        requestType: true,
        status: true,
        verificationLevel: true,
        roleTitle: true,
        issueReason: true,
        requestedOutcome: true,
        submittedAt: true,
        currentOwnerResponseDueAt: true,
        currentOwnerRespondedAt: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return NextResponse.json({ requests }, { status: 200 });
  } catch (error) {
    return organizationClaimErrorResponse(error);
  }
}
