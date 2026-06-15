import {
  buildDiscoverEventsHref,
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
});
