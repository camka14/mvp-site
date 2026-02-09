import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { parseDateInput, stripLegacyFieldsDeep, withLegacyFields } from '@/server/legacyFormat';

export const dynamic = 'force-dynamic';

const EVENT_UPDATE_FIELDS = new Set([
  'name',
  'start',
  'end',
  'description',
  'divisions',
  'winnerSetCount',
  'loserSetCount',
  'doubleElimination',
  'location',
  'rating',
  'teamSizeLimit',
  'maxParticipants',
  'minAge',
  'maxAge',
  'hostId',
  'price',
  'singleDivision',
  'waitListIds',
  'freeAgentIds',
  'cancellationRefundHours',
  'teamSignup',
  'prize',
  'registrationCutoffHours',
  'seedColor',
  'imageId',
  'fieldCount',
  'winnerBracketPointsToVictory',
  'loserBracketPointsToVictory',
  'coordinates',
  'gamesPerOpponent',
  'includePlayoffs',
  'playoffTeamCount',
  'usesSets',
  'matchDurationMinutes',
  'setDurationMinutes',
  'setsPerMatch',
  'restTimeMinutes',
  'state',
  'pointsToVictory',
  'sportId',
  'timeSlotIds',
  'fieldIds',
  'teamIds',
  'userIds',
  'registrationIds',
  'leagueScoringConfigId',
  'organizationId',
  'autoCancellation',
  'eventType',
  'fieldType',
  'doTeamsRef',
  'refereeIds',
  'allowPaymentPlans',
  'installmentCount',
  'installmentDueDates',
  'installmentAmounts',
  'allowTeamSplitDefault',
  'requiredTemplateIds',
]);

const updateSchema = z.object({
  event: z.record(z.string(), z.any()).optional(),
}).passthrough();

const withLegacyEvent = (row: any) => {
  const legacy = withLegacyFields(row);
  if (!Array.isArray(legacy.waitListIds)) {
    (legacy as any).waitListIds = [];
  }
  if (!Array.isArray(legacy.freeAgentIds)) {
    (legacy as any).freeAgentIds = [];
  }
  if (!Array.isArray(legacy.refereeIds)) {
    (legacy as any).refereeIds = [];
  }
  if (!Array.isArray(legacy.requiredTemplateIds)) {
    (legacy as any).requiredTemplateIds = [];
  }
  return legacy;
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const event = await prisma.events.findUnique({ where: { id: eventId } });
  if (!event) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (event.state === 'TEMPLATE') {
    const session = await requireSession(_req);
    if (!session.isAdmin && session.userId !== event.hostId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }
  return NextResponse.json(withLegacyEvent(event), { status: 200 });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const { eventId } = await params;
  const existing = await prisma.events.findUnique({ where: { id: eventId } });
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (!session.isAdmin && existing.hostId !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const rawPayload = (parsed.data.event ?? parsed.data ?? {}) as Record<string, any>;
  const payload = stripLegacyFieldsDeep(rawPayload) as Record<string, any>;

  // Never allow callers to override the URL id or server-managed timestamps.
  delete payload.id;
  delete payload.createdAt;
  delete payload.updatedAt;

  // Drop relationship objects that Prisma doesn't accept on `events.update`.
  delete payload.players;
  delete payload.referees;
  delete payload.teams;
  delete payload.fields;
  delete payload.matches;
  delete payload.timeSlots;
  delete payload.leagueConfig;

  if (payload.installmentDueDates) {
    payload.installmentDueDates = Array.isArray(payload.installmentDueDates)
      ? payload.installmentDueDates.map((value: unknown) => parseDateInput(value)).filter(Boolean)
      : payload.installmentDueDates;
  }

  if (payload.start) {
    const parsedStart = parseDateInput(payload.start);
    if (parsedStart) payload.start = parsedStart;
  }

  if (payload.end) {
    const parsedEnd = parseDateInput(payload.end);
    if (parsedEnd) payload.end = parsedEnd;
  }

  const data: Record<string, any> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (!EVENT_UPDATE_FIELDS.has(key)) continue;
    data[key] = value;
  }

  const updated = await prisma.events.update({
    where: { id: eventId },
    data: {
      ...data,
      updatedAt: new Date(),
    },
  });

  return NextResponse.json(withLegacyEvent(updated), { status: 200 });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const session = await requireSession(req);
  const { eventId } = await params;
  const event = await prisma.events.findUnique({ where: { id: eventId } });
  if (!event) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (!session.isAdmin && event.hostId !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await prisma.events.delete({ where: { id: eventId } });
  return NextResponse.json({ deleted: true }, { status: 200 });
}
