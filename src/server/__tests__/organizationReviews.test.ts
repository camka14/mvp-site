/** @jest-environment node */

const prismaMock = {
  organizations: { findUnique: jest.fn() },
  staffMembers: { findUnique: jest.fn() },
  organizationReviews: { upsert: jest.fn() },
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
  toOrganizationReviewPublicUser,
  upsertOrganizationReview,
} from '@/server/organizationReviews';

describe('getOrganizationReviewEligibility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.organizations.findUnique.mockResolvedValue({ id: 'org_1', ownerId: 'owner_1' });
    prismaMock.staffMembers.findUnique.mockResolvedValue(null);
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
