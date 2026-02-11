import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { withLegacyList } from '@/server/legacyFormat';
import { sendInviteEmails } from '@/server/inviteEmails';
import { ensureAuthUserAndUserDataByEmail } from '@/server/inviteUsers';

export const dynamic = 'force-dynamic';

const inviteSchema = z.object({
  type: z.string(),
  // Email can be omitted when inviting an existing user by `userId`.
  // For email-based invites we validate at runtime below.
  email: z.string().optional(),
  status: z.string().optional(),
  eventId: z.string().optional(),
  organizationId: z.string().optional(),
  teamId: z.string().optional(),
  userId: z.string().optional(),
  createdBy: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
}).passthrough();

const createSchema = z.object({
  invites: z.array(inviteSchema).optional(),
}).passthrough();

const emailSchema = z.string().email();

export async function GET(req: NextRequest) {
  const session = await requireSession(req);
  const params = req.nextUrl.searchParams;
  const userId = params.get('userId');
  const type = params.get('type');
  const teamId = params.get('teamId');

  if (userId && !session.isAdmin && userId !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const where: any = {};
  if (userId) where.userId = userId;
  if (type) where.type = type;
  if (teamId) where.teamId = teamId;

  const invites = await prisma.invites.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ invites: withLegacyList(invites) }, { status: 200 });
}

export async function POST(req: NextRequest) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const invitesInput = parsed.data.invites
    ?? (Array.isArray((body as any)?.invites) ? (body as any).invites : [body]).filter(Boolean);

  if (!invitesInput.length) {
    return NextResponse.json({ error: 'No invites provided' }, { status: 400 });
  }

  const created: any[] = [];
  const toEmail: any[] = [];
  for (const invite of invitesInput) {
    const parsedInvite = inviteSchema.safeParse(invite);
    if (!parsedInvite.success) {
      return NextResponse.json({ error: 'Invalid invite', details: parsedInvite.error.flatten() }, { status: 400 });
    }

    const now = new Date();
    const inviteUserId = parsedInvite.data.userId ? String(parsedInvite.data.userId) : '';
    let email = typeof parsedInvite.data.email === 'string' ? parsedInvite.data.email.trim().toLowerCase() : '';

    let ensuredUserId: string;
    let shouldSendEmail = false;

    if (inviteUserId) {
      ensuredUserId = inviteUserId;

      // Inviting an existing user by id: email may not be provided by the client (UserData is public and does not
      // contain email). Derive it from AuthUser/SensitiveUserData so the Invites table always has a valid email.
      if (!emailSchema.safeParse(email).success) {
        const authUser = await prisma.authUser.findUnique({ where: { id: inviteUserId } });
        if (authUser?.email) {
          email = authUser.email.trim().toLowerCase();
        } else {
          const sensitive = await prisma.sensitiveUserData.findFirst({ where: { userId: inviteUserId } });
          if (sensitive?.email) {
            email = sensitive.email.trim().toLowerCase();
          }
        }
      }

      if (!emailSchema.safeParse(email).success) {
        return NextResponse.json({ error: 'Missing invite email' }, { status: 400 });
      }
    } else {
      if (!emailSchema.safeParse(email).success) {
        return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
      }

      const ensured = await prisma.$transaction(async (tx) => {
        return ensureAuthUserAndUserDataByEmail(tx, email, now);
      });
      ensuredUserId = ensured.userId;
      shouldSendEmail = !ensured.authUserExisted;
    }

    const record = await prisma.invites.create({
      data: {
        id: crypto.randomUUID(),
        type: parsedInvite.data.type,
        email,
        status: parsedInvite.data.status ?? 'pending',
        eventId: parsedInvite.data.eventId ?? null,
        organizationId: parsedInvite.data.organizationId ?? null,
        teamId: parsedInvite.data.teamId ?? null,
        userId: ensuredUserId,
        createdBy: parsedInvite.data.createdBy ?? session.userId,
        firstName: parsedInvite.data.firstName ?? null,
        lastName: parsedInvite.data.lastName ?? null,
        createdAt: now,
        updatedAt: now,
      },
    });

    created.push(record);
    if (shouldSendEmail) {
      toEmail.push(record);
    }
  }

  const baseUrl = req.nextUrl.origin;
  const emailed = await sendInviteEmails(toEmail, baseUrl);
  const emailedMap = new Map(emailed.map((invite) => [invite.id, invite]));
  const updatedInvites = created.map((invite) => emailedMap.get(invite.id) ?? invite);

  return NextResponse.json({ invites: withLegacyList(updatedInvites) }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const userId = body?.userId as string | undefined;
  const teamId = body?.teamId as string | undefined;
  const type = body?.type as string | undefined;

  const where: any = {};
  if (userId) where.userId = userId;
  if (teamId) where.teamId = teamId;
  if (type) where.type = type;

  if (!session.isAdmin) {
    // Non-admin users can:
    // - delete their own invites (userId === session.userId), or
    // - if scoped to a team, delete invites for that team when they are the captain, or
    // - delete invites they created (fallback).
    const canActOnUser = userId && userId === session.userId;

    let isTeamCaptain = false;
    if (teamId) {
      const team = await prisma.volleyBallTeams.findUnique({
        where: { id: teamId },
        select: { captainId: true },
      });
      isTeamCaptain = Boolean(team && team.captainId === session.userId);
    }

    if (!canActOnUser && !isTeamCaptain) {
      where.createdBy = session.userId;
    }

    // Avoid accidental broad deletes from non-admin callers.
    const hasScope = Boolean(userId || teamId || type);
    if (!hasScope) {
      return NextResponse.json({ error: 'Missing delete scope' }, { status: 400 });
    }
  }

  await prisma.invites.deleteMany({ where });
  return NextResponse.json({ deleted: true }, { status: 200 });
}
