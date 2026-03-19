import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { verifyPassword } from '@/lib/authServer';
import { requireSession } from '@/lib/permissions';
import { prisma } from '@/lib/prisma';
import { getRequestOrigin } from '@/lib/requestOrigin';
import { isEmailEnabled, sendEmail } from '@/server/email';

const requestSchema = z.object({
  newEmail: z.string().email(),
  currentPassword: z.string().min(8),
});

type EmailChangeTokenPayload = {
  type: 'email_change';
  userId: string;
  newEmail: string;
};

const EMAIL_CHANGE_TOKEN_TTL_SECONDS = 60 * 30;

const getAuthSecret = (): string => {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error('AUTH_SECRET is not set');
  }
  return secret;
};

const signEmailChangeToken = (payload: EmailChangeTokenPayload): string => {
  return jwt.sign(payload, getAuthSecret(), { expiresIn: EMAIL_CHANGE_TOKEN_TTL_SECONDS });
};

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const session = await requireSession(req);
  const normalizedEmail = parsed.data.newEmail.trim().toLowerCase();

  const authUser = await prisma.authUser.findUnique({
    where: { id: session.userId },
    select: { id: true, email: true, passwordHash: true },
  });
  if (!authUser) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const currentEmail = authUser.email.trim().toLowerCase();
  if (normalizedEmail === currentEmail) {
    return NextResponse.json({ error: 'New email must be different from your current email.' }, { status: 400 });
  }

  const ok = await verifyPassword(parsed.data.currentPassword, authUser.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: 'Current password is incorrect.' }, { status: 400 });
  }

  const existingAuthUser = await prisma.authUser.findUnique({
    where: { email: normalizedEmail },
    select: { id: true },
  });
  if (existingAuthUser && existingAuthUser.id !== session.userId) {
    return NextResponse.json({ error: 'Email already in use' }, { status: 409 });
  }

  const existingSensitiveUser = await prisma.sensitiveUserData.findFirst({
    where: { email: normalizedEmail },
    select: { userId: true },
  });
  if (existingSensitiveUser?.userId && existingSensitiveUser.userId !== session.userId) {
    return NextResponse.json({ error: 'Email already in use' }, { status: 409 });
  }

  if (!isEmailEnabled()) {
    return NextResponse.json(
      { error: 'Email verification is unavailable because SMTP is not configured.' },
      { status: 503 },
    );
  }

  const token = signEmailChangeToken({
    type: 'email_change',
    userId: session.userId,
    newEmail: normalizedEmail,
  });

  const origin = getRequestOrigin(req);
  const confirmUrl = new URL('/api/auth/email/confirm', origin);
  confirmUrl.searchParams.set('token', token);

  try {
    await sendEmail({
      to: normalizedEmail,
      subject: 'Confirm your new BracketIQ email',
      text: `Use this link to confirm your new email address:\n\n${confirmUrl.toString()}\n\nThis link expires in 30 minutes.`,
      html: `
        <p>Use the button below to confirm your new email address:</p>
        <p><a href="${confirmUrl.toString()}">Confirm email change</a></p>
        <p>This link expires in 30 minutes.</p>
      `,
    });
  } catch (error) {
    console.error('Failed to send email change verification email', error);
    return NextResponse.json({ error: 'Failed to send verification email. Please try again.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
