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
let mockEventFormDirtyState = false;
jest.mock('../components/EventForm', () => {
  const React = require('react');
  const { forwardRef, useEffect, useImperativeHandle } = React;
  const MockEventForm = forwardRef(function MockEventForm(props: any, ref: any) {
    useEffect(() => {
      capturedEventFormProps = props;
      props.onDirtyStateChange?.(mockEventFormDirtyState);
      return () => {
        props.onDirtyStateChange?.(false);
      };
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
    mockEventFormDirtyState = false;
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
    expect(capturedEventFormProps?.event?.fields?.[0]?.$id).toBe('field_slot_1');
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

    expect(await screen.findByRole('button', { name: /save template/i })).toBeInTheDocument();
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
      refIds: ['ref_org_1'],
      referees: [{ $id: 'ref_org_1' }],
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

    const publishButton = await screen.findByRole('button', { name: /save league/i });
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
    fireEvent.click(await screen.findByRole('button', { name: /reschedule matches/i }));

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
      refereeIds: [],
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
      refereeIds: [],
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
