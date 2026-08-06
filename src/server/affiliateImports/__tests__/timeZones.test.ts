import {
  tryResolveTimeZoneFromCoordinates,
} from '@/server/timeZones';

describe('affiliate coordinate timezone resolution', () => {
  it('resolves a valid coordinate pair without a host timezone fallback', () => {
    expect(tryResolveTimeZoneFromCoordinates([-122.6765, 45.5231])).toBe('America/Los_Angeles');
  });

  it('returns null when coordinates are not usable', () => {
    expect(tryResolveTimeZoneFromCoordinates(null)).toBeNull();
    expect(tryResolveTimeZoneFromCoordinates([0, 0])).toBeNull();
  });
});
