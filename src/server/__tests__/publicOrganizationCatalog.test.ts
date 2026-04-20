/** @jest-environment node */

const prismaMock = {
  organizations: {
    findUnique: jest.fn(),
  },
  events: {
    findMany: jest.fn(),
  },
  sports: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
  divisions: {
    findMany: jest.fn(),
  },
  canonicalTeams: {
    findMany: jest.fn(),
  },
  fields: {
    findMany: jest.fn(),
  },
  timeSlots: {
    findMany: jest.fn(),
  },
  products: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
  },
  teams: {
    findMany: jest.fn(),
  },
};

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

import {
  getPublicOrganizationBySlug,
  listPublicOrganizationRentals,
  listPublicOrganizationProducts,
  listPublicOrganizationEvents,
  listPublicOrganizationEventPage,
} from '@/server/publicOrganizationCatalog';

const publicOrganization = {
  id: 'org_1',
  slug: 'scsoccer',
  name: 'SCSoccer',
  description: null,
  location: null,
  website: null,
  logoUrl: '/logo.png',
  sports: [],
  brandPrimaryColor: '#0f766e',
  brandAccentColor: '#f59e0b',
  publicHeadline: 'Play',
  publicIntroText: 'Join',
  publicPageEnabled: true,
  publicWidgetsEnabled: true,
  publicCompletionRedirectUrl: null,
};

describe('publicOrganizationCatalog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not return page-disabled organizations for public pages', async () => {
    prismaMock.organizations.findUnique.mockResolvedValue({
      id: 'org_1',
      name: 'SCSoccer',
      publicSlug: 'scsoccer',
      publicPageEnabled: false,
      publicWidgetsEnabled: true,
      publicCompletionRedirectUrl: 'https://client.example.com/thanks',
    });

    await expect(getPublicOrganizationBySlug('scsoccer', { surface: 'page' })).resolves.toBeNull();
    await expect(getPublicOrganizationBySlug('scsoccer', { surface: 'widget' })).resolves.toEqual(expect.objectContaining({
      slug: 'scsoccer',
      publicWidgetsEnabled: true,
      publicCompletionRedirectUrl: 'https://client.example.com/thanks',
    }));
  });

  it('lists only public event cards for an organization', async () => {
    prismaMock.events.findMany.mockResolvedValue([
      {
        id: 'event_1',
        name: 'Spring League',
        description: 'League play',
        start: new Date('2026-05-01T17:00:00.000Z'),
        end: null,
        location: 'Main Field',
        eventType: 'LEAGUE',
        sportId: 'soccer',
          price: 2500,
          imageId: 'file_1',
          divisions: ['open'],
      },
    ]);
    prismaMock.sports.findMany.mockResolvedValue([{ id: 'soccer', name: 'Soccer' }]);
    prismaMock.divisions.findMany.mockResolvedValue([{ eventId: 'event_1', id: 'open', key: 'open', name: 'Open' }]);

    const events = await listPublicOrganizationEvents(publicOrganization);

    expect(prismaMock.events.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organizationId: 'org_1',
        NOT: { state: 'TEMPLATE' },
      }),
    }));
    expect(events).toEqual([
      expect.objectContaining({
        id: 'event_1',
        name: 'Spring League',
        sportName: 'Soccer',
        eventTypeLabel: 'League',
        detailsUrl: '/o/scsoccer/events/event_1',
      }),
    ]);
  });

  it('applies locked event type and today rules to public event queries', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-01T12:00:00.000Z'));
    prismaMock.events.findMany.mockResolvedValue([]);
    prismaMock.sports.findMany.mockResolvedValue([]);
    prismaMock.divisions.findMany.mockResolvedValue([]);

    try {
      await listPublicOrganizationEvents(
        publicOrganization,
        {
          eventTypes: ['league', 'TOURNAMENT', 'bad-type'],
          dateRule: 'today',
          includeChildWeeklyEvents: false,
          limit: 4,
        },
      );
    } finally {
      jest.useRealTimers();
    }

    const query = prismaMock.events.findMany.mock.calls[0]?.[0];
    expect(query).toEqual(expect.objectContaining({
      take: expect.any(Number),
      where: expect.objectContaining({
        eventType: { in: ['LEAGUE', 'TOURNAMENT'] },
        AND: expect.arrayContaining([
          expect.objectContaining({
            OR: expect.any(Array),
          }),
          { eventType: { not: 'WEEKLY_EVENT' } },
        ]),
      }),
    }));
    expect(query.take).toBeGreaterThanOrEqual(4);
  });

  it('applies custom date ranges ahead of date presets', async () => {
    prismaMock.events.findMany.mockResolvedValue([]);
    prismaMock.sports.findMany.mockResolvedValue([]);
    prismaMock.divisions.findMany.mockResolvedValue([]);

    await listPublicOrganizationEvents(
      {
        ...publicOrganization,
      },
      {
        dateRule: 'today',
        dateFrom: '2026-06-01',
        dateTo: '2026-06-03',
      },
    );

    const query = prismaMock.events.findMany.mock.calls[0]?.[0];
    const dateClause = query.where.AND[0].OR[1];
    expect(dateClause.start.gte).toEqual(new Date(2026, 5, 1, 0, 0, 0, 0));
    expect(dateClause.start.lt).toEqual(new Date(2026, 5, 4, 0, 0, 0, 0));
  });

  it('returns paginated event cards with next and previous state', async () => {
    prismaMock.events.findMany.mockResolvedValue([
      {
        id: 'event_1',
        name: 'First Event',
        start: new Date('2026-05-01T17:00:00.000Z'),
        end: null,
        location: 'Main Field',
        eventType: 'EVENT',
        sportId: null,
        price: 0,
        imageId: null,
        divisions: [],
      },
      {
        id: 'event_2',
        name: 'Second Event',
        start: new Date('2026-05-02T17:00:00.000Z'),
        end: null,
        location: 'Main Field',
        eventType: 'EVENT',
        sportId: null,
        price: 0,
        imageId: null,
        divisions: [],
      },
      {
        id: 'event_3',
        name: 'Third Event',
        start: new Date('2026-05-03T17:00:00.000Z'),
        end: null,
        location: 'Main Field',
        eventType: 'EVENT',
        sportId: null,
        price: 0,
        imageId: null,
        divisions: [],
      },
    ]);
    prismaMock.sports.findMany.mockResolvedValue([]);
    prismaMock.divisions.findMany.mockResolvedValue([]);

    const page = await listPublicOrganizationEventPage(publicOrganization, {
      limit: 1,
      page: 2,
    });

    expect(prismaMock.events.findMany).toHaveBeenCalledWith(expect.objectContaining({
      take: expect.any(Number),
    }));
    expect(prismaMock.events.findMany.mock.calls[0]?.[0].skip).toBeUndefined();
    expect(prismaMock.events.findMany.mock.calls[0]?.[0].take).toBeGreaterThanOrEqual(2);
    expect(page.events).toEqual([
      expect.objectContaining({ id: 'event_2' }),
    ]);
    expect(page.pageInfo).toEqual({
      limit: 1,
      page: 2,
      offset: 1,
      hasPrevious: true,
      hasNext: true,
    });
  });

  it('expands public weekly parent events into upcoming occurrence cards for filtered widgets', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-04T12:00:00.000Z'));
    prismaMock.events.findMany.mockResolvedValue([
      {
        id: 'weekly_parent',
        name: 'Weekly Pickup',
        start: new Date('2026-04-01T17:00:00.000Z'),
        end: new Date('2026-06-01T17:00:00.000Z'),
        location: 'Main Court',
        eventType: 'WEEKLY_EVENT',
        parentEvent: null,
        sportId: null,
        price: 1000,
        imageId: null,
        divisions: ['open'],
        timeSlotIds: ['slot_weekly'],
      },
    ]);
    prismaMock.timeSlots.findMany.mockResolvedValue([
      {
        id: 'slot_weekly',
        dayOfWeek: 2,
        daysOfWeek: [2],
        startDate: new Date('2026-04-01T00:00:00.000Z'),
        endDate: new Date('2026-06-01T00:00:00.000Z'),
        startTimeMinutes: 17 * 60,
        endTimeMinutes: 18 * 60,
        repeating: true,
      },
    ]);
    prismaMock.sports.findMany.mockResolvedValue([]);
    prismaMock.divisions.findMany.mockResolvedValue([]);

    try {
      const page = await listPublicOrganizationEventPage(publicOrganization, {
        dateRule: 'week',
        eventTypes: ['WEEKLY_EVENT'],
        limit: 4,
        page: 1,
      });

      expect(page.events).toEqual([
        expect.objectContaining({
          id: 'weekly_parent:slot_weekly:2026-05-06',
          start: new Date(2026, 4, 6, 17, 0, 0, 0).toISOString(),
          detailsUrl: '/o/scsoccer/events/weekly_parent?slotId=slot_weekly&occurrenceDate=2026-05-06',
        }),
      ]);
    } finally {
      jest.useRealTimers();
    }
  });

  it('links public rental cards to the rental selection page', async () => {
    prismaMock.fields.findMany.mockResolvedValue([
      {
        id: 'field_1',
        name: 'Main Field',
        fieldNumber: 1,
        location: 'Main Park',
        rentalSlotIds: ['slot_1'],
      },
    ]);
    prismaMock.timeSlots.findMany.mockResolvedValue([
      {
        id: 'slot_1',
        startDate: new Date('2026-05-01T17:00:00.000Z'),
        endDate: new Date('2026-05-01T19:00:00.000Z'),
        price: 5000,
      },
    ]);

    const rentals = await listPublicOrganizationRentals(publicOrganization);

    expect(rentals).toEqual([
      expect.objectContaining({
        id: 'slot_1',
        detailsUrl: '/o/scsoccer/rentals',
      }),
    ]);
  });

  it('links public product cards directly to checkout pages', async () => {
    prismaMock.products.findMany.mockResolvedValue([
      {
        id: 'product_1',
        name: 'Day Pass',
        description: 'Drop in once',
        priceCents: 1500,
        period: 'single',
      },
    ]);

    const products = await listPublicOrganizationProducts(publicOrganization);

    expect(products).toEqual([
      expect.objectContaining({
        id: 'product_1',
        detailsUrl: '/o/scsoccer/products/product_1',
      }),
    ]);
  });
});
