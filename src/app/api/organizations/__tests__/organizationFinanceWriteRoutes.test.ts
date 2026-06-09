/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  organizations: {
    findUnique: jest.fn(),
  },
};
const requireSessionMock = jest.fn();
const canManageStaffCompensationMock = jest.fn();
const canManageOrganizationFinanceMock = jest.fn();
const createCompensationRateMock = jest.fn();
const createFinancialLineItemMock = jest.fn();

class MockFinanceMutationError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: (...args: any[]) => requireSessionMock(...args) }));
jest.mock('@/server/finance/financeAccess', () => ({
  canManageStaffCompensation: (...args: any[]) => canManageStaffCompensationMock(...args),
  canManageOrganizationFinance: (...args: any[]) => canManageOrganizationFinanceMock(...args),
}));
jest.mock('@/server/finance/financeMutations', () => ({
  FinanceMutationError: MockFinanceMutationError,
  createCompensationRate: (...args: any[]) => createCompensationRateMock(...args),
  createFinancialLineItem: (...args: any[]) => createFinancialLineItemMock(...args),
}));

import { POST as postCompensation } from '@/app/api/organizations/[id]/finance/compensation/route';
import { POST as postLineItem } from '@/app/api/organizations/[id]/finance/line-items/route';

describe('organization finance write routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'owner_1', isAdmin: false });
    prismaMock.organizations.findUnique.mockResolvedValue({
      id: 'org_1',
      ownerId: 'owner_1',
    });
    canManageStaffCompensationMock.mockResolvedValue(true);
    canManageOrganizationFinanceMock.mockResolvedValue(true);
    createCompensationRateMock.mockResolvedValue({
      id: 'rate_1',
      organizationId: 'org_1',
      staffMemberId: 'staff_1',
      wageType: 'HOURLY',
      amountCents: 2200,
    });
    createFinancialLineItemMock.mockResolvedValue({
      id: 'line_1',
      organizationId: 'org_1',
      scope: 'EVENT',
      eventId: 'event_1',
      title: 'Field rental',
      amountCents: 15000,
    });
  });

  it('creates staff compensation rates for authorized staff and billing managers', async () => {
    const response = await postCompensation(
      new NextRequest('http://localhost/api/organizations/org_1/finance/compensation', {
        method: 'POST',
        body: JSON.stringify({
          targetType: 'STAFF',
          targetId: 'staff_1',
          wageType: 'HOURLY',
          amountCents: 2200,
          effectiveFrom: '2026-06-01T00:00:00.000Z',
        }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id: 'org_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(canManageStaffCompensationMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'owner_1' }),
      expect.objectContaining({ id: 'org_1' }),
      prismaMock,
    );
    expect(createCompensationRateMock).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 'org_1',
      targetType: 'STAFF',
      targetId: 'staff_1',
      wageType: 'HOURLY',
      amountCents: 2200,
      actingUserId: 'owner_1',
    }), prismaMock);
    expect(payload.rate.id).toBe('rate_1');
  });

  it('rejects compensation writes without staff compensation access', async () => {
    canManageStaffCompensationMock.mockResolvedValue(false);

    const response = await postCompensation(
      new NextRequest('http://localhost/api/organizations/org_1/finance/compensation', {
        method: 'POST',
        body: JSON.stringify({
          targetType: 'ROLE',
          targetId: 'role_1',
          wageType: 'SALARY',
          amountCents: 6500000,
        }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id: 'org_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe('Forbidden');
    expect(createCompensationRateMock).not.toHaveBeenCalled();
  });

  it('creates custom finance line items for organization finance managers', async () => {
    const response = await postLineItem(
      new NextRequest('http://localhost/api/organizations/org_1/finance/line-items', {
        method: 'POST',
        body: JSON.stringify({
          scope: 'EVENT',
          eventId: 'event_1',
          category: 'Rentals',
          title: 'Field rental',
          amountCents: 15000,
          status: 'ACTUAL',
        }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id: 'org_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(canManageOrganizationFinanceMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'owner_1' }),
      expect.objectContaining({ id: 'org_1' }),
      prismaMock,
    );
    expect(createFinancialLineItemMock).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 'org_1',
      scope: 'EVENT',
      eventId: 'event_1',
      category: 'Rentals',
      title: 'Field rental',
      amountCents: 15000,
      actingUserId: 'owner_1',
    }), prismaMock);
    expect(payload.lineItem.id).toBe('line_1');
  });

  it('passes mutation errors through with their status', async () => {
    createFinancialLineItemMock.mockRejectedValue(new MockFinanceMutationError(404, 'Event not found.'));

    const response = await postLineItem(
      new NextRequest('http://localhost/api/organizations/org_1/finance/line-items', {
        method: 'POST',
        body: JSON.stringify({
          scope: 'EVENT',
          eventId: 'event_missing',
          category: 'Rentals',
          title: 'Field rental',
          amountCents: 15000,
        }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id: 'org_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.error).toBe('Event not found.');
  });
});
