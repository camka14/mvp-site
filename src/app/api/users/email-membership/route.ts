import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

const schema = z.object({
  emails: z.array(z.string()).default([]),
  userIds: z.array(z.string()).default([]),
});

const normalizeEmail = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
};

const normalizeUserId = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  return value.trim();
};

export async function POST(req: NextRequest) {
  await requireSession(req);

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const emails = Array.from(new Set(parsed.data.emails.map(normalizeEmail).filter(Boolean)));
  const userIds = Array.from(new Set(parsed.data.userIds.map(normalizeUserId).filter(Boolean)));

  if (!emails.length || !userIds.length) {
    return NextResponse.json({ matches: [] }, { status: 200 });
  }

  const emailSet = new Set(emails);
  const matches: Array<{ email: string; userId: string }> = [];
  const seenMatches = new Set<string>();

  const sensitiveRows = await prisma.sensitiveUserData.findMany({
    where: { userId: { in: userIds } },
    select: { userId: true, email: true },
  });

  const userIdsWithSensitiveEmail = new Set<string>();
  sensitiveRows.forEach((row) => {
    const userId = normalizeUserId(row.userId);
    const email = normalizeEmail(row.email);
    if (!userId || !email) {
      return;
    }
    userIdsWithSensitiveEmail.add(userId);
    if (!emailSet.has(email)) {
      return;
    }
    const key = `${email}:${userId}`;
    if (seenMatches.has(key)) {
      return;
    }
    seenMatches.add(key);
    matches.push({ email, userId });
  });

  const fallbackUserIds = userIds.filter((userId) => !userIdsWithSensitiveEmail.has(userId));
  if (fallbackUserIds.length > 0) {
    const authRows = await prisma.authUser.findMany({
      where: { id: { in: fallbackUserIds } },
      select: { id: true, email: true },
    });

    authRows.forEach((row) => {
      const userId = normalizeUserId(row.id);
      const email = normalizeEmail(row.email);
      if (!userId || !email || !emailSet.has(email)) {
        return;
      }
      const key = `${email}:${userId}`;
      if (seenMatches.has(key)) {
        return;
      }
      seenMatches.add(key);
      matches.push({ email, userId });
    });
  }

  return NextResponse.json({ matches }, { status: 200 });
}
