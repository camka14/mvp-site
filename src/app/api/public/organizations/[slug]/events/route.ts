import { NextRequest, NextResponse } from 'next/server';
import {
  getPublicOrganizationBySlug,
  listPublicOrganizationEvents,
} from '@/server/publicOrganizationCatalog';
import { buildCacheKey, getOrSetJsonCache } from '@/server/cache';

export const dynamic = 'force-dynamic';

const PUBLIC_ORGANIZATION_CACHE_TTL_SECONDS = 30;

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const limit = Number(req.nextUrl.searchParams.get('limit') ?? '12');
  const cached = await getOrSetJsonCache(
    buildCacheKey('public-organization-events', slug, 'any', limit),
    PUBLIC_ORGANIZATION_CACHE_TTL_SECONDS,
    async () => {
      const organization = await getPublicOrganizationBySlug(slug, { surface: 'any' });
      if (!organization) {
        return null;
      }
      const events = await listPublicOrganizationEvents(organization, { limit });
      return { organization, events };
    },
  );
  if (!cached.value) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json(cached.value, {
    status: 200,
    headers: {
      'X-BracketIQ-Cache': `${cached.backend}; ${cached.cacheStatus}`,
    },
  });
}
