import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { OrganizationClaimRequestTypeEnum } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import {
  createOrganizationClaimMfaChallenge,
  readTotpMfaRequestMetadata,
} from '@/server/authTotpMfa';
import {
  respondToOwnershipRequest,
} from '@/server/organizationClaims/service';
import { organizationClaimErrorResponse } from '@/server/organizationClaims/http';

export const dynamic = 'force-dynamic';

const schema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('START_APPROVAL'),
  }).strict(),
  z.object({
    action: z.literal('DENY'),
    message: z.string().min(1).max(4000),
  }).strict(),
  z.object({
    action: z.literal('RESPOND'),
    message: z.string().min(1).max(4000),
    publicEvidenceUrl: z.string().url().max(2000).nullable().optional(),
  }).strict(),
]);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; requestId: string }> },
) {
  try {
    const [session, { id, requestId }, body] = await Promise.all([
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
    if (parsed.data.action === 'START_APPROVAL') {
      const [organization, claim] = await Promise.all([
        prisma.organizations.findUnique({
          where: { id },
          select: { id: true, ownerId: true },
        }),
        prisma.organizationClaims.findFirst({
          where: { id: requestId, organizationId: id },
          select: { requestType: true },
        }),
      ]);
      if (!organization || !claim) {
        return NextResponse.json({ error: 'Ownership request not found.' }, { status: 404 });
      }
      if (organization.ownerId !== session.userId) {
        return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
      }
      if (claim.requestType !== OrganizationClaimRequestTypeEnum.OWNERSHIP_TRANSFER) {
        return NextResponse.json(
          { error: 'Ownership disputes are decided by BracketIQ administrators.' },
          { status: 400 },
        );
      }
      const challenge = await createOrganizationClaimMfaChallenge({
        userId: session.userId,
        sessionVersion: session.sessionVersion,
        metadata: readTotpMfaRequestMetadata(req),
      });
      if (!challenge) {
        return NextResponse.json({
          error: 'Set up an authenticator before approving an ownership transfer.',
          code: 'MFA_SETUP_REQUIRED_FOR_ORGANIZATION_CLAIM',
          setupUrl: `/profile?mfa=organization-claim&returnTo=${encodeURIComponent(`/organizations/${id}`)}`,
        }, { status: 403 });
      }
      return NextResponse.json({
        code: 'MFA_REQUIRED_FOR_ORGANIZATION_CLAIM',
        mfa: challenge,
      }, { status: 200 });
    }
    const claim = await respondToOwnershipRequest(id, requestId, session, parsed.data);
    return NextResponse.json({ claim }, { status: 200 });
  } catch (error) {
    return organizationClaimErrorResponse(error);
  }
}
