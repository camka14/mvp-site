import { prisma } from '@/lib/prisma';
import { extractDivisionTokenFromId } from '@/lib/divisionTypes';
import { requireVerifiedEmailForPaidRegistration } from '@/server/emailVerificationGate';

type PrismaLike = typeof prisma | any;

type EventPriceContext = {
  id?: string | null;
  price?: number | null;
};

type DivisionSelectionContext = {
  divisionId?: string | null;
  divisionTypeId?: string | null;
  divisionTypeKey?: string | null;
};

const normalizeId = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const normalizeCents = (value: unknown): number => {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.max(0, Math.round(numeric));
};

const uniqueNonEmpty = (values: Array<string | null | undefined>): string[] => (
  Array.from(new Set(values.map((value) => normalizeId(value)).filter((value): value is string => Boolean(value))))
);

const buildDivisionCandidates = (selection?: DivisionSelectionContext | null): string[] => (
  uniqueNonEmpty([
    selection?.divisionId,
    selection?.divisionTypeId,
    selection?.divisionTypeKey,
    extractDivisionTokenFromId(normalizeId(selection?.divisionId) ?? ''),
  ])
);

export const resolveEventRegistrationPriceCents = async ({
  event,
  selection,
  includeAnyPricedDivision = false,
  client = prisma,
}: {
  event: EventPriceContext;
  selection?: DivisionSelectionContext | null;
  includeAnyPricedDivision?: boolean;
  client?: PrismaLike;
}): Promise<number> => {
  const eventPriceCents = normalizeCents(event.price);
  const eventId = normalizeId(event.id);
  if (!eventId || !client?.divisions?.findFirst) {
    return eventPriceCents;
  }

  const candidates = buildDivisionCandidates(selection);
  if (candidates.length > 0) {
    const division = await client.divisions.findFirst({
      where: {
        eventId,
        OR: [
          { id: { in: candidates } },
          { key: { in: candidates } },
          { divisionTypeId: { in: candidates } },
        ],
      },
      select: { price: true },
    });
    return typeof division?.price === 'number'
      ? normalizeCents(division.price)
      : eventPriceCents;
  }

  if (!includeAnyPricedDivision) {
    return eventPriceCents;
  }

  const pricedDivision = await client.divisions.findFirst({
    where: {
      eventId,
      price: { gt: 0 },
      OR: [
        { kind: 'LEAGUE' },
        { kind: null },
      ],
    },
    select: { price: true },
  });
  return Math.max(eventPriceCents, normalizeCents(pricedDivision?.price));
};

export const requireVerifiedEmailForEventRegistrationIfPaid = async ({
  userId,
  event,
  selection,
  includeAnyPricedDivision = false,
  client = prisma,
}: {
  userId: string;
  event: EventPriceContext;
  selection?: DivisionSelectionContext | null;
  includeAnyPricedDivision?: boolean;
  client?: PrismaLike;
}) => {
  const priceCents = await resolveEventRegistrationPriceCents({
    event,
    selection,
    includeAnyPricedDivision,
    client,
  });
  if (priceCents <= 0) {
    return null;
  }

  return requireVerifiedEmailForPaidRegistration(userId);
};

export const requireVerifiedEmailForTeamRegistrationIfPaid = async ({
  userId,
  registrationPriceCents,
}: {
  userId: string;
  registrationPriceCents: unknown;
}) => {
  if (normalizeCents(registrationPriceCents) <= 0) {
    return null;
  }

  return requireVerifiedEmailForPaidRegistration(userId);
};
