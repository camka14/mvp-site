import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { withLegacyFields } from '@/server/legacyFormat';
import { sendInviteEmails } from '@/server/inviteEmails';
import { ensureAuthUserAndUserDataByEmail } from '@/server/inviteUsers';

export const dynamic = 'force-dynamic';

const inviteItemSchema = z.object({
  email: z.string(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  type: z.string().optional(),
  eventId: z.string().optional(),
  organizationId: z.string().optional(),
  teamId: z.string().optional(),
}).passthrough();

const schema = z.object({
  inviterId: z.string().optional(),
  invites: z.array(inviteItemSchema).min(1),
}).passthrough();

const EMAIL_REGEX = /^[^@]+@[^@]+\.[^@]+$/;

const normalizeEmail = (value: string): string => value.trim().toLowerCase();

export async function POST(req: NextRequest) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const inviterId = parsed.data.inviterId ?? session.userId;
  const sentRecords: any[] = [];
  const notEmailedRecords: any[] = [];
  const failed: any[] = [];
  const notSent: any[] = [];

  for (const invite of parsed.data.invites) {
    const emailRaw = typeof invite.email === 'string' ? invite.email : '';
    const email = normalizeEmail(emailRaw);
    if (!EMAIL_REGEX.test(email)) {
      failed.push({ email: emailRaw, reason: 'invalid_email' });
      continue;
    }

    const type = (invite.type ?? 'player').toLowerCase();
    if (!['player', 'referee'].includes(type)) {
      failed.push({ email, reason: 'invalid_type' });
      continue;
    }

    const scopeFields = [invite.eventId, invite.organizationId, invite.teamId].filter(Boolean);
    if (type === 'player') {
      if (!invite.teamId || scopeFields.length !== 1) {
        failed.push({ email, reason: 'team_scope_required' });
        continue;
      }
    } else {
      if ((!invite.eventId && !invite.organizationId) || scopeFields.length !== 1) {
        failed.push({ email, reason: 'ref_scope_required' });
        continue;
      }
    }

    const existing = await prisma.invites.findFirst({
      where: {
        email: { equals: email, mode: 'insensitive' },
        type,
        eventId: invite.eventId ?? null,
        organizationId: invite.organizationId ?? null,
        teamId: invite.teamId ?? null,
      },
    });

    if (existing) {
      notSent.push({ email, reason: 'already_invited' });
      continue;
    }

    const now = new Date();
    const { userId, authUserExisted } = await prisma.$transaction(async (tx) => {
      return ensureAuthUserAndUserDataByEmail(tx, email, now);
    });

    const record = await prisma.invites.create({
      data: {
        id: crypto.randomUUID(),
        type,
        email,
        status: 'pending',
        eventId: invite.eventId ?? null,
        organizationId: invite.organizationId ?? null,
        teamId: invite.teamId ?? null,
        userId,
        createdBy: inviterId,
        firstName: invite.firstName ?? null,
        lastName: invite.lastName ?? null,
        createdAt: now,
        updatedAt: now,
      },
    });

    if (authUserExisted) {
      notEmailedRecords.push({ ...withLegacyFields(record), reason: 'user_exists' });
    } else {
      sentRecords.push(record);
    }
  }

  const baseUrl = req.nextUrl.origin;
  const updatedSent = await sendInviteEmails(sentRecords, baseUrl);
  const sent = updatedSent.map((record) => withLegacyFields(record));

  return NextResponse.json({ sent, not_sent: [...notSent, ...notEmailedRecords], failed }, { status: 200 });
}
