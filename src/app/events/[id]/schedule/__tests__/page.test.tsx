import { renderWithMantine } from '../../../../../../test/utils/renderWithMantine';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import LeagueSchedulePage from '../page';
import { apiRequest } from '@/lib/apiClient';
import { eventService } from '@/lib/eventService';
import { leagueService } from '@/lib/leagueService';
import { organizationService } from '@/lib/organizationService';
import { formatLocalDateTime } from '@/lib/dateUtils';

jest.setTimeout(20000);

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

jest.mock('@/lib/apiClient', () => ({
  apiRequest: jest.fn(),
}));

jest.mock('@/components/layout/Navigation', () => {
  function MockNavigation() {
    return <div data-testid="navigation" />;
  }
  MockNavigation.displayName = 'MockNavigation';
  return {
    __esModule: true,
    default: MockNavigation,
  };
});

jest.mock('@/lib/eventService', () => ({
  eventService: {
    getEventWithRelations: jest.fn(),
    deleteEvent: jest.fn(),
    deleteUnpublishedEvent: jest.fn(),
    updateEvent: jest.fn(),
    createEvent: jest.fn(),
    scheduleEvent: jest.fn(),
  },
}));

jest.mock('@/lib/leagueService', () => ({
  leagueService: {
    deleteMatchesByEvent: jest.fn(),
    deleteWeeklySchedulesForEvent: jest.fn(),
  },
}));

jest.mock('@/lib/organizationService', () => ({
  organizationService: {
    getOrganizationById: jest.fn(),
  },
}));

let capturedEventFormProps: any = null;
let mockEventFormDraft: any = null;
let mockEventFormValidateResult = true;
jest.mock('../components/EventForm', () => {
  const React = require('react');
  const { forwardRef, useEffect, useImperativeHandle } = React;
  const MockEventForm = forwardRef(function MockEventForm(props: any, ref: any) {
    useEffect(() => {
      capturedEventFormProps = props;
    }, [props]);

    useImperativeHandle(ref, () => ({
      getDraft: () => mockEventFormDraft ?? props.event ?? {},
      validate: async () => mockEventFormValidateResult,
    }));
    return <div data-testid="event-form" />;
  });
  MockEventForm.displayName = 'MockEventForm';
  return {
    __esModule: true,
    default: MockEventForm,
  };
});

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

jest.mock('../components/TournamentBracketView', () => {
  function MockTournamentBracketView() {
    return <div data-testid="bracket-view" />;
  }
  MockTournamentBracketView.displayName = 'MockTournamentBracketView';
  return {
    __esModule: true,
    default: MockTournamentBracketView,
  };
});

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

const scheduleFixture = require('../../../../../../test/fixtures/api/schedule.json');
const apiRequestMock = apiRequest as jest.MockedFunction<typeof apiRequest>;

const buildApiEvent = (overrides: Record<string, any> = {}) => {
  const event = JSON.parse(JSON.stringify(scheduleFixture.event));
  return { ...event, ...overrides };
};

describe('League schedule page', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useSearchParamsMock.mockReset();
    mockRouter.push.mockReset();
    mockRouter.replace.mockReset();
    mockRouter.back.mockReset();
    capturedEventFormProps = null;
    mockEventFormDraft = null;
    mockEventFormValidateResult = true;
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

    // Mirror production behavior:
    // - `GET /api/events/:id` returns an event row without embedded matches
    // - matches are loaded via `GET /api/events/:id/matches`
    apiRequestMock.mockImplementation((path: string) => {
      if (path === '/api/events/event_1') {
        const event = buildApiEvent();
        delete (event as any).matches;
        return Promise.resolve({ event });
      }
      if (path === '/api/events/event_1/matches') {
        return Promise.resolve({ matches: buildApiEvent().matches });
      }
      return Promise.resolve({});
    });
  });

  it('renders schedule information', async () => {
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

    await waitFor(() => {
      expect(screen.getByTestId('league-calendar')).toBeInTheDocument();
    });
    expect(screen.queryByText(/Edit Match/)).not.toBeInTheDocument();
    expect(capturedEventFormProps?.event?.$id).toBe('event_1');
    expect(capturedEventFormProps?.event?.matches?.[0]?.$id).toBe('match_1');
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

    apiRequestMock.mockResolvedValue({
      event: buildApiEvent({ state: 'UNPUBLISHED' }),
    });

    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);

    renderWithMantine(<LeagueSchedulePage />);

    await waitFor(() => {
      expect(screen.getByText(/Summer League/)).toBeInTheDocument();
    });

    const cancelButton = await screen.findByRole('button', { name: /delete league/i });
    fireEvent.click(cancelButton);

    await waitFor(() => {
      expect(eventService.deleteUnpublishedEvent).toHaveBeenCalledWith(
        expect.objectContaining({ $id: 'event_1' })
      );
    });

    expect(eventService.deleteEvent).not.toHaveBeenCalled();
    expect(leagueService.deleteMatchesByEvent).not.toHaveBeenCalled();
    expect(leagueService.deleteWeeklySchedulesForEvent).not.toHaveBeenCalled();
    expect(apiRequestMock).toHaveBeenCalledWith('/api/events/event_1');
    confirmSpy.mockRestore();
  });

  it('publishes an unpublished league by updating state and related data', async () => {
    useSearchParamsMock.mockReturnValue({
      get: (key: string) => {
        if (key === 'preview') return '1';
        if (key === 'mode') return null;
        return null;
      },
    });

    const baseEvent = buildApiEvent({
      id: 'event_unpublished',
      name: 'Draft League',
      state: 'UNPUBLISHED',
      attendees: 12,
      fields: [
        {
          id: 'field_1',
          name: 'Court A',
          fieldNumber: 1,
          type: 'INDOOR',
          location: '',
          lat: 0,
          long: 0,
          rentalSlotIds: ['rental_1'],
          rentalSlots: [
            {
              id: 'rental_1',
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
          ...buildApiEvent().matches[0],
          id: 'match_publish',
          field: {
            id: 'field_1',
            name: 'Court A',
            fieldNumber: 1,
            type: 'INDOOR',
            location: '',
            lat: 0,
            long: 0,
          },
        },
      ],
      timeSlots: [
        {
          id: 'slot_1',
          dayOfWeek: 1,
          startTimeMinutes: 600,
          endTimeMinutes: 660,
          repeating: true,
          event: 'event_unpublished',
        },
      ],
    });

    apiRequestMock.mockResolvedValue({ event: baseEvent });

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

  it('blocks create publish when form validation fails (for example missing playoff team count)', async () => {
    useSearchParamsMock.mockReturnValue({
      get: (key: string) => {
        if (key === 'create') return '1';
        if (key === 'mode') return 'edit';
        return null;
      },
    });
    mockEventFormValidateResult = false;

    renderWithMantine(<LeagueSchedulePage />);

    const publishButton = await screen.findByRole('button', { name: /create event/i });
    fireEvent.click(publishButton);

    await waitFor(() => {
      expect(eventService.scheduleEvent).not.toHaveBeenCalled();
    });
    expect(eventService.scheduleEvent).not.toHaveBeenCalled();
    expect(eventService.createEvent).not.toHaveBeenCalled();
    expect(eventService.updateEvent).not.toHaveBeenCalled();
  });

  it('normalizes create payload with multi-day slots and field divisions before schedule preview', async () => {
    useSearchParamsMock.mockReturnValue({
      get: (key: string) => {
        if (key === 'create') return '1';
        if (key === 'mode') return 'edit';
        return null;
      },
    });

    mockEventFormDraft = {
      $id: 'event_create_league',
      name: 'Create League',
      description: '',
      location: 'Main Gym',
      coordinates: [-83.0, 42.0],
      start: '2026-01-05T09:00:00.000',
      end: '2026-01-05T09:00:00.000',
      eventType: 'LEAGUE',
      sportId: 'volleyball',
      fieldType: 'INDOOR',
      price: 0,
      maxParticipants: 8,
      teamSizeLimit: 2,
      teamSignup: true,
      singleDivision: true,
      divisions: ['open'],
      cancellationRefundHours: 24,
      registrationCutoffHours: 2,
      requiredTemplateIds: [],
      imageId: 'image_1',
      seedColor: 0,
      waitListIds: [],
      freeAgentIds: [],
      refereeIds: [],
      fields: [
        {
          $id: 'field_local_1',
          name: 'Court A',
          fieldNumber: 1,
          type: 'INDOOR',
          location: '',
          lat: 0,
          long: 0,
          divisions: ['open'],
        },
      ],
      timeSlots: [
        {
          $id: 'slot_multi',
          dayOfWeek: 1,
          daysOfWeek: [1, 3],
          startTimeMinutes: 540,
          endTimeMinutes: 600,
          repeating: true,
          scheduledFieldId: 'field_local_1',
        },
      ],
      gamesPerOpponent: 1,
      includePlayoffs: true,
      playoffTeamCount: 4,
      usesSets: false,
      matchDurationMinutes: 60,
      restTimeMinutes: 0,
    };

    (eventService.scheduleEvent as jest.Mock).mockResolvedValue({
      event: buildApiEvent({
        id: 'event_create_league',
        $id: 'event_create_league',
        eventType: 'LEAGUE',
      }),
      preview: false,
    });

    renderWithMantine(<LeagueSchedulePage />);

    const publishButton = await screen.findByRole('button', { name: /create event/i });
    fireEvent.click(publishButton);

    await waitFor(() => {
      expect(eventService.scheduleEvent).toHaveBeenCalledTimes(1);
    });

    const [payload] = (eventService.scheduleEvent as jest.Mock).mock.calls[0];
    expect(payload?.timeSlots?.[0]).toMatchObject({
      dayOfWeek: 1,
      daysOfWeek: [1, 3],
      scheduledFieldId: 'field_local_1',
    });
    expect(payload?.fields?.[0]?.divisions).toEqual(['open']);
  });

  it('does not pass a host organization when creating a rental as self', async () => {
    const start = formatLocalDateTime(new Date());
    const end = formatLocalDateTime(new Date(Date.now() + 60 * 60 * 1000));

    useSearchParamsMock.mockReturnValue({
      get: (key: string) => {
        if (key === 'create') return '1';
        if (key === 'rentalStart') return start;
        if (key === 'rentalEnd') return end;
        if (key === 'rentalFieldId') return 'field_1';
        if (key === 'rentalOrgId') return 'org_rental';
        if (key === 'rentalRequiredTemplateIds') return 'tmpl_waiver,tmpl_release';
        if (key === 'mode') return 'edit';
        return null;
      },
    });

    (organizationService.getOrganizationById as jest.Mock).mockResolvedValue({
      $id: 'org_rental',
      name: 'Rental Org',
      fields: [],
    });

    renderWithMantine(<LeagueSchedulePage />);

    await waitFor(() => {
      expect(screen.getByTestId('event-form')).toBeInTheDocument();
    });

    expect(capturedEventFormProps?.organization).toBeNull();
    expect(capturedEventFormProps?.immutableDefaults?.requiredTemplateIds).toEqual([
      'tmpl_waiver',
      'tmpl_release',
    ]);
  });
});
