import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRazumlyAdmin } from '@/server/razumlyAdmin';
import {
  getPushAudienceStats,
  getPushAudienceUserIds,
  normalizePushDeviceTypes,
  sendPushToUsers,
  type PushDeviceType,
} from '@/server/pushNotifications';

export const dynamic = 'force-dynamic';

const requestSchema = z.object({
  title: z.string().trim().min(1).max(160),
  body: z.string().trim().min(1).max(2000),
  deviceTypes: z.array(z.string()).optional(),
  deepLink: z.string().trim().max(500).optional().nullable(),
});

const parseDeviceTypesFromQuery = (req: NextRequest): PushDeviceType[] => {
  const repeated = req.nextUrl.searchParams.getAll('deviceType');
  const commaSeparated = req.nextUrl.searchParams
    .get('deviceTypes')
    ?.split(',')
    .map((value) => value.trim())
    .filter(Boolean) ?? [];
  return normalizePushDeviceTypes([...repeated, ...commaSeparated]);
};

const adminRouteErrorResponse = (error: unknown): NextResponse => {
  if (error instanceof Response) {
    return NextResponse.json(
      { error: error.status === 401 ? 'Unauthorized' : 'Forbidden' },
      { status: error.status || 500 },
    );
  }

  console.error('Admin notifications route failed', error);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
};

export async function GET(req: NextRequest) {
  try {
    await requireRazumlyAdmin(req);
    const deviceTypes = parseDeviceTypesFromQuery(req);
    const audience = await getPushAudienceStats(deviceTypes);
    return NextResponse.json({ deviceTypes, audience }, { status: 200 });
  } catch (error) {
    return adminRouteErrorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireRazumlyAdmin(req);
    const body = await req.json().catch(() => null);
    const parsed = requestSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
    }

    const deviceTypes = normalizePushDeviceTypes(parsed.data.deviceTypes);
    const audience = await getPushAudienceStats(deviceTypes);
    const userIds = await getPushAudienceUserIds(deviceTypes);
    const deepLink = parsed.data.deepLink?.trim();

    const delivery = await sendPushToUsers({
      userIds,
      title: parsed.data.title,
      body: parsed.data.body,
      deviceTypes,
      data: {
        adminNotification: true,
        senderId: session.userId,
        ...(deepLink ? { deepLink } : {}),
      },
    });

    return NextResponse.json({
      ok: true,
      deviceTypes,
      audience,
      delivery,
    }, { status: 200 });
  } catch (error) {
    return adminRouteErrorResponse(error);
  }
}
