import { NextRequest, NextResponse } from 'next/server';
import {
  OrganizationClaimMethodEnum,
  OrganizationClaimStatusEnum,
} from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import { requireRazumlyAdmin } from '@/server/razumlyAdmin';

export const dynamic = 'force-dynamic';

const positiveInt = (value: string | null, fallback: number, max: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), max) : fallback;
};

export async function GET(req: NextRequest) {
  await requireRazumlyAdmin(req);
  const status = req.nextUrl.searchParams.get('status');
  const method = req.nextUrl.searchParams.get('method');
  const organizationId = req.nextUrl.searchParams.get('organizationId')?.trim() || undefined;
  const claimantUserId = req.nextUrl.searchParams.get('claimantUserId')?.trim() || undefined;
  const page = positiveInt(req.nextUrl.searchParams.get('page'), 1, 10_000);
  const pageSize = positiveInt(req.nextUrl.searchParams.get('pageSize'), 25, 100);
  const where = {
    ...(status && Object.values(OrganizationClaimStatusEnum).includes(status as OrganizationClaimStatusEnum)
      ? { status: status as OrganizationClaimStatusEnum }
      : {}),
    ...(method && Object.values(OrganizationClaimMethodEnum).includes(method as OrganizationClaimMethodEnum)
      ? { method: method as OrganizationClaimMethodEnum }
      : {}),
    ...(organizationId ? { organizationId } : {}),
    ...(claimantUserId ? { claimantUserId } : {}),
  };
  const [claims, total] = await Promise.all([
    prisma.organizationClaims.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        organizationId: true,
        claimantUserId: true,
        requestType: true,
        status: true,
        method: true,
        verificationLevel: true,
        roleTitle: true,
        issueReason: true,
        requestedOutcome: true,
        submittedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.organizationClaims.count({ where }),
  ]);
  const organizationIds = Array.from(new Set(claims.map((claim) => claim.organizationId)));
  const organizations = organizationIds.length
    ? await prisma.organizations.findMany({
        where: { id: { in: organizationIds } },
        select: { id: true, name: true, ownershipStatus: true },
      })
    : [];
  const organizationById = new Map(organizations.map((organization) => [organization.id, organization]));
  return NextResponse.json({
    claims: claims.map((claim) => ({
      ...claim,
      organization: organizationById.get(claim.organizationId) ?? null,
    })),
    pagination: {
      page,
      pageSize,
      total,
      pageCount: Math.ceil(total / pageSize),
    },
  }, { status: 200 });
}
