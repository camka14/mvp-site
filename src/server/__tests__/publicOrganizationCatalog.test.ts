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
  },
  teams: {
    findMany: jest.fn(),
  },
};

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

import {
  getPublicOrganizationBySlug,
  listPublicOrganizationEvents,
} from '@/server/publicOrganizationCatalog';

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
    });

    await expect(getPublicOrganizationBySlug('scsoccer', { surface: 'page' })).resolves.toBeNull();
    await expect(getPublicOrganizationBySlug('scsoccer', { surface: 'widget' })).resolves.toEqual(expect.objectContaining({
      slug: 'scsoccer',
      publicWidgetsEnabled: true,
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

    const events = await listPublicOrganizationEvents({
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
    });

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
        detailsUrl: '/o/scsoccer/events/event_1',
      }),
    ]);
  });
});
