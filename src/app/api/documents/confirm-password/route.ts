import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { verifyPassword } from '@/lib/authServer';

const schema = z.object({
  email: z.string().email().optional(),
  password: z.string().min(1),
  eventId: z.string().optional(),
}).passthrough();

export async function POST(request: NextRequest) {
  const session = await requireSession(request);
  const body = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Password is required.' }, { status: 400 });
  }

  const requestedEmail = parsed.data.email?.trim().toLowerCase();
  const authUser = session.isAdmin
    ? await prisma.authUser.findUnique({
      where: requestedEmail
        ? { email: requestedEmail }
        : { id: session.userId },
    })
    : await prisma.authUser.findUnique({ where: { id: session.userId } });
  if (!authUser) {
    return NextResponse.json({ error: 'Invalid credentials.' }, { status: 401 });
  }

  if (!session.isAdmin && authUser.id !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const ok = await verifyPassword(parsed.data.password, authUser.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: 'Invalid credentials.' }, { status: 401 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
