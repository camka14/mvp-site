/** @jest-environment node */

import { NextRequest } from 'next/server';

const requireRazumlyAdminMock = jest.fn();
const transactionMock = jest.fn(async (callback: any) => callback(prismaMock));
const prismaMock = {
  organizations: {
    findUnique: jest.fn(),
    delete: jest.fn(),
  },
  events: {
    count: jest.fn(),
  },
  canonicalTeams: {
    count: jest.fn(),
  },
  staffMembers: {
    deleteMany: jest.fn(),
  },
  invites: {
    deleteMany: jest.fn(),
  },
  products: {
    deleteMany: jest.fn(),
  },
  fields: {
    deleteMany: jest.fn(),
  },
  templateDocuments: {
    deleteMany: jest.fn(),
  },
  signedDocuments: {
    updateMany: jest.fn(),
  },
  bills: {
    updateMany: jest.fn(),
  },
  refundRequests: {
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

import { DELETE as adminOrganizationDelete } from '@/app/api/admin/organizations/[id]/route';

describe('DELETE /api/admin/organizations/[id]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns blockers when the organization still owns events or teams', async () => {
    requireRazumlyAdminMock.mockResolvedValue({ userId: 'admin_1', adminEmail: 'admin@razumly.com' });
    prismaMock.organizations.findUnique.mockResolvedValue({ id: 'org_1' });
    prismaMock.events.count.mockResolvedValue(2);
    prismaMock.canonicalTeams.count.mockResolvedValue(1);

    const res = await adminOrganizationDelete(
      new NextRequest('http://localhost/api/admin/organizations/org_1', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'org_1' }) },
    );
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.blockers).toEqual({ events: 2, teams: 1 });
    expect(prismaMock.organizations.delete).not.toHaveBeenCalled();
  });

  it('deletes an unblocked organization and related admin-owned rows', async () => {
    requireRazumlyAdminMock.mockResolvedValue({ userId: 'admin_1', adminEmail: 'admin@razumly.com' });
    prismaMock.organizations.findUnique.mockResolvedValue({ id: 'org_1' });
    prismaMock.events.count.mockResolvedValue(0);
    prismaMock.canonicalTeams.count.mockResolvedValue(0);

    const res = await adminOrganizationDelete(
      new NextRequest('http://localhost/api/admin/organizations/org_1', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'org_1' }) },
    );

    expect(res.status).toBe(200);
    expect(prismaMock.fields.deleteMany).toHaveBeenCalledWith({ where: { organizationId: 'org_1' } });
    expect(prismaMock.organizations.delete).toHaveBeenCalledWith({ where: { id: 'org_1' } });
  });
});
