import { renderWithMantine } from '../../../../../../test/utils/renderWithMantine';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import LeagueSchedulePage from '../page';
import { eventService } from '@/lib/eventService';
import { leagueService } from '@/lib/leagueService';
import { formatLocalDateTime } from '@/lib/dateUtils';
import type { Field, Match } from '@/types';
import { buildTeam } from '../../../../../../test/factories';

const useSearchParamsMock = jest.fn();
const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
};

jest.mock('next/navigation', () => ({
  useParams: jest.fn(() => ({ id: 'event_1' })),
  useRouter: jest.fn(() => mockRouter),
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
    deleteUnpublishedEvent: jest.fn(),
    updateEvent: jest.fn(),
    createEvent: jest.fn(),
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

jest.mock('@/app/hooks/useSports', () => {
  const { createSport } = require('@/types/defaults');
  return {
    useSports: () => {
      const sport = createSport({ $id: 'volleyball', name: 'Volleyball' });
      return {
        sports: [sport],
        sportsById: new Map([[sport.$id, sport]]),
        sportsByName: new Map([[sport.name.toLowerCase(), sport]]),
        loading: false,
        error: null,
      };
    },
  };
});

const mockMatch: Match = {
  $id: 'match_1',
  start: formatLocalDateTime(new Date(Date.now() + 26 * 60 * 60 * 1000)),
  end: formatLocalDateTime(new Date(Date.now() + 28 * 60 * 60 * 1000)),
  team1Seed: 1,
  team2Seed: 2,
  team1Points: [],
  team2Points: [],
  setResults: [],
  field: {
    $id: 'field_1',
    name: 'Court A',
    fieldNumber: 1,
    type: 'INDOOR',
    location: 'Sports Center',
    lat: 0,
    long: 0,
  } as Field,
  team1: buildTeam({ $id: 'team_a', name: 'Aces' }),
  team2: buildTeam({ $id: 'team_b', name: 'Diggers' }),
};

describe('League schedule page', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useSearchParamsMock.mockReset();
    mockRouter.push.mockReset();
    mockRouter.replace.mockReset();
    mockRouter.back.mockReset();
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
      eventType: 'LEAGUE',
      state: 'PUBLISHED',
      status: 'draft',
      start: formatLocalDateTime(new Date(Date.now() + 24 * 60 * 60 * 1000)),
      end: formatLocalDateTime(new Date(Date.now() + 48 * 60 * 60 * 1000)),
      location: 'Sports Center',
      hostId: 'host_1',
      teams: [
        buildTeam({ $id: 'team_a', name: 'Aces' }),
        buildTeam({ $id: 'team_b', name: 'Diggers' }),
      ],
      fields: [
        { $id: 'field_1', name: 'Court A', fieldNumber: 1, type: 'INDOOR', location: '', lat: 0, long: 0 },
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

  it('deletes unpublished events via eventService when cancelling preview', async () => {
    useSearchParamsMock.mockReturnValue({
      get: (key: string) => {
        if (key === 'mode') return null;
        if (key === 'preview') return '1';
        return null;
      },
    });

    (eventService.getEventWithRelations as jest.Mock).mockResolvedValue({
      $id: 'event_1',
      name: 'Summer League',
      eventType: 'LEAGUE',
      state: 'UNPUBLISHED',
      status: 'draft',
      start: formatLocalDateTime(new Date(Date.now() + 24 * 60 * 60 * 1000)),
      end: formatLocalDateTime(new Date(Date.now() + 48 * 60 * 60 * 1000)),
      location: 'Sports Center',
      hostId: 'host_1',
      fields: [
        { $id: 'field_1', name: 'Court A', fieldNumber: 1, type: 'INDOOR', location: '', lat: 0, long: 0 },
      ],
      matches: [mockMatch],
      timeSlots: [],
    });

    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);

    renderWithMantine(<LeagueSchedulePage />);

    await waitFor(() => {
      expect(screen.getByText(/Summer League/)).toBeInTheDocument();
    });

    const cancelButton = await screen.findByRole('button', { name: /cancel league preview/i });
    fireEvent.click(cancelButton);

    await waitFor(() => {
      expect(eventService.deleteUnpublishedEvent).toHaveBeenCalledWith(
        expect.objectContaining({ $id: 'event_1' })
      );
    });

    expect(eventService.deleteEvent).not.toHaveBeenCalled();
    expect(leagueService.deleteMatchesByEvent).not.toHaveBeenCalled();
    expect(leagueService.deleteWeeklySchedulesForEvent).not.toHaveBeenCalled();
    expect(eventService.getEventWithRelations).toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('publishes an unpublished league by updating state and related data', async () => {
    (eventService.getEventWithRelations as jest.Mock).mockResolvedValue({
      $id: 'event_unpublished',
      name: 'Draft League',
      eventType: 'LEAGUE',
      state: 'UNPUBLISHED',
      status: 'draft',
      attendees: 12,
      start: formatLocalDateTime(new Date(Date.now() + 24 * 60 * 60 * 1000)),
      end: formatLocalDateTime(new Date(Date.now() + 48 * 60 * 60 * 1000)),
      location: 'Sports Center',
      hostId: 'host_1',
      teams: [
        buildTeam({ $id: 'team_a', name: 'Aces' }),
        buildTeam({ $id: 'team_b', name: 'Diggers' }),
      ],
      fields: [
        {
          $id: 'field_1',
          name: 'Court A',
          fieldNumber: 1,
          type: 'INDOOR',
          location: '',
          lat: 0,
          long: 0,
          rentalSlotIds: ['rental_1'],
          rentalSlots: [
            {
              $id: 'rental_1',
              dayOfWeek: 0,
              startTimeMinutes: 480,
              endTimeMinutes: 540,
              repeating: true,
            },
          ],
        },
      ],
      matches: [
        {
          ...mockMatch,
          $id: 'match_publish',
          field: {
            $id: 'field_1',
            name: 'Court A',
            fieldNumber: 1,
            type: 'INDOOR',
            location: '',
            lat: 0,
            long: 0,
          } as Field,
        },
      ],
      timeSlots: [
        {
          $id: 'slot_1',
          dayOfWeek: 1,
          startTimeMinutes: 600,
          endTimeMinutes: 660,
          repeating: true,
          event: 'event_unpublished',
        },
      ],
    });

    (eventService.updateEvent as jest.Mock).mockImplementation((_id: string, payload: any) =>
      Promise.resolve({
        ...payload,
        $id: 'event_unpublished',
        state: 'PUBLISHED',
      }),
    );

    renderWithMantine(<LeagueSchedulePage />);

    const publishButton = await screen.findByRole('button', { name: /publish league/i });
    fireEvent.click(publishButton);

    await waitFor(() => {
      expect(eventService.updateEvent).toHaveBeenCalledTimes(1);
    });

    const [, payload] = (eventService.updateEvent as jest.Mock).mock.calls[0];
    expect(payload.state).toBe('PUBLISHED');
    expect(payload.matches).toHaveLength(1);
    expect(payload.timeSlots).toHaveLength(1);
    expect(payload.fields?.[0]?.rentalSlotIds).toBeUndefined();
    expect(payload).not.toHaveProperty('attendees');
    expect(eventService.createEvent).not.toHaveBeenCalled();
  });
});
