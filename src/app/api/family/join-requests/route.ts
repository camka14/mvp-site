import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

const normalizeText = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const toIso = (value?: Date | string | null): string | null => {
  if (!value) {
    return null;
  }
  const asDate = value instanceof Date ? value : new Date(value);
  return Number.isFinite(asDate.getTime()) ? asDate.toISOString() : null;
};

export async function GET(req: NextRequest) {
  const session = await requireSession(req);

  const requests = await prisma.eventRegistrations.findMany({
    where: {
      parentId: session.userId,
      registrantType: 'CHILD',
      status: 'PENDINGCONSENT',
      consentStatus: {
        in: ['guardian_approval_required'],
      },
    },
    orderBy: {
      updatedAt: 'desc',
    },
    select: {
      id: true,
      eventId: true,
      registrantId: true,
      divisionId: true,
      divisionTypeId: true,
      divisionTypeKey: true,
      consentStatus: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!requests.length) {
    return NextResponse.json({ requests: [] }, { status: 200 });
  }

  const eventIds = Array.from(new Set(
    requests
      .map((request) => normalizeText(request.eventId))
      .filter((value): value is string => Boolean(value)),
  ));
  const childIds = Array.from(new Set(
    requests
      .map((request) => normalizeText(request.registrantId))
      .filter((value): value is string => Boolean(value)),
  ));

  const [events, children, childSensitive] = await Promise.all([
    eventIds.length
      ? prisma.events.findMany({
        where: { id: { in: eventIds } },
        select: {
          id: true,
          name: true,
          start: true,
        },
      })
      : Promise.resolve([]),
    childIds.length
      ? prisma.userData.findMany({
        where: { id: { in: childIds } },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          dateOfBirth: true,
        },
      })
      : Promise.resolve([]),
    childIds.length
      ? prisma.sensitiveUserData.findMany({
        where: { userId: { in: childIds } },
        select: {
          userId: true,
          email: true,
        },
      })
      : Promise.resolve([]),
  ]);

  const eventById = new Map(events.map((event) => [event.id, event]));
  const childById = new Map(children.map((child) => [child.id, child]));
  const childEmailById = new Map(
    childSensitive.map((row) => [row.userId, normalizeText(row.email)]),
  );

  const payload = requests.map((request) => {
    const child = childById.get(request.registrantId);
    const event = eventById.get(request.eventId);
    const firstName = normalizeText(child?.firstName) ?? '';
    const lastName = normalizeText(child?.lastName) ?? '';
    const fullName = `${firstName} ${lastName}`.trim() || 'Child';
    const childEmail = childEmailById.get(request.registrantId) ?? null;

    return {
      registrationId: request.id,
      eventId: request.eventId,
      eventName: normalizeText(event?.name) ?? 'Event',
      eventStart: toIso(event?.start),
      childUserId: request.registrantId,
      childFirstName: firstName,
      childLastName: lastName,
      childFullName: fullName,
      childDateOfBirth: toIso(child?.dateOfBirth),
      childEmail,
      childHasEmail: Boolean(childEmail),
      consentStatus: normalizeText(request.consentStatus) ?? 'guardian_approval_required',
      divisionId: normalizeText(request.divisionId),
      divisionTypeId: normalizeText(request.divisionTypeId),
      divisionTypeKey: normalizeText(request.divisionTypeKey),
      requestedAt: toIso(request.createdAt),
      updatedAt: toIso(request.updatedAt),
    };
  });

  return NextResponse.json({ requests: payload }, { status: 200 });
}
