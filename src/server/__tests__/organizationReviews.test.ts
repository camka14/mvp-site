/** @jest-environment node */

const prismaMock = {
  organizations: { findUnique: jest.fn() },
  staffMembers: { findUnique: jest.fn() },
  organizationReviews: {
    upsert: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    aggregate: jest.fn(),
    groupBy: jest.fn(),
  },
  userData: { findMany: jest.fn() },
};

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/generated/prisma/client', () => ({
  OrganizationReviewStatusEnum: {
    PUBLISHED: 'PUBLISHED',
    HIDDEN: 'HIDDEN',
  },
}));

import {
  getOrganizationReviewEligibility,
  getOrganizationReviewsPayload,
  InvalidOrganizationReviewCursorError,
  toOrganizationReviewPublicUser,
  upsertOrganizationReview,
} from '@/server/organizationReviews';

describe('getOrganizationReviewEligibility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.organizations.findUnique.mockResolvedValue({ id: 'org_1', ownerId: 'owner_1' });
    prismaMock.staffMembers.findUnique.mockResolvedValue(null);
    prismaMock.organizationReviews.findMany.mockResolvedValue([]);
    prismaMock.organizationReviews.count.mockResolvedValue(0);
    prismaMock.organizationReviews.aggregate.mockResolvedValue({ _avg: { rating: null } });
    prismaMock.organizationReviews.groupBy.mockResolvedValue([]);
    prismaMock.userData.findMany.mockResolvedValue([]);
  });

  it('returns a deterministic next cursor without exposing the lookahead row', async () => {
    const rows = [
      reviewRow('review_3', '2026-07-13T03:00:00.000Z'),
      reviewRow('review_2', '2026-07-13T02:00:00.000Z'),
      reviewRow('review_1', '2026-07-13T01:00:00.000Z'),
    ];
    prismaMock.organizationReviews.findMany.mockResolvedValue(rows);
    prismaMock.organizationReviews.count.mockResolvedValue(3);

    const firstPage = await getOrganizationReviewsPayload('org_1', null, { limit: 2 });

    expect(firstPage.reviews.map((review) => review.id)).toEqual(['review_3', 'review_2']);
    expect(firstPage.nextCursor).toEqual(expect.any(String));
    expect(prismaMock.organizationReviews.findMany).toHaveBeenCalledWith(expect.objectContaining({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 3,
    }));

    prismaMock.organizationReviews.findMany.mockResolvedValue([rows[2]]);
    const secondPage = await getOrganizationReviewsPayload('org_1', null, {
      limit: 2,
      cursor: firstPage.nextCursor ?? undefined,
    });

    expect(secondPage.reviews.map((review) => review.id)).toEqual(['review_1']);
    expect(secondPage.nextCursor).toBeNull();
    expect(prismaMock.organizationReviews.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: {
        AND: [
          { organizationId: 'org_1', status: 'PUBLISHED' },
          {
            OR: [
              { createdAt: { lt: rows[1].createdAt } },
              { createdAt: rows[1].createdAt, id: { lt: rows[1].id } },
            ],
          },
        ],
      },
    }));
  });

  it('keeps an unseen review reachable when it is edited between pages', async () => {
    const first = reviewRow('review_3', '2026-07-13T03:00:00.000Z');
    const boundary = reviewRow('review_2', '2026-07-13T02:00:00.000Z');
    const unseen = reviewRow('review_1', '2026-07-13T01:00:00.000Z');
    prismaMock.organizationReviews.findMany.mockResolvedValueOnce([first, boundary, unseen]);

    const firstPage = await getOrganizationReviewsPayload('org_1', null, { limit: 2 });

    unseen.updatedAt = new Date('2026-07-13T04:00:00.000Z');
    prismaMock.organizationReviews.findMany.mockResolvedValueOnce([unseen]);
    const secondPage = await getOrganizationReviewsPayload('org_1', null, {
      limit: 2,
      cursor: firstPage.nextCursor ?? undefined,
    });

    expect(secondPage.reviews.map((review) => review.id)).toEqual(['review_1']);
    expect(prismaMock.organizationReviews.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: {
        AND: [
          { organizationId: 'org_1', status: 'PUBLISHED' },
          {
            OR: [
              { createdAt: { lt: boundary.createdAt } },
              { createdAt: boundary.createdAt, id: { lt: boundary.id } },
            ],
          },
        ],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    }));
  });

  it('preserves the legacy default of 50 reviews when no limit is provided', async () => {
    await getOrganizationReviewsPayload('org_1', null);

    expect(prismaMock.organizationReviews.findMany).toHaveBeenCalledWith(expect.objectContaining({
      take: 51,
    }));
  });

  it('rejects malformed pagination cursors instead of treating them as the first page', async () => {
    await expect(getOrganizationReviewsPayload('org_1', null, {
      cursor: 'not-a-valid-cursor',
    })).rejects.toBeInstanceOf(InvalidOrganizationReviewCursorError);

    expect(prismaMock.organizationReviews.findMany).not.toHaveBeenCalled();
  });

  it('allows a signed-in non-staff user to review', async () => {
    await expect(getOrganizationReviewEligibility('org_1', { userId: 'user_1' })).resolves.toEqual({
      organizationExists: true,
      canReview: true,
      cannotReviewReason: null,
    });
  });

  it('rejects the organization owner without querying staff membership', async () => {
    const result = await getOrganizationReviewEligibility('org_1', { userId: 'owner_1' });

    expect(result.canReview).toBe(false);
    expect(result.cannotReviewReason).toMatch(/owners cannot review/i);
    expect(prismaMock.staffMembers.findUnique).not.toHaveBeenCalled();
  });

  it('rejects organization staff', async () => {
    prismaMock.staffMembers.findUnique.mockResolvedValue({ id: 'staff_member_1' });

    const result = await getOrganizationReviewEligibility('org_1', { userId: 'staff_1' });

    expect(result.canReview).toBe(false);
    expect(result.cannotReviewReason).toMatch(/staff cannot review/i);
  });

  it('does not republish a hidden review when its author edits it', async () => {
    prismaMock.organizationReviews.upsert.mockResolvedValue({ id: 'review_1' });

    await upsertOrganizationReview('org_1', 'user_1', { rating: 3, body: 'Updated wording' });

    expect(prismaMock.organizationReviews.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.not.objectContaining({
        status: expect.anything(),
        hiddenAt: expect.anything(),
        hiddenByUserId: expect.anything(),
      }),
    }));
  });

  it('does not expose a minor or private profile name and image', () => {
    const now = new Date('2026-07-09T00:00:00.000Z');
    const baseUser = {
      id: 'user_1',
      firstName: 'Taylor',
      lastName: 'Reed',
      userName: 'taylor-r',
      profileImageId: 'file_1',
      accountVisibility: 'PUBLIC',
      dateOfBirth: new Date('2012-01-01T00:00:00.000Z'),
    };

    expect(toOrganizationReviewPublicUser('user_1', baseUser, now)).toEqual({
      id: 'user_1',
      displayName: 'BracketIQ user',
      profileImageUrl: null,
    });
    expect(toOrganizationReviewPublicUser('user_1', {
      ...baseUser,
      dateOfBirth: new Date('1990-01-01T00:00:00.000Z'),
      accountVisibility: 'PRIVATE_TO_ORGS',
    }, now)).toEqual({
      id: 'user_1',
      displayName: 'taylor-r',
      profileImageUrl: null,
    });
  });
});

const reviewRow = (id: string, updatedAt: string) => ({
  id,
  organizationId: 'org_1',
  reviewerUserId: `user_${id}`,
  rating: 5,
  body: `${id} body`,
  status: 'PUBLISHED',
  createdAt: new Date(updatedAt),
  updatedAt: new Date(updatedAt),
});
