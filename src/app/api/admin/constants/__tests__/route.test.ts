/** @jest-environment node */

import { NextRequest } from 'next/server';

const requireRazumlyAdminMock = jest.fn();
const loadAdminConstantsMock = jest.fn();

jest.mock('@/server/razumlyAdmin', () => ({
  requireRazumlyAdmin: (...args: any[]) => requireRazumlyAdminMock(...args),
}));

jest.mock('@/server/adminConstants', () => ({
  loadAdminConstants: (...args: any[]) => loadAdminConstantsMock(...args),
}));

import { GET as constantsGet } from '@/app/api/admin/constants/route';

describe('GET /api/admin/constants', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 403 when caller is not a razumly admin', async () => {
    requireRazumlyAdminMock.mockRejectedValue(new Response('Forbidden', { status: 403 }));
    const res = await constantsGet(new NextRequest('http://localhost/api/admin/constants'));
    expect(res.status).toBe(403);
  });

  it('returns constants payload for admin caller', async () => {
    requireRazumlyAdminMock.mockResolvedValue({ userId: 'admin_1', adminEmail: 'admin@razumly.com' });
    loadAdminConstantsMock.mockResolvedValue({
      sports: [{ id: 'sport_1', name: 'Soccer' }],
      divisions: [{ id: 'division_1', name: 'Open', key: 'open' }],
      leagueScoringConfigs: [{ id: 'cfg_1', pointsForWin: 3 }],
      editableFields: {
        sports: ['name'],
        divisions: ['name', 'key'],
        leagueScoringConfigs: ['pointsForWin'],
      },
    });

    const res = await constantsGet(new NextRequest('http://localhost/api/admin/constants'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.adminEmail).toBe('admin@razumly.com');
    expect(Array.isArray(json.sports)).toBe(true);
    expect(Array.isArray(json.divisions)).toBe(true);
    expect(Array.isArray(json.leagueScoringConfigs)).toBe(true);
  });
});
