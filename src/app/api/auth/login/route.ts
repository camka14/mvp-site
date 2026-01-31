import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { verifyPassword, setAuthCookie, signSessionToken, SessionToken } from '@/lib/authServer';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const toPublicUser = (user: { id: string; email: string; name: string | null; createdAt: Date | null; updatedAt: Date | null }) => ({
  id: user.id,
  email: user.email,
  name: user.name,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const { email, password } = parsed.data;
  const normalizedEmail = email.toLowerCase();
  const authUser = await prisma.authUser.findUnique({ where: { email: normalizedEmail } });
  if (!authUser) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  const ok = await verifyPassword(password, authUser.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  const now = new Date();
  await prisma.authUser.update({ where: { id: authUser.id }, data: { lastLogin: now, updatedAt: now } });
  const profile = await prisma.userData.findUnique({ where: { id: authUser.id } });

  const session: SessionToken = { userId: authUser.id, isAdmin: false };
  const token = signSessionToken(session);
  const res = NextResponse.json({ user: toPublicUser(authUser), session, token, profile }, { status: 200 });
  setAuthCookie(res, token);
  return res;
}
