/** @jest-environment node */

import { NextRequest } from 'next/server';

const requireSessionMock = jest.fn();
const reserveRentalCheckoutLocksMock = jest.fn();
const releaseRentalCheckoutLocksMock = jest.fn();
const resolveCanonicalRentalCheckoutMock = jest.fn();

jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));
jest.mock('@/lib/prisma', () => ({ prisma: { id: 'prisma_mock' } }));
jest.mock('@/server/repositories/rentalCheckoutLocks', () => ({
  reserveRentalCheckoutLocks: (...args: any[]) => reserveRentalCheckoutLocksMock(...args),
  releaseRentalCheckoutLocks: (...args: any[]) => releaseRentalCheckoutLocksMock(...args),
}));
jest.mock('@/server/rentalCheckoutAccess', () => ({
  resolveCanonicalRentalCheckout: (...args: any[]) => resolveCanonicalRentalCheckoutMock(...args),
}));

import { POST, DELETE } from '@/app/api/billing/rental-lock/route';

const jsonRequest = (method: 'POST' | 'DELETE', body: unknown) => (
  new NextRequest('http://localhost/api/billing/rental-lock', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
);

describe('rental lock route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
    resolveCanonicalRentalCheckoutMock.mockResolvedValue({
      ok: true,
      checkout: {
        window: {
          eventId: 'event_1',
          fieldIds: ['field_1'],
          start: new Date('2099-04-01T13:30:00.000Z'),
          end: new Date('2099-04-01T15:00:00.000Z'),
          timeZone: 'UTC',
          noFixedEndDateTime: false,
          organizationId: 'organization_1',
          eventType: 'EVENT',
          parentEvent: null,
        },
        organization: { id: 'organization_1', ownerId: 'owner_1', publicPageEnabled: true },
        totalAmountCents: 2500,
        availabilitySlotIds: ['availability_1'],
        requiredTemplateIds: [],
        hostRequiredTemplateIds: [],
        event: null,
      },
    });
    reserveRentalCheckoutLocksMock.mockResolvedValue({
      ok: true,
      ownerToken: 'rental:user_1:event_1',
      lockIds: ['lock_1'],
      expiresAt: new Date('2099-04-01T13:40:00.000Z'),
    });
    releaseRentalCheckoutLocksMock.mockResolvedValue(undefined);
  });

  it('reserves a lock window', async () => {
    const res = await POST(jsonRequest('POST', {
      event: { $id: 'event_1' },
      timeSlot: { $id: 'slot_1' },
    }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(typeof data.expiresAt).toBe('string');
    expect(reserveRentalCheckoutLocksMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_1',
      }),
    );
    expect(resolveCanonicalRentalCheckoutMock).toHaveBeenCalledWith(expect.objectContaining({
      session: expect.objectContaining({ userId: 'user_1' }),
    }));
  });

  it('returns conflict response when reservation fails', async () => {
    reserveRentalCheckoutLocksMock.mockResolvedValueOnce({
      ok: false,
      status: 409,
      error: 'Selected fields and time range are temporarily reserved by another checkout.',
      conflictFieldIds: ['field_1'],
    });

    const res = await POST(jsonRequest('POST', {
      event: { $id: 'event_1' },
      timeSlot: { $id: 'slot_1' },
    }));
    const data = await res.json();

    expect(res.status).toBe(409);
    expect(String(data.error ?? '')).toContain('temporarily reserved');
    expect(data.conflictFieldIds).toEqual(['field_1']);
  });

  it('rejects rental lock reservations that start in the past', async () => {
    resolveCanonicalRentalCheckoutMock.mockResolvedValueOnce({
      ok: true,
      checkout: {
        window: {
          eventId: 'event_1',
          fieldIds: ['field_1'],
          start: new Date('2001-04-01T13:30:00.000Z'),
          end: new Date('2001-04-01T15:00:00.000Z'),
          timeZone: 'UTC',
          noFixedEndDateTime: false,
          organizationId: 'organization_1',
          eventType: 'EVENT',
          parentEvent: null,
        },
        organization: { id: 'organization_1', ownerId: 'owner_1', publicPageEnabled: true },
        totalAmountCents: 2500,
        availabilitySlotIds: ['availability_1'],
        requiredTemplateIds: [],
        hostRequiredTemplateIds: [],
        event: null,
      },
    });

    const res = await POST(jsonRequest('POST', {
      event: { $id: 'event_1' },
      timeSlot: { $id: 'slot_1' },
    }));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe('Rental selections must start in the future.');
    expect(reserveRentalCheckoutLocksMock).not.toHaveBeenCalled();
  });

  it('releases a lock window', async () => {
    const res = await DELETE(jsonRequest('DELETE', {
      event: { $id: 'event_1' },
      timeSlot: { $id: 'slot_1' },
    }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(releaseRentalCheckoutLocksMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_1',
      }),
    );
    expect(resolveCanonicalRentalCheckoutMock).toHaveBeenCalledWith(expect.objectContaining({
      requireAvailability: false,
    }));
  });

  it('does not reserve a caller-forged field selection', async () => {
    resolveCanonicalRentalCheckoutMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      error: 'One or more selected fields are unavailable for rental.',
    });

    const res = await POST(jsonRequest('POST', {
      event: { $id: 'event_1', hostId: 'user_1' },
      timeSlot: { scheduledFieldIds: ['forged_field'] },
    }));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain('unavailable');
    expect(reserveRentalCheckoutLocksMock).not.toHaveBeenCalled();
  });
});
