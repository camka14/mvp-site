const canManageEventMock = jest.fn();
const canManageOrganizationMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: {} }));
jest.mock('@/server/accessControl', () => ({
  canManageEvent: (...args: unknown[]) => canManageEventMock(...args),
  canManageOrganization: (...args: unknown[]) => canManageOrganizationMock(...args),
}));

import { resolveCanonicalRentalCheckout } from '@/server/rentalCheckoutAccess';

const start = new Date('2099-04-01T13:00:00.000Z');
const end = new Date('2099-04-01T14:00:00.000Z');

const selection = (overrides?: {
  event?: Record<string, unknown>;
  timeSlot?: Record<string, unknown>;
}) => ({
  event: {
    $id: 'draft_event_1',
    hostId: 'user_1',
    start: start.toISOString(),
    end: end.toISOString(),
    organizationId: 'forged_organization',
    ...(overrides?.event ?? {}),
  },
  timeSlot: {
    scheduledFieldIds: ['field_1'],
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    price: 1,
    ...(overrides?.timeSlot ?? {}),
  },
});

const createClient = (options?: {
  fields?: Array<Record<string, unknown>>;
  organization?: Record<string, unknown> | null;
  event?: Record<string, unknown> | null;
  slots?: Array<Record<string, unknown>>;
}) => ({
  fields: {
    findMany: jest.fn().mockResolvedValue(options?.fields ?? [
      {
        id: 'field_1',
        name: 'Court One',
        organizationId: 'organization_1',
        facilityId: null,
        rentalSlotIds: ['availability_1'],
        lat: 45.5,
        long: -122.6,
      },
    ]),
  },
  facilities: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  organizations: {
    findUnique: jest.fn().mockResolvedValue(options?.organization === undefined ? {
      id: 'organization_1',
      ownerId: 'owner_1',
      publicPageEnabled: true,
      coordinates: [-122.6, 45.5],
    } : options.organization),
  },
  events: {
    findUnique: jest.fn().mockResolvedValue(options?.event ?? null),
  },
  timeSlots: {
    findMany: jest.fn().mockResolvedValue(options?.slots ?? [
      {
        id: 'availability_1',
        archivedAt: null,
        repeating: false,
        startDate: new Date('2099-04-01T12:00:00.000Z'),
        endDate: new Date('2099-04-01T18:00:00.000Z'),
        timeZone: 'UTC',
        price: 1800,
        requiredTemplateIds: ['participant_template'],
        hostRequiredTemplateIds: ['rental_agreement'],
      },
    ]),
  },
});

describe('resolveCanonicalRentalCheckout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    canManageEventMock.mockResolvedValue(true);
    canManageOrganizationMock.mockResolvedValue(false);
  });

  it('derives price, organization, templates, fields, and window from persisted rental inventory', async () => {
    const client = createClient();
    const result = await resolveCanonicalRentalCheckout({
      session: { userId: 'user_1', isAdmin: false },
      ...selection(),
      client: client as any,
    });

    expect(result).toEqual(expect.objectContaining({ ok: true }));
    if (!result.ok) throw new Error(result.error);
    expect(result.checkout.window).toEqual(expect.objectContaining({
      eventId: 'draft_event_1',
      fieldIds: ['field_1'],
      organizationId: 'organization_1',
      start,
      end,
    }));
    expect(result.checkout.totalAmountCents).toBe(1800);
    expect(result.checkout.availabilitySlotIds).toEqual(['availability_1']);
    expect(result.checkout.requiredTemplateIds).toEqual(['participant_template']);
    expect(result.checkout.hostRequiredTemplateIds).toEqual(['rental_agreement']);
    expect(client.fields.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: { in: ['field_1'] } }),
    }));
  });

  it('rejects a caller-forged field before any reservation can be made', async () => {
    const client = createClient({ fields: [] });
    const result = await resolveCanonicalRentalCheckout({
      session: { userId: 'user_1', isAdmin: false },
      ...selection({ timeSlot: { scheduledFieldIds: ['forged_field'], startDate: start.toISOString(), endDate: end.toISOString() } }),
      client: client as any,
    });

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: 'One or more selected fields are unavailable for rental.',
    });
    expect(client.timeSlots.findMany).not.toHaveBeenCalled();
  });

  it('requires management authority when the selected event already exists', async () => {
    canManageEventMock.mockResolvedValueOnce(false);
    const client = createClient({
      event: {
        id: 'draft_event_1',
        archivedAt: null,
        hostId: 'another_user',
        assistantHostIds: [],
        organizationId: null,
        eventType: 'EVENT',
        parentEvent: null,
      },
    });
    const result = await resolveCanonicalRentalCheckout({
      session: { userId: 'user_1', isAdmin: false },
      ...selection(),
      client: client as any,
    });

    expect(result).toEqual({
      ok: false,
      status: 403,
      error: 'You do not have access to reserve rentals for this event.',
    });
    expect(canManageEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user_1' }),
      expect.objectContaining({ id: 'draft_event_1' }),
      client,
    );
  });

  it('allows a new draft only for its authenticated host and public rental inventory', async () => {
    const client = createClient();
    const result = await resolveCanonicalRentalCheckout({
      session: { userId: 'user_1', isAdmin: false },
      ...selection({ event: { hostId: 'another_user' } }),
      client: client as any,
    });

    expect(result).toEqual({
      ok: false,
      status: 403,
      error: 'You do not have access to reserve this rental checkout.',
    });
  });

  it('rejects a selection that is outside the current availability window', async () => {
    const client = createClient({
      slots: [{
        id: 'availability_1',
        archivedAt: null,
        repeating: false,
        startDate: new Date('2099-04-01T15:00:00.000Z'),
        endDate: new Date('2099-04-01T18:00:00.000Z'),
        timeZone: 'UTC',
        price: 1800,
      }],
    });
    const result = await resolveCanonicalRentalCheckout({
      session: { userId: 'user_1', isAdmin: false },
      ...selection(),
      client: client as any,
    });

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: 'One or more selected fields are unavailable for rental.',
    });
  });
});
