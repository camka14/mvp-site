import {
  GUEST_ONBOARDING_COOKIE,
  GUEST_ONBOARDING_STORAGE_KEY,
  buildGuestCreateDestination,
  buildGuestDiscoverDestination,
  buildGuestSignupDestination,
  isGuestOnboardingCookieComplete,
  markGuestOnboardingComplete,
} from '@/lib/guestOnboarding';

describe('guestOnboarding', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.cookie = `${GUEST_ONBOARDING_COOKIE}=; Path=/; Max-Age=0`;
  });

  it('builds server-backed event and club Discover presets', () => {
    expect(buildGuestDiscoverDestination({
      target: 'events',
      sport: 'Indoor Soccer',
      skillDivisionTypeId: 'competitive',
      location: { lat: 45.52, lng: -122.68, label: 'Portland, OR' },
    })).toBe(
      '/discover?tab=events&sport=Indoor+Soccer&skillDivisionTypeIds=competitive&lat=45.52&lng=-122.68&location=Portland%2C+OR&distanceMiles=50',
    );

    expect(buildGuestDiscoverDestination({
      target: 'clubs',
      sport: 'Volleyball',
      skillDivisionTypeId: 'open',
      location: null,
    })).toBe('/discover?tab=organizations&sport=Volleyball&skillDivisionTypeIds=open&tags=club');
  });

  it('does not claim a division skill filter for rentals', () => {
    expect(buildGuestDiscoverDestination({
      target: 'rentals',
      sport: 'Basketball',
      skillDivisionTypeId: 'advanced',
      location: null,
    })).toBe('/discover?tab=rentals&sport=Basketball');
  });

  it('builds direct create and signup destinations', () => {
    expect(buildGuestCreateDestination('club', 'unused')).toBe('/organizations?create=1&preset=club');
    expect(buildGuestCreateDestination('event', 'event_1')).toBe(
      '/events/event_1/schedule?create=1&mode=edit&tab=details',
    );
    expect(buildGuestSignupDestination({ target: 'organization', next: '/organizations?create=1' }))
      .toBe('/login?mode=signup&onboardingIntent=ORGANIZATION&next=%2Forganizations%3Fcreate%3D1');
  });

  it('marks a completed target in storage and a server-readable cookie', () => {
    markGuestOnboardingComplete('events');

    expect(JSON.parse(window.localStorage.getItem(GUEST_ONBOARDING_STORAGE_KEY) ?? '{}'))
      .toEqual(expect.objectContaining({ version: 1, target: 'events' }));
    expect(document.cookie).toContain(`${GUEST_ONBOARDING_COOKIE}=1`);
    expect(isGuestOnboardingCookieComplete('1')).toBe(true);
    expect(isGuestOnboardingCookieComplete('0')).toBe(false);
  });
});
