import { NextRequest, NextResponse } from 'next/server';
import { getPublicOrganizationCatalog } from '@/server/publicOrganizationCatalog';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const catalog = await getPublicOrganizationCatalog(slug, { surface: 'any', limit: 6 });
  if (!catalog) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json(catalog, { status: 200 });
}
