import { apiRequest } from '@/lib/apiClient';

export type OrganizationReviewStatus = 'PUBLISHED' | 'HIDDEN';

export type OrganizationReview = {
  id: string;
  organizationId: string;
  reviewerUserId: string;
  rating: number;
  body: string | null;
  status: OrganizationReviewStatus;
  createdAt: string;
  updatedAt: string;
  reviewer: {
    id: string;
    displayName: string;
    profileImageUrl: string | null;
  };
};

export type OrganizationReviewsPayload = {
  summary: {
    averageRating: number | null;
    reviewCount: number;
    ratingCounts: [number, number, number, number, number];
  };
  reviews: OrganizationReview[];
  nextCursor: string | null;
  viewerReview: OrganizationReview | null;
  viewerIsAuthenticated: boolean;
  canReview: boolean;
  cannotReviewReason: string | null;
};

const reviewsPath = (
  organizationId: string,
  page?: { limit?: number; cursor?: string },
): string => {
  const path = `/api/organizations/${encodeURIComponent(organizationId)}/reviews`;
  const query = new URLSearchParams();
  if (page?.limit != null) query.set('limit', String(page.limit));
  if (page?.cursor) query.set('cursor', page.cursor);
  const suffix = query.toString();
  return suffix ? `${path}?${suffix}` : path;
};

export const organizationReviewService = {
  getReviews: (
    organizationId: string,
    page?: { limit?: number; cursor?: string },
  ): Promise<OrganizationReviewsPayload> => (
    apiRequest<OrganizationReviewsPayload>(reviewsPath(organizationId, page))
  ),

  saveReview: (
    organizationId: string,
    input: { rating: number; body?: string | null },
  ): Promise<OrganizationReviewsPayload> => (
    apiRequest<OrganizationReviewsPayload>(reviewsPath(organizationId), {
      method: 'POST',
      body: input,
    })
  ),

  deleteReview: (organizationId: string, reviewId: string): Promise<OrganizationReviewsPayload> => (
    apiRequest<OrganizationReviewsPayload>(
      `${reviewsPath(organizationId)}/${encodeURIComponent(reviewId)}`,
      { method: 'DELETE' },
    )
  ),

  reportReview: (reviewId: string): Promise<unknown> => (
    apiRequest('/api/moderation/reports', {
      method: 'POST',
      body: {
        targetType: 'ORGANIZATION_REVIEW',
        targetId: reviewId,
        category: 'report_organization_review',
      },
    })
  ),
};
