import {
  buildDiscoverEventsHref,
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
      tags: ['club'],
      skillDivisionTypeIds: ['competitive'],
      distanceMiles: 50,
      location: { lat: 45.52, lng: -122.68, label: 'Portland, OR' },
    });

    expect(parseDiscoverPreset(new URLSearchParams(
      'tab=unknown&lat=200&lng=oops&distanceMiles=900',
    ))).toEqual({
      tab: 'events',
      tags: [],
      skillDivisionTypeIds: [],
      distanceMiles: null,
      location: null,
    });
  });
});
