import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { normalizePhoneNumberToE164 } from '@/server/authPhoneMfa';
import { applyRateLimit, RATE_LIMIT_POLICIES } from '@/server/rateLimit';
import {
  applyUserPrivacy,
  createVisibilityContext,
  isVisibleInGenericSearch,
  publicUserSelect,
} from '@/server/userPrivacy';
import { withDerivedCanonicalTeamIds } from '@/server/teams/teamMembership';

export const dynamic = 'force-dynamic';

const schema = z.object({
  email: z.string().trim().max(320).optional(),
  phone: z.string().trim().max(64).optional(),
}).refine(
  (value) => Boolean(value.email || value.phone),
  { message: 'Choose an email address or phone number.' },
);

const normalizeEmail = (value: string | undefined): string | null => {
  const normalized = value?.trim().toLowerCase() ?? '';
  return normalized.length ? normalized : null;
};

const normalizePhone = (value: string | undefined): string | null => {
  const normalized = value?.trim() ?? '';
  if (!normalized) return null;
  try {
    return normalizePhoneNumberToE164(normalized);
  } catch {
    return null;
  }
};

export async function POST(req: NextRequest) {
  const session = await requireSession(req);
  const rateLimited = await applyRateLimit(req, RATE_LIMIT_POLICIES.contactMatch, session.userId);
  if (rateLimited) return rateLimited;

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const email = normalizeEmail(parsed.data.email);
  const phoneNumberE164 = normalizePhone(parsed.data.phone);
  if (!email && !phoneNumberE164) {
    return NextResponse.json({ matched: false }, { status: 200 });
  }

  const sensitiveFilters: Array<Record<string, unknown>> = [];
  if (email) {
    sensitiveFilters.push({ email: { equals: email, mode: 'insensitive' } });
  }
  if (phoneNumberE164) {
    sensitiveFilters.push({ phoneNumberE164, phoneVerifiedAt: { not: null } });
  }

  const [sensitiveMatches, authMatches] = await Promise.all([
    sensitiveFilters.length
      ? prisma.sensitiveUserData.findMany({
        where: { OR: sensitiveFilters },
        select: { userId: true },
        take: 10,
      })
      : [],
    email
      ? prisma.authUser.findMany({
        where: {
          email: { equals: email, mode: 'insensitive' },
          disabledAt: null,
        },
        select: { id: true },
        take: 10,
      })
      : [],
  ]);

  const candidateIds = Array.from(new Set([
    ...sensitiveMatches.map((row) => row.userId),
    ...authMatches.map((row) => row.id),
  ].filter(Boolean)));
  if (!candidateIds.length) {
    return NextResponse.json({ matched: false }, { status: 200 });
  }

  const users = await prisma.userData.findMany({
    where: { id: { in: candidateIds } },
    select: publicUserSelect,
    take: candidateIds.length,
  });
  const usersWithTeamIds = await withDerivedCanonicalTeamIds(users, prisma);
  const byId = new Map(usersWithTeamIds.map((user) => [user.id, user] as const));
  const visibilityContext = await createVisibilityContext(prisma, {
    viewerId: session.userId,
    isAdmin: session.isAdmin,
  });
  const visibleMatch = candidateIds
    .map((id) => byId.get(id))
    .find((user) => user && isVisibleInGenericSearch(user, visibilityContext));

  if (!visibleMatch) {
    return NextResponse.json({ matched: false }, { status: 200 });
  }

  return NextResponse.json({
    matched: true,
    user: applyUserPrivacy(visibleMatch, visibilityContext),
  }, { status: 200 });
}
