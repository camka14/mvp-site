import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { canManageOrganization } from '@/server/accessControl';
import { normalizePublicSlug } from '@/server/organizationPublicSettings';

export const dynamic = 'force-dynamic';

type SlugCheckResponse = {
  slug: string | null;
  available: boolean;
  valid: boolean;
  current: boolean;
  error?: string;
};

const json = (payload: SlugCheckResponse, status = 200) => NextResponse.json(payload, { status });

export async function GET(req: NextRequest) {
  const session = await requireSession(req);
  const url = new URL(req.url);
  const rawSlug = url.searchParams.get('slug') ?? '';
  const organizationId = url.searchParams.get('organizationId')?.trim() ?? '';

  let slug: string | null;
  try {
    slug = normalizePublicSlug(rawSlug);
  } catch (error) {
    return json({
      slug: null,
      available: false,
      valid: false,
      current: false,
      error: error instanceof Error ? error.message : 'Invalid public slug.',
    });
  }

  if (!slug) {
    return json({
      slug: null,
      available: false,
      valid: false,
      current: false,
      error: 'Enter a public slug.',
    });
  }

  let currentPublicSlug: string | null = null;
  if (organizationId) {
    const organization = await (prisma as any).organizations.findUnique({
      where: { id: organizationId },
      select: {
        id: true,
        ownerId: true,
        hostIds: true,
        officialIds: true,
        publicSlug: true,
      },
    });
    if (!organization) {
      return json({
        slug,
        available: false,
        valid: false,
        current: false,
        error: 'Organization not found.',
      }, 404);
    }
    if (!(await canManageOrganization(session, organization))) {
      return json({
        slug,
        available: false,
        valid: false,
        current: false,
        error: 'Forbidden.',
      }, 403);
    }
    currentPublicSlug = typeof organization.publicSlug === 'string' ? organization.publicSlug : null;
  }

  const isCurrent = currentPublicSlug === slug;
  if (isCurrent) {
    return json({
      slug,
      available: true,
      valid: true,
      current: true,
    });
  }

  const slugOwner = await (prisma as any).organizations.findFirst({
    where: {
      publicSlug: slug,
      ...(organizationId ? { id: { not: organizationId } } : {}),
    },
    select: { id: true },
  });

  return json({
    slug,
    available: !slugOwner,
    valid: true,
    current: false,
    error: slugOwner ? 'This public slug is already in use.' : undefined,
  });
}
