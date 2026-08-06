'use client';

import { useEffect, useState } from 'react';
import { Drawer, Text } from '@mantine/core';
import FeedbackForm from './FeedbackForm';
import type { FeedbackFormDraft } from './FeedbackForm';
import type { FeedbackEntrySource } from '@/lib/feedbackService';
import {
  normalizeFeedbackPathCategory,
  trackFeedbackOpened,
} from '@/lib/analytics/feedbackAnalytics';

export type FeedbackDrawerProps = {
  opened: boolean;
  onClose: () => void;
  authenticatedEmail?: string | null;
  entrySource: 'desktop_header' | 'mobile_menu';
};

export function FeedbackDrawer({
  opened,
  onClose,
  authenticatedEmail,
  entrySource,
}: FeedbackDrawerProps) {
  const [formVersion, setFormVersion] = useState(0);
  const [draft, setDraft] = useState<FeedbackFormDraft | null>(null);

  useEffect(() => {
    if (!opened) return;
    const path = typeof window !== 'undefined' ? window.location.pathname : '/';
    trackFeedbackOpened({
      entrySource: entrySource as FeedbackEntrySource,
      pathCategory: normalizeFeedbackPathCategory(path),
    });
  }, [entrySource, opened]);

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      size="min(100vw, 520px)"
      title="Send feedback"
      keepMounted
      overlayProps={{ backgroundOpacity: 0.35, blur: 2 }}
    >
      <Text size="sm" c="dimmed" mb="lg">
        Share a bug, suggest an idea, or send general feedback. We will save your submission so our team can review it.
      </Text>
      <FeedbackForm
        key={formVersion}
        authenticatedEmail={authenticatedEmail}
        entrySource={entrySource}
        draft={draft ?? undefined}
        onDraftChange={setDraft}
        onCancel={onClose}
        onDone={() => {
          setDraft(null);
          setFormVersion((value) => value + 1);
        }}
      />
    </Drawer>
  );
}

export default FeedbackDrawer;
