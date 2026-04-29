import { prisma } from '@/lib/prisma';
import type { Prisma, PrismaClient } from '@/generated/prisma/client';

type PrismaLike = PrismaClient | Prisma.TransactionClient | any;

export type EventOfficialRow = {
  id: string;
  eventId: string;
  userId: string;
  positionIds: string[];
  fieldIds: string[];
  isActive: boolean;
};

const normalizeId = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const normalizeIdList = (value: unknown): string[] => (
  Array.isArray(value)
    ? Array.from(new Set(
      value
        .map((entry) => normalizeId(entry))
        .filter((entry): entry is string => Boolean(entry)),
    ))
    : []
);

export const getEventOfficialRowsByEventIds = async (
  eventIds: string[],
  client: PrismaLike = prisma,
): Promise<Map<string, EventOfficialRow[]>> => {
  const normalizedEventIds = normalizeIdList(eventIds);
  const response = new Map<string, EventOfficialRow[]>();
  normalizedEventIds.forEach((eventId) => response.set(eventId, []));
  if (!normalizedEventIds.length || typeof client.eventOfficials?.findMany !== 'function') {
    return response;
  }

  const rows = await client.eventOfficials.findMany({
    where: {
      eventId: { in: normalizedEventIds },
      isActive: { not: false },
    },
    orderBy: [
      { createdAt: 'asc' },
      { id: 'asc' },
    ],
  });

  rows.forEach((row: any) => {
    const eventId = normalizeId(row.eventId);
    const userId = normalizeId(row.userId);
    const id = normalizeId(row.id);
    if (!eventId || !userId || !id) {
      return;
    }
    const list = response.get(eventId) ?? [];
    list.push({
      id,
      eventId,
      userId,
      positionIds: normalizeIdList(row.positionIds),
      fieldIds: normalizeIdList(row.fieldIds),
      isActive: row.isActive !== false,
    });
    response.set(eventId, list);
  });

  return response;
};

export const getEventOfficialIdsByEventIds = async (
  eventIds: string[],
  client: PrismaLike = prisma,
): Promise<Map<string, string[]>> => {
  const rowsByEventId = await getEventOfficialRowsByEventIds(eventIds, client);
  const response = new Map<string, string[]>();
  eventIds.forEach((eventId) => {
    response.set(eventId, Array.from(new Set((rowsByEventId.get(eventId) ?? []).map((row) => row.userId))));
  });
  return response;
};

export const getEventOfficialIdsForEvent = async (
  eventId: string,
  client: PrismaLike = prisma,
): Promise<string[]> => {
  const map = await getEventOfficialIdsByEventIds([eventId], client);
  return map.get(eventId) ?? [];
};
