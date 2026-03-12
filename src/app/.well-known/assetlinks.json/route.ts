import { NextResponse } from 'next/server';
import { ANDROID_ASSET_LINKS_BODY } from '@/lib/appSiteAssociations';

export const dynamic = 'force-static';

export async function GET() {
  return NextResponse.json(ANDROID_ASSET_LINKS_BODY, {
    status: 200,
    headers: {
      'cache-control': 'public, max-age=3600',
    },
  });
}
