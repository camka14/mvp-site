import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { canManageEvent } from '@/server/accessControl';
import { parseDateInput, withLegacyFields } from '@/server/legacyFormat';
import { upsertEventFromPayload } from '@/server/repositories/events';

export const dynamic = 'force-dynamic';

const requestSchema = z.object({
  sessionStart: z.string(),
  sessionEnd: z.string(),
  slotId: z.string().optional(),
  divisionId: z.string().optional(),
  divisionTypeId: z.string().optional(),
  divisionTypeKey: z.string().optional(),
}).passthrough();

const normalizeId = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const normalizeStringIdList = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(
    new Set(
      value
        .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
        .filter((entry) => entry.length > 0),
    ),
  );
};

const normalizeSlotFieldIds = (slot: any): string[] => {
  const fromList = normalizeStringIdList(slot?.scheduledFieldIds);
  if (fromList.length) {
    return fromList;
  }
  const fallback = normalizeId(slot?.scheduledFieldId);
  return fallback ? [fallback] : [];
};

const normalizeSlotDays = (slot: any): number[] => {
  const days = Array.isArray(slot?.daysOfWeek) && slot.daysOfWeek.length
    ? slot.daysOfWeek
    : Number.isInteger(slot?.dayOfWeek)
      ? [slot.dayOfWeek]
      : [];
  return Array.from(
    new Set(
      days
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6),
    ),
  );
};

const toDateOnlyValue = (value: Date): number => {
  const copy = new Date(value.getTime());
  copy.setHours(0, 0, 0, 0);
  return copy.getTime();
};

const toMondayIndex = (value: Date): number => (value.getDay() + 6) % 7;

const matchesSlotOccurrence = (slot: any, sessionStart: Date, sessionEnd: Date): boolean => {
  const slotDays = normalizeSlotDays(slot);
  if (!slotDays.length) {
    return false;
  }

  const slotStartMinutes = Number(slot?.startTimeMinutes);
  const slotEndMinutes = Number(slot?.endTimeMinutes);
  if (!Number.isFinite(slotStartMinutes) || !Number.isFinite(slotEndMinutes) || slotEndMinutes <= slotStartMinutes) {
    return false;
  }

  const sessionStartMinutes = (sessionStart.getHours() * 60) + sessionStart.getMinutes();
  const sessionEndMinutes = (sessionEnd.getHours() * 60) + sessionEnd.getMinutes();
  if (sessionStartMinutes !== slotStartMinutes || sessionEndMinutes !== slotEndMinutes) {
    return false;
  }

  const sessionDay = toMondayIndex(sessionStart);
  if (!slotDays.includes(sessionDay)) {
    return false;
  }

  const slotStartDate = parseDateInput(slot?.startDate);
  if (!(slotStartDate instanceof Date) || Number.isNaN(slotStartDate.getTime())) {
    return false;
  }
  if (toDateOnlyValue(sessionStart) < toDateOnlyValue(slotStartDate)) {
    return false;
  }

  const slotEndDate = parseDateInput(slot?.endDate);
  if (slotEndDate instanceof Date && !Number.isNaN(slotEndDate.getTime())) {
    if (toDateOnlyValue(sessionStart) > toDateOnlyValue(slotEndDate)) {
      return false;
    }
  }

  return true;
};

const buildChildPayload = (
  parent: any,
  selectedSlot: any | null,
  childId: string,
  sessionStart: Date,
  sessionEnd: Date,
) => {
  const parentDivisionIds = normalizeStringIdList(parent.divisions);
  const slotDivisionIds = normalizeStringIdList(selectedSlot?.divisions);
  const childDivisionIds = slotDivisionIds.length ? slotDivisionIds : parentDivisionIds;
  const slotFieldIds = normalizeSlotFieldIds(selectedSlot);
  const parentFieldIds = normalizeStringIdList(parent.fieldIds);
  const childFieldIds = slotFieldIds.length ? slotFieldIds : parentFieldIds;

  return {
  id: childId,
  name: parent.name,
  description: parent.description,
  start: sessionStart,
  end: sessionEnd,
  location: parent.location,
  coordinates: parent.coordinates,
  price: parent.price,
  minAge: parent.minAge,
  maxAge: parent.maxAge,
  rating: parent.rating,
  imageId: parent.imageId,
  hostId: parent.hostId,
  assistantHostIds: Array.isArray(parent.assistantHostIds) ? parent.assistantHostIds : [],
  noFixedEndDateTime: false,
  state: parent.state,
  maxParticipants: parent.maxParticipants,
  teamSizeLimit: parent.teamSizeLimit,
  restTimeMinutes: parent.restTimeMinutes,
  teamSignup: parent.teamSignup,
  singleDivision: childDivisionIds.length <= 1 ? true : parent.singleDivision,
  waitListIds: [],
  freeAgentIds: [],
  teamIds: [],
  userIds: [],
  registrationIds: [],
  fieldIds: childFieldIds,
  timeSlotIds: [],
  refereeIds: Array.isArray(parent.refereeIds) ? parent.refereeIds : [],
  cancellationRefundHours: parent.cancellationRefundHours,
  registrationCutoffHours: parent.registrationCutoffHours,
  seedColor: parent.seedColor,
  eventType: 'WEEKLY_EVENT',
  sportId: parent.sportId,
  leagueScoringConfigId: parent.leagueScoringConfigId,
  organizationId: parent.organizationId,
  parentEvent: parent.id,
  requiredTemplateIds: Array.isArray(parent.requiredTemplateIds) ? parent.requiredTemplateIds : [],
  divisions: childDivisionIds,
  doTeamsRef: parent.doTeamsRef,
  teamRefsMaySwap: parent.teamRefsMaySwap,
  allowPaymentPlans: parent.allowPaymentPlans,
  installmentCount: parent.installmentCount,
  installmentDueDates: Array.isArray(parent.installmentDueDates) ? parent.installmentDueDates : [],
  installmentAmounts: Array.isArray(parent.installmentAmounts) ? parent.installmentAmounts : [],
  allowTeamSplitDefault: parent.allowTeamSplitDefault,
  registrationByDivisionType: parent.registrationByDivisionType,
  };
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const session = await requireSession(req);
  const { eventId } = await params;

  const body = await req.json().catch(() => null);
  const parsed = requestSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const sessionStart = parseDateInput(parsed.data.sessionStart);
  const sessionEnd = parseDateInput(parsed.data.sessionEnd);
  const slotId = normalizeId(parsed.data.slotId);
  if (!(sessionStart instanceof Date) || Number.isNaN(sessionStart.getTime())) {
    return NextResponse.json({ error: 'Invalid sessionStart' }, { status: 400 });
  }
  if (!(sessionEnd instanceof Date) || Number.isNaN(sessionEnd.getTime()) || sessionEnd.getTime() <= sessionStart.getTime()) {
    return NextResponse.json({ error: 'Invalid sessionEnd' }, { status: 400 });
  }

  const parent = await prisma.events.findUnique({
    where: { id: eventId },
  });
  if (!parent) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  const parentEventType = String(parent.eventType ?? '').toUpperCase();
  const parentEventId = normalizeId((parent as any).parentEvent);
  if (parentEventType !== 'WEEKLY_EVENT' || parentEventId) {
    return NextResponse.json({ error: 'Weekly sessions can only be created from parent weekly events.' }, { status: 400 });
  }

  const isManager = await canManageEvent(session, parent);
  const state = String(parent.state ?? '').toUpperCase();
  if (state === 'UNPUBLISHED' && !isManager) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const parentSlotIds = Array.isArray(parent.timeSlotIds) ? parent.timeSlotIds.map(String).filter(Boolean) : [];
  if (!parentSlotIds.length) {
    return NextResponse.json({ error: 'Parent weekly event has no timeslots.' }, { status: 400 });
  }

  const slots = await prisma.timeSlots.findMany({
    where: { id: { in: parentSlotIds } },
  });
  const matchingSlots = slots.filter((slot) => matchesSlotOccurrence(slot, sessionStart, sessionEnd));
  if (!matchingSlots.length) {
    return NextResponse.json({ error: 'Selected session does not match parent weekly timeslots.' }, { status: 400 });
  }
  const selectedSlot = slotId
    ? (matchingSlots.find((slot) => normalizeId(slot.id) === slotId) ?? null)
    : matchingSlots[0] ?? null;
  if (slotId && !selectedSlot) {
    return NextResponse.json({ error: 'Selected timeslot is not available for this session.' }, { status: 400 });
  }

  const existing = await prisma.events.findFirst({
    where: {
      eventType: 'WEEKLY_EVENT',
      parentEvent: eventId,
      start: sessionStart,
      end: sessionEnd,
    } as any,
  });
  if (existing) {
    return NextResponse.json({ event: withLegacyFields(existing) }, { status: 200 });
  }

  const childId = crypto.randomUUID();
  const childPayload = buildChildPayload(parent, selectedSlot, childId, sessionStart, sessionEnd);

  const created = await prisma.$transaction(async (tx) => {
    await upsertEventFromPayload(childPayload, tx);
    const createdRow = await tx.events.findUnique({ where: { id: childId } });
    if (!createdRow) {
      throw new Error('Failed to create weekly child event');
    }
    return createdRow;
  });

  return NextResponse.json({ event: withLegacyFields(created) }, { status: 201 });
}
