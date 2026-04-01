import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getRequestOrigin } from '@/lib/requestOrigin';
import {
  isInitialEmailVerificationAvailable,
  sendInitialEmailVerification,
} from '@/server/authEmailVerification';

const requestSchema = z.object({
  email: z.string().email(),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const normalizedEmail = parsed.data.email.trim().toLowerCase();
  const authUser = await prisma.authUser.findUnique({
    where: { email: normalizedEmail },
    select: { id: true, email: true, emailVerifiedAt: true },
  });

  if (!authUser || authUser.emailVerifiedAt) {
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  if (!isInitialEmailVerificationAvailable()) {
    return NextResponse.json(
      { error: 'Email verification is unavailable because SMTP is not configured.' },
      { status: 503 },
    );
  }

  try {
    await sendInitialEmailVerification({
      userId: authUser.id,
      email: authUser.email,
      origin: getRequestOrigin(req),
    });
  } catch (error) {
    console.error('Failed to resend verification email', error);
    return NextResponse.json({ error: 'Failed to send verification email. Please try again.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
