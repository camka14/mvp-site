import { NextRequest, NextResponse } from 'next/server';
import { getPublicOrganizationCatalog } from '@/server/publicOrganizationCatalog';
import { buildCacheKey, getOrSetJsonCache } from '@/server/cache';

export const dynamic = 'force-dynamic';

const PUBLIC_ORGANIZATION_CACHE_TTL_SECONDS = 30;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const cached = await getOrSetJsonCache(
    buildCacheKey('public-organization-catalog', slug, 'any', 6),
    PUBLIC_ORGANIZATION_CACHE_TTL_SECONDS,
    () => getPublicOrganizationCatalog(slug, { surface: 'any', limit: 6 }),
  );
  const catalog = cached.value;
  if (!catalog) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json(catalog, {
    status: 200,
    headers: {
      'X-BracketIQ-Cache': `${cached.backend}; ${cached.cacheStatus}`,
    },
  });
}
