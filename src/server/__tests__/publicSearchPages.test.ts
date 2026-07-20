/** @jest-environment node */

const prismaMock = {
  organizations: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
  events: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
  },
  sports: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
  facilities: {
    findMany: jest.fn(),
  },
  fields: {
    findMany: jest.fn(),
  },
};

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

import {
  createPublicSearchSportEntries,
  extractPublicSearchLocation,
  getPublicSearchPage,
  getRegularPublicEventSeoData,
  getRegularOrganizationSeoData,
  listPublicSearchPageSummaries,
  listPublicSearchSitemapEntries,
  listRegularPublicEventSitemapEntries,
  listRegularOrganizationProfileSitemapEntries,
  PACIFIC_NORTHWEST_MAJOR_SEARCH_LOCATIONS,
  publicSearchPath,
} from '@/server/publicSearchPages';

const mockBaseInventory = () => {
  prismaMock.sports.findMany.mockResolvedValue([
    { id: 'sport_grass_soccer', name: 'Grass Soccer' },
    { id: 'sport_indoor_soccer', name: 'Indoor Soccer' },
    { id: 'sport_pickleball', name: 'Pickleball' },
  ]);
  prismaMock.organizations.findMany.mockResolvedValue([
    {
      id: 'org_1',
      publicSlug: 'river-city',
      name: 'River City Sports Club',
      description: 'Soccer and futsal programs in Portland.',
      location: 'Portland, OR',
      address: '100 Main St, Portland, OR 97201',
      website: 'https://river.example.com',
      sports: ['Grass Soccer'],
      logoId: 'logo_1',
      publicPageEnabled: true,
      coordinates: [-122.6765, 45.5231],
      updatedAt: new Date('2026-07-01T12:00:00.000Z'),
    },
    {
      id: 'org_2',
      publicSlug: 'northside-pickleball',
      name: 'Northside Pickleball',
      description: 'Public pickleball courts and ladders.',
      location: 'Seattle, WA',
      address: '200 Court Way, Seattle, WA',
      website: null,
      sports: ['Pickleball'],
      logoId: null,
      publicPageEnabled: false,
      coordinates: [-122.3321, 47.6062],
      updatedAt: new Date('2026-07-02T12:00:00.000Z'),
    },
    {
      id: 'org_3',
      publicSlug: 'summit-united',
      name: 'Summit United',
      description: 'Indoor soccer programs in Beaverton.',
      location: 'Beaverton, OR',
      address: '300 Center St, Beaverton, OR 97005',
      website: null,
      sports: ['Indoor Soccer'],
      logoId: null,
      publicPageEnabled: true,
      coordinates: [-122.8037, 45.4871],
      updatedAt: new Date('2026-07-06T12:00:00.000Z'),
    },
    {
      id: 'org_4',
      publicSlug: 'capital-city-soccer',
      name: 'Capital City Soccer',
      description: 'Grass soccer programs in Salem.',
      location: 'Salem, OR',
      address: '400 State St, Salem, OR 97301',
      website: null,
      sports: ['Grass Soccer'],
      logoId: null,
      publicPageEnabled: true,
      coordinates: [-123.0351, 44.9429],
      updatedAt: new Date('2026-07-07T12:00:00.000Z'),
    },
  ]);
  prismaMock.events.findMany.mockResolvedValue([
    {
      id: 'event_1',
      name: 'Portland Summer Soccer League',
      description: 'Adult league play.',
      start: new Date('2030-08-01T18:00:00.000Z'),
      end: new Date('2030-09-01T18:00:00.000Z'),
      location: 'Portland, OR',
      address: '100 Main St, Portland, OR 97201',
      coordinates: [-122.6765, 45.5231],
      price: 5000,
      eventType: 'LEAGUE',
      sportId: 'sport_grass_soccer',
      organizationId: 'org_1',
      imageId: 'event_image_1',
      updatedAt: new Date('2026-07-03T12:00:00.000Z'),
    },
    {
      id: 'event_2',
      name: 'Seattle Pickleball Mixer',
      description: 'Open pickleball mixer.',
      start: new Date('2030-08-02T18:00:00.000Z'),
      end: new Date('2030-08-02T20:00:00.000Z'),
      location: 'Seattle, WA',
      address: '200 Court Way, Seattle, WA',
      coordinates: [-122.3321, 47.6062],
      price: 2500,
      eventType: 'EVENT',
      sportId: 'sport_pickleball',
      organizationId: 'org_2',
      imageId: null,
      updatedAt: new Date('2026-07-05T12:00:00.000Z'),
    },
    {
      id: 'event_3',
      name: 'Beaverton Indoor Soccer Tournament',
      description: 'Regional indoor tournament.',
      start: new Date('2030-08-03T18:00:00.000Z'),
      end: new Date('2030-08-04T20:00:00.000Z'),
      location: 'Beaverton, OR',
      address: '300 Center St, Beaverton, OR 97005',
      coordinates: [-122.8037, 45.4871],
      price: 7500,
      eventType: 'TOURNAMENT',
      sportId: 'sport_indoor_soccer',
      organizationId: 'org_3',
      imageId: null,
      updatedAt: new Date('2026-07-08T12:00:00.000Z'),
    },
    {
      id: 'event_4',
      name: 'Salem Grass Soccer Tournament',
      description: 'Regional grass tournament.',
      start: new Date('2030-08-05T18:00:00.000Z'),
      end: new Date('2030-08-06T20:00:00.000Z'),
      location: 'Salem, OR',
      address: '400 State St, Salem, OR 97301',
      coordinates: [-123.0351, 44.9429],
      price: 7500,
      eventType: 'TOURNAMENT',
      sportId: 'sport_grass_soccer',
      organizationId: 'org_4',
      imageId: null,
      updatedAt: new Date('2026-07-09T12:00:00.000Z'),
    },
  ]);
  prismaMock.facilities.findMany.mockResolvedValue([
    {
      id: 'facility_1',
      name: 'River City Fields',
      location: 'Portland, OR',
      address: '100 Main St, Portland, OR 97201',
      organizationId: 'org_1',
      coordinates: [-122.6765, 45.5231],
      updatedAt: new Date('2026-07-04T12:00:00.000Z'),
    },
  ]);
  prismaMock.fields.findMany.mockResolvedValue([
    {
      facilityId: 'facility_1',
      sportIds: ['sport_grass_soccer'],
    },
  ]);
};

describe('publicSearchPages', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.organizations.findMany.mockReset();
    prismaMock.organizations.findUnique.mockReset();
    prismaMock.events.findMany.mockReset();
    prismaMock.events.findFirst.mockReset();
    prismaMock.sports.findMany.mockReset();
    prismaMock.sports.findUnique.mockReset();
    prismaMock.facilities.findMany.mockReset();
    prismaMock.fields.findMany.mockReset();
  });

  it('builds stable public search paths', () => {
    expect(publicSearchPath({ kind: 'events', sportSlug: 'soccer', eventType: 'leagues', locationSlug: 'portland-or' }))
      .toBe('/find-events/soccer-leagues/portland-or');
    expect(publicSearchPath({ kind: 'clubs', sportSlug: 'soccer', locationSlug: 'portland-or' }))
      .toBe('/find-clubs/soccer/portland-or');
    expect(publicSearchPath({ kind: 'facilities' })).toBe('/find-facilities');
  });

  it('builds umbrella soccer and volleyball catalog entries from their variants', () => {
    const sports = createPublicSearchSportEntries([
      { id: 'grass_soccer', name: 'Grass Soccer' },
      { id: 'indoor_soccer', name: 'Indoor Soccer' },
      { id: 'indoor_volleyball', name: 'Indoor Volleyball' },
      { id: 'beach_volleyball', name: 'Beach Volleyball' },
      { id: 'pickleball', name: 'Pickleball' },
    ]);

    expect(sports).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'Soccer',
        slug: 'soccer',
        sportIds: ['grass_soccer', 'indoor_soccer'],
        sportNames: ['Grass Soccer', 'Indoor Soccer'],
      }),
      expect.objectContaining({
        name: 'Volleyball',
        slug: 'volleyball',
        sportIds: ['indoor_volleyball', 'beach_volleyball'],
        sportNames: ['Indoor Volleyball', 'Beach Volleyball'],
      }),
      expect.objectContaining({ name: 'Pickleball', slug: 'pickleball' }),
    ]));
  });

  it('extracts conservative city and state locations', () => {
    expect(extractPublicSearchLocation('100 Main St, Portland, OR 97201')).toEqual({
      slug: 'portland-or',
      label: 'Portland, OR',
      city: 'Portland',
      state: 'OR',
    });
    expect(extractPublicSearchLocation('Portland, Oregon')).toEqual({
      slug: 'portland-or',
      label: 'Portland, OR',
      city: 'Portland',
      state: 'OR',
    });
    expect(extractPublicSearchLocation('Main Field')).toBeNull();
  });

  it('loads an event type and location landing page backed by real inventory', async () => {
    mockBaseInventory();

    const page = await getPublicSearchPage({
      kind: 'events',
      sportSlug: 'soccer',
      eventType: 'leagues',
      locationSlug: 'portland-or',
    });

    expect(page).toEqual(expect.objectContaining({
      canonicalPath: '/find-events/soccer-leagues/portland-or',
      h1: 'Soccer Leagues near Portland, OR',
      discoverHref: '/discover?sport=Grass+Soccer&sport=Indoor+Soccer&lat=45.5231&lng=-122.6765&location=Portland%2C+OR&distanceMiles=25',
      searchRadiusMiles: 25,
    }));
    expect(page?.results).toEqual([
      expect.objectContaining({
        title: 'Portland Summer Soccer League',
        href: '/o/river-city/events/event_1',
        organizationName: 'River City Sports Club',
      }),
    ]);
  });

  it('uses the umbrella sport and a 25-mile radius for local results', async () => {
    mockBaseInventory();

    const page = await getPublicSearchPage({
      kind: 'clubs',
      sportSlug: 'soccer',
      locationSlug: 'portland-or',
    });

    expect(page?.canonicalPath).toBe('/find-clubs/soccer/portland-or');
    expect(page?.results).toEqual([
      expect.objectContaining({
        title: 'River City Sports Club',
        href: '/o/river-city',
      }),
      expect.objectContaining({
        title: 'Summit United',
        href: '/o/summit-united',
      }),
    ]);
    expect(page?.results).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ title: 'Capital City Soccer' }),
    ]));
  });

  it('links event search results to regular event detail pages when the org public page is not enabled', async () => {
    mockBaseInventory();

    const page = await getPublicSearchPage({
      kind: 'events',
      sportSlug: 'pickleball',
      locationSlug: 'seattle-wa',
    });

    expect(page?.canonicalPath).toBe('/find-events/pickleball/seattle-wa');
    expect(page?.results).toEqual([
      expect.objectContaining({
        title: 'Seattle Pickleball Mixer',
        href: '/event/event_2',
        organizationName: 'Northside Pickleball',
      }),
    ]);
  });

  it('links facility results to the enabled public organization page', async () => {
    mockBaseInventory();

    const page = await getPublicSearchPage({
      kind: 'facilities',
      sportSlug: 'soccer',
      locationSlug: 'portland-or',
    });

    expect(page?.results).toEqual([
      expect.objectContaining({
        title: 'River City Fields',
        href: '/o/river-city',
      }),
    ]);
  });

  it('lists public search sitemap entries without querying per combination', async () => {
    mockBaseInventory();

    const entries = await listPublicSearchSitemapEntries();

    expect(entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ url: 'https://bracket-iq.com/find-events/soccer-leagues/portland-or' }),
      expect.objectContaining({ url: 'https://bracket-iq.com/find-clubs/soccer/portland-or' }),
      expect.objectContaining({ url: 'https://bracket-iq.com/find-facilities/soccer/portland-or' }),
    ]));
    expect(entries).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ url: 'https://bracket-iq.com/find-events/pickleball-tournaments/eugene-or' }),
      expect.objectContaining({ url: 'https://bracket-iq.com/find-clubs/soccer/seattle-wa' }),
    ]));
    expect(prismaMock.organizations.findMany).toHaveBeenCalledTimes(1);
  });

  it('indexes listed organizations on either their enabled custom page or regular profile', async () => {
    mockBaseInventory();
    prismaMock.organizations.findUnique.mockResolvedValue({
      id: 'org_1',
      name: 'River City Sports Club',
      description: 'Soccer and futsal programs in Portland.',
      location: 'Portland, OR',
      website: 'https://river.example.com',
      logoId: 'logo_1',
      publicSlug: 'river-city',
      publicPageEnabled: true,
      updatedAt: new Date('2026-07-01T12:00:00.000Z'),
      status: 'LISTED',
    });

    const [entries, enabledSeo] = await Promise.all([
      listRegularOrganizationProfileSitemapEntries(),
      getRegularOrganizationSeoData('org_1'),
    ]);

    expect(entries).toEqual([
      expect.objectContaining({
        url: 'https://bracket-iq.com/organizations/org_2',
      }),
    ]);
    expect(enabledSeo).toEqual(expect.objectContaining({
      canonicalPath: '/o/river-city',
      indexable: true,
      logoUrl: '/api/files/logo_1/preview?w=240&h=240',
    }));

    prismaMock.organizations.findUnique.mockResolvedValue({
      id: 'org_2',
      name: 'Northside Pickleball',
      description: 'Public pickleball courts and ladders.',
      location: 'Seattle, WA',
      website: null,
      logoId: null,
      publicSlug: 'northside-pickleball',
      publicPageEnabled: false,
      updatedAt: new Date('2026-07-02T12:00:00.000Z'),
      status: 'LISTED',
    });

    await expect(getRegularOrganizationSeoData('org_2')).resolves.toEqual(expect.objectContaining({
      canonicalPath: '/organizations/org_2',
      indexable: true,
    }));
  });

  it('loads regular public event detail SEO data and sitemap entries', async () => {
    mockBaseInventory();
    prismaMock.events.findFirst.mockResolvedValue({
      id: 'event_2',
      name: 'Seattle Pickleball Mixer',
      description: 'Open pickleball mixer.',
      start: new Date('2026-08-02T18:00:00.000Z'),
      end: new Date('2026-08-02T20:00:00.000Z'),
      location: 'Seattle, WA',
      address: '200 Court Way, Seattle, WA',
      price: 2500,
      imageId: null,
      eventType: 'EVENT',
      sportId: 'sport_pickleball',
      organizationId: 'org_2',
      updatedAt: new Date('2026-07-05T12:00:00.000Z'),
    });
    prismaMock.organizations.findUnique.mockResolvedValue({
      id: 'org_2',
      name: 'Northside Pickleball',
      description: 'Public pickleball courts and ladders.',
      location: 'Seattle, WA',
      website: null,
      logoId: null,
      publicSlug: null,
      publicPageEnabled: false,
      status: 'LISTED',
    });
    prismaMock.sports.findUnique.mockResolvedValue({ name: 'Pickleball' });

    const [entries, seo] = await Promise.all([
      listRegularPublicEventSitemapEntries(),
      getRegularPublicEventSeoData('event_2'),
    ]);

    expect(entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ url: 'https://bracket-iq.com/event/event_2' }),
    ]));
    expect(seo).toEqual(expect.objectContaining({
      canonicalPath: '/event/event_2',
      indexable: true,
      title: 'Seattle Pickleball Mixer | Northside Pickleball on BracketIQ',
      registrationPath: null,
    }));
    expect(seo?.event).toEqual(expect.objectContaining({
      sportName: 'Pickleball',
      imageUrl: '/api/avatars/initials?name=Northside%20Pickleball&size=240&format=png',
    }));
  });

  it('returns 404 data for curated sport-city pages when inventory is empty', async () => {
    mockBaseInventory();

    const page = await getPublicSearchPage({
      kind: 'events',
      sportSlug: 'pickleball',
      eventType: 'tournaments',
      locationSlug: 'portland-or',
    });

    expect(page).toBeNull();
  });

  it('still rejects empty pages for unknown non-curated locations', async () => {
    mockBaseInventory();

    await expect(getPublicSearchPage({
      kind: 'events',
      sportSlug: 'pickleball',
      eventType: 'tournaments',
      locationSlug: 'nowhere-zz',
    })).resolves.toBeNull();
  });

  it('exposes page summaries for indexed combinations', async () => {
    mockBaseInventory();

    const summaries = await listPublicSearchPageSummaries();

    expect(summaries.map((summary) => summary.path)).toEqual(expect.arrayContaining([
      '/find-events/soccer',
      '/find-events/soccer-leagues',
      '/find-events/soccer-leagues/portland-or',
      '/find-clubs/soccer',
      '/find-facilities/soccer',
    ]));
    expect(summaries.map((summary) => summary.path)).not.toEqual(expect.arrayContaining([
      '/find-events/pickleball/eugene-or',
      '/find-events/pickleball-tournaments/eugene-or',
      '/find-clubs/soccer/seattle-wa',
    ]));
  });

  it('links root search hubs to populated sport pages', async () => {
    mockBaseInventory();

    const page = await getPublicSearchPage({ kind: 'events' });

    expect(page?.relatedPages).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: '/find-events/soccer' }),
      expect.objectContaining({ path: '/find-events/pickleball' }),
    ]));
  });

  it('keeps the curated major city list focused on Washington and Oregon', () => {
    expect(PACIFIC_NORTHWEST_MAJOR_SEARCH_LOCATIONS).toEqual(expect.arrayContaining([
      expect.objectContaining({ slug: 'seattle-wa', label: 'Seattle, WA' }),
      expect.objectContaining({ slug: 'portland-or', label: 'Portland, OR' }),
      expect.objectContaining({ slug: 'eugene-or', label: 'Eugene, OR' }),
      expect.objectContaining({ slug: 'vancouver-wa', label: 'Vancouver, WA' }),
    ]));
  });
});
