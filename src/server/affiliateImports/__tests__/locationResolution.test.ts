/** @jest-environment node */

import {
  buildAffiliateEventLocationQueries,
  buildAffiliatePlaceLocationQueries,
  buildAffiliateSpecificEventLocationQueries,
  normalizeAffiliateCoordinates,
  normalizeAffiliateLocationSource,
} from '@/server/affiliateImports/locationResolution';

describe('affiliate location resolution inputs', () => {
  it('tries an evidenced event address before broader venue and city fallbacks', () => {
    expect(buildAffiliateEventLocationQueries({
      location: 'Major Owens Center',
      address: '1561 Bedford Ave',
      city: 'Brooklyn, NY',
    })).toEqual([
      '1561 Bedford Ave, Brooklyn, NY',
      'Major Owens Center, 1561 Bedford Ave, Brooklyn, NY',
      'Major Owens Center, Brooklyn, NY',
      'Brooklyn, NY',
      'Major Owens Center',
    ]);
  });

  it('uses a place name with city when the source has no street address', () => {
    expect(buildAffiliatePlaceLocationQueries({
      name: 'Eastern New York Youth Soccer Association ODP',
      location: 'Eastern New York',
      city: 'Eastern New York',
    })).toEqual([
      'Eastern New York Youth Soccer Association ODP, Eastern New York',
      'Eastern New York',
    ]);
  });

  it('tries an evidenced organization address before a fuzzy organization-name search', () => {
    expect(buildAffiliatePlaceLocationQueries({
      name: 'Chicago United Hockey League',
      address: '1321 N Dee Rd',
      city: 'Park Ridge, IL 60068',
    })).toEqual([
      '1321 N Dee Rd, Park Ridge, IL 60068',
      'Chicago United Hockey League, 1321 N Dee Rd, Park Ridge, IL 60068',
      'Chicago United Hockey League, Park Ridge, IL 60068',
      'Park Ridge, IL 60068',
    ]);
  });

  it('requires a venue or street address for a specific event location', () => {
    expect(buildAffiliateSpecificEventLocationQueries({ city: 'Houston, TX' })).toEqual([]);
    expect(buildAffiliateSpecificEventLocationQueries({
      venueName: 'Major Owens Center',
      city: 'Brooklyn, NY',
    })).toEqual([
      'Major Owens Center, Brooklyn, NY',
      'Major Owens Center',
    ]);
  });

  it('normalizes source-organization fallback as an explicit mode', () => {
    expect(normalizeAffiliateLocationSource('SOURCE_ORGANIZATION')).toBe('SOURCE_ORGANIZATION');
    expect(normalizeAffiliateLocationSource('candidate')).toBe('CANDIDATE');
    expect(normalizeAffiliateLocationSource(null)).toBe('CANDIDATE');
  });

  it('does not use a context-free organization name as a coordinate query', () => {
    expect(buildAffiliatePlaceLocationQueries({ name: 'United' })).toEqual([]);
  });

  it('normalizes only finite in-range non-zero coordinate pairs', () => {
    expect(normalizeAffiliateCoordinates([-74.006, 40.7128])).toEqual([-74.006, 40.7128]);
    expect(normalizeAffiliateCoordinates([0, 0])).toBeNull();
    expect(normalizeAffiliateCoordinates([181, 40])).toBeNull();
  });
});
