import { renderWithMantine } from '../../../../../../test/utils/renderWithMantine';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import LeagueSchedulePage from '../page';
import { apiRequest } from '@/lib/apiClient';
import { eventService } from '@/lib/eventService';
import { leagueService } from '@/lib/leagueService';
import { organizationService } from '@/lib/organizationService';
import { formatLocalDateTime } from '@/lib/dateUtils';
import { buildEventDivisionId } from '@/lib/divisionTypes';

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
    getEvent: jest.fn(),
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
let mockEventFormDirtyState = false;
let mockCommitDirtyBaseline = jest.fn();
let mockValidatePendingStaffAssignments = jest.fn();
let mockSubmitPendingStaffInvites = jest.fn();
jest.mock('../components/EventForm', () => {
  const React = require('react');
  const { forwardRef, useEffect, useImperativeHandle, useState } = React;
  const MockEventForm = forwardRef(function MockEventForm(props: any, ref: any) {
    capturedEventFormProps = props;
    const [mockInputValue, setMockInputValue] = useState('');
    const [isDirty, setIsDirty] = useState(mockEventFormDirtyState);
    useEffect(() => {
      props.onDirtyStateChange?.(isDirty);
    }, [isDirty, props]);

    useEffect(() => () => {
      props.onDirtyStateChange?.(false);
    }, [props]);

    useImperativeHandle(ref, () => ({
      getDraft: () => mockEventFormDraft ?? props.event ?? {},
      validate: async () => mockEventFormValidateResult,
      validatePendingStaffAssignments: async () => mockValidatePendingStaffAssignments(),
      commitDirtyBaseline: () => mockCommitDirtyBaseline(),
      submitPendingStaffInvites: (eventId: string) => mockSubmitPendingStaffInvites(eventId),
    }));
    return (
      <div data-testid="event-form">
        <input
          aria-label="Mock Event Form Input"
          value={mockInputValue}
          onChange={(event) => {
            setMockInputValue(event.currentTarget.value);
            setIsDirty(event.currentTarget.value.trim().length > 0);
          }}
        />
      </div>
    );
  });
  MockEventForm.displayName = 'MockEventForm';
  return {
    __esModule: true,
    default: MockEventForm,
  };
});

jest.mock('../components/LeagueCalendarView', () => {
  return function MockCalendarView({ matches, onMatchClick, canManage, conflictMatchIdsById }: any) {
    return (
      <div data-testid="league-calendar">
        <span>Calendar View</span>
        {Array.isArray(matches) && matches.map((match) => (
          <span key={match?.$id ?? match?.id ?? 'unknown'} data-testid={`calendar-match-${match?.$id ?? match?.id ?? 'unknown'}`}>
            {match?.$id ?? match?.id ?? 'unknown'}
          </span>
        ))}
        <span data-testid="calendar-conflict-count">{Object.keys(conflictMatchIdsById ?? {}).length}</span>
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
    mockEventFormDirtyState = false;
    mockCommitDirtyBaseline = jest.fn();
    mockValidatePendingStaffAssignments = jest.fn();
    mockSubmitPendingStaffInvites = jest.fn();
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
    apiRequestMock.mockReset();
    (eventService.getEvent as jest.Mock).mockReset();
    (eventService.getEventWithRelations as jest.Mock).mockReset();
    (eventService.deleteEvent as jest.Mock).mockReset();
    (eventService.deleteUnpublishedEvent as jest.Mock).mockReset();
    (eventService.updateEvent as jest.Mock).mockReset();
    (eventService.createEvent as jest.Mock).mockReset();
    (eventService.scheduleEvent as jest.Mock).mockReset();
    (leagueService.deleteMatchesByEvent as jest.Mock).mockReset();
    (leagueService.deleteWeeklySchedulesForEvent as jest.Mock).mockReset();
    (organizationService.getOrganizationById as jest.Mock).mockReset();

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
    (eventService.getEvent as jest.Mock).mockImplementation(async () => {
      const event = buildApiEvent();
      delete (event as any).matches;
      return event;
    });
    (eventService.getEventWithRelations as jest.Mock).mockResolvedValue(undefined);
    (organizationService.getOrganizationById as jest.Mock).mockResolvedValue(undefined);
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

  it('keeps the create button enabled in create mode when a seeded draft has no pending changes', async () => {
    useSearchParamsMock.mockReturnValue({
      get: (key: string) => {
        if (key === 'create') return '1';
        if (key === 'mode') return null;
        if (key === 'preview') return null;
        if (key === 'templateId') return null;
        if (key === 'skipTemplatePrompt') return '1';
        return null;
      },
    });

    renderWithMantine(<LeagueSchedulePage />);

    await waitFor(() => {
      expect(screen.getByTestId('event-form')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Create Event' })).toBeEnabled();
    });
  });

  it('enables Save when the event form reports unsaved changes', async () => {
    useSearchParamsMock.mockReturnValue({
      get: (key: string) => {
        if (key === 'mode') return 'edit';
        if (key === 'preview') return null;
        return null;
      },
    });

    const baseEvent = buildApiEvent({
      id: 'event_1',
      $id: 'event_1',
      state: 'UNPUBLISHED',
      organizationId: 'org_1',
      hostId: 'host_1',
      assistantHostIds: [],
      officialIds: ['official_1'],
    });

    apiRequestMock.mockImplementation((path: string) => {
      if (path === '/api/events/event_1') {
        const event = { ...baseEvent };
        delete (event as any).matches;
        return Promise.resolve({ event });
      }
      if (path === '/api/events/event_1/matches') {
        return Promise.resolve({ matches: [] });
      }
      return Promise.resolve({});
    });

    mockEventFormDirtyState = true;

    renderWithMantine(<LeagueSchedulePage />);

    const saveButton = await screen.findByRole('button', { name: /^save$/i });
    await waitFor(() => {
      expect(saveButton).toBeEnabled();
    });
  });

  it('updates tracked changes when a form value changes', async () => {
    useSearchParamsMock.mockReturnValue({
      get: (key: string) => {
        if (key === 'mode') return 'edit';
        if (key === 'preview') return null;
        return null;
      },
    });

    renderWithMantine(<LeagueSchedulePage />);

    const saveButton = await screen.findByRole('button', { name: /^save$/i });
    expect(saveButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Mock Event Form Input'), {
      target: { value: 'updated value' },
    });

    await waitFor(() => {
      expect(saveButton).toBeEnabled();
    });
  });

  it('shows the send notification action next to the event title for managers', async () => {
    useSearchParamsMock.mockReturnValue({
      get: (key: string) => {
        if (key === 'mode') return null;
        if (key === 'preview') return null;
        return null;
      },
    });

    renderWithMantine(<LeagueSchedulePage />);

    const notifyButton = await screen.findByLabelText(/send notification/i);
    expect(notifyButton).toBeInTheDocument();

    fireEvent.click(notifyButton);
    const dialog = await screen.findByRole('dialog', { name: /send notification/i });
    const scoped = within(dialog);
    expect(scoped.getByLabelText(/title/i)).toBeInTheDocument();
    expect(scoped.getByLabelText(/message/i)).toBeInTheDocument();
    expect(scoped.getByLabelText(/^managers$/i)).toBeInTheDocument();
    expect(scoped.getByLabelText(/^players$/i)).toBeInTheDocument();
    expect(scoped.getByLabelText(/^parents \(of players\)$/i)).toBeInTheDocument();
    expect(scoped.getByLabelText(/^officials$/i)).toBeInTheDocument();
    expect(scoped.getByLabelText(/^hosts$/i)).toBeInTheDocument();
  });

  it('includes playoff matches in the league schedule tab', async () => {
    useSearchParamsMock.mockReturnValue({
      get: (key: string) => {
        if (key === 'mode') return 'edit';
        if (key === 'preview') return null;
        return null;
      },
    });

    const regularDivisionId = buildEventDivisionId('event_1', 'open');
    const playoffDivisionId = buildEventDivisionId('event_1', 'open_playoff');
    const baseEvent = buildApiEvent({
      eventType: 'LEAGUE',
      includePlayoffs: true,
      divisions: [regularDivisionId, playoffDivisionId],
      divisionDetails: [
        {
          id: regularDivisionId,
          key: 'open',
          name: 'Open',
          kind: 'LEAGUE',
          teamIds: [],
        },
        {
          id: playoffDivisionId,
          key: 'open_playoff',
          name: 'Open Playoff',
          kind: 'PLAYOFF',
          teamIds: [],
        },
      ],
      playoffDivisionDetails: [
        {
          id: playoffDivisionId,
          key: 'open_playoff',
          name: 'Open Playoff',
          kind: 'PLAYOFF',
          teamIds: [],
        },
      ],
    });

    const matchTemplate = buildApiEvent().matches?.[0] ?? {};
    const regularMatch = {
      ...matchTemplate,
      $id: 'match_regular',
      id: 'match_regular',
      division: regularDivisionId,
      previousLeftId: null,
      previousRightId: null,
      winnerNextMatchId: null,
      loserNextMatchId: null,
    };
    const playoffMatch = {
      ...matchTemplate,
      $id: 'match_playoff',
      id: 'match_playoff',
      division: playoffDivisionId,
      previousLeftId: 'match_seed_left',
      previousRightId: 'match_seed_right',
      winnerNextMatchId: null,
      loserNextMatchId: null,
    };

    apiRequestMock.mockImplementation((path: string) => {
      if (path === '/api/events/event_1') {
        const event = { ...baseEvent };
        delete (event as any).matches;
        return Promise.resolve({ event });
      }
      if (path === '/api/events/event_1/matches') {
        return Promise.resolve({ matches: [regularMatch, playoffMatch] });
      }
      return Promise.resolve({});
    });

    renderWithMantine(<LeagueSchedulePage />);

    await waitFor(() => {
      expect(screen.getByText(/Summer League/)).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByTestId('calendar-match-match_regular')).toBeInTheDocument();
      expect(screen.getByTestId('calendar-match-match_playoff')).toBeInTheDocument();
    });
  });

  it('shows the load error message below the try again button', async () => {
    apiRequestMock.mockRejectedValue(new Error('Network down'));

    renderWithMantine(<LeagueSchedulePage />);

    const retryButton = await screen.findByRole('button', { name: /try again/i });
    const errorMessage = await screen.findByText('Failed to load league schedule. Please try again.');
    expect(retryButton.compareDocumentPosition(errorMessage)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('hydrates league scoring config details from leagueScoringConfigId on load', async () => {
    useSearchParamsMock.mockReturnValue({
      get: (key: string) => {
        if (key === 'mode') return 'edit';
        if (key === 'preview') return null;
        return null;
      },
    });

    apiRequestMock.mockImplementation((path: string) => {
      if (path === '/api/events/event_1') {
        const event = buildApiEvent({
          eventType: 'LEAGUE',
          leagueScoringConfigId: 'cfg_1',
        });
        delete (event as any).leagueScoringConfig;
        delete (event as any).matches;
        return Promise.resolve({ event });
      }
      if (path === '/api/league-scoring-configs/cfg_1') {
        return Promise.resolve({
          $id: 'cfg_1',
          pointsForWin: 5,
          pointsForDraw: 2,
          pointsForLoss: 0,
        });
      }
      if (path === '/api/events/event_1/matches') {
        return Promise.resolve({ matches: buildApiEvent().matches });
      }
      return Promise.resolve({});
    });

    renderWithMantine(<LeagueSchedulePage />);

    await waitFor(() => {
      expect(capturedEventFormProps?.event?.leagueScoringConfig?.$id).toBe('cfg_1');
    });
    expect(capturedEventFormProps?.event?.leagueScoringConfig?.pointsForWin).toBe(5);
    expect(apiRequestMock).toHaveBeenCalledWith('/api/league-scoring-configs/cfg_1');
  });

  it('hydrates time slots (and slot-derived fields) when event payload only includes timeSlotIds', async () => {
    useSearchParamsMock.mockReturnValue({
      get: (key: string) => {
        if (key === 'mode') return 'edit';
        if (key === 'preview') return null;
        return null;
      },
    });

    apiRequestMock.mockImplementation((path: string) => {
      if (path === '/api/events/event_1') {
        const event = buildApiEvent({
          timeSlots: [],
          timeSlotIds: ['slot_1'],
          fields: [],
          fieldIds: [],
        });
        delete (event as any).matches;
        return Promise.resolve({ event });
      }
      if (path === '/api/time-slots?ids=slot_1') {
        return Promise.resolve({
          timeSlots: [
            {
              id: 'slot_1',
              dayOfWeek: 2,
              daysOfWeek: [2],
              startTimeMinutes: 540,
              endTimeMinutes: 600,
              repeating: true,
              scheduledFieldId: 'field_slot_1',
              divisions: ['open'],
            },
          ],
        });
      }
      if (path === '/api/fields?ids=field_slot_1') {
        return Promise.resolve({
          fields: [
            {
              id: 'field_slot_1',
              name: 'Court A',
              fieldNumber: 1,
              location: '',
              lat: 0,
              long: 0,
            },
          ],
        });
      }
      if (path === '/api/events/event_1/matches') {
        return Promise.resolve({ matches: buildApiEvent().matches });
      }
      return Promise.resolve({});
    });

    renderWithMantine(<LeagueSchedulePage />);

    await waitFor(() => {
      expect(capturedEventFormProps?.event?.timeSlots?.[0]?.$id).toBe('slot_1');
    });
    expect(capturedEventFormProps?.event?.timeSlots?.[0]?.scheduledFieldIds).toEqual(['field_slot_1']);
    expect(capturedEventFormProps?.event?.fields?.[0]?.$id ?? capturedEventFormProps?.event?.fields?.[0]?.id).toBe('field_slot_1');
  });

  it('uses template wording for template events in edit mode', async () => {
    useSearchParamsMock.mockReturnValue({
      get: (key: string) => {
        if (key === 'mode') return 'edit';
        if (key === 'preview') return null;
        return null;
      },
    });

    apiRequestMock.mockImplementation((path: string) => {
      if (path === '/api/events/event_1') {
        const event = buildApiEvent({
          eventType: 'LEAGUE',
          state: 'TEMPLATE',
        });
        delete (event as any).matches;
        return Promise.resolve({ event });
      }
      if (path === '/api/events/event_1/matches') {
        return Promise.resolve({ matches: buildApiEvent().matches });
      }
      return Promise.resolve({});
    });

    renderWithMantine(<LeagueSchedulePage />);

    expect(await screen.findByRole('button', { name: /^save$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save league/i })).not.toBeInTheDocument();
  });

  it('creates a template from an unsaved create-mode draft', async () => {
    useSearchParamsMock.mockReturnValue({
      get: (key: string) => {
        if (key === 'create') return '1';
        if (key === 'mode') return 'edit';
        return null;
      },
    });

    mockEventFormDraft = {
      ...buildApiEvent({
        id: 'event_unsaved',
        $id: 'event_unsaved',
        name: 'Unsaved League',
        state: 'DRAFT',
        eventType: 'LEAGUE',
      }),
    };

    apiRequestMock.mockImplementation((path: string, options?: unknown) => {
      if (path.startsWith('/api/events?state=TEMPLATE')) {
        return Promise.resolve({ events: [] });
      }
      if (path === '/api/events' && (options as { method?: string } | undefined)?.method === 'POST') {
        const payloadEvent = (
          (options as { body?: { event?: Record<string, unknown> } } | undefined)
            ?.body?.event
        ) ?? {};
        return Promise.resolve({ event: { ...payloadEvent } });
      }
      return Promise.resolve({});
    });

    renderWithMantine(<LeagueSchedulePage />);

    const createTemplateButton = await screen.findByRole('button', { name: /create template/i });
    fireEvent.click(createTemplateButton);

    await waitFor(() => {
      const createCall = apiRequestMock.mock.calls.find(
        ([path, options]) => path === '/api/events' && (options as { method?: string } | undefined)?.method === 'POST',
      );
      expect(createCall).toBeDefined();
    });

    const createCall = apiRequestMock.mock.calls.find(
      ([path, options]) => path === '/api/events' && (options as { method?: string } | undefined)?.method === 'POST',
    );
    const requestBody = (createCall?.[1] as { body?: { id?: string; event?: Record<string, unknown> } } | undefined)?.body;

    expect(requestBody?.id).toBeTruthy();
    expect(requestBody?.event?.state).toBe('TEMPLATE');
    expect(requestBody?.event?.name).toBe('Unsaved League (TEMPLATE)');
    expect(eventService.getEventWithRelations).not.toHaveBeenCalled();
  });

  it('defaults create mode events to single division', async () => {
    useSearchParamsMock.mockReturnValue({
      get: (key: string) => {
        if (key === 'create') return '1';
        if (key === 'mode') return 'edit';
        return null;
      },
    });

    apiRequestMock.mockImplementation((path: string) => {
      if (path.startsWith('/api/events?state=TEMPLATE')) {
        return Promise.resolve({ events: [] });
      }
      return Promise.resolve({});
    });

    renderWithMantine(<LeagueSchedulePage />);

    await waitFor(() => {
      expect(capturedEventFormProps?.event?.eventType).toBe('EVENT');
      expect(capturedEventFormProps?.event?.singleDivision).toBe(true);
    });
  });

  it('shows create action and hides manage action for create mode without edit query', async () => {
    useSearchParamsMock.mockReturnValue({
      get: (key: string) => {
        if (key === 'create') return '1';
        if (key === 'mode') return null;
        return null;
      },
    });

    apiRequestMock.mockImplementation((path: string) => {
      if (path.startsWith('/api/events?state=TEMPLATE')) {
        return Promise.resolve({ events: [] });
      }
      return Promise.resolve({});
    });

    renderWithMantine(<LeagueSchedulePage />);

    await waitFor(() => {
      expect(capturedEventFormProps?.event?.eventType).toBe('EVENT');
    });

    expect(screen.queryByRole('button', { name: /^manage$/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^create event$/i })).toBeInTheDocument();
  });

  it('creates a template from persisted edit data and preserves complex divisions/time slots', async () => {
    useSearchParamsMock.mockReturnValue({
      get: (key: string) => {
        if (key === 'mode') return 'edit';
        if (key === 'preview') return null;
        return null;
      },
    });

    const openSourceDivisionId = buildEventDivisionId('event_1', 'open');
    const advancedSourceDivisionId = buildEventDivisionId('event_1', 'advanced');
    const playoffUpperSourceDivisionId = buildEventDivisionId('event_1', 'playoff_upper');
    const playoffLowerSourceDivisionId = buildEventDivisionId('event_1', 'playoff_lower');

    const persistedEvent = buildApiEvent({
      id: 'event_1',
      $id: 'event_1',
      name: 'Test League',
      state: 'PUBLISHED',
      eventType: 'LEAGUE',
      singleDivision: false,
      splitLeaguePlayoffDivisions: true,
      fieldIds: ['field_local_1', 'field_local_2'],
      divisions: [openSourceDivisionId, advancedSourceDivisionId],
      divisionDetails: [
        {
          id: openSourceDivisionId,
          key: 'open',
          name: 'Open',
          divisionTypeId: 'skill_open_age_18plus',
          divisionTypeName: 'Open \u2022 18+',
          ratingType: 'SKILL',
          gender: 'C',
          ageCutoffDate: '2026-08-01T19:00:00.000Z',
          ageCutoffLabel: 'Age 18+ as of 08/01/2026',
          ageCutoffSource: 'US Youth Soccer seasonal-year age grouping guidance.',
          playoffPlacementDivisionIds: [playoffUpperSourceDivisionId, '', playoffLowerSourceDivisionId],
          teamIds: ['team_a'],
        },
        {
          id: advancedSourceDivisionId,
          key: 'advanced',
          name: 'Advanced',
          divisionTypeId: 'skill_premier_age_u17',
          divisionTypeName: 'Premier \u2022 U17',
          ratingType: 'SKILL',
          gender: 'C',
          ageCutoffDate: '2026-08-01T19:00:00.000Z',
          ageCutoffLabel: 'Age 17 or younger as of 08/01/2026',
          ageCutoffSource: 'US Youth Soccer seasonal-year age grouping guidance.',
          playoffPlacementDivisionIds: [playoffUpperSourceDivisionId, '', playoffLowerSourceDivisionId],
          teamIds: ['team_b'],
        },
      ],
      playoffDivisionDetails: [
        {
          id: playoffUpperSourceDivisionId,
          key: 'playoff_upper',
          name: 'Playoff Upper',
          kind: 'PLAYOFF',
        },
        {
          id: playoffLowerSourceDivisionId,
          key: 'playoff_lower',
          name: 'Playoff Lower',
          kind: 'PLAYOFF',
        },
      ],
      fields: [
        {
          $id: 'field_local_1',
          name: 'Court A',
          fieldNumber: 1,
          location: '',
          lat: 0,
          long: 0,
          divisions: [openSourceDivisionId, advancedSourceDivisionId],
        },
        {
          $id: 'field_local_2',
          name: 'Court B',
          fieldNumber: 2,
          location: '',
          lat: 0,
          long: 0,
          divisions: [advancedSourceDivisionId],
        },
      ],
      timeSlots: [
        {
          $id: 'slot_multi_days',
          dayOfWeek: 1,
          daysOfWeek: [1, 3],
          divisions: [openSourceDivisionId],
          startTimeMinutes: 540,
          endTimeMinutes: 600,
          repeating: true,
          scheduledFieldId: 'field_local_1',
          scheduledFieldIds: ['field_local_1'],
          requiredTemplateIds: ['tmpl_waiver'],
        },
        {
          $id: 'slot_advanced',
          dayOfWeek: 4,
          daysOfWeek: [4],
          divisions: [advancedSourceDivisionId],
          startTimeMinutes: 600,
          endTimeMinutes: 660,
          repeating: true,
          scheduledFieldId: 'field_local_2',
          scheduledFieldIds: ['field_local_2'],
        },
      ],
    });

    mockEventFormDraft = {
      ...buildApiEvent({
        id: 'event_1',
        $id: 'event_1',
        name: 'Test League',
        state: 'PUBLISHED',
        eventType: 'LEAGUE',
        singleDivision: false,
        splitLeaguePlayoffDivisions: true,
        fieldIds: ['field_draft_1'],
        divisions: [openSourceDivisionId],
        divisionDetails: [
          {
            id: openSourceDivisionId,
            key: 'open',
            name: 'Open',
            divisionTypeId: 'skill_undefined_age_undefined',
            maxParticipants: 8,
            teamIds: ['team_a'],
          },
        ],
      }),
      name: 'Test League Edited',
    };

    (eventService.getEventWithRelations as jest.Mock).mockResolvedValue(persistedEvent);

    apiRequestMock.mockImplementation((path: string, options?: unknown) => {
      if (path === '/api/events/event_1') {
        const event = buildApiEvent(persistedEvent);
        delete (event as any).matches;
        return Promise.resolve({ event });
      }
      if (path === '/api/events/event_1/matches') {
        return Promise.resolve({ matches: buildApiEvent().matches });
      }
      if (path === '/api/events' && (options as { method?: string } | undefined)?.method === 'POST') {
        const payloadEvent = (
          (options as { body?: { event?: Record<string, unknown> } } | undefined)
            ?.body?.event
        ) ?? {};
        return Promise.resolve({ event: { ...payloadEvent } });
      }
      return Promise.resolve({});
    });

    renderWithMantine(<LeagueSchedulePage />);

    const createTemplateButton = await screen.findByRole('button', { name: /create template/i });
    fireEvent.click(createTemplateButton);

    await waitFor(() => {
      const createCall = apiRequestMock.mock.calls.find(
        ([path, options]) => path === '/api/events' && (options as { method?: string } | undefined)?.method === 'POST',
      );
      expect(createCall).toBeDefined();
    });

    const createCall = apiRequestMock.mock.calls.find(
      ([path, options]) => path === '/api/events' && (options as { method?: string } | undefined)?.method === 'POST',
    );
    const requestBody = (createCall?.[1] as { body?: { event?: Record<string, any> } } | undefined)?.body;
    const templateId = String(requestBody?.id ?? requestBody?.event?.$id ?? '');
    const openTemplateDivisionId = buildEventDivisionId(templateId, 'open');
    const advancedTemplateDivisionId = buildEventDivisionId(templateId, 'advanced');
    const playoffUpperTemplateDivisionId = buildEventDivisionId(templateId, 'playoff_upper');
    const playoffLowerTemplateDivisionId = buildEventDivisionId(templateId, 'playoff_lower');

    expect(templateId).toBeTruthy();
    expect(requestBody?.event?.state).toBe('TEMPLATE');
    expect(requestBody?.event?.name).toBe('Test League (TEMPLATE)');
    expect(requestBody?.event?.divisions).toEqual([openTemplateDivisionId, advancedTemplateDivisionId]);
    expect(requestBody?.event?.divisionDetails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: openTemplateDivisionId,
          key: 'open',
          divisionTypeId: 'skill_open_age_18plus',
          ageCutoffDate: '2026-08-01T19:00:00.000Z',
          playoffPlacementDivisionIds: [playoffUpperTemplateDivisionId, '', playoffLowerTemplateDivisionId],
          teamIds: ['team_a'],
        }),
        expect.objectContaining({
          id: advancedTemplateDivisionId,
          key: 'advanced',
          divisionTypeId: 'skill_premier_age_u17',
          ageCutoffDate: '2026-08-01T19:00:00.000Z',
          playoffPlacementDivisionIds: [playoffUpperTemplateDivisionId, '', playoffLowerTemplateDivisionId],
          teamIds: ['team_b'],
        }),
      ]),
    );
    expect(requestBody?.event?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          divisions: [openTemplateDivisionId, advancedTemplateDivisionId],
        }),
        expect.objectContaining({
          divisions: [advancedTemplateDivisionId],
        }),
      ]),
    );
    expect(requestBody?.event?.timeSlots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          dayOfWeek: 1,
          daysOfWeek: [1, 3],
          divisions: [openTemplateDivisionId],
          requiredTemplateIds: ['tmpl_waiver'],
        }),
        expect.objectContaining({
          dayOfWeek: 4,
          daysOfWeek: [4],
          divisions: [advancedTemplateDivisionId],
        }),
      ]),
    );
    const divisionTypeIds = (requestBody?.event?.divisionDetails ?? []).map((entry: { divisionTypeId?: string }) => entry.divisionTypeId);
    expect(divisionTypeIds).not.toContain('skill_undefined_age_undefined');
    expect(eventService.getEventWithRelations).toHaveBeenCalledWith('event_1');
  });

  it('seeds create mode from templateId query and does not fetch standings for unsaved events', async () => {
    useSearchParamsMock.mockReturnValue({
      get: (key: string) => {
        if (key === 'create') return '1';
        if (key === 'mode') return 'edit';
        if (key === 'templateId') return 'template_1';
        return null;
      },
    });

    (eventService.getEventWithRelations as jest.Mock).mockResolvedValue(
      buildApiEvent({
        id: 'template_1',
        $id: 'template_1',
        name: 'Template League (TEMPLATE)',
        state: 'TEMPLATE',
        eventType: 'LEAGUE',
        divisions: ['division_open'],
        divisionDetails: [
          {
            id: 'division_open',
            name: 'Open',
            teams: [],
            teamIds: [],
          },
        ],
      }),
    );

    apiRequestMock.mockImplementation((path: string) => {
      if (path.startsWith('/api/events?state=TEMPLATE')) {
        return Promise.resolve({ events: [] });
      }
      return Promise.resolve({});
    });

    renderWithMantine(<LeagueSchedulePage />);

    await waitFor(() => {
      expect(eventService.getEventWithRelations).toHaveBeenCalledWith('template_1');
    });

    await waitFor(() => {
      expect(capturedEventFormProps?.event?.name).toBe('Template League');
      expect(capturedEventFormProps?.event?.state).toBe('DRAFT');
    });

    const standingsCalls = apiRequestMock.mock.calls.filter(([path]) => (
      typeof path === 'string' && path.includes('/standings')
    ));
    expect(standingsCalls).toHaveLength(0);
  });

  it('preserves template-seeded location values when org defaults hydrate create mode', async () => {
    useSearchParamsMock.mockReturnValue({
      get: (key: string) => {
        if (key === 'create') return '1';
        if (key === 'mode') return 'edit';
        if (key === 'templateId') return 'template_org_1';
        if (key === 'orgId') return 'org_1';
        return null;
      },
    });

    (eventService.getEventWithRelations as jest.Mock).mockResolvedValue(
      buildApiEvent({
        id: 'template_org_1',
        $id: 'template_org_1',
        name: 'Template League (TEMPLATE)',
        state: 'TEMPLATE',
        eventType: 'LEAGUE',
        location: 'Template Arena',
        coordinates: [-121.9, 37.3],
        fields: [
          {
            $id: 'field_template_1',
            name: 'Template Court',
            fieldNumber: 2,
            location: 'Template Arena',
            lat: 37.3,
            long: -121.9,
          },
        ],
      }),
    );

    (organizationService.getOrganizationById as jest.Mock).mockResolvedValue({
      $id: 'org_1',
      ownerId: 'owner_1',
      location: 'Organization HQ',
      coordinates: [-83.0, 42.0],
      fields: [
        {
          $id: 'field_org_1',
          name: 'Org Court',
          fieldNumber: 1,
          location: 'Organization HQ',
          lat: 42.0,
          long: -83.0,
        },
      ],
      officialIds: ['official_org_1'],
      officials: [{ $id: 'official_org_1' }],
    });

    apiRequestMock.mockImplementation((path: string) => {
      if (path.startsWith('/api/events?state=TEMPLATE')) {
        return Promise.resolve({ events: [] });
      }
      return Promise.resolve({});
    });

    renderWithMantine(<LeagueSchedulePage />);

    await waitFor(() => {
      expect(eventService.getEventWithRelations).toHaveBeenCalledWith('template_org_1');
    });
    await waitFor(() => {
      expect(organizationService.getOrganizationById).toHaveBeenCalledWith('org_1', true);
    });
    await waitFor(() => {
      expect(capturedEventFormProps?.event?.organizationId).toBe('org_1');
      expect(capturedEventFormProps?.event?.location).toBe('Template Arena');
      expect(capturedEventFormProps?.event?.coordinates).toEqual([-121.9, 37.3]);
      expect(capturedEventFormProps?.event?.fields?.[0]?.name).toBe('Template Court');
    });
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

  it('does not delete events when cancelling preview', async () => {
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

    renderWithMantine(<LeagueSchedulePage />);

    await waitFor(() => {
      expect(screen.getByText(/Summer League/)).toBeInTheDocument();
    });

    const cancelButton = await screen.findByRole('button', { name: /cancel .* preview/i });
    fireEvent.click(cancelButton);

    await waitFor(() => {
      expect(mockRouter.back.mock.calls.length + mockRouter.push.mock.calls.length).toBeGreaterThan(0);
    });

    expect(eventService.deleteUnpublishedEvent).not.toHaveBeenCalled();
    expect(eventService.deleteEvent).not.toHaveBeenCalled();
    expect(leagueService.deleteMatchesByEvent).not.toHaveBeenCalled();
    expect(leagueService.deleteWeeklySchedulesForEvent).not.toHaveBeenCalled();
    expect(apiRequestMock).toHaveBeenCalledWith('/api/events/event_1');
  });

  it('saves an unpublished league without changing lifecycle state', async () => {
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
    mockEventFormDirtyState = true;

    (eventService.updateEvent as jest.Mock).mockImplementation((_id: string, payload: any) =>
      Promise.resolve({
        ...payload,
        $id: 'event_unpublished',
        state: 'PUBLISHED',
      }),
    );

    renderWithMantine(<LeagueSchedulePage />);

    const publishButton = await screen.findByRole('button', { name: /^save$/i });
    await waitFor(() => {
      expect(publishButton).toBeEnabled();
    });
    fireEvent.click(publishButton);

    await waitFor(() => {
      expect(eventService.updateEvent).toHaveBeenCalledTimes(1);
    });

    const [, payload] = (eventService.updateEvent as jest.Mock).mock.calls[0];
    expect(payload.state).toBe('UNPUBLISHED');
    expect(payload.matches).toHaveLength(1);
    expect(payload.timeSlots).toHaveLength(1);
    expect(payload.fields?.[0]?.rentalSlotIds).toBeUndefined();
    expect(payload).not.toHaveProperty('attendees');
    expect(eventService.createEvent).not.toHaveBeenCalled();
    expect(mockCommitDirtyBaseline).toHaveBeenCalledTimes(1);
    expect(mockValidatePendingStaffAssignments).toHaveBeenCalledTimes(1);
    expect(mockSubmitPendingStaffInvites).toHaveBeenCalledWith('event_unpublished');
  });

  it('saves a template without changing template lifecycle state', async () => {
    useSearchParamsMock.mockReturnValue({
      get: (key: string) => {
        if (key === 'mode') return 'edit';
        if (key === 'preview') return null;
        return null;
      },
    });

    const baseEvent = buildApiEvent({
      id: 'event_1',
      $id: 'event_1',
      name: 'Test League (TEMPLATE)',
      state: 'TEMPLATE',
      singleDivision: true,
      divisions: ['event_1__division__open'],
      divisionDetails: [
        {
          id: 'event_1__division__open',
          key: 'open',
          name: 'Open',
          teamIds: [],
        },
      ],
      timeSlots: [
        {
          id: 'slot_template_1',
          dayOfWeek: 2,
          daysOfWeek: [2],
          divisions: ['event_1__division__open'],
          startTimeMinutes: 540,
          endTimeMinutes: 600,
          repeating: true,
          scheduledFieldId: 'field_1',
        },
      ],
    });

    mockEventFormDraft = {
      ...baseEvent,
      name: 'Test League Renamed (TEMPLATE)',
      state: 'TEMPLATE',
    };
    mockEventFormDirtyState = true;

    apiRequestMock.mockImplementation((path: string) => {
      if (path === '/api/events/event_1') {
        const event = { ...baseEvent };
        delete (event as any).matches;
        return Promise.resolve({ event });
      }
      if (path === '/api/events/event_1/matches') {
        return Promise.resolve({ matches: buildApiEvent().matches });
      }
      return Promise.resolve({});
    });

    (eventService.updateEvent as jest.Mock).mockImplementation((_id: string, payload: any) =>
      Promise.resolve({
        ...payload,
        $id: 'event_1',
        state: payload?.state ?? 'TEMPLATE',
      }),
    );

    renderWithMantine(<LeagueSchedulePage />);

    const saveTemplateButton = await screen.findByRole('button', { name: /^save$/i });
    await waitFor(() => {
      expect(saveTemplateButton).toBeEnabled();
    });
    fireEvent.click(saveTemplateButton);

    await waitFor(() => {
      expect(eventService.updateEvent).toHaveBeenCalledTimes(1);
    });

    const [, payload] = (eventService.updateEvent as jest.Mock).mock.calls[0];
    expect(payload.state).toBe('TEMPLATE');
    expect(payload.name).toBe('Test League Renamed (TEMPLATE)');
    expect(payload.divisions).toEqual(['event_1__division__open']);
    expect(payload.timeSlots).toHaveLength(1);
  });

  it('persists tournament winner set count from form draft on save', async () => {
    useSearchParamsMock.mockReturnValue({
      get: (key: string) => {
        if (key === 'mode') return 'edit';
        if (key === 'preview') return null;
        return null;
      },
    });

    const baseEvent = buildApiEvent({
      id: 'event_tournament',
      $id: 'event_tournament',
      name: 'Autumn Tournament',
      eventType: 'TOURNAMENT',
      state: 'PUBLISHED',
      winnerSetCount: 1,
      loserSetCount: 1,
      winnerBracketPointsToVictory: [21],
      loserBracketPointsToVictory: [21],
      usesSets: true,
    });
    let persistedWinnerSetCount = 1;
    const pointsForWinnerSets = (count: number) => Array.from({ length: count }, () => 21);

    mockEventFormDraft = {
      ...baseEvent,
      winnerSetCount: 3,
      loserSetCount: 1,
      winnerBracketPointsToVictory: [21, 21, 21],
      loserBracketPointsToVictory: [21],
      usesSets: true,
    };
    mockEventFormDirtyState = true;

    apiRequestMock.mockImplementation((path: string) => {
      if (path === '/api/events/event_1') {
        const event = {
          ...baseEvent,
          winnerSetCount: persistedWinnerSetCount,
          winnerBracketPointsToVictory: pointsForWinnerSets(persistedWinnerSetCount),
        };
        delete (event as any).matches;
        return Promise.resolve({ event });
      }
      if (path === '/api/events/event_1/matches') {
        return Promise.resolve({ matches: buildApiEvent().matches });
      }
      return Promise.resolve({});
    });

    (eventService.updateEvent as jest.Mock).mockImplementation((_id: string, payload: any) =>
      {
        persistedWinnerSetCount = typeof payload?.winnerSetCount === 'number'
          ? payload.winnerSetCount
          : persistedWinnerSetCount;
        return Promise.resolve({
          ...payload,
          $id: 'event_tournament',
        });
      },
    );

    renderWithMantine(<LeagueSchedulePage />);

    const saveTournamentButton = await screen.findByRole('button', { name: /^save$/i });
    await waitFor(() => {
      expect(saveTournamentButton).toBeEnabled();
    });
    fireEvent.click(saveTournamentButton);

    await waitFor(() => {
      expect(eventService.updateEvent).toHaveBeenCalledTimes(1);
    });

    const [, payload] = (eventService.updateEvent as jest.Mock).mock.calls[0];
    expect(payload.winnerSetCount).toBe(3);
    expect(payload.winnerBracketPointsToVictory).toEqual([21, 21, 21]);
    expect(payload.usesSets).toBe(true);
  });

  it('reschedules from non-details tabs and surfaces backend warnings', async () => {
    useSearchParamsMock.mockReturnValue({
      get: (key: string) => {
        if (key === 'mode') return 'edit';
        if (key === 'preview') return null;
        return null;
      },
    });

    mockEventFormValidateResult = false;
    (eventService.updateEvent as jest.Mock).mockImplementation((_id: string, payload: any) =>
      Promise.resolve({
        ...payload,
        $id: 'event_1',
        state: payload?.state ?? 'UNPUBLISHED',
      }),
    );
    (eventService.scheduleEvent as jest.Mock).mockResolvedValue({
      event: buildApiEvent({
        id: 'event_1',
        $id: 'event_1',
      }),
      preview: false,
      warnings: [
        {
          code: 'LOCKED_MATCH_OUTSIDE_WINDOW',
          message: 'Locked match is outside the updated start/time-slot window and was preserved.',
          matchIds: ['match_1'],
        },
      ],
    });

    renderWithMantine(<LeagueSchedulePage />);

    expect(await screen.findByText(/Summer League/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /schedule/i }));
    fireEvent.click(await screen.findByRole('button', { name: /^reschedule$/i }));

    await waitFor(() => {
      expect(eventService.scheduleEvent).toHaveBeenCalledTimes(1);
    });
    expect(eventService.scheduleEvent).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ eventId: 'event_1' }),
    );
    expect(
      await screen.findByText(/Locked match is outside the updated start\/time-slot window and was preserved\./i),
    ).toBeInTheDocument();
  });

  it('persists match lock edits before triggering reschedule', async () => {
    useSearchParamsMock.mockReturnValue({
      get: (key: string) => {
        if (key === 'mode') return 'edit';
        if (key === 'preview') return null;
        return null;
      },
    });

    const baseEvent = buildApiEvent({
      id: 'event_1',
      $id: 'event_1',
    });
    const persistedMatches = (baseEvent.matches ?? []).map((match: Record<string, any>) => ({
      ...match,
      locked: false,
    }));

    apiRequestMock.mockImplementation((path: string, options?: unknown) => {
      const method = (options as { method?: string } | undefined)?.method;
      if (path === '/api/events/event_1') {
        const event = { ...baseEvent };
        delete (event as any).matches;
        return Promise.resolve({ event });
      }
      if (path === '/api/events/event_1/matches' && method === 'PATCH') {
        const body = (options as { body?: { matches?: Array<Record<string, any>> } } | undefined)?.body;
        const updates = Array.isArray(body?.matches) ? body.matches : [];
        const updatesById = new Map(
          updates
            .filter((entry) => typeof entry?.id === 'string' && entry.id.length > 0)
            .map((entry) => [entry.id as string, entry]),
        );
        const nextMatches = persistedMatches.map((match) => {
          const update = updatesById.get(String(match.$id ?? match.id));
          return update ? { ...match, ...update, id: update.id, $id: update.id } : match;
        });
        persistedMatches.splice(0, persistedMatches.length, ...nextMatches);
        return Promise.resolve({ matches: persistedMatches });
      }
      if (path === '/api/events/event_1/matches') {
        return Promise.resolve({ matches: persistedMatches });
      }
      return Promise.resolve({});
    });

    (eventService.updateEvent as jest.Mock).mockImplementation((_id: string, payload: any) =>
      Promise.resolve({
        ...payload,
        $id: 'event_1',
      }),
    );
    (eventService.scheduleEvent as jest.Mock).mockResolvedValue({
      event: buildApiEvent({
        id: 'event_1',
        $id: 'event_1',
      }),
      preview: false,
      warnings: [],
    });

    renderWithMantine(<LeagueSchedulePage />);

    expect(await screen.findByText(/Summer League/)).toBeInTheDocument();

    fireEvent.click(await screen.findByRole('button', { name: /edit first match/i }));
    const lockCheckbox = await screen.findByRole('checkbox', { name: /lock match/i });
    expect(lockCheckbox).not.toBeChecked();

    fireEvent.click(lockCheckbox);
    expect(lockCheckbox).toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => {
      expect(screen.queryByText(/Edit Match/)).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('tab', { name: /schedule/i }));
    fireEvent.click(await screen.findByRole('button', { name: /^reschedule$/i }));

    await waitFor(() => {
      expect(eventService.scheduleEvent).toHaveBeenCalledTimes(1);
    });

    const patchCallIndex = apiRequestMock.mock.calls.findIndex(([path, options]) => (
      path === '/api/events/event_1/matches'
      && (options as { method?: string } | undefined)?.method === 'PATCH'
    ));
    expect(patchCallIndex).toBeGreaterThanOrEqual(0);
    const patchCall = apiRequestMock.mock.calls[patchCallIndex];
    const patchBody = (patchCall?.[1] as { body?: { matches?: Array<Record<string, any>> } } | undefined)?.body;
    expect(patchBody?.matches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'match_1',
          locked: true,
        }),
      ]),
    );

    const patchOrder = apiRequestMock.mock.invocationCallOrder[patchCallIndex];
    const scheduleOrder = (eventService.scheduleEvent as jest.Mock).mock.invocationCallOrder[0];
    expect(patchOrder).toBeLessThan(scheduleOrder);
  });

  it('disables Save but allows Reschedule when conflicts exist on the same field', async () => {
    useSearchParamsMock.mockReturnValue({
      get: (key: string) => {
        if (key === 'mode') return 'edit';
        if (key === 'preview') return null;
        return null;
      },
    });

    const baseEvent = buildApiEvent({
      id: 'event_1',
      $id: 'event_1',
    });
    const conflictingMatches = [
      {
        ...baseEvent.matches[0],
        $id: 'conflict_1',
        id: 'conflict_1',
        fieldId: 'field_1',
        field: undefined,
        start: '2026-03-01T10:00:00.000Z',
        end: '2026-03-01T11:00:00.000Z',
      },
      {
        ...baseEvent.matches[1],
        $id: 'conflict_2',
        id: 'conflict_2',
        fieldId: 'field_1',
        field: undefined,
        start: '2026-03-01T10:30:00.000Z',
        end: '2026-03-01T11:30:00.000Z',
      },
    ];

    apiRequestMock.mockImplementation((path: string) => {
      if (path === '/api/events/event_1') {
        const event = { ...baseEvent };
        delete (event as any).matches;
        return Promise.resolve({ event });
      }
      if (path === '/api/events/event_1/matches') {
        return Promise.resolve({ matches: conflictingMatches });
      }
      return Promise.resolve({});
    });
    (eventService.updateEvent as jest.Mock).mockImplementation((_id: string, payload: any) =>
      Promise.resolve({
        ...payload,
        $id: 'event_1',
      }),
    );
    (eventService.scheduleEvent as jest.Mock).mockResolvedValue({
      event: buildApiEvent({
        id: 'event_1',
        $id: 'event_1',
      }),
      preview: false,
      warnings: [],
    });
    mockEventFormDirtyState = true;

    renderWithMantine(<LeagueSchedulePage />);

    expect(await screen.findByText(/Summer League/)).toBeInTheDocument();
    expect(await screen.findByTestId('calendar-conflict-count')).toHaveTextContent('2');

    const saveButton = await screen.findByRole('button', { name: /^save$/i });
    expect(saveButton).toBeDisabled();
    expect(eventService.updateEvent).not.toHaveBeenCalled();

    const rescheduleButton = await screen.findByRole('button', { name: /^reschedule$/i });
    expect(rescheduleButton).toBeEnabled();
    fireEvent.click(rescheduleButton);

    await waitFor(() => {
      expect(eventService.scheduleEvent).toHaveBeenCalledTimes(1);
    });
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

  it('normalizes create payload with multi-day slots and slot divisions before schedule preview', async () => {
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
      officialIds: [],
      fields: [
        {
          $id: 'field_local_1',
          name: 'Court A',
          fieldNumber: 1,
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
          divisions: ['open'],
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
    mockEventFormDirtyState = true;

    renderWithMantine(<LeagueSchedulePage />);

    const publishButton = await screen.findByRole('button', { name: /create event/i });
    await waitFor(() => {
      expect(publishButton).toBeEnabled();
    });
    fireEvent.click(publishButton);

    await waitFor(() => {
      expect(eventService.scheduleEvent).toHaveBeenCalledTimes(1);
    });

    const [payload] = (eventService.scheduleEvent as jest.Mock).mock.calls[0];
    expect(payload?.timeSlots?.[0]).toMatchObject({
      dayOfWeek: 1,
      daysOfWeek: [1, 3],
      divisions: ['open'],
      scheduledFieldId: 'field_local_1',
    });
  });

  it('normalizes tournament create payload with weekly timeslots before schedule preview', async () => {
    useSearchParamsMock.mockReturnValue({
      get: (key: string) => {
        if (key === 'create') return '1';
        if (key === 'mode') return 'edit';
        return null;
      },
    });

    mockEventFormDraft = {
      $id: 'event_create_tournament',
      name: 'Create Tournament',
      description: '',
      location: 'Main Gym',
      coordinates: [-83.0, 42.0],
      start: '2026-01-06T09:00:00.000',
      end: '2026-01-06T09:00:00.000',
      eventType: 'TOURNAMENT',
      sportId: 'volleyball',
      price: 0,
      maxParticipants: 16,
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
      officialIds: [],
      fields: [
        {
          $id: 'field_tournament_1',
          name: 'Court A',
          fieldNumber: 1,
          location: '',
          lat: 0,
          long: 0,
          divisions: ['open'],
        },
      ],
      timeSlots: [
        {
          $id: 'slot_tournament_multi',
          dayOfWeek: 2,
          daysOfWeek: [2, 4],
          divisions: ['open'],
          startTimeMinutes: 600,
          endTimeMinutes: 720,
          repeating: true,
          scheduledFieldId: 'field_tournament_1',
        },
      ],
      doubleElimination: false,
      winnerSetCount: 1,
      loserSetCount: 1,
      winnerBracketPointsToVictory: [21],
      loserBracketPointsToVictory: [21],
      fieldCount: 1,
      restTimeMinutes: 0,
    };

    (eventService.scheduleEvent as jest.Mock).mockResolvedValue({
      event: buildApiEvent({
        id: 'event_create_tournament',
        $id: 'event_create_tournament',
        eventType: 'TOURNAMENT',
      }),
      preview: false,
    });
    mockEventFormDirtyState = true;

    renderWithMantine(<LeagueSchedulePage />);

    const publishButton = await screen.findByRole('button', { name: /create event/i });
    await waitFor(() => {
      expect(publishButton).toBeEnabled();
    });
    fireEvent.click(publishButton);

    await waitFor(() => {
      expect(eventService.scheduleEvent).toHaveBeenCalledTimes(1);
    });

    const [payload] = (eventService.scheduleEvent as jest.Mock).mock.calls[0];
    expect(payload?.eventType).toBe('TOURNAMENT');
    expect(payload?.timeSlots?.[0]).toMatchObject({
      dayOfWeek: 2,
      daysOfWeek: [2, 4],
      divisions: ['open'],
      scheduledFieldId: 'field_tournament_1',
    });
  });

  it('hides participant actions for placeholder teams', async () => {
    useSearchParamsMock.mockReturnValue({
      get: (key: string) => {
        if (key === 'mode') return 'edit';
        if (key === 'preview') return null;
        return null;
      },
    });

    const event = buildApiEvent({
      eventType: 'TOURNAMENT',
      singleDivision: true,
      teamSignup: true,
      teams: [],
      teamIds: ['team_real', 'team_placeholder'],
    });
    delete (event as any).matches;

    apiRequestMock.mockImplementation((path: string) => {
      if (path === '/api/events/event_1') {
        return Promise.resolve({ event });
      }
      if (path === '/api/events/event_1/matches') {
        return Promise.resolve({ matches: [] });
      }
      if (path.startsWith('/api/teams?ids=')) {
        return Promise.resolve({
          teams: [
            {
              $id: 'team_real',
              id: 'team_real',
              name: 'Sand Strikers',
              division: 'Open',
              sport: 'Volleyball',
              playerIds: [],
              captainId: '',
              pending: [],
              teamSize: 2,
              parentTeamId: 'parent_real',
            },
            {
              $id: 'team_placeholder',
              id: 'team_placeholder',
              name: 'Place Holder 1',
              division: 'Open',
              sport: 'Volleyball',
              playerIds: [],
              captainId: '',
              pending: [],
              teamSize: 2,
            },
          ],
        });
      }
      if (path === '/api/events/event_1/teams/compliance') {
        return Promise.resolve({ teams: [] });
      }
      return Promise.resolve({});
    });

    renderWithMantine(<LeagueSchedulePage />);

    const participantsTab = await screen.findByRole('tab', { name: /participants/i });
    fireEvent.click(participantsTab);

    await screen.findByText('Sand Strikers');
    await screen.findByText('Place Holder 1');

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /^remove$/i })).toHaveLength(1);
    });
  });

  it('renders non-team participant user cards with billing and document status in manage mode', async () => {
    useSearchParamsMock.mockReturnValue({
      get: (key: string) => {
        if (key === 'mode') return 'edit';
        if (key === 'preview') return null;
        return null;
      },
    });

    const event = buildApiEvent({
      eventType: 'EVENT',
      teamSignup: false,
      teams: [],
      teamIds: [],
      userIds: ['user_1'],
      players: [],
    });
    delete (event as any).matches;

    const originalFetch = (globalThis as any).fetch;
    (globalThis as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        users: [
          {
            $id: 'user_1',
            firstName: 'Casey',
            lastName: 'Rivers',
            userName: 'crivers',
            teamIds: [],
            friendIds: [],
            friendRequestIds: [],
            friendRequestSentIds: [],
            followingIds: [],
            uploadedImages: [],
            fullName: 'Casey Rivers',
            avatarUrl: '',
          },
        ],
      }),
    });

    apiRequestMock.mockImplementation((path: string) => {
      if (path === '/api/events/event_1') {
        return Promise.resolve({ event });
      }
      if (path === '/api/events/event_1/matches') {
        return Promise.resolve({ matches: [] });
      }
      if (path === '/api/events/event_1/users/compliance') {
        return Promise.resolve({
          users: [
            {
              userId: 'user_1',
              fullName: 'Casey Rivers',
              userName: 'crivers',
              isMinorAtEvent: false,
              registrationType: 'ADULT',
              payment: {
                hasBill: true,
                billId: 'bill_1',
                totalAmountCents: 5000,
                paidAmountCents: 3000,
                status: 'OPEN',
                isPaidInFull: false,
              },
              documents: {
                signedCount: 1,
                requiredCount: 2,
              },
              requiredDocuments: [],
            },
          ],
        });
      }
      return Promise.resolve({});
    });

    try {
      renderWithMantine(<LeagueSchedulePage />);

      const participantsTab = await screen.findByRole('tab', { name: /participants/i });
      fireEvent.click(participantsTab);

      await screen.findByText('Casey Rivers');
      await screen.findByText('$30.00 of $50.00 paid');
      await screen.findByText('1/2 signatures complete');
      expect(screen.queryByText(/no team bill yet/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/rostered user/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/1\/1 players/i)).not.toBeInTheDocument();

      expect(screen.queryByRole('button', { name: /add team/i })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /refund/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /send bill/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^remove$/i })).toBeInTheDocument();
    } finally {
      (globalThis as any).fetch = originalFetch;
    }
  });

  it('does not show team fullness labels for non-team participants in non-edit mode', async () => {
    useSearchParamsMock.mockReturnValue({
      get: (key: string) => {
        if (key === 'mode') return null;
        if (key === 'preview') return null;
        return null;
      },
    });

    const event = buildApiEvent({
      eventType: 'EVENT',
      teamSignup: false,
      teams: [],
      teamIds: [],
      userIds: ['user_1'],
      players: [],
    });
    delete (event as any).matches;
    const originalFetch = (globalThis as any).fetch;
    (globalThis as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        users: [
          {
            $id: 'user_1',
            firstName: 'Casey',
            lastName: 'Rivers',
            userName: 'crivers',
            teamIds: [],
            friendIds: [],
            friendRequestIds: [],
            friendRequestSentIds: [],
            followingIds: [],
            uploadedImages: [],
            fullName: 'Casey Rivers',
            avatarUrl: '',
          },
        ],
      }),
    });

    apiRequestMock.mockImplementation((path: string) => {
      if (path === '/api/events/event_1') {
        return Promise.resolve({ event });
      }
      if (path === '/api/events/event_1/matches') {
        return Promise.resolve({ matches: [] });
      }
      return Promise.resolve({});
    });

    try {
      renderWithMantine(<LeagueSchedulePage />);

      const participantsTab = await screen.findByRole('tab', { name: /participants/i });
      fireEvent.click(participantsTab);

      await screen.findByText('Casey Rivers');
      expect(screen.queryByText(/team full/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/spots left/i)).not.toBeInTheDocument();
    } finally {
      (globalThis as any).fetch = originalFetch;
    }
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
        if (key === 'rentalDocumentTemplateId') return 'tmpl_rental_contract';
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
    expect(capturedEventFormProps?.rentalPurchase?.rentalDocumentTemplateId).toBe('tmpl_rental_contract');
  });

  it('shows create-mode submit errors from form validation', async () => {
    useSearchParamsMock.mockReturnValue({
      get: (key: string) => {
        if (key === 'create') return '1';
        return null;
      },
    });
    mockEventFormValidateResult = false;
    mockEventFormDirtyState = true;

    renderWithMantine(<LeagueSchedulePage />);

    await screen.findByTestId('event-form');

    const createButton = await screen.findByRole('button', { name: /^create event$/i });
    fireEvent.click(createButton);

    expect(await screen.findByText('Please fix the highlighted fields before submitting.')).toBeInTheDocument();
  });

  it('opens rental sign modal in create mode after sign links are created', async () => {
    const start = formatLocalDateTime(new Date());
    const end = formatLocalDateTime(new Date(Date.now() + 60 * 60 * 1000));

    useSearchParamsMock.mockReturnValue({
      get: (key: string) => {
        if (key === 'create') return '1';
        if (key === 'rentalStart') return start;
        if (key === 'rentalEnd') return end;
        if (key === 'rentalFieldId') return 'field_1';
        if (key === 'rentalOrgId') return 'org_rental';
        if (key === 'rentalDocumentTemplateId') return 'tmpl_rental_contract';
        return null;
      },
    });
    mockEventFormDirtyState = true;
    mockEventFormValidateResult = true;

    (organizationService.getOrganizationById as jest.Mock).mockResolvedValue({
      $id: 'org_rental',
      name: 'Rental Org',
      fields: [],
    });

    apiRequestMock.mockImplementation((path: string) => {
      if (path === '/api/rentals/sign') {
        return Promise.resolve({
          signLinks: [
            {
              templateId: 'tmpl_rental_contract',
              type: 'TEXT',
              title: 'Rental Contract',
              signOnce: false,
              content: 'Rental terms go here.',
              documentId: 'doc_1',
              requiredSignerType: 'PARTICIPANT',
              requiredSignerLabel: 'Participant',
              signerContext: 'participant',
            },
          ],
        });
      }
      return Promise.resolve({});
    });

    renderWithMantine(<LeagueSchedulePage />);

    await screen.findByTestId('event-form');

    const createButton = await screen.findByRole('button', { name: /^create event$/i });
    fireEvent.click(createButton);

    expect(await screen.findByRole('dialog', { name: /sign rental document/i })).toBeInTheDocument();
    expect(await screen.findByText(/rental terms go here/i)).toBeInTheDocument();
  });
});

