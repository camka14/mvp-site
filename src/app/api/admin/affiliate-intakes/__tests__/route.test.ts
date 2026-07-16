/** @jest-environment node */

import { NextRequest } from 'next/server';

const requireRazumlyAdminMock = jest.fn();
const listMock = jest.fn();
const createMock = jest.fn();
const queueMock = jest.fn();

jest.mock('@/server/razumlyAdmin', () => ({
  requireRazumlyAdmin: (...args: unknown[]) => requireRazumlyAdminMock(...args),
}));
jest.mock('@/server/affiliateImports/sourceIntake', () => ({
  listAffiliateSourceIntakes: (...args: unknown[]) => listMock(...args),
  createAffiliateSourceIntake: (...args: unknown[]) => createMock(...args),
  queueAffiliateSourceIntakeRun: (...args: unknown[]) => queueMock(...args),
}));

import { GET, POST } from '@/app/api/admin/affiliate-intakes/route';
import { POST as inspect } from '@/app/api/admin/affiliate-intakes/[id]/inspect/route';

describe('/api/admin/affiliate-intakes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireRazumlyAdminMock.mockResolvedValue({ userId: 'admin_1' });
  });

  it('requires Razumly admin access', async () => {
    requireRazumlyAdminMock.mockRejectedValue(new Response('Forbidden', { status: 403 }));
    const response = await GET(new NextRequest('http://localhost/api/admin/affiliate-intakes'));
    expect(response.status).toBe(403);
    expect(listMock).not.toHaveBeenCalled();
  });

  it('creates an intake without creating an approved scrape source', async () => {
    createMock.mockResolvedValue({ id: 'intake_1', status: 'REVIEW_REQUIRED' });
    const response = await POST(new NextRequest('http://localhost/api/admin/affiliate-intakes', {
      method: 'POST',
      body: JSON.stringify({
        name: 'SF Glens',
        region: 'San Francisco Bay Area',
        targetKindHints: ['CLUB'],
        pages: [{ url: 'https://example.com/', role: 'HOME' }],
      }),
    }));
    expect(response.status).toBe(201);
    expect(createMock).toHaveBeenCalledWith(expect.objectContaining({ name: 'SF Glens' }), 'admin_1');
  });

  it('returns 202 when an inspection is queued', async () => {
    queueMock.mockResolvedValue({ id: 'run_1', status: 'QUEUED' });
    const response = await inspect(
      new NextRequest('http://localhost/api/admin/affiliate-intakes/intake_1/inspect', {
        method: 'POST',
        body: JSON.stringify({ pageIds: ['page_1'] }),
      }),
      { params: Promise.resolve({ id: 'intake_1' }) },
    );
    expect(response.status).toBe(202);
    expect(queueMock).toHaveBeenCalledWith('intake_1', ['page_1'], 'admin_1');
  });
});
