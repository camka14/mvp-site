import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getTokenFromRequest, setAuthCookie, verifySessionToken } from '@/lib/authServer';
import { requireSession } from '@/lib/permissions';
import { revokeAuthUserSessions } from '@/server/authSessions';
import { unregisterPushDeviceTargetForUser } from '@/server/pushNotifications';

const deviceTargetSchema = z.object({
  pushToken: z.string().trim().min(1).max(4_096),
  pushTarget: z.string().trim().min(1).max(512).optional(),
}).strict();

const logoutSchema = z.object({
  deviceTarget: deviceTargetSchema.optional(),
}).passthrough();

const cleanupAuthenticationFailure = (status: number) => NextResponse.json(
  {
    error: 'A current authenticated session is required before removing this device notification target.',
    code: 'PUSH_TARGET_CLEANUP_AUTH_REQUIRED',
  },
  { status },
);

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = logoutSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const requestedDeviceTarget = parsed.data.deviceTarget;
  if (requestedDeviceTarget) {
    let session: Awaited<ReturnType<typeof requireSession>>;
    try {
      session = await requireSession(req);
    } catch (error) {
      if (error instanceof Response) {
        return cleanupAuthenticationFailure(error.status || 401);
      }
      throw error;
    }

    try {
      await unregisterPushDeviceTargetForUser({
        userId: session.userId,
        pushToken: requestedDeviceTarget.pushToken,
        pushTarget: requestedDeviceTarget.pushTarget,
      });
    } catch (error) {
      console.error('Failed to remove push device target during logout', {
        userId: session.userId,
        error,
      });
      return NextResponse.json(
        {
          error: 'Unable to remove this device notification target. Please retry logout.',
          code: 'PUSH_TARGET_CLEANUP_FAILED',
        },
        { status: 503 },
      );
    }

    await revokeAuthUserSessions(session.userId);
    const res = NextResponse.json({ ok: true, deviceTargetRemoved: true }, { status: 200 });
    setAuthCookie(res, '');
    return res;
  }

  // Preserve the existing web/legacy behavior for callers that do not send a
  // device target: best-effort server-session revocation and cookie clearing.
  const legacySession = verifySessionToken(getTokenFromRequest(req) ?? '');
  if (legacySession?.userId) {
    await revokeAuthUserSessions(legacySession.userId);
  }
  const res = NextResponse.json({ ok: true }, { status: 200 });
  setAuthCookie(res, '');
  return res;
}
