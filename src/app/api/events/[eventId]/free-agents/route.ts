import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { withLegacyFields } from '@/server/legacyFormat';
import { calculateAgeOnDate } from '@/lib/age';

export const dynamic = 'force-dynamic';

const payloadSchema = z.object({
  userId: z.string().optional(),
}).passthrough();

const normalizeUserId = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const ensureUnique = (values: string[]) => Array.from(new Set(values.filter(Boolean)));

const canManageChildFreeAgent = async (params: {
  parentId: string;
  childId: string;
}): Promise<boolean> => {
  const link = await prisma.parentChildLinks.findFirst({
    where: {
      parentId: params.parentId,
      childId: params.childId,
      status: 'ACTIVE',
    },
    select: { id: true },
  });
  return Boolean(link);
};

async function updateFreeAgents(
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
  const targetUserId = normalizeUserId(parsed.data.userId) ?? session.userId;
  let managingLinkedChild = false;

  if (!session.isAdmin && targetUserId !== session.userId) {
    const canManageChild = await canManageChildFreeAgent({
      parentId: session.userId,
      childId: targetUserId,
    });
    if (!canManageChild) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    managingLinkedChild = true;
  }

  const [event, targetUser] = await Promise.all([
    prisma.events.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        teamSignup: true,
        freeAgentIds: true,
        requiredTemplateIds: true,
        start: true,
      },
    }),
    prisma.userData.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        dateOfBirth: true,
      },
    }),
  ]);

  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }
  if (mode === 'add' && !event.teamSignup) {
    return NextResponse.json(
      { error: 'Free-agent signup is only available for team registration events.' },
      { status: 403 },
    );
  }
  if (!targetUser) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }
  const targetUserAgeAtEvent = targetUser.dateOfBirth instanceof Date && event.start instanceof Date
    ? calculateAgeOnDate(targetUser.dateOfBirth, event.start)
    : Number.NaN;
  const isMinorTargetUser = Number.isFinite(targetUserAgeAtEvent) && targetUserAgeAtEvent < 18;

  if (mode === 'add' && isMinorTargetUser && !session.isAdmin && !managingLinkedChild) {
    return NextResponse.json(
      {
        error: 'A parent/guardian must approve free-agent registration for child accounts.',
        requiresParentApproval: true,
      },
      { status: 403 },
    );
  }

  const currentFreeAgentIds = Array.isArray(event.freeAgentIds)
    ? event.freeAgentIds.filter((id): id is string => typeof id === 'string' && Boolean(id))
    : [];
  const nextFreeAgentIds = mode === 'add'
    ? ensureUnique([...currentFreeAgentIds, targetUserId])
    : currentFreeAgentIds.filter((id) => id !== targetUserId);

  const updated = await prisma.events.update({
    where: { id: eventId },
    data: {
      freeAgentIds: nextFreeAgentIds,
      updatedAt: new Date(),
    },
  });

  let warnings: string[] | undefined;
  if (mode === 'add' && managingLinkedChild && Array.isArray(event.requiredTemplateIds) && event.requiredTemplateIds.length > 0) {
    const childSensitive = await prisma.sensitiveUserData.findFirst({
      where: { userId: targetUserId },
      select: { email: true },
    });
    const childEmail = normalizeUserId(childSensitive?.email ?? null);
    if (!childEmail && Number.isFinite(targetUserAgeAtEvent) && targetUserAgeAtEvent < 13) {
      const childName = `${(targetUser.firstName ?? '').trim()} ${(targetUser.lastName ?? '').trim()}`.trim() || targetUserId;
      warnings = [
        `Under-13 child ${childName} is missing an email and cannot complete child signature steps until an email is added.`,
      ];
    }
  }

  return NextResponse.json({
    event: withLegacyFields(updated),
    warnings,
  }, { status: 200 });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  return updateFreeAgents(req, params, 'add');
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  return updateFreeAgents(req, params, 'remove');
}
