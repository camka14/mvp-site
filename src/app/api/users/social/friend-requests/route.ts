import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/permissions';
import { withLegacyFields } from '@/server/legacyFormat';
import { sendFriendRequest } from '@/server/socialGraph';
import { toSocialErrorResponse } from '@/app/api/users/social/shared';

const sendFriendRequestSchema = z.object({
  targetUserId: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const session = await requireSession(req);

  const body = await req.json().catch(() => null);
  const parsed = sendFriendRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const user = await sendFriendRequest(session.userId, parsed.data.targetUserId);
    return NextResponse.json({ user: withLegacyFields(user) }, { status: 200 });
  } catch (error) {
    return toSocialErrorResponse(error);
  }
}
