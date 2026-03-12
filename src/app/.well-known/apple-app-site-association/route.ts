import { NextResponse } from 'next/server';
import { APPLE_APP_SITE_ASSOCIATION_BODY } from '@/lib/appSiteAssociations';

export const dynamic = 'force-static';

export async function GET() {
  return NextResponse.json(APPLE_APP_SITE_ASSOCIATION_BODY, {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'public, max-age=3600',
    },
  });
}
