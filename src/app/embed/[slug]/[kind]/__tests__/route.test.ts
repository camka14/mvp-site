/** @jest-environment node */

import { NextRequest } from 'next/server';

const getPublicOrganizationCatalogMock = jest.fn();
const getPublicStandingsWidgetPageMock = jest.fn();
const getPublicBracketWidgetPageMock = jest.fn();

jest.mock('@/server/publicOrganizationCatalog', () => ({
  PUBLIC_EVENT_TYPES: ['EVENT', 'TOURNAMENT', 'LEAGUE', 'WEEKLY_EVENT'],
  formatPublicEventTypeLabel: (value: unknown) => String(value ?? 'Event').replace('_', ' '),
  getPublicOrganizationCatalog: (...args: unknown[]) => getPublicOrganizationCatalogMock(...args),
  getPublicStandingsWidgetPage: (...args: unknown[]) => getPublicStandingsWidgetPageMock(...args),
  getPublicBracketWidgetPage: (...args: unknown[]) => getPublicBracketWidgetPageMock(...args),
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

const standingsPage = {
  organization: catalog.organization,
  eventPageInfo: {
    limit: 1,
    page: 2,
    offset: 1,
    hasPrevious: true,
    hasNext: true,
  },
  currentEvent: {
    id: 'league_1',
    name: 'Spring League',
  },
  divisionOptions: [
    { value: 'open', label: 'Open Division' },
    { value: 'women', label: 'Women' },
  ],
  selectedDivisionId: 'open',
  selectedDivisionName: 'Open Division',
  division: {
    divisionName: 'Open Division',
    standings: [
      {
        position: 1,
        teamName: 'Aces',
        draws: 0,
        finalPoints: 9,
        pointsDelta: 0,
      },
    ],
  },
};

const bracketPage = {
  organization: catalog.organization,
  eventPageInfo: {
    limit: 1,
    page: 1,
    offset: 0,
    hasPrevious: false,
    hasNext: false,
  },
  currentEvent: {
    id: 'tournament_1',
    name: 'Spring Finals',
  },
  divisionOptions: [
    { value: 'open', label: 'Open Division' },
  ],
  selectedDivisionId: 'open',
  selectedDivisionName: 'Open Division',
  winnersColumns: [
    {
      label: 'Round 1',
      matches: [
        {
          id: 'match_1',
          matchId: 1,
          fieldLabel: 'Court 1',
          startLabel: 'May 10, 5:00 PM',
          team1Name: 'Aces',
          team2Name: 'Bumpers',
          team1Points: [21, 21],
          team2Points: [18, 17],
        },
      ],
    },
  ],
  losersColumns: [
    {
      label: 'Losers Round 1',
      matches: [],
    },
  ],
  hasLosersBracket: true,
};

describe('GET /embed/[slug]/[kind]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getPublicOrganizationCatalogMock.mockResolvedValue(catalog);
    getPublicStandingsWidgetPageMock.mockResolvedValue(standingsPage);
    getPublicBracketWidgetPageMock.mockResolvedValue(bracketPage);
  });

  it('passes widget filter query params to the public catalog', async () => {
    const req = new NextRequest(
      'http://localhost/embed/scsoccer/events?limit=4&page=2&showDateFilter=1&showEventTypeFilter=1&dateRule=today&eventTypes=league,tournament&includeChildWeeklyEvents=0&teamOpenRegistrationOnly=1&productPurchaseMode=subscription',
    );

    await getWidget(req, { params: Promise.resolve({ slug: 'scsoccer', kind: 'events' }) });

    expect(getPublicOrganizationCatalogMock).toHaveBeenCalledWith('scsoccer', expect.objectContaining({
      surface: 'widget',
      limit: 4,
      eventPage: 2,
      dateRule: 'today',
      eventTypes: ['LEAGUE', 'TOURNAMENT'],
      includeChildWeeklyEvents: false,
      teamOpenRegistrationOnly: true,
      productPurchaseMode: 'subscription',
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

  it('passes standings widget selection params to the dedicated standings loader', async () => {
    const req = new NextRequest(
      'http://localhost/embed/scsoccer/standings?page=2&showDateFilter=1&dateRule=upcoming&eventIds=league_1,league_2&divisionId=open',
    );

    await getWidget(req, { params: Promise.resolve({ slug: 'scsoccer', kind: 'standings' }) });

    expect(getPublicStandingsWidgetPageMock).toHaveBeenCalledWith('scsoccer', {
      page: 2,
      dateRule: 'upcoming',
      eventIds: ['league_1', 'league_2'],
      divisionId: 'open',
    });
    expect(getPublicOrganizationCatalogMock).not.toHaveBeenCalled();
  });

  it('renders standings widgets with division controls and page navigation', async () => {
    const req = new NextRequest('http://localhost/embed/scsoccer/standings?page=2&showDateFilter=1&dateRule=upcoming');

    const res = await getWidget(req, { params: Promise.resolve({ slug: 'scsoccer', kind: 'standings' }) });
    const html = await res.text();

    expect(html).toContain('League standings');
    expect(html).toContain('Spring League');
    expect(html).toContain('Open Division');
    expect(html).toContain('data-widget-division');
    expect(html).toContain('name="dateFilter"');
    expect(html).toContain('data-widget-page="1"');
    expect(html).toContain('data-widget-page="3"');
    expect(html).toContain('Aces');
  });

  it('renders bracket widgets with winners and losers lanes', async () => {
    const req = new NextRequest('http://localhost/embed/scsoccer/brackets?divisionId=open');

    const res = await getWidget(req, { params: Promise.resolve({ slug: 'scsoccer', kind: 'brackets' }) });
    const html = await res.text();

    expect(getPublicBracketWidgetPageMock).toHaveBeenCalledWith('scsoccer', {
      page: 1,
      dateRule: 'all',
      eventIds: [],
      divisionId: 'open',
    });
    expect(html).toContain('Bracket view');
    expect(html).toContain('Winners Bracket');
    expect(html).toContain('Losers Bracket');
    expect(html).toContain('Round 1');
    expect(html).toContain('Court 1');
    expect(html).toContain('Aces');
    expect(html).toContain('Bumpers');
  });

  it('renders open-registration team cards as public registration links', async () => {
    getPublicOrganizationCatalogMock.mockResolvedValue({
      ...catalog,
      teams: [
        {
          id: 'team_open',
          name: 'Fusion Volleyball Club',
          sport: 'Indoor Volleyball',
          division: 'Open',
          imageUrl: '/team.png',
          currentSize: 3,
          teamSize: 6,
          isFull: false,
          openRegistration: true,
          registrationPriceCents: 2500,
          registrationUrl: '/o/scsoccer/teams/team_open',
        },
      ],
    });
    const req = new NextRequest('http://localhost/embed/scsoccer/teams?teamOpenRegistrationOnly=1');

    const res = await getWidget(req, { params: Promise.resolve({ slug: 'scsoccer', kind: 'teams' }) });
    const html = await res.text();

    expect(html).toContain('href="/o/scsoccer/teams/team_open"');
    expect(html).toContain('3/6 full');
    expect(html).toContain('Open registration - $25.00');
    expect(html).toContain('Join team');
  });

  it('renders full teams without a registration link', async () => {
    getPublicOrganizationCatalogMock.mockResolvedValue({
      ...catalog,
      teams: [
        {
          id: 'team_full',
          name: 'Packed House',
          sport: 'Indoor Volleyball',
          division: 'Open',
          imageUrl: '/team.png',
          currentSize: 6,
          teamSize: 6,
          isFull: true,
          openRegistration: true,
          registrationPriceCents: 2500,
          registrationUrl: null,
        },
      ],
    });
    const req = new NextRequest('http://localhost/embed/scsoccer/teams');

    const res = await getWidget(req, { params: Promise.resolve({ slug: 'scsoccer', kind: 'teams' }) });
    const html = await res.text();

    expect(html).not.toContain('href="/o/scsoccer/teams/team_full"');
    expect(html).toContain('6/6 full');
    expect(html).toContain('Team full');
  });
});
