/** @jest-environment node */

import { NextRequest } from 'next/server';

const requireAdminMock = jest.fn();
const prismaMock = {
  feedbackSubmissions: {
    count: jest.fn(),
    findMany: jest.fn(),
  },
};

jest.mock('@/server/razumlyAdmin', () => ({
  requireRazumlyAdmin: (...args: any[]) => requireAdminMock(...args),
}));
jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

import { GET } from '@/app/api/admin/feedback/route';

const makeRow = (id: string, createdAt: Date) => ({
  id,
  createdAt,
  updatedAt: createdAt,
  type: 'BUG',
  status: 'NEW',
  message: 'The field selector does not save.',
  additionalContext: null,
  submitterUserId: 'user_1',
  allowContact: false,
  contactEmail: 'hidden@example.com',
  sourcePath: '/discover',
  userAgent: 'browser',
  clientContext: { surface: 'WEB' },
  reviewedAt: null,
  reviewedByUserId: null,
  reviewNotes: null,
});

describe('GET /api/admin/feedback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireAdminMock.mockResolvedValue({ userId: 'admin_1', adminEmail: 'admin@bracket-iq.com' });
    prismaMock.feedbackSubmissions.count.mockResolvedValue(1);
    prismaMock.feedbackSubmissions.findMany.mockResolvedValue([
      makeRow('feedback_1', new Date('2026-08-06T20:00:00.000Z')),
    ]);
  });

  it('rejects non-administrators', async () => {
    requireAdminMock.mockRejectedValue(new Response('Forbidden', { status: 403 }));

    const response = await GET(new NextRequest('http://localhost/api/admin/feedback'));

    expect(response.status).toBe(403);
    expect(prismaMock.feedbackSubmissions.findMany).not.toHaveBeenCalled();
  });

  it('returns filtered, ordered, paginated rows', async () => {
    const response = await GET(new NextRequest(
      'http://localhost/api/admin/feedback?page=2&pageSize=10&type=BUG&status=NEW&query=field',
    ));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({ page: 2, pageSize: 10, total: 1, totalPages: 1 });
    expect(prismaMock.feedbackSubmissions.count).toHaveBeenCalledWith({
      where: {
        AND: [
          { type: 'BUG' },
          { status: 'NEW' },
          { OR: expect.arrayContaining([
            { message: { contains: 'field', mode: 'insensitive' } },
            { additionalContext: { contains: 'field', mode: 'insensitive' } },
          ]) },
        ],
      },
    });
    expect(prismaMock.feedbackSubmissions.findMany).toHaveBeenCalledWith(expect.objectContaining({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: 10,
      take: 10,
    }));
    expect(json.items[0].createdAt).toBe('2026-08-06T20:00:00.000Z');
  });
});
