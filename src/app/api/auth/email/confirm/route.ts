import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { prisma } from '@/lib/prisma';
import { getRequestOrigin } from '@/lib/requestOrigin';

type EmailChangeTokenPayload = {
  type: 'email_change';
  userId: string;
  newEmail: string;
  iat?: number;
  exp?: number;
};

const getAuthSecret = (): string => {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error('AUTH_SECRET is not set');
  }
  return secret;
};

const readTokenPayload = (token: string | null): EmailChangeTokenPayload | null => {
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, getAuthSecret());
    if (!decoded || typeof decoded === 'string') return null;
    const userId = typeof decoded.userId === 'string' ? decoded.userId : '';
    const newEmail = typeof decoded.newEmail === 'string' ? decoded.newEmail.trim().toLowerCase() : '';
    const type = decoded.type === 'email_change' ? decoded.type : null;
    if (!type || !userId || !newEmail) return null;
    return {
      type,
      userId,
      newEmail,
      iat: typeof decoded.iat === 'number' ? decoded.iat : undefined,
      exp: typeof decoded.exp === 'number' ? decoded.exp : undefined,
    };
  } catch {
    return null;
  }
};

const buildRedirect = (req: NextRequest, status: 'success' | 'error', message: string): NextResponse => {
  const redirectUrl = new URL('/profile', getRequestOrigin(req));
  redirectUrl.searchParams.set('emailChange', status);
  redirectUrl.searchParams.set('emailChangeMessage', message);
  return NextResponse.redirect(redirectUrl, { status: 302 });
};

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  const payload = readTokenPayload(token);
  if (!payload) {
    return buildRedirect(req, 'error', 'Invalid or expired email verification link.');
  }

  const existingAuth = await prisma.authUser.findUnique({
    where: { email: payload.newEmail },
    select: { id: true },
  });
  if (existingAuth && existingAuth.id !== payload.userId) {
    return buildRedirect(req, 'error', 'Email already in use.');
  }

  const now = new Date();
  try {
    await prisma.$transaction(async (tx) => {
      await tx.authUser.update({
        where: { id: payload.userId },
        data: {
          email: payload.newEmail,
          emailVerifiedAt: now,
          updatedAt: now,
        },
      });
      await tx.sensitiveUserData.updateMany({
        where: { userId: payload.userId },
        data: {
          email: payload.newEmail,
          updatedAt: now,
        },
      });
    });
  } catch (error) {
    console.error('Failed to confirm email change', error);
    return buildRedirect(req, 'error', 'Unable to update email. Please try again.');
  }

  return buildRedirect(req, 'success', 'Email updated successfully.');
}
