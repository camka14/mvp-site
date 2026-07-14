import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { normalizeOptionalName } from '@/lib/nameCase';
import { requireSession } from '@/lib/permissions';
import { getRequestOrigin } from '@/lib/requestOrigin';
import { withLegacyFields } from '@/server/legacyFormat';
import { sendInviteEmails } from '@/server/inviteEmails';
import { ensureAuthUserAndUserDataByEmail } from '@/server/inviteUsers';
import { canManageEvent, canManageOrganization } from '@/server/accessControl';

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

const canInviteToScope = async (
  session: Awaited<ReturnType<typeof requireSession>>,
  invite: z.infer<typeof inviteItemSchema>,
): Promise<boolean> => {
  if (session.isAdmin) return true;

  if (invite.teamId) {
    const team = await prisma.teams.findUnique({
      where: { id: invite.teamId },
      select: {
        captainId: true,
        managerId: true,
        headCoachId: true,
        coachIds: true,
      },
    });
    if (!team) return false;
    return [team.captainId, team.managerId, team.headCoachId, ...(team.coachIds ?? [])]
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
      .includes(session.userId);
  }

  if (invite.eventId) {
    const event = await prisma.events.findUnique({
      where: { id: invite.eventId },
      select: { hostId: true, assistantHostIds: true, organizationId: true },
    });
    return canManageEvent(session, event);
  }

  if (invite.organizationId) {
    const organization = await prisma.organizations.findUnique({
      where: { id: invite.organizationId },
      select: { id: true, ownerId: true },
    });
    return canManageOrganization(session, organization);
  }

  return false;
};

export async function POST(req: NextRequest) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

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
    if (!['player', 'official'].includes(type)) {
      failed.push({ email, reason: 'invalid_type' });
      continue;
    }
    const canonicalType = type === 'player' ? 'TEAM' : 'STAFF';

    const scopeFields = [invite.eventId, invite.organizationId, invite.teamId].filter(Boolean);
    if (type === 'player') {
      if (!invite.teamId || scopeFields.length !== 1) {
        failed.push({ email, reason: 'team_scope_required' });
        continue;
      }
    } else {
      if ((!invite.eventId && !invite.organizationId) || scopeFields.length !== 1) {
        failed.push({ email, reason: 'official_scope_required' });
        continue;
      }
    }

    if (!(await canInviteToScope(session, invite))) {
      failed.push({ email, reason: 'forbidden_scope' });
      continue;
    }

    const existing = await prisma.invites.findFirst({
      where: {
        email: { equals: email, mode: 'insensitive' },
        type: canonicalType,
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
    const firstName = normalizeOptionalName(invite.firstName);
    const lastName = normalizeOptionalName(invite.lastName);
    const { userId, authUserExisted } = await prisma.$transaction(async (tx) => {
      return ensureAuthUserAndUserDataByEmail(tx, email, now, {
        firstName,
        lastName,
      });
    });

    const record = await prisma.invites.create({
      data: {
        id: crypto.randomUUID(),
        type: canonicalType,
        email,
        status: 'PENDING',
        eventId: invite.eventId ?? null,
        organizationId: invite.organizationId ?? null,
        teamId: invite.teamId ?? null,
        userId,
        createdBy: session.userId,
        firstName: firstName ?? null,
        lastName: lastName ?? null,
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

  const baseUrl = getRequestOrigin(req);
  const updatedSent = await sendInviteEmails(sentRecords, baseUrl);
  const sent = updatedSent.map((record) => withLegacyFields(record));

  return NextResponse.json({ sent, not_sent: [...notSent, ...notEmailedRecords], failed }, { status: 200 });
}

