import { OrganizationReviewStatusEnum } from '@/generated/prisma/client';
import { createId } from '@/lib/id';
import { isPrivateToOrganizationsVisibility } from '@/lib/accountVisibility';
import { formatNameParts } from '@/lib/nameCase';
import { prisma } from '@/lib/prisma';
import { isMinorAtUtcDate } from '@/server/userPrivacy';

const DEFAULT_REVIEW_LIMIT = 50;
const MAX_REVIEW_LIMIT = 100;
const MAX_REVIEW_CURSOR_LENGTH = 1024;

export type OrganizationReviewPublicUser = {
  id: string;
  displayName: string;
  profileImageUrl: string | null;
};

export type OrganizationReviewView = {
  id: string;
  organizationId: string;
  reviewerUserId: string;
  rating: number;
  body: string | null;
  status: OrganizationReviewStatusEnum;
  createdAt: string;
  updatedAt: string;
  reviewer: OrganizationReviewPublicUser;
};

export type OrganizationReviewSummary = {
  averageRating: number | null;
  reviewCount: number;
  ratingCounts: [number, number, number, number, number];
};

export type OrganizationReviewsPayload = {
  summary: OrganizationReviewSummary;
  reviews: OrganizationReviewView[];
  nextCursor: string | null;
  viewerReview: OrganizationReviewView | null;
  viewerIsAuthenticated: boolean;
  canReview: boolean;
  cannotReviewReason: string | null;
};

type Viewer = { userId: string; isAdmin?: boolean } | null;

type OrganizationReviewCursor = {
  createdAt: string;
  id: string;
};

export class InvalidOrganizationReviewCursorError extends Error {
  constructor() {
    super('Invalid organization review cursor.');
    this.name = 'InvalidOrganizationReviewCursorError';
  }
}

const encodeOrganizationReviewCursor = (review: {
  createdAt: Date;
  id: string;
}): string => Buffer.from(JSON.stringify({
  createdAt: review.createdAt.toISOString(),
  id: review.id,
} satisfies OrganizationReviewCursor), 'utf8').toString('base64url');

const decodeOrganizationReviewCursor = (rawCursor: string): {
  createdAt: Date;
  id: string;
} => {
  if (!rawCursor || rawCursor.length > MAX_REVIEW_CURSOR_LENGTH || !/^[A-Za-z0-9_-]+$/.test(rawCursor)) {
    throw new InvalidOrganizationReviewCursorError();
  }
  try {
    const parsed = JSON.parse(Buffer.from(rawCursor, 'base64url').toString('utf8')) as Partial<OrganizationReviewCursor>;
    if (
      typeof parsed.createdAt !== 'string'
      || typeof parsed.id !== 'string'
      || !parsed.id.trim()
    ) {
      throw new InvalidOrganizationReviewCursorError();
    }
    const createdAt = new Date(parsed.createdAt);
    if (Number.isNaN(createdAt.getTime())) {
      throw new InvalidOrganizationReviewCursorError();
    }
    return { createdAt, id: parsed.id };
  } catch (error) {
    if (error instanceof InvalidOrganizationReviewCursorError) throw error;
    throw new InvalidOrganizationReviewCursorError();
  }
};

const profileImageUrl = (profileImageId: string | null): string | null => {
  const fileId = profileImageId?.trim();
  return fileId ? `/api/files/${encodeURIComponent(fileId)}/preview?w=96&h=96&fit=cover` : null;
};

type ReviewUserRow = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  userName: string;
  profileImageId: string | null;
  accountVisibility: string;
  dateOfBirth: Date;
};

export const toOrganizationReviewPublicUser = (
  reviewerUserId: string,
  user: ReviewUserRow | undefined,
  now: Date = new Date(),
): OrganizationReviewPublicUser => {
  if (!user || isMinorAtUtcDate(user.dateOfBirth, now)) {
    return { id: reviewerUserId, displayName: 'BracketIQ user', profileImageUrl: null };
  }
  if (isPrivateToOrganizationsVisibility(user.accountVisibility)) {
    return {
      id: reviewerUserId,
      displayName: user.userName.trim() || 'BracketIQ user',
      profileImageUrl: null,
    };
  }
  return {
    id: reviewerUserId,
    displayName: formatNameParts(user.firstName, user.lastName) || user.userName.trim() || 'BracketIQ user',
    profileImageUrl: profileImageUrl(user.profileImageId),
  };
};

export const getOrganizationReviewEligibility = async (
  organizationId: string,
  viewer: Viewer,
): Promise<{ canReview: boolean; cannotReviewReason: string | null; organizationExists: boolean }> => {
  const organization = await prisma.organizations.findUnique({
    where: { id: organizationId },
    select: { id: true, ownerId: true },
  });
  if (!organization) {
    return { canReview: false, cannotReviewReason: 'Organization not found.', organizationExists: false };
  }
  if (!viewer) {
    return { canReview: false, cannotReviewReason: 'Sign in to write a review.', organizationExists: true };
  }
  if (organization.ownerId === viewer.userId) {
    return { canReview: false, cannotReviewReason: 'Organization owners cannot review their own organization.', organizationExists: true };
  }
  const staffMembership = await prisma.staffMembers.findUnique({
    where: {
      organizationId_userId: {
        organizationId,
        userId: viewer.userId,
      },
    },
    select: { id: true },
  });
  if (staffMembership) {
    return { canReview: false, cannotReviewReason: 'Organization staff cannot review their own organization.', organizationExists: true };
  }
  return { canReview: true, cannotReviewReason: null, organizationExists: true };
};

const serializeReviews = async (rows: Array<{
  id: string;
  organizationId: string;
  reviewerUserId: string;
  rating: number;
  body: string | null;
  status: OrganizationReviewStatusEnum;
  createdAt: Date;
  updatedAt: Date;
}>): Promise<OrganizationReviewView[]> => {
  const reviewerIds = Array.from(new Set(rows.map((row) => row.reviewerUserId)));
  const users = reviewerIds.length > 0
    ? await prisma.userData.findMany({
        where: { id: { in: reviewerIds } },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          userName: true,
          profileImageId: true,
          accountVisibility: true,
          dateOfBirth: true,
        },
      })
    : [];
  const usersById = new Map(users.map((user) => [user.id, user]));

  return rows.map((row) => {
    const user = usersById.get(row.reviewerUserId);
    return {
      id: row.id,
      organizationId: row.organizationId,
      reviewerUserId: row.reviewerUserId,
      rating: row.rating,
      body: row.body,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      reviewer: toOrganizationReviewPublicUser(row.reviewerUserId, user),
    };
  });
};

export const getOrganizationReviewsPayload = async (
  organizationId: string,
  viewer: Viewer,
  options: { limit?: number; cursor?: string } = {},
): Promise<OrganizationReviewsPayload> => {
  const eligibility = await getOrganizationReviewEligibility(organizationId, viewer);
  if (!eligibility.organizationExists) {
    throw new Response('Not found', { status: 404 });
  }

  const limit = Math.min(Math.max(Math.trunc(options.limit ?? DEFAULT_REVIEW_LIMIT), 1), MAX_REVIEW_LIMIT);
  const publishedWhere = { organizationId, status: OrganizationReviewStatusEnum.PUBLISHED };
  const cursor = options.cursor ? decodeOrganizationReviewCursor(options.cursor) : null;
  const pageWhere = cursor
    ? {
        AND: [
          publishedWhere,
          {
            OR: [
              { createdAt: { lt: cursor.createdAt } },
              { createdAt: cursor.createdAt, id: { lt: cursor.id } },
            ],
          },
        ],
      }
    : publishedWhere;
  const [reviewPage, reviewCount, ratingAggregate, ratingGroups, viewerReview] = await Promise.all([
    prisma.organizationReviews.findMany({
      where: pageWhere,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    }),
    prisma.organizationReviews.count({ where: publishedWhere }),
    prisma.organizationReviews.aggregate({ where: publishedWhere, _avg: { rating: true } }),
    prisma.organizationReviews.groupBy({
      by: ['rating'],
      where: publishedWhere,
      _count: { _all: true },
    }),
    viewer
      ? prisma.organizationReviews.findUnique({
          where: {
            organizationId_reviewerUserId: {
              organizationId,
              reviewerUserId: viewer.userId,
            },
          },
        })
      : Promise.resolve(null),
  ]);
  const hasNextPage = reviewPage.length > limit;
  const reviews = hasNextPage ? reviewPage.slice(0, limit) : reviewPage;
  const nextCursor = hasNextPage && reviews.length > 0
    ? encodeOrganizationReviewCursor(reviews[reviews.length - 1])
    : null;

  const ratingCounts: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  ratingGroups.forEach((group) => {
    if (group.rating >= 1 && group.rating <= 5) {
      ratingCounts[group.rating - 1] = group._count._all;
    }
  });

  const rowsToSerialize = viewerReview && !reviews.some((review) => review.id === viewerReview.id)
    ? [...reviews, viewerReview]
    : reviews;
  const serialized = await serializeReviews(rowsToSerialize);
  const serializedById = new Map(serialized.map((review) => [review.id, review]));

  return {
    summary: {
      averageRating: ratingAggregate._avg.rating == null
        ? null
        : Math.round(ratingAggregate._avg.rating * 10) / 10,
      reviewCount,
      ratingCounts,
    },
    reviews: reviews.map((review) => serializedById.get(review.id)).filter((review): review is OrganizationReviewView => Boolean(review)),
    nextCursor,
    viewerReview: viewerReview ? serializedById.get(viewerReview.id) ?? null : null,
    viewerIsAuthenticated: Boolean(viewer),
    canReview: eligibility.canReview,
    cannotReviewReason: eligibility.cannotReviewReason,
  };
};

export const upsertOrganizationReview = async (
  organizationId: string,
  reviewerUserId: string,
  input: { rating: number; body?: string | null },
): Promise<void> => {
  const now = new Date();
  await prisma.organizationReviews.upsert({
    where: {
      organizationId_reviewerUserId: { organizationId, reviewerUserId },
    },
    create: {
      id: createId(),
      organizationId,
      reviewerUserId,
      rating: input.rating,
      body: input.body?.trim() || null,
      status: OrganizationReviewStatusEnum.PUBLISHED,
      createdAt: now,
      updatedAt: now,
    },
    update: {
      rating: input.rating,
      body: input.body?.trim() || null,
      updatedAt: now,
    },
  });
};
