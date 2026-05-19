import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  buildAppVersionResponse,
  normalizeAppReleasePlatform,
  parseBuildNumber,
  type AppReleaseRow,
} from '@/lib/appReleases';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const platform = normalizeAppReleasePlatform(searchParams.get('platform'));

  if (!platform) {
    return NextResponse.json(
      { error: 'platform must be IOS or ANDROID' },
      { status: 400 },
    );
  }

  const current = {
    versionName: searchParams.get('versionName')?.trim() || null,
    buildNumber: parseBuildNumber(searchParams.get('buildNumber')),
  };

  const releases = await prisma.appReleases.findMany({
    where: {
      platform,
      isActive: true,
    },
  });

  return NextResponse.json(
    buildAppVersionResponse(releases as AppReleaseRow[], current),
    { status: 200 },
  );
}
