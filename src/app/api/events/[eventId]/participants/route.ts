import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { withLegacyFields } from '@/server/legacyFormat';

export const dynamic = 'force-dynamic';

const payloadSchema = z.object({
  user: z.record(z.string(), z.any()).optional(),
  userId: z.string().optional(),
  team: z.record(z.string(), z.any()).optional(),
  teamId: z.string().optional(),
}).passthrough();

const withLegacyEvent = (row: any) => {
  const legacy = withLegacyFields(row);
  return legacy;
};

const extractId = (value: any): string | undefined => {
  if (!value) return undefined;
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    if (typeof value.$id === 'string') return value.$id;
    if (typeof value.id === 'string') return value.id;
  }
  return undefined;
};

const ensureUnique = (values: string[]) => Array.from(new Set(values.filter(Boolean)));

const hasSignedRequiredTemplates = async (event: { requiredTemplateIds: string[] | null }, userId?: string) => {
  if (!userId) return true;
  const required = Array.isArray(event.requiredTemplateIds) ? event.requiredTemplateIds : [];
  if (!required.length) return true;
  const signed = await prisma.signedDocuments.findMany({
    where: {
      userId,
      templateId: { in: required },
      status: { in: ['SIGNED', 'signed'] },
    },
    select: { templateId: true },
  });
  const signedSet = new Set(signed.map((doc) => doc.templateId));
  return required.every((id) => signedSet.has(id));
};

async function updateParticipants(
  req: NextRequest,
  params: Promise<{ eventId: string }>,
  mode: 'add' | 'remove',
) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = payloadSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const { eventId } = await params;
  const event = await prisma.events.findUnique({ where: { id: eventId } });
  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  const userId = parsed.data.userId ?? extractId(parsed.data.user);
  const teamId = parsed.data.teamId ?? extractId(parsed.data.team);

  if (userId && !session.isAdmin && session.userId !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (mode === 'add') {
    const ok = await hasSignedRequiredTemplates(event, userId);
    if (!ok) {
      return NextResponse.json({ error: 'Required document signatures missing.' }, { status: 400 });
    }
  }

  let nextUserIds = Array.isArray(event.userIds) ? [...event.userIds] : [];
  let nextTeamIds = Array.isArray(event.teamIds) ? [...event.teamIds] : [];

  if (teamId) {
    if (mode === 'add') {
      nextTeamIds = ensureUnique([...nextTeamIds, teamId]);
    } else {
      nextTeamIds = nextTeamIds.filter((id) => id !== teamId);
    }
  } else if (userId) {
    if (mode === 'add') {
      nextUserIds = ensureUnique([...nextUserIds, userId]);
    } else {
      nextUserIds = nextUserIds.filter((id) => id !== userId);
    }
  }

  const updated = await prisma.events.update({
    where: { id: eventId },
    data: { userIds: nextUserIds, teamIds: nextTeamIds, updatedAt: new Date() },
  });

  return NextResponse.json({ event: withLegacyEvent(updated) }, { status: 200 });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  return updateParticipants(req, params, 'add');
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  return updateParticipants(req, params, 'remove');
}
