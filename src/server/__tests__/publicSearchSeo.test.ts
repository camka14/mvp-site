/** @jest-environment node */

const prismaMock = {
  organizations: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
  },
  events: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
  },
  sports: {
    findMany: jest.fn(),
  },
};

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

import {
  createPublicEventStructuredData,
  getPublicEventSportDirectory,
  getPublicEventSeoData,
  listPublicSitemapEntries,
} from '@/server/publicSearchSeo';

describe('publicSearchSeo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.organizations.findMany.mockReset();
    prismaMock.organizations.findFirst.mockReset();
    prismaMock.events.findMany.mockReset();
    prismaMock.events.findFirst.mockReset();
    prismaMock.sports.findMany.mockReset();
  });

  it('lists public organization and event URLs for the sitemap', async () => {
    prismaMock.organizations.findMany.mockResolvedValue([
      {
        id: 'org_1',
        publicSlug: 'river-city',
        updatedAt: new Date('2026-06-01T12:00:00.000Z'),
      },
    ]);
    prismaMock.events.findMany.mockResolvedValue([
      {
        id: 'event_1',
        organizationId: 'org_1',
        sportId: 'sport_soccer',
        updatedAt: new Date('2026-06-02T12:00:00.000Z'),
        start: new Date('2026-06-10T12:00:00.000Z'),
      },
    ]);
    const entries = await listPublicSitemapEntries();

    expect(prismaMock.organizations.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        publicPageEnabled: true,
        publicSlug: { not: null },
        status: 'LISTED',
      },
    }));
    expect(prismaMock.events.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organizationId: { in: ['org_1'] },
        OR: [{ state: 'PUBLISHED' }, { state: null }],
        NOT: { state: 'TEMPLATE' },
      }),
    }));
    expect(entries).toEqual([
      expect.objectContaining({
        url: 'https://bracket-iq.com/o/river-city',
        changeFrequency: 'daily',
        priority: 0.7,
      }),
      expect.objectContaining({
        url: 'https://bracket-iq.com/o/river-city/events/event_1',
        changeFrequency: 'daily',
        priority: 0.75,
      }),
    ]);
    expect(prismaMock.sports.findMany).not.toHaveBeenCalled();
  });

  it('loads public sport event directories with filtered Discover links', async () => {
    prismaMock.organizations.findMany
      .mockResolvedValueOnce([
        {
          id: 'org_1',
          publicSlug: 'river-city',
          name: 'River City Sports Club',
          updatedAt: new Date('2026-06-01T12:00:00.000Z'),
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'org_1',
          publicSlug: 'river-city',
          name: 'River City Sports Club',
          updatedAt: new Date('2026-06-01T12:00:00.000Z'),
        },
      ]);
    prismaMock.events.findMany
      .mockResolvedValueOnce([
        {
          sportId: 'sport_soccer',
          updatedAt: new Date('2026-06-02T12:00:00.000Z'),
          start: new Date('2026-06-10T12:00:00.000Z'),
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'event_1',
          name: 'Summer Pickup Soccer',
          start: new Date('2026-06-10T12:00:00.000Z'),
          location: 'Main Field',
          price: 1500,
          organizationId: 'org_1',
        },
      ]);
    prismaMock.sports.findMany.mockResolvedValue([
      {
        id: 'sport_soccer',
        name: 'Soccer',
        updatedAt: new Date('2026-06-01T12:00:00.000Z'),
      },
    ]);

    const directory = await getPublicEventSportDirectory('soccer');

    expect(directory).toEqual({
      sport: expect.objectContaining({
        name: 'Soccer',
        slug: 'soccer',
        eventCount: 1,
        directoryPath: '/find-events/soccer',
        discoverHref: '/discover?sport=Soccer',
      }),
      events: [
        expect.objectContaining({
          id: 'event_1',
          name: 'Summer Pickup Soccer',
          organizationName: 'River City Sports Club',
          organizationSlug: 'river-city',
          eventPath: '/o/river-city/events/event_1',
        }),
      ],
    });
  });

  it('loads minimal public event SEO data by slug and event id', async () => {
    prismaMock.organizations.findFirst.mockResolvedValue({
      id: 'org_1',
      publicSlug: 'river-city',
      name: 'River City Sports Club',
      description: 'Local sports club',
      location: 'River City',
      website: 'https://river.example.com',
      logoId: 'logo_1',
      publicHeadline: 'Play in River City',
      publicIntroText: 'Find local events.',
    });
    prismaMock.events.findFirst.mockResolvedValue({
      id: 'event_1',
      name: 'Summer Pickup Soccer',
      description: null,
      start: new Date('2026-07-01T18:00:00.000Z'),
      end: new Date('2026-07-01T20:00:00.000Z'),
      location: 'Main Field',
      address: '100 Park Ave',
      price: 1500,
      imageId: 'image_1',
      eventType: 'EVENT',
      createdAt: new Date('2026-06-01T12:00:00.000Z'),
      updatedAt: new Date('2026-06-02T12:00:00.000Z'),
    });

    const data = await getPublicEventSeoData('River-City', 'event_1');

    expect(prismaMock.organizations.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        publicSlug: 'river-city',
        publicPageEnabled: true,
      },
    }));
    expect(prismaMock.events.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: 'event_1',
        organizationId: 'org_1',
        OR: [{ state: 'PUBLISHED' }, { state: null }],
        NOT: { state: 'TEMPLATE' },
      },
    }));
    expect(data).toEqual({
      organization: expect.objectContaining({
        slug: 'river-city',
        logoUrl: '/api/files/logo_1/preview?w=240&h=240',
      }),
      event: expect.objectContaining({
        id: 'event_1',
        start: '2026-07-01T18:00:00.000Z',
        imageId: 'image_1',
      }),
    });
  });

  it('creates Event and BreadcrumbList structured data for public event pages', () => {
    const data = createPublicEventStructuredData({
      organization: {
        id: 'org_1',
        slug: 'river-city',
        name: 'River City Sports Club',
        location: 'River City',
        website: 'https://river.example.com',
        logoUrl: '/api/files/logo_1/preview?w=240&h=240',
      },
      event: {
        id: 'event_1',
        name: 'Summer Pickup Soccer',
        description: 'Open play for local soccer players.',
        start: '2026-07-01T18:00:00.000Z',
        end: '2026-07-01T20:00:00.000Z',
        location: 'Main Field',
        address: '100 Park Ave',
        price: 1500,
        imageId: 'image_1',
        $createdAt: '2026-06-01T12:00:00.000Z',
      },
    });

    const graph = data['@graph'] as Array<Record<string, any>>;
    const eventNode = graph.find((node) => node['@type'] === 'Event');
    const breadcrumb = graph.find((node) => node['@type'] === 'BreadcrumbList');

    expect(eventNode).toMatchObject({
      '@id': 'https://bracket-iq.com/o/river-city/events/event_1#event',
      name: 'Summer Pickup Soccer',
      url: 'https://bracket-iq.com/o/river-city/events/event_1',
      startDate: '2026-07-01T18:00:00.000Z',
      endDate: '2026-07-01T20:00:00.000Z',
      image: ['https://bracket-iq.com/api/files/image_1/preview?w=1200&h=675'],
      location: {
        '@type': 'Place',
        name: 'Main Field',
        address: '100 Park Ave',
      },
      offers: {
        '@type': 'Offer',
        price: 15,
        priceCurrency: 'USD',
      },
    });
    expect(breadcrumb?.itemListElement).toEqual([
      expect.objectContaining({ position: 1, name: 'BracketIQ' }),
      expect.objectContaining({ position: 2, name: 'River City Sports Club' }),
      expect.objectContaining({ position: 3, name: 'Summer Pickup Soccer' }),
    ]);
  });
});
