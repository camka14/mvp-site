import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const EMAIL_VERIFICATION_REQUIRED_CODE = 'EMAIL_VERIFICATION_REQUIRED' as const;

export const isUserEmailVerified = async (userId: string): Promise<boolean> => {
  const authUser = await prisma.authUser.findUnique({
    where: { id: userId },
    select: { emailVerifiedAt: true },
  });

  return Boolean(authUser?.emailVerifiedAt);
};

export const buildEmailVerificationRequiredResponse = (action: 'create_event' | 'create_organization') => {
  const target = action === 'create_event' ? 'an event' : 'an organization';
  return NextResponse.json(
    {
      error: `Verify your email before creating ${target}.`,
      code: EMAIL_VERIFICATION_REQUIRED_CODE,
    },
    { status: 403 },
  );
};
