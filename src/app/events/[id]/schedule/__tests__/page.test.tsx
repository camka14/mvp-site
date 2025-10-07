import { renderWithMantine } from '../../../../../../test/utils/renderWithMantine';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import LeagueSchedulePage from '../page';
import { eventService } from '@/lib/eventService';
import type { Field, Match } from '@/types';
import { buildTeam } from '../../../../../../test/factories';

const useSearchParamsMock = jest.fn();

jest.mock('next/navigation', () => ({
  useParams: jest.fn(() => ({ id: 'event_1' })),
  useRouter: jest.fn(() => ({ push: jest.fn() })),
  usePathname: jest.fn(() => '/events/event_1/schedule'),
  useSearchParams: () => useSearchParamsMock(),
}));

const useAppMock = jest.fn();
jest.mock('@/app/providers', () => ({ useApp: () => useAppMock() }));

jest.mock('@/app/appwrite', () => {
  const { createAppwriteModuleMock } = require('../../../../../../test/mocks/appwrite');
  return createAppwriteModuleMock();
});

jest.mock('@/components/layout/Navigation', () => () => <div data-testid="navigation" />);

jest.mock('@/lib/eventService', () => ({
  eventService: {
    getEventWithRelations: jest.fn(),
    deleteEvent: jest.fn(),
  },
}));

jest.mock('@/lib/leagueService', () => ({
  leagueService: {
    deleteMatchesByEvent: jest.fn(),
    deleteWeeklySchedulesForEvent: jest.fn(),
  },
}));

jest.mock('../components/LeagueCalendarView', () => {
  return function MockCalendarView({ matches, onMatchClick, canManage }: any) {
    return (
      <div data-testid="league-calendar">
        <span>Calendar View</span>
        {canManage && matches?.length > 0 && (
          <button type="button" onClick={() => onMatchClick?.(matches[0])}>
            Edit First Match
          </button>
        )}
      </div>
    );
  };
});

jest.mock('../components/TournamentBracketView', () => () => <div data-testid="bracket-view" />);

const mockMatch: Match = {
  $id: 'match_1',
  eventId: 'event_1',
  start: new Date(Date.now() + 26 * 60 * 60 * 1000).toISOString(),
  end: new Date(Date.now() + 28 * 60 * 60 * 1000).toISOString(),
  team1Seed: 1,
  team2Seed: 2,
  team1Points: [],
  team2Points: [],
  setResults: [],
  field: {
    $id: 'field_1',
    name: 'Court A',
    fieldNumber: 1,
    type: 'indoor',
    location: 'Sports Center',
    lat: 0,
    long: 0,
  } as Field,
  team1: buildTeam({ $id: 'team_a', name: 'Aces' }),
  team2: buildTeam({ $id: 'team_b', name: 'Diggers' }),
};

describe('League schedule page', () => {
  beforeEach(() => {
    useSearchParamsMock.mockReset();
    useAppMock.mockReturnValue({
      user: { $id: 'host_1' },
      isAuthenticated: true,
      isGuest: false,
      loading: false,
    });

    useSearchParamsMock.mockReturnValue({
      get: (key: string) => {
        if (key === 'mode') return null;
        if (key === 'preview') return null;
        return null;
      },
    });

    jest.clearAllMocks();

    (eventService.getEventWithRelations as jest.Mock).mockResolvedValue({
      $id: 'event_1',
      name: 'Summer League',
      eventType: 'league',
      status: 'draft',
      start: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      end: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      location: 'Sports Center',
      hostId: 'host_1',
      teams: [
        buildTeam({ $id: 'team_a', name: 'Aces' }),
        buildTeam({ $id: 'team_b', name: 'Diggers' }),
      ],
      fields: [
        { $id: 'field_1', name: 'Court A', fieldNumber: 1, type: 'indoor', location: '', lat: 0, long: 0 },
      ],
      timeSlots: [],
      matches: [mockMatch],
    });
  });

  it('renders schedule information', async () => {
    renderWithMantine(<LeagueSchedulePage />);

    await waitFor(() => {
      expect(screen.getByText(/Summer League/)).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByTestId('league-calendar')).toBeInTheDocument();
    });
    expect(screen.queryByText(/Edit Match/)).not.toBeInTheDocument();
  });

  it('allows host to open match editor when in edit mode', async () => {
    useSearchParamsMock.mockReturnValue({
      get: (key: string) => {
        if (key === 'mode') return 'edit';
        if (key === 'preview') return null;
        return null;
      },
    });

    renderWithMantine(<LeagueSchedulePage />);

    await waitFor(() => {
      expect(screen.getByText(/Summer League/)).toBeInTheDocument();
    });

    const editButton = await screen.findByRole('button', { name: /edit first match/i });
    fireEvent.click(editButton);

    expect(await screen.findByText(/Edit Match/)).toBeInTheDocument();
  });
});
