import { getHomePathForUser } from '@/lib/homePage';

describe('getHomePathForUser', () => {
  it('asks signed-in users for onboarding before resolving an app home path', () => {
    expect(getHomePathForUser({ homePageOrganizationId: null, onboardingIntent: null })).toBe('/onboarding');
  });

  it('falls back to discover once onboarding is complete and no org home exists', () => {
    expect(getHomePathForUser({ homePageOrganizationId: null, onboardingIntent: 'DISCOVER_EVENTS' })).toBe('/discover');
  });

  it('preserves configured organization home pages after onboarding is complete', () => {
    expect(getHomePathForUser({ homePageOrganizationId: 'org_42', onboardingIntent: 'ORGANIZATION' })).toBe('/organizations/org_42');
  });
});
