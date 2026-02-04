import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

const emailSchema = z.string().email();

const normalizeEmail = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
};

const buildResponse = (exists: boolean, userId?: string | null, sensitiveUserId?: string | null) => {
  return NextResponse.json(
    {
      exists,
      userId: userId ?? undefined,
      sensitiveUserId: sensitiveUserId ?? undefined,
    },
    { status: 200 },
  );
};

export async function GET(req: NextRequest) {
  await requireSession(req);
  const email = normalizeEmail(req.nextUrl.searchParams.get('email'));
  if (!emailSchema.safeParse(email).success) {
    return buildResponse(false);
  }

  const sensitive = await prisma.sensitiveUserData.findFirst({ where: { email } });
  if (!sensitive) {
    return buildResponse(false);
  }
  return buildResponse(true, sensitive.userId, sensitive.id);
}

export async function POST(req: NextRequest) {
  await requireSession(req);
  const body = await req.json().catch(() => null);
  const email = normalizeEmail(body?.email);
  if (!emailSchema.safeParse(email).success) {
    return buildResponse(false);
  }

  const sensitive = await prisma.sensitiveUserData.findFirst({ where: { email } });
  if (!sensitive) {
    return buildResponse(false);
  }
  return buildResponse(true, sensitive.userId, sensitive.id);
}
