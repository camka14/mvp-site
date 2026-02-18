/** @jest-environment node */

import { NextRequest } from 'next/server';

const requireRazumlyAdminMock = jest.fn();
const parseAdminConstantKindMock = jest.fn();
const normalizePatchForKindMock = jest.fn();
const updateAdminConstantByKindMock = jest.fn();

class MockAdminConstantsInputError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

jest.mock('@/server/razumlyAdmin', () => ({
  requireRazumlyAdmin: (...args: any[]) => requireRazumlyAdminMock(...args),
}));

jest.mock('@/server/adminConstants', () => ({
  AdminConstantsInputError: MockAdminConstantsInputError,
  parseAdminConstantKind: (...args: any[]) => parseAdminConstantKindMock(...args),
  normalizePatchForKind: (...args: any[]) => normalizePatchForKindMock(...args),
  updateAdminConstantByKind: (...args: any[]) => updateAdminConstantByKindMock(...args),
}));

import { PATCH as constantPatch } from '@/app/api/admin/constants/[kind]/[id]/route';

const patchRequest = (body: unknown) => (
  new NextRequest('http://localhost/api/admin/constants/sports/sport_1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
);

describe('PATCH /api/admin/constants/[kind]/[id]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 403 when admin access is denied', async () => {
    requireRazumlyAdminMock.mockRejectedValue(new Response('Forbidden', { status: 403 }));
    const res = await constantPatch(
      patchRequest({ patch: { name: 'New Name' } }),
      { params: Promise.resolve({ kind: 'sports', id: 'sport_1' }) },
    );
    expect(res.status).toBe(403);
  });

  it('returns validation error when patch payload is invalid', async () => {
    requireRazumlyAdminMock.mockResolvedValue({ userId: 'admin_1' });
    parseAdminConstantKindMock.mockReturnValue('sports');
    normalizePatchForKindMock.mockImplementation(() => {
      throw new MockAdminConstantsInputError('Bad patch payload.', 400);
    });

    const res = await constantPatch(
      patchRequest({ patch: { name: null } }),
      { params: Promise.resolve({ kind: 'sports', id: 'sport_1' }) },
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toContain('Bad patch payload');
  });

  it('updates and returns record for valid requests', async () => {
    requireRazumlyAdminMock.mockResolvedValue({ userId: 'admin_1' });
    parseAdminConstantKindMock.mockReturnValue('sports');
    normalizePatchForKindMock.mockReturnValue({ name: 'Soccer' });
    updateAdminConstantByKindMock.mockResolvedValue({ id: 'sport_1', name: 'Soccer' });

    const res = await constantPatch(
      patchRequest({ patch: { name: 'Soccer' } }),
      { params: Promise.resolve({ kind: 'sports', id: 'sport_1' }) },
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(updateAdminConstantByKindMock).toHaveBeenCalledWith('sports', 'sport_1', { name: 'Soccer' });
    expect(json.record.$id).toBe('sport_1');
  });
});
