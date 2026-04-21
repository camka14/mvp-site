import {
  normalizePublicRentalOrderSports,
  resolvePublicRentalOrderSportId,
} from '@/server/publicRentalOrders';

describe('resolvePublicRentalOrderSportId', () => {
  it('normalizes the configured organization sports list', () => {
    expect(normalizePublicRentalOrderSports([' Indoor Soccer ', 'Indoor Soccer', '', 'Indoor Volleyball'])).toEqual([
      'Indoor Soccer',
      'Indoor Volleyball',
    ]);
  });

  it('returns the only configured organization sport', () => {
    expect(resolvePublicRentalOrderSportId({
      organizationName: 'North Gym',
      organizationSports: ['Indoor Soccer'],
    })).toBe('Indoor Soccer');
  });

  it('matches a sport name embedded in the organization name', () => {
    expect(resolvePublicRentalOrderSportId({
      organizationName: 'Summit Indoor Volleyball Facility',
      organizationSports: ['Grass Soccer', 'Indoor Soccer', 'Indoor Volleyball'],
    })).toBe('Indoor Volleyball');
  });

  it('falls back to Other for ambiguous multi-sport organizations', () => {
    expect(resolvePublicRentalOrderSportId({
      organizationName: 'Community Sports Center',
      organizationSports: ['Indoor Soccer', 'Indoor Volleyball'],
    })).toBe('Other');
  });

  it('returns the requested sport when it is supported by the organization', () => {
    expect(resolvePublicRentalOrderSportId({
      organizationName: 'Community Sports Center',
      organizationSports: ['Indoor Soccer', 'Indoor Volleyball'],
      requestedSportId: 'Indoor Soccer',
    })).toBe('Indoor Soccer');
  });

  it('returns null for an unsupported requested sport', () => {
    expect(resolvePublicRentalOrderSportId({
      organizationName: 'Community Sports Center',
      organizationSports: ['Indoor Soccer', 'Indoor Volleyball'],
      requestedSportId: 'Basketball',
    })).toBeNull();
  });

  it('falls back to Other when the organization has no configured sports', () => {
    expect(resolvePublicRentalOrderSportId({
      organizationName: 'Community Sports Center',
      organizationSports: [],
    })).toBe('Other');
  });
});
