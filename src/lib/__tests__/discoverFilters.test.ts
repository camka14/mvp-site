import {
  buildDiscoverHref,
  buildDiscoverEventsHref,
  discoverDateParamToDate,
  discoverDateToParam,
  parseDiscoverPreset,
  parseDiscoverSportFilters,
  resolveDiscoverSportFilters,
  sportNameToSlug,
  sportSlugToLabel,
} from '@/lib/discoverFilters';

describe('discoverFilters', () => {
  it('parses repeated sport params and legacy comma-separated sports params', () => {
    const params = new URLSearchParams('sport=Soccer&sport=Basketball&sports=Soccer,Pickleball&sport=');

    expect(parseDiscoverSportFilters(params)).toEqual(['Soccer', 'Basketball', 'Pickleball']);
  });

  it('builds Discover event links with encoded sport filters', () => {
    expect(buildDiscoverEventsHref({ sports: ['Soccer', 'Beach Volleyball'], query: 'summer cup' }))
      .toBe('/discover?q=summer+cup&sport=Soccer&sport=Beach+Volleyball');

    expect(buildDiscoverEventsHref({
      sports: ['Grass Soccer', 'Indoor Soccer'],
      location: { lat: 45.5231, lng: -122.6765, label: 'Portland, OR' },
      distanceMiles: 25,
    })).toBe('/discover?sport=Grass+Soccer&sport=Indoor+Soccer&lat=45.5231&lng=-122.6765&location=Portland%2C+OR&distanceMiles=25');
  });

  it('resolves URL sport values to canonical configured sport names', () => {
    expect(resolveDiscoverSportFilters(['soccer', 'PICKLEBALL', 'Unknown'], ['Soccer', 'Pickleball']))
      .toEqual(['Soccer', 'Pickleball']);
  });

  it('converts sport names and slugs for public event pages', () => {
    expect(sportNameToSlug('Beach Volleyball & Soccer')).toBe('beach-volleyball-and-soccer');
    expect(sportSlugToLabel('beach-volleyball')).toBe('Beach Volleyball');
  });

  it('parses a validated onboarding preset and rejects malformed location values', () => {
    expect(parseDiscoverPreset(new URLSearchParams(
      'tab=organizations&tags=club&skillDivisionTypeIds=competitive&lat=45.52&lng=-122.68&location=Portland%2C+OR&distanceMiles=50',
    ))).toEqual({
      tab: 'organizations',
      query: '',
      tags: ['club'],
      eventTypes: [],
      genders: [],
      skillDivisionTypeIds: ['competitive'],
      ageDivisionTypeIds: [],
      teamDivisionTypeIds: [],
      priceMinDollars: null,
      priceMaxDollars: null,
      startDate: null,
      endDate: null,
      startHour: null,
      endHour: null,
      distanceMiles: 50,
      location: { lat: 45.52, lng: -122.68, label: 'Portland, OR' },
    });

    expect(parseDiscoverPreset(new URLSearchParams(
      'tab=unknown&lat=200&lng=oops&distanceMiles=900',
    ))).toEqual({
      tab: 'events',
      query: '',
      tags: [],
      eventTypes: [],
      genders: [],
      skillDivisionTypeIds: [],
      ageDivisionTypeIds: [],
      teamDivisionTypeIds: [],
      priceMinDollars: null,
      priceMaxDollars: null,
      startDate: null,
      endDate: null,
      startHour: null,
      endHour: null,
      distanceMiles: null,
      location: null,
    });
  });

  it('round trips the full active event filter state through a shareable URL', () => {
    const href = buildDiscoverHref({
      tab: 'events',
      query: 'summer cup',
      sports: ['Soccer', 'Basketball'],
      tags: ['Tryouts'],
      eventTypes: ['TOURNAMENT', 'LEAGUE'],
      genders: ['C'],
      skillDivisionTypeIds: ['competitive'],
      ageDivisionTypeIds: ['u18'],
      priceMinDollars: 10,
      priceMaxDollars: 75.5,
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      location: { lat: 45.5231, lng: -122.6765, label: 'Portland, OR' },
      distanceMiles: 25,
    });
    const params = new URL(href, 'https://bracket-iq.com').searchParams;

    expect(parseDiscoverSportFilters(params)).toEqual(['Soccer', 'Basketball']);
    expect(parseDiscoverPreset(params)).toEqual({
      tab: 'events',
      query: 'summer cup',
      tags: ['Tryouts'],
      eventTypes: ['TOURNAMENT', 'LEAGUE'],
      genders: ['C'],
      skillDivisionTypeIds: ['competitive'],
      ageDivisionTypeIds: ['u18'],
      teamDivisionTypeIds: [],
      priceMinDollars: 10,
      priceMaxDollars: 75.5,
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      startHour: null,
      endHour: null,
      distanceMiles: 25,
      location: { lat: 45.5231, lng: -122.6765, label: 'Portland, OR' },
    });
  });

  it('stores tab-specific rental and team filters without leaking irrelevant values', () => {
    expect(buildDiscoverHref({
      tab: 'rentals',
      sports: ['Pickleball'],
      tags: ['ignored'],
      startHour: 9,
      endHour: 21,
      teamDivisionTypeIds: ['ignored'],
    })).toBe('/discover?tab=rentals&sport=Pickleball&startHour=9&endHour=21');

    expect(buildDiscoverHref({
      tab: 'teams',
      sports: ['Soccer'],
      teamDivisionTypeIds: ['competitive'],
      eventTypes: ['LEAGUE'],
      location: { lat: 45.5231, lng: -122.6765, label: 'Portland, OR' },
      distanceMiles: 25,
    })).toBe('/discover?tab=teams&sport=Soccer&teamDivisionTypeIds=competitive');
  });

  it('validates date-only filters without changing the local calendar day', () => {
    const parsed = discoverDateParamToDate('2026-02-28');

    expect(parsed).toEqual(new Date(2026, 1, 28));
    expect(discoverDateToParam(parsed)).toBe('2026-02-28');
    expect(discoverDateParamToDate('2026-02-30')).toBeNull();
  });

  it('ignores invalid filter enums, rental ranges, and distance without coordinates', () => {
    const preset = parseDiscoverPreset(new URLSearchParams(
      'eventTypes=league&eventTypes=UNKNOWN&genders=c&genders=X&startHour=22&endHour=8&distanceMiles=25',
    ));

    expect(preset.eventTypes).toEqual(['LEAGUE']);
    expect(preset.genders).toEqual(['C']);
    expect(preset.startHour).toBeNull();
    expect(preset.endHour).toBeNull();
    expect(preset.distanceMiles).toBeNull();
  });
});
