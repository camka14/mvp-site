import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { canManageOrganization } from '@/server/accessControl';
import { attachFacilitiesToFieldRows, toFieldResponse } from '@/server/fieldFacilityPayload';

export const dynamic = 'force-dynamic';

const ACTIVE_BOOKING_STATUSES = ['CONFIRMED'];
const ACTIVE_ITEM_STATUSES = ['CONFIRMED'];

const normalizeOptionalString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const parseDateParam = (value: string | null): Date | null => {
  const normalized = normalizeOptionalString(value);
  if (!normalized) return null;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const uniqueStrings = (values: unknown[]): string[] => (
  Array.from(
    new Set(
      values
        .map(normalizeOptionalString)
        .filter((value): value is string => Boolean(value)),
    ),
  )
);

const loadAllowedOrganizationRentalIds = async (
  session: { userId: string; isAdmin: boolean },
  candidateOrganizationIds: string[],
): Promise<Set<string>> => {
  const ids = uniqueStrings(candidateOrganizationIds);
  if (!ids.length) {
    return new Set();
  }

  const organizations = await (prisma as any).organizations.findMany({
    where: { id: { in: ids } },
    select: { id: true, ownerId: true },
  });

  const allowed = new Set<string>();
  for (const organization of organizations) {
    if (await canManageOrganization(session, organization)) {
      allowed.add(organization.id);
    }
  }
  return allowed;
};

export async function GET(req: NextRequest) {
  const session = await requireSession(req);
  const params = req.nextUrl.searchParams;
  const eventId = normalizeOptionalString(params.get('eventId'));
  const organizationId = normalizeOptionalString(params.get('organizationId'));
  const rangeStart = parseDateParam(params.get('start'));
  const rangeEnd = parseDateParam(params.get('end'));

  const bookingEventFilter = eventId
    ? { OR: [{ eventId: null }, { eventId }] }
    : { eventId: null };
  const itemWhere: Record<string, unknown> = {
    status: { in: ACTIVE_ITEM_STATUSES },
    ...(eventId ? { OR: [{ eventId: null }, { eventId }] } : { eventId: null }),
    ...(rangeStart ? { end: { gt: rangeStart } } : {}),
    ...(rangeEnd ? { start: { lt: rangeEnd } } : {}),
  };
  const matchingItems = await (prisma as any).rentalBookingItems.findMany({
    where: itemWhere,
    orderBy: [{ start: 'asc' }, { id: 'asc' }],
  });
  const matchingBookingIds = uniqueStrings(matchingItems.map((item: any) => item.bookingId));
  if (!matchingBookingIds.length) {
    return NextResponse.json({ bookings: [] }, { status: 200 });
  }

  const baseWhere: Record<string, unknown> = {
    id: { in: matchingBookingIds },
    status: { in: ACTIVE_BOOKING_STATUSES },
    ...(organizationId ? { renterOrganizationId: organizationId } : {}),
  };

  const personalBookings = await (prisma as any).rentalBookings.findMany({
    where: {
      AND: [
        baseWhere,
        bookingEventFilter,
        {
          OR: [
            { renterUserId: session.userId },
            { createdByUserId: session.userId },
          ],
        },
      ],
    },
    orderBy: { createdAt: 'desc' },
  });

  const organizationBookingCandidates = await (prisma as any).rentalBookings.findMany({
    where: {
      AND: [
        baseWhere,
        bookingEventFilter,
        { renterOrganizationId: { not: null } },
      ],
    },
    orderBy: { createdAt: 'desc' },
  });

  const allowedOrganizationIds = await loadAllowedOrganizationRentalIds(
    session,
    organizationBookingCandidates.map((booking: any) => booking.renterOrganizationId),
  );

  const bookingById = new Map<string, any>();
  personalBookings.forEach((booking: any) => bookingById.set(String(booking.id), booking));
  organizationBookingCandidates.forEach((booking: any) => {
    const renterOrganizationId = normalizeOptionalString(booking.renterOrganizationId);
    if (renterOrganizationId && allowedOrganizationIds.has(renterOrganizationId)) {
      bookingById.set(String(booking.id), booking);
    }
  });

  const bookings = Array.from(bookingById.values());
  const bookingIds = uniqueStrings(bookings.map((booking: any) => booking.id));
  if (!bookingIds.length) {
    return NextResponse.json({ bookings: [] }, { status: 200 });
  }

  const bookingIdSet = new Set(bookingIds);
  const items = matchingItems.filter((item: any) => bookingIdSet.has(String(item.bookingId)));

  const [bookingOrganizations, bookingItemFacilities] = await Promise.all([
    (prisma as any).organizations.findMany({
      where: { id: { in: uniqueStrings(bookings.map((booking: any) => booking.organizationId)) } },
      select: {
        id: true,
        name: true,
        location: true,
        address: true,
        coordinates: true,
      },
    }),
    typeof (prisma as any).facilities?.findMany === 'function'
      ? (prisma as any).facilities.findMany({
          where: { id: { in: uniqueStrings(items.map((item: any) => item.facilityId)) } },
        })
      : Promise.resolve([]),
  ]);

  const fields = await attachFacilitiesToFieldRows(
    await (prisma as any).fields.findMany({
      where: { id: { in: uniqueStrings(items.map((item: any) => item.fieldId)) } },
    }),
  );
  const fieldById = new Map<string, any>(
    fields.map((field: any) => [String(field.id), toFieldResponse(field)]),
  );
  const organizationById = new Map<string, any>(
    bookingOrganizations.map((organization: any) => [String(organization.id), organization]),
  );
  const facilityById = new Map<string, any>(
    bookingItemFacilities.map((facility: any) => [String(facility.id), facility]),
  );
  const itemsByBookingId = new Map<string, any[]>();
  items.forEach((item: any) => {
    const bookingId = String(item.bookingId);
    itemsByBookingId.set(bookingId, [...(itemsByBookingId.get(bookingId) ?? []), item]);
  });

  return NextResponse.json({
    bookings: bookings
      .map((booking: any) => ({
        ...booking,
        organization: organizationById.get(String(booking.organizationId)) ?? null,
        items: (itemsByBookingId.get(String(booking.id)) ?? []).map((item: any) => {
          const facility = item.facilityId ? facilityById.get(String(item.facilityId)) ?? null : null;
          const field = fieldById.get(String(item.fieldId)) ?? null;
          return {
            ...item,
            start: item.start instanceof Date ? item.start.toISOString() : item.start,
            end: item.end instanceof Date ? item.end.toISOString() : item.end,
            facility,
            field: field
              ? {
                  ...field,
                  facilityId: field.facilityId ?? item.facilityId ?? null,
                  facility: field.facility ?? facility,
                }
              : null,
          };
        }),
      }))
      .filter((booking: any) => booking.items.length > 0),
  }, { status: 200 });
}
