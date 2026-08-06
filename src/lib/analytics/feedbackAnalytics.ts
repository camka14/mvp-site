import { capture } from './posthogClient';
import type { FeedbackEntrySource, FeedbackSubmissionType } from '@/lib/feedbackService';

export type FeedbackPathCategory =
  | 'profile'
  | 'discover'
  | 'admin'
  | 'event'
  | 'organization'
  | 'other';

const pathCategoryPrefixes: Array<[string, FeedbackPathCategory]> = [
  ['/profile', 'profile'],
  ['/discover', 'discover'],
  ['/admin', 'admin'],
  ['/event', 'event'],
  ['/events', 'event'],
  ['/organization', 'organization'],
  ['/organizations', 'organization'],
];

export const normalizeFeedbackPathCategory = (path: string | null | undefined): FeedbackPathCategory => {
  const normalized = path?.trim() ?? '';
  const match = pathCategoryPrefixes.find(([prefix]) => (
    normalized === prefix || normalized.startsWith(`${prefix}/`)
  ));
  return match?.[1] ?? 'other';
};

export const trackFeedbackOpened = ({
  entrySource,
  pathCategory,
}: {
  entrySource: FeedbackEntrySource;
  pathCategory: FeedbackPathCategory;
}): void => {
  capture('feedback opened', {
    entry_source: entrySource,
    path_category: pathCategory,
  });
};

export const trackFeedbackSubmitted = ({
  type,
  allowContact,
  pathCategory,
}: {
  type: FeedbackSubmissionType;
  allowContact: boolean;
  pathCategory: FeedbackPathCategory;
}): void => {
  capture('feedback submitted', {
    feedback_type: type,
    allow_contact: allowContact,
    path_category: pathCategory,
  });
};
