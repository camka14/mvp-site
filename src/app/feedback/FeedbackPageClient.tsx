'use client';

import { useEffect, useState } from 'react';
import { Paper } from '@mantine/core';
import { useApp } from '@/app/providers';
import FeedbackForm from '@/components/feedback/FeedbackForm';
import { normalizeFeedbackPathCategory, trackFeedbackOpened } from '@/lib/analytics/feedbackAnalytics';

export default function FeedbackPageClient() {
  const { authUser } = useApp();
  const [formVersion, setFormVersion] = useState(0);

  useEffect(() => {
    trackFeedbackOpened({
      entrySource: 'standalone_page',
      pathCategory: normalizeFeedbackPathCategory('/feedback'),
    });
  }, []);

  return (
    <Paper withBorder radius="lg" shadow="sm" p="lg" bg="white">
      <FeedbackForm
        key={formVersion}
        authenticatedEmail={authUser?.email}
        entrySource="standalone_page"
        onDone={() => setFormVersion((value) => value + 1)}
      />
    </Paper>
  );
}
