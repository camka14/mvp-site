import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { withLegacyList, withLegacyFields } from '@/server/legacyFormat';

export const dynamic = 'force-dynamic';

const inviteSchema = z.object({
  type: z.string(),
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

  const created = await Promise.all(invitesInput.map((invite: any) => {
    return prisma.invites.create({
      data: {
        id: crypto.randomUUID(),
        type: invite.type,
        email: invite.email ?? null,
        status: invite.status ?? 'pending',
        eventId: invite.eventId ?? null,
        organizationId: invite.organizationId ?? null,
        teamId: invite.teamId ?? null,
        userId: invite.userId ?? null,
        createdBy: invite.createdBy ?? session.userId,
        firstName: invite.firstName ?? null,
        lastName: invite.lastName ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }));

  if (created.length === 1) {
    return NextResponse.json(withLegacyFields(created[0]), { status: 201 });
  }

  return NextResponse.json({ invites: withLegacyList(created) }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const userId = body?.userId as string | undefined;
  const teamId = body?.teamId as string | undefined;
  const type = body?.type as string | undefined;

  if (userId && !session.isAdmin && userId !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const where: any = {};
  if (userId) where.userId = userId;
  if (teamId) where.teamId = teamId;
  if (type) where.type = type;

  await prisma.invites.deleteMany({ where });
  return NextResponse.json({ deleted: true }, { status: 200 });
}
