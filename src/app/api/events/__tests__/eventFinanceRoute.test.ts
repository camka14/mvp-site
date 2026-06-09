/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  events: {
    findUnique: jest.fn(),
  },
};
const requireSessionMock = jest.fn();
const canManageEventMock = jest.fn();
const loadEventFinanceSummaryMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: (...args: any[]) => requireSessionMock(...args) }));
jest.mock('@/server/accessControl', () => ({ canManageEvent: (...args: any[]) => canManageEventMock(...args) }));
jest.mock('@/server/finance/financeRepository', () => ({
  loadEventFinanceSummary: (...args: any[]) => loadEventFinanceSummaryMock(...args),
}));

import { GET } from '@/app/api/events/[eventId]/finance/route';

describe('GET /api/events/[eventId]/finance', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'host_1', isAdmin: false });
    canManageEventMock.mockResolvedValue(true);
    prismaMock.events.findUnique.mockResolvedValue({
      id: 'event_1',
      hostId: 'host_1',
      assistantHostIds: [],
      organizationId: 'org_1',
    });
    loadEventFinanceSummaryMock.mockResolvedValue({
      eventId: 'event_1',
      actualProfitCents: 4200,
      lineItems: [],
      warnings: [],
    });
  });

  it('returns the calculated event finance summary for event managers', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/events/event_1/finance'),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(canManageEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'host_1' }),
      expect.objectContaining({ id: 'event_1' }),
    );
    expect(loadEventFinanceSummaryMock).toHaveBeenCalledWith('event_1', prismaMock);
    expect(payload.finance).toMatchObject({
      eventId: 'event_1',
      actualProfitCents: 4200,
    });
  });

  it('rejects viewers who cannot manage the event', async () => {
    canManageEventMock.mockResolvedValue(false);

    const response = await GET(
      new NextRequest('http://localhost/api/events/event_1/finance'),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe('Forbidden');
    expect(loadEventFinanceSummaryMock).not.toHaveBeenCalled();
  });
});
