import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { canManageEvent } from '@/server/accessControl';

export const dynamic = 'force-dynamic';

const MAX_EMAIL_LOOKUP_EMAILS = 50;
const MAX_EMAIL_LOOKUP_USER_IDS = 100;

const schema = z.object({
  emails: z.array(z.string().max(320)).max(MAX_EMAIL_LOOKUP_EMAILS).default([]),
  userIds: z.array(z.string().max(128)).max(MAX_EMAIL_LOOKUP_USER_IDS).default([]),
  eventId: z.string().trim().min(1).max(128).optional(),
});

const normalizeEmail = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
};

const normalizeUserId = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  return value.trim();
};

const normalizeUserIds = (values: unknown): string[] => (
  Array.isArray(values)
    ? Array.from(new Set(values.map(normalizeUserId).filter(Boolean)))
    : []
);

const resolveScopedUserIds = async (
  session: Awaited<ReturnType<typeof requireSession>>,
  requestedUserIds: string[],
  eventId?: string,
): Promise<string[] | NextResponse> => {
  if (!eventId) {
    // New-event validation may only compare against the signed-in host. A
    // broader membership check must be tied to an event the caller can manage.
    return requestedUserIds.filter((userId) => userId === session.userId);
  }

  const event = await prisma.events.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      hostId: true,
      assistantHostIds: true,
      organizationId: true,
    },
  });
  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }
  if (!(await canManageEvent(session, event))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const eventOfficials = await prisma.eventOfficials.findMany({
    where: {
      eventId: event.id,
      isActive: { not: false },
    },
    select: { userId: true },
  });
  const relatedUserIds = new Set([
    ...normalizeUserIds([event.hostId, ...(Array.isArray(event.assistantHostIds) ? event.assistantHostIds : [])]),
    ...eventOfficials.map((official) => normalizeUserId(official.userId)).filter(Boolean),
  ]);
  return requestedUserIds.filter((userId) => relatedUserIds.has(userId));
};

export async function POST(req: NextRequest) {
  const session = await requireSession(req);

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

  const scopedUserIds = await resolveScopedUserIds(session, userIds, parsed.data.eventId);
  if (scopedUserIds instanceof NextResponse) {
    return scopedUserIds;
  }
  if (!scopedUserIds.length) {
    return NextResponse.json({ matches: [] }, { status: 200 });
  }

  const emailSet = new Set(emails);
  const matches: Array<{ email: string; userId: string }> = [];
  const seenMatches = new Set<string>();

  const sensitiveRows = await prisma.sensitiveUserData.findMany({
    where: { userId: { in: scopedUserIds } },
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

  const fallbackUserIds = scopedUserIds.filter((userId) => !userIdsWithSensitiveEmail.has(userId));
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
