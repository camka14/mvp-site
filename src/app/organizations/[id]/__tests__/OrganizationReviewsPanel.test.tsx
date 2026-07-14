import { MantineProvider } from '@mantine/core';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

const getReviewsMock = jest.fn();
const saveReviewMock = jest.fn();
const deleteReviewMock = jest.fn();
const notificationShowMock = jest.fn();
const openConfirmModalMock = jest.fn();

jest.mock('@/lib/organizationReviewService', () => ({
  organizationReviewService: {
    getReviews: (...args: unknown[]) => getReviewsMock(...args),
    saveReview: (...args: unknown[]) => saveReviewMock(...args),
    deleteReview: (...args: unknown[]) => deleteReviewMock(...args),
    reportReview: jest.fn(),
  },
}));

jest.mock('@mantine/notifications', () => ({
  notifications: { show: (...args: unknown[]) => notificationShowMock(...args) },
}));

jest.mock('@mantine/modals', () => ({
  modals: { openConfirmModal: (...args: unknown[]) => openConfirmModalMock(...args) },
}));

import OrganizationReviewsPanel from '@/app/organizations/[id]/OrganizationReviewsPanel';

const review = (id: string, displayName: string) => ({
  id,
  organizationId: 'org_1',
  reviewerUserId: `user_${id}`,
  rating: 5,
  body: `${displayName} review`,
  status: 'PUBLISHED' as const,
  createdAt: '2026-07-13T00:00:00.000Z',
  updatedAt: '2026-07-13T00:00:00.000Z',
  reviewer: { id: `user_${id}`, displayName, profileImageUrl: null },
});

const payload = (
  reviews: ReturnType<typeof review>[],
  nextCursor: string | null,
  overrides: Partial<{
    viewerReview: ReturnType<typeof review> | null;
    viewerIsAuthenticated: boolean;
    canReview: boolean;
    cannotReviewReason: string | null;
  }> = {},
) => ({
  summary: { averageRating: 5, reviewCount: 3, ratingCounts: [0, 0, 0, 0, 3] as [number, number, number, number, number] },
  reviews,
  nextCursor,
  viewerReview: null,
  viewerIsAuthenticated: false,
  canReview: false,
  cannotReviewReason: 'Sign in to write a review.',
  ...overrides,
});

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

describe('OrganizationReviewsPanel pagination', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    openConfirmModalMock.mockImplementation((options: { onConfirm: () => void }) => options.onConfirm());
  });

  it('appends the next page, deduplicates boundary rows, and stops at the terminal cursor', async () => {
    const first = review('review_3', 'Jordan Rivers');
    const second = review('review_2', 'Casey Morgan');
    getReviewsMock
      .mockResolvedValueOnce(payload([first], 'cursor_1'))
      .mockResolvedValueOnce(payload([first, second], null));

    render(
      <MantineProvider>
        <OrganizationReviewsPanel organizationId="org_1" />
      </MantineProvider>,
    );

    expect(await screen.findByText('Jordan Rivers')).toBeInTheDocument();
    expect(getReviewsMock).toHaveBeenNthCalledWith(1, 'org_1', { limit: 20 });

    fireEvent.click(screen.getByRole('button', { name: 'Load more reviews' }));

    expect(await screen.findByText('Casey Morgan')).toBeInTheDocument();
    expect(getReviewsMock).toHaveBeenNthCalledWith(2, 'org_1', { limit: 20, cursor: 'cursor_1' });
    expect(screen.getAllByText('Jordan Rivers')).toHaveLength(1);
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Load more reviews' })).not.toBeInTheDocument();
    });
  });

  it('ignores a late load-more response after a save replaces the authoritative first page', async () => {
    const original = review('review_3', 'Jordan Rivers');
    const updated = { ...original, body: 'Updated after save' };
    const lateReview = review('review_2', 'Late Review');
    const latePage = deferred<ReturnType<typeof payload>>();
    getReviewsMock
      .mockResolvedValueOnce(payload([original], 'cursor_1', {
        viewerReview: original,
        viewerIsAuthenticated: true,
        canReview: true,
        cannotReviewReason: null,
      }))
      .mockReturnValueOnce(latePage.promise);
    saveReviewMock.mockResolvedValue(payload([updated], null, {
      viewerReview: updated,
      viewerIsAuthenticated: true,
      canReview: true,
      cannotReviewReason: null,
    }));

    render(
      <MantineProvider>
        <OrganizationReviewsPanel organizationId="org_1" />
      </MantineProvider>,
    );

    expect(await screen.findByText('Jordan Rivers')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Load more reviews' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit review' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Publish' }));

    expect(await screen.findByText('Updated after save')).toBeInTheDocument();
    expect(saveReviewMock).toHaveBeenCalledWith('org_1', { rating: 5, body: 'Jordan Rivers review' });

    await act(async () => {
      latePage.resolve(payload([lateReview], null));
      await latePage.promise;
    });

    expect(screen.queryByText('Late Review')).not.toBeInTheDocument();
    expect(screen.getByText('Updated after save')).toBeInTheDocument();
  });

  it('ignores a late load-more response after a delete replaces the authoritative first page', async () => {
    const original = review('review_3', 'Jordan Rivers');
    const lateReview = review('review_2', 'Late Review');
    const latePage = deferred<ReturnType<typeof payload>>();
    getReviewsMock
      .mockResolvedValueOnce(payload([original], 'cursor_1', {
        viewerReview: original,
        viewerIsAuthenticated: true,
        canReview: true,
        cannotReviewReason: null,
      }))
      .mockReturnValueOnce(latePage.promise);
    deleteReviewMock.mockResolvedValue(payload([], null, {
      viewerReview: null,
      viewerIsAuthenticated: true,
      canReview: true,
      cannotReviewReason: null,
    }));

    render(
      <MantineProvider>
        <OrganizationReviewsPanel organizationId="org_1" />
      </MantineProvider>,
    );

    expect(await screen.findByText('Jordan Rivers')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Load more reviews' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit review' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));

    expect(await screen.findByText('No reviews yet. Be the first to share your experience.')).toBeInTheDocument();
    expect(deleteReviewMock).toHaveBeenCalledWith('org_1', original.id);

    await act(async () => {
      latePage.resolve(payload([lateReview], null));
      await latePage.promise;
    });

    expect(screen.queryByText('Late Review')).not.toBeInTheDocument();
    expect(screen.getByText('No reviews yet. Be the first to share your experience.')).toBeInTheDocument();
  });

  it('keeps the newest first-page response when organization requests resolve out of order', async () => {
    const firstRequest = deferred<ReturnType<typeof payload>>();
    const secondRequest = deferred<ReturnType<typeof payload>>();
    getReviewsMock
      .mockReturnValueOnce(firstRequest.promise)
      .mockReturnValueOnce(secondRequest.promise);

    const { rerender } = render(
      <MantineProvider>
        <OrganizationReviewsPanel organizationId="org_1" />
      </MantineProvider>,
    );
    await waitFor(() => expect(getReviewsMock).toHaveBeenCalledTimes(1));

    rerender(
      <MantineProvider>
        <OrganizationReviewsPanel organizationId="org_2" />
      </MantineProvider>,
    );
    await waitFor(() => expect(getReviewsMock).toHaveBeenCalledTimes(2));

    await act(async () => {
      secondRequest.resolve(payload([review('review_org_2', 'Second Organization')], null));
      await secondRequest.promise;
    });
    expect(screen.getByText('Second Organization')).toBeInTheDocument();

    await act(async () => {
      firstRequest.resolve(payload([review('review_org_1', 'First Organization')], null));
      await firstRequest.promise;
    });

    expect(screen.getByText('Second Organization')).toBeInTheDocument();
    expect(screen.queryByText('First Organization')).not.toBeInTheDocument();
    expect(getReviewsMock).toHaveBeenNthCalledWith(2, 'org_2', { limit: 20 });
  });
});
