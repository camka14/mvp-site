import { capture } from '@/lib/analytics/posthogClient';
import {
  normalizeFeedbackPathCategory,
  trackFeedbackOpened,
  trackFeedbackSubmitted,
} from '@/lib/analytics/feedbackAnalytics';

jest.mock('@/lib/analytics/posthogClient', () => ({
  capture: jest.fn(),
}));

describe('feedback analytics', () => {
  it('normalizes only the safe path category', () => {
    expect(normalizeFeedbackPathCategory('/organizations/org_1?secret=value')).toBe('organization');
    expect(normalizeFeedbackPathCategory('/unknown/private')).toBe('other');
  });

  it('captures only the permitted opened properties', () => {
    trackFeedbackOpened({ entrySource: 'desktop_header', pathCategory: 'discover' });

    expect(capture).toHaveBeenCalledWith('feedback opened', {
      entry_source: 'desktop_header',
      path_category: 'discover',
    });
  });

  it('captures only the permitted submitted properties', () => {
    trackFeedbackSubmitted({ type: 'BUG', allowContact: true, pathCategory: 'profile' });

    expect(capture).toHaveBeenCalledWith('feedback submitted', {
      feedback_type: 'BUG',
      allow_contact: true,
      path_category: 'profile',
    });
    expect(JSON.stringify((capture as jest.Mock).mock.calls)).not.toContain('secret');
  });
});
