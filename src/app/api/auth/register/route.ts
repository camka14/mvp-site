import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';
import { hashPassword, setAuthCookie, signSessionToken, SessionToken } from '@/lib/authServer';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  userName: z.string().optional(),
  dateOfBirth: z.string().optional(),
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
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const { email, password, name, firstName, lastName, userName, dateOfBirth } = parsed.data;
  const normalizedEmail = email.toLowerCase();

  const existingAuth = await prisma.authUser.findUnique({ where: { email: normalizedEmail } });
  if (existingAuth) {
    return NextResponse.json({ error: 'Email already in use' }, { status: 409 });
  }

  const existingSensitive = await prisma.sensitiveUserData.findFirst({ where: { email: normalizedEmail } });
  const userId = existingSensitive?.userId || crypto.randomUUID();
  const passwordHash = await hashPassword(password);

  const now = new Date();

  const [authUser, profile] = await prisma.$transaction(async (tx) => {
    const createdAuth = await tx.authUser.create({
      data: {
        id: userId,
        email: normalizedEmail,
        passwordHash,
        name: name ?? null,
        createdAt: now,
        updatedAt: now,
        lastLogin: now,
      },
    });

    const existingProfile = await tx.userData.findUnique({ where: { id: userId } });
    const profileRow = existingProfile
      ? await tx.userData.update({
          where: { id: userId },
          data: {
            firstName: firstName ?? existingProfile.firstName,
            lastName: lastName ?? existingProfile.lastName,
            userName: userName ?? existingProfile.userName,
            dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : existingProfile.dateOfBirth,
            updatedAt: now,
          },
        })
      : await tx.userData.create({
          data: {
            id: userId,
            createdAt: now,
            updatedAt: now,
            firstName: firstName ?? null,
            lastName: lastName ?? null,
            userName: userName ?? normalizedEmail.split('@')[0] ?? 'user',
            dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : new Date('2000-01-01'),
            teamIds: [],
            friendIds: [],
            friendRequestIds: [],
            friendRequestSentIds: [],
            followingIds: [],
            uploadedImages: [],
            profileImageId: null,
          },
        });

    await tx.sensitiveUserData.upsert({
      where: { id: existingSensitive?.id ?? userId },
      update: {
        email: normalizedEmail,
        userId,
        updatedAt: now,
      },
      create: {
        id: userId,
        email: normalizedEmail,
        userId,
        createdAt: now,
        updatedAt: now,
      },
    });

    return [createdAuth, profileRow] as const;
  });

  const session: SessionToken = { userId: authUser.id, isAdmin: false };
  const token = signSessionToken(session);
  const res = NextResponse.json({
    user: toPublicUser(authUser),
    session,
    token,
    profile,
  }, { status: 201 });
  setAuthCookie(res, token);
  return res;
}
