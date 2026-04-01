import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRequestOrigin } from '@/lib/requestOrigin';
import { readInitialEmailVerificationToken } from '@/server/authEmailVerification';

const buildRedirect = (req: NextRequest, status: 'success' | 'error', message: string): NextResponse => {
  const redirectUrl = new URL('/login', getRequestOrigin(req));
  redirectUrl.searchParams.set('verification', status);
  redirectUrl.searchParams.set('verificationMessage', message);
  return NextResponse.redirect(redirectUrl, { status: 302 });
};

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  const payload = readInitialEmailVerificationToken(token);
  if (!payload) {
    return buildRedirect(req, 'error', 'Invalid or expired verification link.');
  }

  const authUser = await prisma.authUser.findUnique({
    where: { id: payload.userId },
    select: { id: true, email: true, emailVerifiedAt: true },
  });
  if (!authUser) {
    return buildRedirect(req, 'error', 'Unable to verify this account.');
  }

  const normalizedStoredEmail = authUser.email.trim().toLowerCase();
  if (normalizedStoredEmail !== payload.email) {
    return buildRedirect(req, 'error', 'This verification link is no longer valid for your account.');
  }

  if (authUser.emailVerifiedAt) {
    return buildRedirect(req, 'success', 'Email already verified. You can sign in now.');
  }

  try {
    await prisma.authUser.update({
      where: { id: authUser.id },
      data: {
        emailVerifiedAt: new Date(),
        updatedAt: new Date(),
      },
    });
  } catch (error) {
    console.error('Failed to verify initial account email', error);
    return buildRedirect(req, 'error', 'Unable to verify email. Please request another verification email.');
  }

  return buildRedirect(req, 'success', 'Email verified successfully. You can sign in now.');
}
