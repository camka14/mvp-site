import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { withLegacyFields } from '@/server/legacyFormat';
import { ensureAuthUserAndUserDataByEmail } from '@/server/inviteUsers';

export const dynamic = 'force-dynamic';

const schema = z.object({
  email: z.string().email(),
}).passthrough();

export async function POST(req: NextRequest) {
  await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const now = new Date();
  const { userId } = await prisma.$transaction(async (tx) => {
    return ensureAuthUserAndUserDataByEmail(tx, parsed.data.email, now);
  });

  const user = await prisma.userData.findUnique({ where: { id: userId } });
  if (!user) {
    return NextResponse.json({ error: 'Failed to ensure user' }, { status: 500 });
  }

  return NextResponse.json({ user: withLegacyFields(user) }, { status: 200 });
}

