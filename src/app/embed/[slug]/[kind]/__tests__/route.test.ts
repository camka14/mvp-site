/** @jest-environment node */

import { NextRequest } from 'next/server';

const getPublicOrganizationCatalogMock = jest.fn();

jest.mock('@/server/publicOrganizationCatalog', () => ({
  PUBLIC_EVENT_TYPES: ['EVENT', 'TOURNAMENT', 'LEAGUE', 'WEEKLY_EVENT'],
  formatPublicEventTypeLabel: (value: unknown) => String(value ?? 'Event').replace('_', ' '),
  getPublicOrganizationCatalog: (...args: unknown[]) => getPublicOrganizationCatalogMock(...args),
  normalizePublicEventTypes: (value: unknown) => (
    typeof value === 'string'
      ? value.split(',').map((entry) => entry.trim().toUpperCase()).filter(Boolean)
      : []
  ),
}));

import { GET as getWidget } from '@/app/embed/[slug]/[kind]/route';

const catalog = {
  organization: {
    id: 'org_1',
    slug: 'scsoccer',
    name: 'SC Soccer',
    description: null,
    location: null,
    website: null,
    logoUrl: '/logo.png',
    sports: [],
    brandPrimaryColor: '#0f766e',
    brandAccentColor: '#f59e0b',
    publicHeadline: 'Play',
    publicIntroText: 'Find events.',
    publicPageEnabled: true,
    publicWidgetsEnabled: true,
  },
  events: [
    {
      id: 'event_1',
      name: 'League Night',
      description: null,
      start: '2026-05-01T17:00:00.000Z',
      end: null,
      location: 'Main Field',
      eventType: 'LEAGUE',
      eventTypeLabel: 'League',
      sportName: 'Soccer',
      priceCents: 2500,
      imageUrl: '/event.png',
      divisionLabels: [],
      detailsUrl: '/o/scsoccer/events/event_1',
    },
  ],
  eventPageInfo: {
    limit: 6,
    page: 1,
    offset: 0,
    hasPrevious: false,
    hasNext: false,
  },
  teams: [],
  rentals: [],
  products: [],
};

describe('GET /embed/[slug]/[kind]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getPublicOrganizationCatalogMock.mockResolvedValue(catalog);
  });

  it('passes widget filter query params to the public catalog', async () => {
    const req = new NextRequest(
      'http://localhost/embed/scsoccer/events?limit=4&page=2&showDateFilter=1&showEventTypeFilter=1&dateRule=today&eventTypes=league,tournament&includeChildWeeklyEvents=0',
    );

    await getWidget(req, { params: Promise.resolve({ slug: 'scsoccer', kind: 'events' }) });

    expect(getPublicOrganizationCatalogMock).toHaveBeenCalledWith('scsoccer', expect.objectContaining({
      surface: 'widget',
      limit: 4,
      eventPage: 2,
      dateRule: 'today',
      eventTypes: ['LEAGUE', 'TOURNAMENT'],
      includeChildWeeklyEvents: false,
    }));
  });

  it('emits CSS that lets filter changes visually hide cards', async () => {
    const req = new NextRequest('http://localhost/embed/scsoccer/events?showDateFilter=1&showEventTypeFilter=1');

    const res = await getWidget(req, { params: Promise.resolve({ slug: 'scsoccer', kind: 'events' }) });
    const html = await res.text();

    expect(html).toContain('.card[hidden] { display: none; }');
    expect(html).toContain('class="grid event-grid" data-events-grid');
    expect(html).toContain('.event-grid { grid-template-columns: repeat(auto-fit, minmax(220px, 500px));');
    expect(html).toContain('card.hidden = !isVisible;');
    expect(html).toContain('refetchEventsFromFilters');
    expect(html).toContain('window.location.assign(url.toString())');
    expect(html).toContain('input[name="dateFilter"], input[name="eventTypeFilter"]');
  });

  it('renders event pagination controls when more events are available', async () => {
    getPublicOrganizationCatalogMock.mockResolvedValue({
      ...catalog,
      eventPageInfo: {
        limit: 1,
        page: 2,
        offset: 1,
        hasPrevious: true,
        hasNext: true,
      },
    });
    const req = new NextRequest('http://localhost/embed/scsoccer/events?limit=1&page=2');

    const res = await getWidget(req, { params: Promise.resolve({ slug: 'scsoccer', kind: 'events' }) });
    const html = await res.text();

    expect(html).toContain('data-widget-page="1"');
    expect(html).toContain('Page 2');
    expect(html).toContain('data-widget-page="3"');
  });
});
