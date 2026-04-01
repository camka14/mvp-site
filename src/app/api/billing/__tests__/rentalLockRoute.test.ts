/** @jest-environment node */

import { NextRequest } from 'next/server';

const requireSessionMock = jest.fn();
const reserveRentalCheckoutLocksMock = jest.fn();
const releaseRentalCheckoutLocksMock = jest.fn();
const extractRentalCheckoutWindowMock = jest.fn();

jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));
jest.mock('@/lib/prisma', () => ({ prisma: { id: 'prisma_mock' } }));
jest.mock('@/server/repositories/rentalCheckoutLocks', () => ({
  extractRentalCheckoutWindow: (...args: any[]) => extractRentalCheckoutWindowMock(...args),
  reserveRentalCheckoutLocks: (...args: any[]) => reserveRentalCheckoutLocksMock(...args),
  releaseRentalCheckoutLocks: (...args: any[]) => releaseRentalCheckoutLocksMock(...args),
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
    extractRentalCheckoutWindowMock.mockReturnValue({
      ok: true,
      window: {
        eventId: 'event_1',
        fieldIds: ['field_1'],
        start: new Date('2026-04-01T13:30:00.000Z'),
        end: new Date('2026-04-01T15:00:00.000Z'),
        noFixedEndDateTime: false,
        organizationId: null,
        eventType: 'EVENT',
        parentEvent: null,
      },
    });
    reserveRentalCheckoutLocksMock.mockResolvedValue({
      ok: true,
      ownerToken: 'rental:user_1:event_1',
      lockIds: ['lock_1'],
      expiresAt: new Date('2026-04-01T13:40:00.000Z'),
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
  });
});
