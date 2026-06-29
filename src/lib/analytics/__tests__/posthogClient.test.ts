import posthog from 'posthog-js';
import {
  capture,
  identifyUser,
  isPostHogEnabled,
  resetAnalytics,
} from '@/lib/analytics/posthogClient';

jest.mock('posthog-js', () => ({
  __esModule: true,
  default: {
    capture: jest.fn(),
    identify: jest.fn(),
    reset: jest.fn(),
  },
}));

const posthogMock = posthog as jest.Mocked<typeof posthog>;

describe('posthogClient', () => {
  const originalToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;

  afterAll(() => {
    process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN = originalToken;
  });

  it('does not call PostHog when no project token is configured', () => {
    process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN = '';

    expect(isPostHogEnabled()).toBe(false);

    capture('event created', { event_type: 'LEAGUE' });
    identifyUser('user_1', { platform: 'web' });
    resetAnalytics();

    expect(posthogMock.capture).not.toHaveBeenCalled();
    expect(posthogMock.identify).not.toHaveBeenCalled();
    expect(posthogMock.reset).not.toHaveBeenCalled();
  });

  it('captures, identifies, and resets when configured', () => {
    process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN = 'phc_test';

    expect(isPostHogEnabled()).toBe(true);

    capture('event created', { event_type: 'LEAGUE', omitted: undefined });
    identifyUser(' user_1 ', { platform: 'web', is_admin: false });
    resetAnalytics();

    expect(posthogMock.capture).toHaveBeenCalledWith('event created', { event_type: 'LEAGUE' });
    expect(posthogMock.identify).toHaveBeenCalledWith('user_1', { platform: 'web', is_admin: false });
    expect(posthogMock.reset).toHaveBeenCalledTimes(1);
  });

  it('ignores blank user ids', () => {
    process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN = 'phc_test';

    identifyUser('   ', { platform: 'web' });

    expect(posthogMock.identify).not.toHaveBeenCalled();
  });
});
