import { NextRequest, NextResponse } from 'next/server';
import {
  getPublicOrganizationBySlug,
  listPublicOrganizationRentals,
} from '@/server/publicOrganizationCatalog';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const organization = await getPublicOrganizationBySlug(slug, { surface: 'any' });
  if (!organization) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const limit = Number(req.nextUrl.searchParams.get('limit') ?? '12');
  const rentals = await listPublicOrganizationRentals(organization, { limit });
  return NextResponse.json({ organization, rentals }, { status: 200 });
}
