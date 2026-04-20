import { NextRequest, NextResponse } from 'next/server';
import {
  getPublicOrganizationBySlug,
  listPublicOrganizationTeams,
} from '@/server/publicOrganizationCatalog';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const organization = await getPublicOrganizationBySlug(slug, { surface: 'any' });
  if (!organization) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const limit = Number(req.nextUrl.searchParams.get('limit') ?? '12');
  const teams = await listPublicOrganizationTeams(organization, { limit });
  return NextResponse.json({ organization, teams }, { status: 200 });
}
