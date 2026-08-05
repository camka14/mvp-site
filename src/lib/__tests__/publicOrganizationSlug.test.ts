import {
  buildPublicEventPath,
  buildPublicOrganizationPath,
  normalizePublicOrganizationSlug,
  slugifyPublicOrganizationName,
} from '@/lib/publicOrganizationSlug';

describe('publicOrganizationSlug', () => {
  it('normalizes legacy underscores to hyphens', () => {
    expect(normalizePublicOrganizationSlug(' River_City__Sports ')).toBe('river-city-sports');
    expect(buildPublicOrganizationPath('River_City Sports')).toBe('/o/river-city-sports');
    expect(buildPublicEventPath('River_City', 'event_1')).toBe('/o/river-city/events/event_1');
  });

  it('slugifies organization names with hyphen-separated words', () => {
    expect(slugifyPublicOrganizationName("River City Sports Club!")).toBe('river-city-sports-club');
  });
});
