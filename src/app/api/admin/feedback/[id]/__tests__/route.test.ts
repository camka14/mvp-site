/** @jest-environment node */

import { NextRequest } from 'next/server';

const requireAdminMock = jest.fn();
const prismaMock = {
  feedbackSubmissions: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
};

jest.mock('@/server/razumlyAdmin', () => ({
  requireRazumlyAdmin: (...args: any[]) => requireAdminMock(...args),
}));
jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

import { PATCH } from '@/app/api/admin/feedback/[id]/route';

const row = {
  id: 'feedback_1',
  createdAt: new Date('2026-08-06T20:00:00.000Z'),
  updatedAt: new Date('2026-08-06T20:00:00.000Z'),
  type: 'IDEA',
  status: 'IN_REVIEW',
  message: 'Please add a better team search.',
  additionalContext: null,
  submitterUserId: null,
  allowContact: false,
  contactEmail: 'should-not-display@example.com',
  sourcePath: '/discover',
  userAgent: null,
  clientContext: { surface: 'WEB' },
  reviewedAt: new Date('2026-08-06T20:10:00.000Z'),
  reviewedByUserId: 'admin_1',
  reviewNotes: 'Reviewed with product.',
};

const request = (body: unknown) => new NextRequest('http://localhost/api/admin/feedback/feedback_1', {
  method: 'PATCH',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

describe('PATCH /api/admin/feedback/[id]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireAdminMock.mockResolvedValue({ userId: 'admin_1', adminEmail: 'admin@bracket-iq.com' });
    prismaMock.feedbackSubmissions.findUnique.mockResolvedValue({ status: 'NEW' });
    prismaMock.feedbackSubmissions.update.mockResolvedValue(row);
  });

  it('updates status, trims notes, and marks the reviewer', async () => {
    const response = await PATCH(request({ status: 'IN_REVIEW', reviewNotes: '  Reviewed with product.  ' }), {
      params: Promise.resolve({ id: 'feedback_1' }),
    });

    expect(response.status).toBe(200);
    expect(prismaMock.feedbackSubmissions.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'feedback_1' },
      data: expect.objectContaining({
        status: 'IN_REVIEW',
        reviewNotes: 'Reviewed with product.',
        reviewedByUserId: 'admin_1',
        reviewedAt: expect.any(Date),
      }),
    }));
  });

  it('stores an empty note as null', async () => {
    await PATCH(request({ status: 'NEW', reviewNotes: '   ' }), {
      params: Promise.resolve({ id: 'feedback_1' }),
    });

    expect(prismaMock.feedbackSubmissions.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'NEW', reviewNotes: null }),
    }));
  });

  it('rejects invalid statuses and missing rows', async () => {
    const invalid = await PATCH(request({ status: 'UNKNOWN' }), {
      params: Promise.resolve({ id: 'feedback_1' }),
    });
    expect(invalid.status).toBe(400);

    prismaMock.feedbackSubmissions.findUnique.mockResolvedValue(null);
    const missing = await PATCH(request({ status: 'CLOSED' }), {
      params: Promise.resolve({ id: 'feedback_1' }),
    });
    expect(missing.status).toBe(404);
  });
});
