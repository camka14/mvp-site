'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Avatar,
  Button,
  Divider,
  Group,
  Loader,
  Modal,
  Paper,
  Progress,
  Rating,
  Stack,
  Text,
  Textarea,
  Title,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { Flag, Pencil, Trash2 } from 'lucide-react';
import {
  organizationReviewService,
  type OrganizationReview,
  type OrganizationReviewsPayload,
} from '@/lib/organizationReviewService';

type OrganizationReviewsPanelProps = {
  organizationId: string;
  mode?: 'summary' | 'full';
  onViewAll?: () => void;
};

const formatReviewDate = (value: string): string => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
};

function ReviewRow({ review, canEdit, onEdit, onReport }: {
  review: OrganizationReview;
  canEdit: boolean;
  onEdit: () => void;
  onReport?: () => void;
}) {
  return (
    <Stack gap="xs">
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Group gap="sm" wrap="nowrap">
          <Avatar src={review.reviewer.profileImageUrl} name={review.reviewer.displayName} radius="xl" />
          <div>
            <Text fw={700} size="sm">{review.reviewer.displayName}</Text>
            <Group gap="xs">
              <Rating value={review.rating} readOnly size="xs" />
              <Text size="xs" c="dimmed">{formatReviewDate(review.updatedAt)}</Text>
            </Group>
          </div>
        </Group>
        {canEdit ? (
          <Button
            variant="subtle"
            size="compact-sm"
            leftSection={<Pencil size={15} />}
            onClick={onEdit}
          >
            Edit
          </Button>
        ) : onReport ? (
          <Button
            variant="subtle"
            color="gray"
            size="compact-sm"
            leftSection={<Flag size={15} />}
            onClick={onReport}
          >
            Report
          </Button>
        ) : null}
      </Group>
      {review.body ? <Text size="sm" style={{ whiteSpace: 'pre-line' }}>{review.body}</Text> : null}
    </Stack>
  );
}

export default function OrganizationReviewsPanel({
  organizationId,
  mode = 'full',
  onViewAll,
}: OrganizationReviewsPanelProps) {
  const [payload, setPayload] = useState<OrganizationReviewsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadReviews = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPayload(await organizationReviewService.getReviews(organizationId));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load reviews.');
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    void loadReviews();
  }, [loadReviews]);

  const openEditor = () => {
    setRating(payload?.viewerReview?.rating ?? 0);
    setBody(payload?.viewerReview?.body ?? '');
    setEditorOpen(true);
  };

  const saveReview = async () => {
    if (rating < 1 || rating > 5) return;
    setSaving(true);
    try {
      setPayload(await organizationReviewService.saveReview(organizationId, { rating, body }));
      setEditorOpen(false);
      notifications.show({ color: 'green', message: 'Your review has been published.' });
    } catch (saveError) {
      notifications.show({
        color: 'red',
        message: saveError instanceof Error ? saveError.message : 'Unable to save your review.',
      });
    } finally {
      setSaving(false);
    }
  };

  const deleteReview = async () => {
    const reviewId = payload?.viewerReview?.id;
    if (!reviewId) return;
    setDeleting(true);
    try {
      setPayload(await organizationReviewService.deleteReview(organizationId, reviewId));
      setEditorOpen(false);
      notifications.show({ color: 'green', message: 'Your review has been deleted.' });
    } catch (deleteError) {
      notifications.show({
        color: 'red',
        message: deleteError instanceof Error ? deleteError.message : 'Unable to delete your review.',
      });
    } finally {
      setDeleting(false);
    }
  };

  const confirmDelete = () => {
    modals.openConfirmModal({
      title: 'Delete review?',
      children: <Text size="sm">This removes your rating and written review from the organization.</Text>,
      labels: { confirm: 'Delete review', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: () => void deleteReview(),
    });
  };

  const reportReview = (reviewId: string) => {
    modals.openConfirmModal({
      title: 'Report this review?',
      children: <Text size="sm">BracketIQ moderators will review it for inappropriate or misleading content.</Text>,
      labels: { confirm: 'Report review', cancel: 'Cancel' },
      onConfirm: async () => {
        try {
          await organizationReviewService.reportReview(reviewId);
          notifications.show({ color: 'green', message: 'Review reported to moderators.' });
        } catch (reportError) {
          notifications.show({
            color: 'red',
            message: reportError instanceof Error ? reportError.message : 'Unable to report this review.',
          });
        }
      },
    });
  };

  if (loading) {
    return <Paper withBorder p="md" radius="md"><Group><Loader size="sm" /><Text size="sm">Loading reviews...</Text></Group></Paper>;
  }
  if (error || !payload) {
    return (
      <Paper withBorder p="md" radius="md">
        <Alert color="red" title="Reviews unavailable">
          <Stack gap="sm"><Text size="sm">{error ?? 'Unable to load reviews.'}</Text><Button variant="light" size="xs" onClick={() => void loadReviews()}>Try again</Button></Stack>
        </Alert>
      </Paper>
    );
  }

  const { summary } = payload;
  const average = summary.averageRating ?? 0;

  if (mode === 'summary') {
    return (
      <Paper withBorder p="md" radius="md" className="org-tab-surface">
        <Group justify="space-between" align="center">
          <div>
            <Title order={5}>Reviews</Title>
            {summary.reviewCount > 0 ? (
              <Group gap="xs" mt={6}>
                <Text fw={800}>{average.toFixed(1)}</Text>
                <Rating value={average} fractions={2} readOnly size="sm" />
                <Text size="sm" c="dimmed">({summary.reviewCount})</Text>
              </Group>
            ) : <Text size="sm" c="dimmed" mt={6}>No reviews yet.</Text>}
          </div>
          <Button variant="light" size="xs" onClick={onViewAll}>View reviews</Button>
        </Group>
      </Paper>
    );
  }

  return (
    <Paper withBorder p="lg" radius="md" className="org-tab-surface">
      <Stack gap="lg">
        <Group justify="space-between" align="flex-start">
          <div>
            <Title order={4}>Reviews</Title>
            <Text size="sm" c="dimmed">Ratings and feedback from the BracketIQ community.</Text>
          </div>
          {payload.canReview ? (
            <Button onClick={openEditor}>{payload.viewerReview ? 'Edit review' : 'Write a review'}</Button>
          ) : !payload.viewerIsAuthenticated ? (
            <Button component="a" href={`/login?redirect=${encodeURIComponent(`/organizations/${organizationId}/reviews`)}`}>
              Sign in to review
            </Button>
          ) : null}
        </Group>

        <Group align="flex-start" gap="xl">
          <Stack gap={2} align="center" style={{ minWidth: 120 }}>
            <Text fz={36} fw={800} lh={1}>{summary.reviewCount > 0 ? average.toFixed(1) : '-'}</Text>
            <Rating value={average} fractions={2} readOnly />
            <Text size="sm" c="dimmed">{summary.reviewCount} {summary.reviewCount === 1 ? 'review' : 'reviews'}</Text>
          </Stack>
          <Stack gap={6} style={{ flex: 1, maxWidth: 420 }}>
            {[5, 4, 3, 2, 1].map((star) => (
              <Group key={star} gap="xs" wrap="nowrap">
                <Text size="xs" w={18}>{star}</Text>
                <Progress
                  value={summary.reviewCount > 0 ? (summary.ratingCounts[star - 1] / summary.reviewCount) * 100 : 0}
                  style={{ flex: 1 }}
                  aria-label={`${star} star reviews`}
                />
                <Text size="xs" c="dimmed" w={24} ta="right">{summary.ratingCounts[star - 1]}</Text>
              </Group>
            ))}
          </Stack>
        </Group>

        {!payload.canReview && payload.viewerIsAuthenticated && payload.cannotReviewReason ? (
          <Text size="sm" c="dimmed">{payload.cannotReviewReason}</Text>
        ) : null}
        {payload.viewerReview?.status === 'HIDDEN' ? (
          <Alert color="yellow" title="Your review is hidden">
            A moderator removed this review from the public list. Editing it will not republish it.
          </Alert>
        ) : null}

        <Divider />
        {payload.reviews.length > 0 ? (
          <Stack gap="lg">
            {payload.reviews.map((review, index) => (
              <div key={review.id}>
                <ReviewRow
                  review={review}
                  canEdit={payload.viewerReview?.id === review.id}
                  onEdit={openEditor}
                  onReport={payload.viewerIsAuthenticated && payload.viewerReview?.id !== review.id
                    ? () => reportReview(review.id)
                    : undefined}
                />
                {index < payload.reviews.length - 1 ? <Divider mt="lg" /> : null}
              </div>
            ))}
          </Stack>
        ) : (
          <Text size="sm" c="dimmed">No reviews yet. Be the first to share your experience.</Text>
        )}
      </Stack>

      <Modal opened={editorOpen} onClose={() => setEditorOpen(false)} title={payload.viewerReview ? 'Edit your review' : 'Write a review'} centered>
        <Stack>
          <div>
            <Text fw={700} size="sm" mb={6}>Your rating</Text>
            <Rating value={rating} onChange={setRating} size="xl" />
            {rating === 0 ? <Text size="xs" c="dimmed" mt={4}>Choose 1 to 5 stars.</Text> : null}
          </div>
          <Textarea
            label="Review"
            description="Optional"
            placeholder="Share what stood out about this organization."
            value={body}
            onChange={(event) => setBody(event.currentTarget.value)}
            minRows={5}
            maxLength={2000}
          />
          <Group justify="space-between">
            {payload.viewerReview ? (
              <Button color="red" variant="subtle" leftSection={<Trash2 size={16} />} loading={deleting} onClick={confirmDelete}>
                Delete
              </Button>
            ) : <span />}
            <Group>
              <Button variant="default" onClick={() => setEditorOpen(false)}>Cancel</Button>
              <Button loading={saving} disabled={rating === 0 || deleting} onClick={() => void saveReview()}>Publish</Button>
            </Group>
          </Group>
        </Stack>
      </Modal>
    </Paper>
  );
}
