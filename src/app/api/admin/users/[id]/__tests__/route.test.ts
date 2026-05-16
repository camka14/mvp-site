/** @jest-environment node */

import { NextRequest } from 'next/server';

const requireRazumlyAdminMock = jest.fn();
const transactionMock = jest.fn(async (callback: any) => callback(prismaMock));
const prismaMock = {
  userData: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  authUser: {
    findUnique: jest.fn(),
    deleteMany: jest.fn(),
  },
  sensitiveUserData: {
    findFirst: jest.fn(),
    deleteMany: jest.fn(),
  },
  events: {
    count: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  organizations: {
    count: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  chatGroup: {
    count: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  bills: {
    findMany: jest.fn(),
    updateMany: jest.fn(),
  },
  refundRequests: {
    findMany: jest.fn(),
  },
  teams: {
    findMany: jest.fn(),
    update: jest.fn(),
  },
  canonicalTeams: {
    updateMany: jest.fn(),
  },
  teamRegistrations: {
    updateMany: jest.fn(),
  },
  teamStaffAssignments: {
    updateMany: jest.fn(),
  },
  eventTeamStaffAssignments: {
    updateMany: jest.fn(),
  },
  eventOfficials: {
    deleteMany: jest.fn(),
  },
  eventRegistrations: {
    updateMany: jest.fn(),
  },
  subscriptions: {
    updateMany: jest.fn(),
  },
  invites: {
    updateMany: jest.fn(),
    deleteMany: jest.fn(),
  },
  parentChildLinks: {
    updateMany: jest.fn(),
  },
  pushDeviceTarget: {
    deleteMany: jest.fn(),
  },
  messages: {
    updateMany: jest.fn(),
  },
  moderationReport: {
    updateMany: jest.fn(),
  },
  files: {
    updateMany: jest.fn(),
  },
  stripeAccounts: {
    updateMany: jest.fn(),
  },
  $transaction: transactionMock,
};

jest.mock('@/server/razumlyAdmin', () => ({
  requireRazumlyAdmin: (...args: any[]) => requireRazumlyAdminMock(...args),
}));

jest.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}));

import { DELETE as adminUserDelete } from '@/app/api/admin/users/[id]/route';

describe('DELETE /api/admin/users/[id]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.userData.findUnique.mockResolvedValue({
      id: 'user_1',
      firstName: 'Sam',
      lastName: 'Player',
      userName: 'sam',
      dateOfBirth: new Date('2000-01-01T00:00:00Z'),
    });
    prismaMock.authUser.findUnique.mockResolvedValue({ id: 'user_1', email: 'sam@example.com' });
    prismaMock.sensitiveUserData.findFirst.mockResolvedValue({ id: 'sensitive_1', email: 'sam@example.com' });
    prismaMock.events.count.mockResolvedValue(0);
    prismaMock.organizations.count.mockResolvedValue(0);
    prismaMock.chatGroup.count.mockResolvedValue(0);
    prismaMock.bills.findMany.mockResolvedValue([]);
    prismaMock.refundRequests.findMany.mockResolvedValue([]);
    prismaMock.userData.findMany.mockResolvedValue([]);
    prismaMock.teams.findMany.mockResolvedValue([]);
    prismaMock.organizations.findMany.mockResolvedValue([]);
    prismaMock.events.findMany.mockResolvedValue([]);
    prismaMock.chatGroup.findMany.mockResolvedValue([]);
  });

  it('returns blockers before deleting owned records', async () => {
    requireRazumlyAdminMock.mockResolvedValue({ userId: 'admin_1', adminEmail: 'admin@razumly.com' });
    prismaMock.events.count.mockResolvedValue(1);
    prismaMock.organizations.count.mockResolvedValue(1);

    const res = await adminUserDelete(
      new NextRequest('http://localhost/api/admin/users/user_1', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'user_1' }) },
    );
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.blockers.hostedEvents).toBe(1);
    expect(json.blockers.ownedOrganizations).toBe(1);
    expect(prismaMock.userData.delete).not.toHaveBeenCalled();
  });

  it('deletes an unblocked user and linked auth rows', async () => {
    requireRazumlyAdminMock.mockResolvedValue({ userId: 'admin_1', adminEmail: 'admin@razumly.com' });

    const res = await adminUserDelete(
      new NextRequest('http://localhost/api/admin/users/user_1', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'user_1' }) },
    );

    expect(res.status).toBe(200);
    expect(prismaMock.authUser.deleteMany).toHaveBeenCalledWith({ where: { id: 'user_1' } });
    expect(prismaMock.sensitiveUserData.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { userId: 'user_1' },
          { email: 'sam@example.com' },
        ],
      },
    });
    expect(prismaMock.userData.delete).toHaveBeenCalledWith({ where: { id: 'user_1' } });
  });
});
