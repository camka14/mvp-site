import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { hashPassword, verifyPassword, signSessionToken, setAuthCookie } from '@/lib/authServer';
import { requireSession } from '@/lib/permissions';

const passwordSchema = z.object({
  currentPassword: z.string().min(8).optional(),
  newPassword: z.string().min(8),
  userId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = passwordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const session = await requireSession(req);
  const { currentPassword, newPassword, userId } = parsed.data;
  const targetUserId = userId ?? session.userId;

  if (!session.isAdmin && targetUserId !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const authUser = await prisma.authUser.findUnique({ where: { id: targetUserId } });
  if (!authUser) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (!session.isAdmin || targetUserId === session.userId) {
    if (!currentPassword) {
      return NextResponse.json({ error: 'Current password is required.' }, { status: 400 });
    }
    const ok = await verifyPassword(currentPassword, authUser.passwordHash);
    if (!ok) {
      return NextResponse.json({ error: 'Current password is incorrect.' }, { status: 400 });
    }
  }

  const passwordHash = await hashPassword(newPassword);
  await prisma.authUser.update({ where: { id: targetUserId }, data: { passwordHash, updatedAt: new Date() } });

  const refreshed = signSessionToken({ userId: targetUserId, isAdmin: session.isAdmin });
  const res = NextResponse.json({ ok: true }, { status: 200 });
  setAuthCookie(res, refreshed);
  return res;
}
