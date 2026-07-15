import { renderWithMantine } from '../../../../../../test/utils/renderWithMantine';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import LeagueSchedulePage from '../page';
import { apiRequest } from '@/lib/apiClient';
import { eventService } from '@/lib/eventService';
import { leagueService } from '@/lib/leagueService';
import { organizationService } from '@/lib/organizationService';
import { formatLocalDateTime } from '@/lib/dateUtils';
import { buildEventDivisionId } from '@/lib/divisionTypes';

jest.setTimeout(20000);
jest.mock('react-big-calendar/lib/css/react-big-calendar.css', () => ({}));
jest.mock('react-big-calendar/lib/addons/dragAndDrop/styles.css', () => ({}));

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

const mockSetActivePageContext = jest.fn();
const mockRegisterRefreshHandler = jest.fn();
const mockRegisterClientActionHandler = jest.fn();
jest.mock('@/context/AgentContext', () => ({
  useAgentContext: () => ({
    setActivePageContext: mockSetActivePageContext,
    registerRefreshHandler: mockRegisterRefreshHandler,
    registerClientActionHandler: mockRegisterClientActionHandler,
  }),
}));

jest.mock('@/lib/apiClient', () => ({
  apiRequest: jest.fn(),
  isApiRequestError: (error: unknown) => (
    typeof error === 'object' &&
    error !== null &&
    'status' in error
  ),
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
    getEventById: jest.fn(),
    getEventWithRelations: jest.fn(),
    getEventDetailBootstrap: jest.fn(),
    deleteEvent: jest.fn(),
    deleteEventResult: jest.fn(),
    deleteUnpublishedEvent: jest.fn(),
    updateEvent: jest.fn(),
    createEvent: jest.fn(),
    scheduleEvent: jest.fn(),
    getEventParticipants: jest.fn(),
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

const mockGetEventStaffState = jest.fn();
const mockPutEventStaffState = jest.fn();
jest.mock('@/lib/eventStaffService', () => {
  const actual = jest.requireActual('@/lib/eventStaffService');
  return {
    ...actual,
    eventStaffService: {
      getEventStaffState: (...args: unknown[]) => mockGetEventStaffState(...args),
      putEventStaffState: (...args: unknown[]) => mockPutEventStaffState(...args),
    },
  };
});

let capturedEventFormProps: any = null;
let mockEventFormDraft: any = null;
let mockEventFormValidateResult = true;
let mockEventFormDirtyState = false;
let mockEventFormValidationErrors: Array<{ path: string; message: string }> = [];
let mockCommitDirtyBaseline = jest.fn();
let mockValidatePendingStaffAssignments = jest.fn();
let mockApplyCanonicalStaffState = jest.fn();
jest.mock('../components/EventForm', () => {
  const React = require('react');
  const { forwardRef, useEffect, useImperativeHandle, useState } = React;
  const MockEventForm = forwardRef(function MockEventForm(props: any, ref: any) {
    const [mockInputValue, setMockInputValue] = useState('');
    const [isDirty, setIsDirty] = useState(mockEventFormDirtyState);
    useEffect(() => {
      capturedEventFormProps = props;
    }, [props]);

    useEffect(() => {
      props.onDirtyStateChange?.(isDirty);
    }, [isDirty, props]);

    useEffect(() => () => {
      props.onDirtyStateChange?.(false);
    }, [props]);

    useImperativeHandle(ref, () => ({
      getDraft: () => mockEventFormDraft ?? props.event ?? {},
      validate: async () => mockEventFormValidateResult,
      getValidationErrors: () => mockEventFormValidationErrors,
      getRegistrationQuestionDrafts: () => [],
      validatePendingStaffAssignments: async () => mockValidatePendingStaffAssignments(),
      commitDirtyBaseline: () => mockCommitDirtyBaseline(),
      applyCanonicalStaffState: (snapshot: unknown) => mockApplyCanonicalStaffState(snapshot),
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
  return function MockCalendarView({ matches, onMatchClick, onMatchTimeChange, canManage, conflictMatchIdsById, onViewChange, onDateChange, date }: any) {
    const currentDate = date instanceof Date ? date : new Date();
    const firstMatch = Array.isArray(matches) ? matches[0] : null;
    return (
      <div data-testid="league-calendar">
        <span>Calendar View</span>
        {Array.isArray(matches) && matches.map((match) => (
          <span key={match?.$id ?? match?.id ?? 'unknown'} data-testid={`calendar-match-${match?.$id ?? match?.id ?? 'unknown'}`}>
            {match?.$id ?? match?.id ?? 'unknown'}
            {match?.weeklyOccurrenceMeta ? (
              <span data-testid={`calendar-match-meta-${match?.$id ?? match?.id ?? 'unknown'}`}>
                {[
                  match.weeklyOccurrenceMeta.divisionLabel,
                  match.weeklyOccurrenceMeta.isViewerRegistered ? 'registered' : 'not-registered',
                ].filter(Boolean).join('|')}
              </span>
            ) : null}
          </span>
        ))}
        <span data-testid="calendar-conflict-count">{Object.keys(conflictMatchIdsById ?? {}).length}</span>
        {onMatchClick && matches?.length > 0 && (
          <button type="button" onClick={() => onMatchClick?.(firstMatch)}>
            {canManage ? 'Edit First Match' : 'Select First Match'}
          </button>
        )}
        {canManage && onMatchTimeChange && firstMatch && (
          <button
            type="button"
            onClick={() => onMatchTimeChange(firstMatch, {
              start: new Date('2026-03-02T12:00:00.000Z'),
              end: new Date('2026-03-02T13:00:00.000Z'),
              fieldId: firstMatch.fieldId ?? 'field_1',
            })}
          >
            Move First Match
          </button>
        )}
        {onViewChange && (
          <>
            <button type="button" onClick={() => onViewChange('week')}>
              Switch To Week View
            </button>
            <button type="button" onClick={() => onViewChange('day')}>
              Switch To Day View
            </button>
            <button type="button" onClick={() => onViewChange('agenda')}>
              Switch To Agenda View
            </button>
          </>
        )}
        {onDateChange && (
          <>
            <button
              type="button"
              onClick={() => onDateChange(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))}
            >
              Jump To Previous Month
            </button>
            <button
              type="button"
              onClick={() => onDateChange(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))}
            >
              Jump To Next Month
            </button>
          </>
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

const toIsoDateString = (value: Date): string => {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, '0');
  const day = `${value.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const toMondayIndex = (value: Date): number => (value.getDay() + 6) % 7;

const buildWeeklyParentEvent = ({
  occurrenceDate: occurrenceDateInput,
  slotStartOffsetDays = -1,
  slotEndOffsetDays = 14,
}: {
  occurrenceDate?: Date;
  slotStartOffsetDays?: number;
  slotEndOffsetDays?: number;
} = {}) => {
  const today = new Date(occurrenceDateInput?.getTime() ?? Date.now());
  today.setHours(0, 0, 0, 0);
  const slotId = 'slot_weekly_parent_1';
  const occurrenceDate = toIsoDateString(today);
  const weeklyDayIndex = toMondayIndex(today);
  const slotStartDate = new Date(today.getTime() + slotStartOffsetDays * 24 * 60 * 60 * 1000);
  const slotEndDate = new Date(today.getTime() + slotEndOffsetDays * 24 * 60 * 60 * 1000);

  const event = buildApiEvent({
    id: 'event_1',
    $id: 'event_1',
    name: 'Weekly Parent Event',
    eventType: 'WEEKLY_EVENT',
    parentEvent: null,
    teamSignup: false,
    state: 'PUBLISHED',
    start: formatLocalDateTime(today),
    end: '',
    noFixedEndDateTime: true,
    maxParticipants: 10,
    teamSizeLimit: 2,
    divisions: ['division_open'],
    divisionDetails: [
      {
        id: 'division_open',
        key: 'open',
        name: 'Open',
        divisionTypeId: 'skill_open',
        divisionTypeName: 'Open',
        divisionTypeKey: 'skill_open',
        ratingType: 'SKILL',
        gender: 'C',
        maxParticipants: 10,
      },
    ],
    teams: [],
    players: [],
    teamIds: [],
    userIds: [],
    fields: [
      {
        $id: 'field_1',
        name: 'Main Court',
        location: 'Main',
        lat: 0,
        long: 0,
      },
    ],
    fieldIds: ['field_1'],
    timeSlotIds: [slotId],
    timeSlots: [
      {
        $id: slotId,
        scheduledFieldId: 'field_1',
        scheduledFieldIds: ['field_1'],
        dayOfWeek: weeklyDayIndex,
        daysOfWeek: [weeklyDayIndex],
        divisions: ['division_open'],
        startDate: formatLocalDateTime(slotStartDate),
        endDate: formatLocalDateTime(slotEndDate),
        startTimeMinutes: 540,
        endTimeMinutes: 660,
        repeating: true,
        conflicts: [],
        checking: false,
      },
    ],
  });

  return {
    event,
    slotId,
    occurrenceDate,
  };
};

const mockScheduleApiEvent = (overrides: Record<string, any> = {}) => {
  const scheduledEvent = buildApiEvent(overrides);
  apiRequestMock.mockImplementation((path: string) => {
    if (path === '/api/events/event_1') {
      const event = { ...scheduledEvent };
      delete (event as any).matches;
      return Promise.resolve({ event });
    }
    if (path === '/api/events/event_1/matches') {
      return Promise.resolve({ matches: scheduledEvent.matches ?? [] });
    }
    return Promise.resolve({});
  });
  return scheduledEvent;
};

const openMoreActionsMenu = async () => {
  const moreButton = await screen.findByRole('button', { name: /^more$/i });
  await act(async () => {
    fireEvent.click(moreButton);
  });
};

const clickMoreActionElement = async (action: HTMLElement) => {
  await act(async () => {
    fireEvent.click(action);
    await Promise.resolve();
  });
};

const clickMoreAction = async (name: RegExp) => {
  await openMoreActionsMenu();
  const action = await screen.findByRole('menuitem', { name });
  await clickMoreActionElement(action);
  return action;
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
    mockEventFormValidationErrors = [];
    mockCommitDirtyBaseline = jest.fn();
    mockValidatePendingStaffAssignments = jest.fn();
    mockApplyCanonicalStaffState = jest.fn();
    useAppMock.mockReturnValue({
      user: { $id: 'host_1' },
      isAuthenticated: true,
      isGuest: false,
      loading: false,
      setUser: jest.fn(),
    });

    useSearchParamsMock.mockReturnValue({
      get: (key: string) => {
        if (key === 'mode') return null;
        if (key === 'preview') return null;
        return null;
      },
    });

    jest.clearAllMocks();
    mockGetEventStaffState.mockResolvedValue({
      contractVersion: 1,
      eventId: 'event_1',
      revision: 'staff-revision-1',
      assistantHostIds: [],
      officialPositions: [],
      eventOfficials: [],
      officialIds: [],
      staffInvites: [],
    });
    mockPutEventStaffState.mockResolvedValue({
      contractVersion: 1,
      eventId: 'event_1',
      revision: 'staff-revision-2',
      assistantHostIds: [],
      officialPositions: [],
      eventOfficials: [],
      officialIds: [],
      staffInvites: [],
    });
    apiRequestMock.mockReset();
    (eventService.getEvent as jest.Mock).mockReset();
    (eventService.getEventById as jest.Mock).mockReset();
    (eventService.getEventWithRelations as jest.Mock).mockReset();
    (eventService.getEventDetailBootstrap as jest.Mock).mockReset();
    (eventService.deleteEvent as jest.Mock).mockReset();
    (eventService.deleteUnpublishedEvent as jest.Mock).mockReset();
    (eventService.updateEvent as jest.Mock).mockReset();
    (eventService.createEvent as jest.Mock).mockReset();
    (eventService.scheduleEvent as jest.Mock).mockReset();
    (eventService.getEventParticipants as jest.Mock).mockReset();
    mockGetEventStaffState.mockReset();
    mockPutEventStaffState.mockReset();
    (leagueService.deleteMatchesByEvent as jest.Mock).mockReset();
    (leagueService.deleteWeeklySchedulesForEvent as jest.Mock).mockReset();
    (organizationService.getOrganizationById as jest.Mock).mockReset();

    // Mirror production behavior:
    // - `GET /api/events/:id` returns an event row without embedded matches
    // - matches are loaded via `GET /api/events/:id/matches`
    apiRequestMock.mockImplementation((path: string, options?: any) => {
      if (path === '/api/chat/terms-consent') {
        if (options?.method === 'POST') {
          return Promise.resolve({
            version: '2026-06-10',
            url: '/terms',
            summary: ['Sending chat messages or creating events requires agreement to the BracketIQ Terms and EULA.'],
            accepted: true,
            acceptedAt: '2026-04-14T12:00:00.000Z',
          });
        }
        return Promise.resolve({
          version: '2026-06-10',
          url: '/terms',
          summary: ['Sending chat messages or creating events requires agreement to the BracketIQ Terms and EULA.'],
          accepted: true,
          acceptedAt: '2026-04-14T12:00:00.000Z',
        });
      }
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
    (eventService.getEventById as jest.Mock).mockImplementation(async () => {
      const event = buildApiEvent();
      delete (event as any).matches;
      return event;
    });
    (eventService.getEventWithRelations as jest.Mock).mockResolvedValue(undefined);
    (eventService.getEventDetailBootstrap as jest.Mock).mockResolvedValue(undefined);
    mockGetEventStaffState.mockImplementation(async (eventId: string) => ({
      contractVersion: 1,
      eventId,
      revision: `revision_before_${eventId}`,
      assistantHostIds: [],
      officialPositions: [{ id: 'position_1', name: 'Referee', count: 1, order: 0 }],
      eventOfficials: [],
      officialIds: [],
      staffInvites: [],
    }));
    mockPutEventStaffState.mockImplementation(async (eventId: string, input: any) => ({
      contractVersion: 1,
      eventId,
      revision: `revision_after_${eventId}`,
      assistantHostIds: input.assistantHostIds ?? [],
      officialPositions: [{ id: 'position_1', name: 'Referee', count: 1, order: 0 }],
      eventOfficials: input.eventOfficials ?? [],
      officialIds: (input.eventOfficials ?? []).map((official: any) => official.userId),
      staffInvites: [],
    }));
    (eventService.getEventParticipants as jest.Mock).mockResolvedValue({
      event: null,
      participants: {
        teamIds: [],
        userIds: [],
        waitListIds: [],
        freeAgentIds: [],
        divisions: [],
      },
      teams: [],
      users: [],
      participantCount: 0,
      participantCapacity: 0,
      occurrence: null,
    });
    (organizationService.getOrganizationById as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('lets an event host start an unstaffed match from the score modal', async () => {
    renderWithMantine(<LeagueSchedulePage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Select First Match' }));

    expect(await screen.findByRole('button', { name: 'Start Match' })).toBeInTheDocument();
  });

  it('shows the terms modal on event creation until consent is accepted', async () => {
    const setUserMock = jest.fn();
    useAppMock.mockReturnValue({
      user: { $id: 'host_1' },
      isAuthenticated: true,
      isGuest: false,
      loading: false,
      setUser: setUserMock,
    });
    useSearchParamsMock.mockReturnValue({
      get: (key: string) => {
        if (key === 'create') return '1';
        return null;
      },
    });

    apiRequestMock.mockImplementation((path: string, options?: any) => {
      if (path === '/api/chat/terms-consent') {
        if (options?.method === 'POST') {
          return Promise.resolve({
            version: '2026-06-10',
            url: '/terms',
            summary: ['There is no tolerance for objectionable content or abusive users.'],
            accepted: true,
            acceptedAt: '2026-04-14T12:00:00.000Z',
          });
        }
        return Promise.resolve({
          version: '2026-06-10',
          url: '/terms',
          summary: ['There is no tolerance for objectionable content or abusive users.'],
          accepted: false,
          acceptedAt: null,
        });
      }
      return Promise.resolve({});
    });

    renderWithMantine(<LeagueSchedulePage />);

    expect(await screen.findByText('Agree to the Terms and EULA')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Agree' }));

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith(
        '/api/chat/terms-consent',
        expect.objectContaining({
          method: 'POST',
          body: { accepted: true },
        }),
      );
    });

    await waitFor(() => {
      expect(screen.queryByText('Agree to the Terms and EULA')).not.toBeInTheDocument();
    });

    expect(setUserMock).toHaveBeenCalledWith(expect.objectContaining({
      chatTermsAcceptedAt: '2026-04-14T12:00:00.000Z',
      chatTermsVersion: '2026-06-10',
    }));
  });

  it('skips the terms modal on event creation after consent already exists', async () => {
    useSearchParamsMock.mockReturnValue({
      get: (key: string) => {
        if (key === 'create') return '1';
        return null;
      },
    });

    renderWithMantine(<LeagueSchedulePage />);

    expect(await screen.findByText('Create Event')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText('Agree to the Terms and EULA')).not.toBeInTheDocument();
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

  it('uses the event detail bootstrap endpoint for initial schedule hydration', async () => {
    useSearchParamsMock.mockReturnValue({
      get: (key: string) => {
        if (key === 'mode') return 'edit';
        if (key === 'preview') return null;
        return null;
      },
      toString: () => 'mode=edit',
    });
    const bootstrappedTeam = {
      $id: 'team_1',
      name: 'Bootstrap Team',
      playerIds: [],
      players: [],
    };
    const bootstrappedEvent = buildApiEvent({
      teamSignup: true,
      teamIds: ['team_1'],
      teams: [bootstrappedTeam],
    });
    (eventService.getEventDetailBootstrap as jest.Mock).mockResolvedValue({
      event: bootstrappedEvent,
      participantSnapshot: {
        event: bootstrappedEvent,
        participants: {
          teamIds: ['team_1'],
          userIds: [],
          waitListIds: [],
          freeAgentIds: [],
          divisions: [],
        },
        teams: [bootstrappedTeam],
        users: [],
        participantCount: 1,
        participantCapacity: 0,
        occurrence: null,
        divisionWarnings: [],
      },
      matches: bootstrappedEvent.matches ?? [],
      fields: bootstrappedEvent.fields ?? [],
      timeSlots: bootstrappedEvent.timeSlots ?? [],
      leagueScoringConfig: bootstrappedEvent.leagueScoringConfig ?? null,
      staffInvites: [],
      teamCompliance: {
        teams: [{
          teamId: 'team_1',
          teamName: 'Bootstrap Team',
          payment: {
            hasBill: false,
            billId: null,
            totalAmountCents: 0,
            paidAmountCents: 0,
            status: null,
            isPaidInFull: false,
            paymentPending: false,
          },
          documents: {
            signedCount: 0,
            requiredCount: 0,
          },
          users: [],
        }],
      },
      userCompliance: null,
    });

    renderWithMantine(<LeagueSchedulePage />);

    await waitFor(() => {
      expect(screen.getByText(/Summer League/)).toBeInTheDocument();
    });

    expect(eventService.getEventDetailBootstrap).toHaveBeenCalledWith('event_1', undefined, {
      manage: 'auto',
    });
    expect(eventService.getEventWithRelations).not.toHaveBeenCalled();
    expect(eventService.getEventParticipants).not.toHaveBeenCalled();
    expect(
      apiRequestMock.mock.calls.some(([path]) => path === '/api/events/event_1/matches'),
    ).toBe(false);
    expect(
      apiRequestMock.mock.calls.some(([path]) => path === '/api/events/event_1/teams/compliance'),
    ).toBe(false);
  });

  it('hides event management actions from signed-in users who cannot manage the event', async () => {
    useAppMock.mockReturnValue({
      user: { $id: 'viewer_1' },
      isAuthenticated: true,
      isGuest: false,
      loading: false,
      setUser: jest.fn(),
    });
    useSearchParamsMock.mockReturnValue({
      get: (key: string) => {
        if (key === 'mode') return null;
        if (key === 'preview') return null;
        return null;
      },
    });

    renderWithMantine(<LeagueSchedulePage />);

    await waitFor(() => {
      expect(screen.getByText(/Summer League/)).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /report event/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^manage$/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/send notification/i)).not.toBeInTheDocument();
  });

  it('does not enter manage state from the edit query parameter without event management access', async () => {
    useAppMock.mockReturnValue({
      user: { $id: 'viewer_1' },
      isAuthenticated: true,
      isGuest: false,
      loading: false,
      setUser: jest.fn(),
    });
    useSearchParamsMock.mockReturnValue({
      get: (key: string) => {
        if (key === 'mode') return 'edit';
        if (key === 'preview') return null;
        return null;
      },
      toString: () => 'mode=edit',
    });

    renderWithMantine(<LeagueSchedulePage />);

    await waitFor(() => {
      expect(screen.getByText(/Summer League/)).toBeInTheDocument();
    });

    expect(capturedEventFormProps).toBeNull();
    expect(screen.queryByTestId('event-form')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^save$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^more$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /cancel manage/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^manage$/i })).not.toBeInTheDocument();
  });

  it('renders match incidents loaded with schedule matches', async () => {
    useAppMock.mockReturnValue({
      user: { $id: 'viewer_1' },
      isAuthenticated: true,
      isGuest: false,
      loading: false,
      setUser: jest.fn(),
    });
    useSearchParamsMock.mockReturnValue({
      get: (key: string) => {
        if (key === 'mode') return null;
        if (key === 'preview') return null;
        return null;
      },
    });

    const rules = {
      scoringModel: 'POINTS_ONLY',
      segmentCount: 1,
      segmentLabel: 'Total',
      supportedIncidentTypes: ['GOAL', 'DISCIPLINE', 'NOTE', 'ADMIN'],
      autoCreatePointIncidentType: 'GOAL',
      pointIncidentRequiresParticipant: false,
    };
    const baseEvent = buildApiEvent({
      hostId: 'host_1',
      assistantHostIds: [],
      autoCreatePointMatchIncidents: true,
      resolvedMatchRules: rules,
    });
    const matchWithIncident = {
      ...(baseEvent.matches?.[0] ?? {}),
      id: 'match_1',
      $id: 'match_1',
      eventId: 'event_1',
      team1Id: 'team_a',
      team2Id: 'team_b',
      team1: { id: 'team_a', $id: 'team_a', name: 'Aces' },
      team2: { id: 'team_b', $id: 'team_b', name: 'Diggers' },
      officialId: 'official_1',
      officialCheckedIn: true,
      officialIds: [{ positionId: 'official', slotIndex: 0, userId: 'official_1', checkedIn: true }],
      actualStart: '2026-03-01T10:00:00.000Z',
      matchRulesSnapshot: rules,
      resolvedMatchRules: rules,
      team1Points: [1],
      team2Points: [0],
      setResults: [0],
      segments: [{
        id: 'match_1_segment_1',
        $id: 'match_1_segment_1',
        eventId: 'event_1',
        matchId: 'match_1',
        sequence: 1,
        status: 'IN_PROGRESS',
        scores: { team_a: 1, team_b: 0 },
        winnerEventTeamId: null,
        metadata: null,
      }],
      incidents: [{
        id: 'incident_1',
        $id: 'incident_1',
        eventId: 'event_1',
        matchId: 'match_1',
        segmentId: 'match_1_segment_1',
        eventTeamId: 'team_a',
        eventRegistrationId: null,
        participantUserId: null,
        officialUserId: 'official_1',
        incidentType: 'GOAL',
        sequence: 1,
        minute: 5,
        clock: null,
        clockSeconds: null,
        linkedPointDelta: 1,
        note: null,
        metadata: null,
      }],
    };

    apiRequestMock.mockImplementation((path: string) => {
      if (path === '/api/chat/terms-consent') {
        return Promise.resolve({
          version: '2026-06-10',
          url: '/terms',
          summary: [],
          accepted: true,
          acceptedAt: '2026-04-14T12:00:00.000Z',
        });
      }
      if (path === '/api/events/event_1') {
        const event = { ...baseEvent };
        delete (event as any).matches;
        return Promise.resolve({ event });
      }
      if (path === '/api/events/event_1/matches') {
        return Promise.resolve({ matches: [matchWithIncident] });
      }
      return Promise.resolve({});
    });
    (eventService.getEvent as jest.Mock).mockImplementation(async () => {
      const event = { ...baseEvent };
      delete (event as any).matches;
      return event;
    });
    (eventService.getEventById as jest.Mock).mockImplementation(async () => {
      const event = { ...baseEvent };
      delete (event as any).matches;
      return event;
    });

    renderWithMantine(<LeagueSchedulePage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Select First Match' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Match Details' }));

    expect(await screen.findByText("Aces | 5'")).toBeInTheDocument();
    expect(screen.queryByText('No match details recorded.')).not.toBeInTheDocument();
  });

  it('updates the open score modal when a scoring incident is saved', async () => {
    useAppMock.mockReturnValue({
      user: { $id: 'official_1' },
      isAuthenticated: true,
      isGuest: false,
      loading: false,
      setUser: jest.fn(),
    });
    useSearchParamsMock.mockReturnValue({
      get: (key: string) => {
        if (key === 'mode') return null;
        if (key === 'preview') return null;
        return null;
      },
    });

    const rules = {
      scoringModel: 'POINTS_ONLY',
      segmentCount: 1,
      segmentLabel: 'Total',
      supportedIncidentTypes: ['GOAL', 'DISCIPLINE', 'NOTE', 'ADMIN'],
      autoCreatePointIncidentType: 'GOAL',
      pointIncidentRequiresParticipant: false,
    };
    const baseEvent = buildApiEvent({
      hostId: 'host_1',
      assistantHostIds: [],
      autoCreatePointMatchIncidents: true,
      resolvedMatchRules: rules,
    });
    const baseMatch = {
      ...(baseEvent.matches?.[0] ?? {}),
      id: 'match_1',
      $id: 'match_1',
      eventId: 'event_1',
      team1Id: 'team_a',
      team2Id: 'team_b',
      officialId: 'official_1',
      officialCheckedIn: true,
      officialIds: [{ positionId: 'official', slotIndex: 0, userId: 'official_1', checkedIn: true }],
      matchRulesSnapshot: rules,
      resolvedMatchRules: rules,
      team1Points: [0],
      team2Points: [0],
      setResults: [0],
      segments: [{
        id: 'match_1_segment_1',
        $id: 'match_1_segment_1',
        eventId: 'event_1',
        matchId: 'match_1',
        sequence: 1,
        status: 'IN_PROGRESS',
        scores: { team_a: 0, team_b: 0 },
        winnerEventTeamId: null,
        metadata: null,
      }],
      incidents: [],
    };
    const updatedMatch = {
      ...baseMatch,
      team1Points: [1],
      segments: [{
        ...baseMatch.segments[0],
        status: 'IN_PROGRESS',
        scores: { team_a: 1, team_b: 0 },
      }],
      incidents: [{
        id: 'incident_1',
        $id: 'incident_1',
        eventId: 'event_1',
        matchId: 'match_1',
        segmentId: 'match_1_segment_1',
        eventTeamId: 'team_a',
        eventRegistrationId: null,
        participantUserId: null,
        officialUserId: 'official_1',
        incidentType: 'GOAL',
        sequence: 1,
        minute: 5,
        clock: null,
        clockSeconds: null,
        linkedPointDelta: 1,
        note: null,
        metadata: null,
      }],
    };

    apiRequestMock.mockImplementation((path: string, options?: any) => {
      if (path === '/api/chat/terms-consent') {
        return Promise.resolve({
          version: '2026-06-10',
          url: '/terms',
          summary: [],
          accepted: true,
          acceptedAt: '2026-04-14T12:00:00.000Z',
        });
      }
      if (path === '/api/events/event_1') {
        const event = { ...baseEvent };
        delete (event as any).matches;
        return Promise.resolve({ event });
      }
      if (path === '/api/events/event_1/matches') {
        return Promise.resolve({ matches: [baseMatch] });
      }
      if (path === '/api/events/event_1/matches/match_1/incidents' && options?.method === 'POST') {
        return Promise.resolve({ match: updatedMatch });
      }
      return Promise.resolve({});
    });
    (eventService.getEvent as jest.Mock).mockImplementation(async () => {
      const event = { ...baseEvent };
      delete (event as any).matches;
      return event;
    });
    (eventService.getEventById as jest.Mock).mockImplementation(async () => {
      const event = { ...baseEvent };
      delete (event as any).matches;
      return event;
    });

    renderWithMantine(<LeagueSchedulePage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Select First Match' }));
    expect(await screen.findByText('No match details recorded.')).toBeInTheDocument();

    fireEvent.click(await screen.findByRole('button', { name: 'Add to Match Log' }));

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith(
        '/api/events/event_1/matches/match_1/incidents',
        expect.objectContaining({ method: 'POST' }),
      );
    });
    expect(await screen.findByText("Aces | 5'")).toBeInTheDocument();
    expect(screen.queryByText('No match details recorded.')).not.toBeInTheDocument();
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

  it('skips stale match persistence after removing fields deletes their matches', async () => {
    useSearchParamsMock.mockReturnValue({
      get: (key: string) => {
        if (key === 'mode') return 'edit';
        if (key === 'preview') return null;
        return null;
      },
      toString: () => 'mode=edit',
    });

    const fieldOne = {
      id: 'field_1',
      $id: 'field_1',
      name: 'Field 1',
      location: 'Park',
      lat: 0,
      long: 0,
    };
    const fieldTwo = {
      id: 'field_2',
      $id: 'field_2',
      name: 'Field 2',
      location: 'Park',
      lat: 0,
      long: 0,
    };
    const baseMatches = buildApiEvent().matches ?? [];
    const keptMatch = {
      ...baseMatches[0],
      id: 'match_1',
      $id: 'match_1',
      fieldId: 'field_1',
      field: fieldOne,
    };
    const removedFieldMatch = {
      ...baseMatches[0],
      id: 'match_2',
      $id: 'match_2',
      fieldId: 'field_2',
      field: fieldTwo,
    };
    const eventBeforeSave = buildApiEvent({
      id: 'event_1',
      $id: 'event_1',
      name: 'Field Reduction Tournament',
      eventType: 'TOURNAMENT',
      state: 'PUBLISHED',
      organizationId: 'org_1',
      hostId: 'host_1',
      assistantHostIds: [],
      fieldIds: ['field_1', 'field_2'],
      fields: [fieldOne, fieldTwo],
      matches: [keptMatch, removedFieldMatch],
    });
    let persistedEvent = eventBeforeSave;
    let persistedMatches = [keptMatch, removedFieldMatch];

    const eventWithoutMatches = (event: Record<string, any>) => {
      const responseEvent = { ...event };
      delete responseEvent.matches;
      return responseEvent;
    };

    apiRequestMock.mockImplementation((path: string, options?: any) => {
      if (path === '/api/events/event_1') {
        return Promise.resolve({ event: eventWithoutMatches(persistedEvent) });
      }
      if (path === '/api/events/event_1/matches' && options?.method === 'PATCH') {
        return Promise.reject(Object.assign(new Error('Request failed'), { status: 404 }));
      }
      if (path === '/api/events/event_1/matches') {
        return Promise.resolve({ matches: persistedMatches });
      }
      return Promise.resolve({});
    });
    (eventService.getEvent as jest.Mock).mockImplementation(async () => eventWithoutMatches(persistedEvent));
    (eventService.getEventById as jest.Mock).mockImplementation(async () => eventWithoutMatches(persistedEvent));
    (eventService.updateEvent as jest.Mock).mockImplementation((_id: string, payload: any) => {
      persistedEvent = {
        ...eventBeforeSave,
        ...payload,
        fieldIds: ['field_1'],
        fields: [fieldOne],
      };
      persistedMatches = [keptMatch];
      return Promise.resolve(eventWithoutMatches(persistedEvent));
    });

    mockEventFormDraft = {
      ...eventBeforeSave,
      fieldIds: ['field_1'],
      fields: [fieldOne],
    };
    mockEventFormDirtyState = true;

    renderWithMantine(<LeagueSchedulePage />);

    const saveButton = await screen.findByRole('button', { name: /^save$/i });
    await waitFor(() => {
      expect(saveButton).toBeEnabled();
    });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(eventService.updateEvent).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(mockCommitDirtyBaseline).toHaveBeenCalledTimes(1);
    });

    expect(
      apiRequestMock.mock.calls.some(([path, options]) => (
        path === '/api/events/event_1/matches'
        && (options as { method?: string } | undefined)?.method === 'PATCH'
      )),
    ).toBe(false);
    expect(screen.queryByText(/Failed to save tournament changes/i)).not.toBeInTheDocument();
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

  it('hides the schedule pool selector when all divisions are selected', async () => {
    useSearchParamsMock.mockReturnValue({
      get: (key: string) => {
        if (key === 'mode') return 'edit';
        if (key === 'preview') return null;
        if (key === 'tab') return 'schedule';
        return null;
      },
      toString: () => 'mode=edit&tab=schedule',
    });

    const goldDivisionId = 'division_gold';
    const silverDivisionId = 'division_silver';
    const poolAGoldId = 'pool_a_gold';
    const poolASilverId = 'pool_a_silver';
    const event = buildApiEvent({
      eventType: 'TOURNAMENT',
      includePlayoffs: true,
      includePlayoffsOrPools: true,
      divisions: [poolAGoldId, poolASilverId, goldDivisionId, silverDivisionId],
      divisionDetails: [
        {
          id: poolAGoldId,
          key: 'pool_a_gold',
          name: 'Pool A',
          kind: 'LEAGUE',
          playoffPlacementDivisionIds: [goldDivisionId],
          teamIds: [],
        },
        {
          id: poolASilverId,
          key: 'pool_a_silver',
          name: 'Pool A',
          kind: 'LEAGUE',
          playoffPlacementDivisionIds: [silverDivisionId],
          teamIds: [],
        },
        {
          id: goldDivisionId,
          key: 'gold',
          name: 'Gold',
          kind: 'PLAYOFF',
          teamIds: [],
        },
        {
          id: silverDivisionId,
          key: 'silver',
          name: 'Silver',
          kind: 'PLAYOFF',
          teamIds: [],
        },
      ],
      playoffDivisionDetails: [
        {
          id: goldDivisionId,
          key: 'gold',
          name: 'Gold',
          kind: 'PLAYOFF',
          teamIds: [],
        },
        {
          id: silverDivisionId,
          key: 'silver',
          name: 'Silver',
          kind: 'PLAYOFF',
          teamIds: [],
        },
      ],
    });
    delete (event as any).matches;

    apiRequestMock.mockImplementation((path: string) => {
      if (path === '/api/events/event_1') {
        return Promise.resolve({ event });
      }
      if (path === '/api/events/event_1/matches') {
        return Promise.resolve({ matches: [] });
      }
      if (path.startsWith('/api/events/event_1/standings?')) {
        return Promise.resolve({
          division: {
            divisionId: poolAGoldId,
            divisionName: 'Pool A',
            standingsConfirmedAt: null,
            standingsConfirmedBy: null,
            playoffTeamCount: null,
            playoffPlacementDivisionIds: [goldDivisionId],
            standingsOverrides: null,
            standings: [],
            validation: {
              mappingErrors: [],
              capacityErrors: [],
            },
            playoffDivisions: [],
          },
        });
      }
      return Promise.resolve({});
    });

    renderWithMantine(<LeagueSchedulePage />);

    const schedulePanel = await screen.findByRole('tabpanel', { name: /^Schedule$/i });
    expect(within(schedulePanel).getByDisplayValue('All divisions')).toBeInTheDocument();
    expect(within(schedulePanel).queryByLabelText(/^Pool$/i)).not.toBeInTheDocument();
  });

  it('shows the load error message below the try again button', async () => {
    apiRequestMock.mockRejectedValue(new Error('Network down'));

    renderWithMantine(<LeagueSchedulePage />);

    const retryButton = await screen.findByRole('button', { name: /try again/i });
    const errorMessage = await screen.findByText('Failed to load league schedule. Please try again. Network down');
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

  it('hides manage-only actions before entering manage mode', async () => {
    renderWithMantine(<LeagueSchedulePage />);

    expect(await screen.findByRole('button', { name: /^manage$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^more$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /cancel league/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /create template/i })).not.toBeInTheDocument();
  });

  it('redirects to the user home page after deleting a future event', async () => {
    useAppMock.mockReturnValue({
      user: { $id: 'host_1', homePageOrganizationId: 'org_42', onboardingIntent: 'ORGANIZATION' },
      isAuthenticated: true,
      isGuest: false,
      loading: false,
      setUser: jest.fn(),
    });
    const futureStart = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const futureEnd = new Date(Date.now() + 26 * 60 * 60 * 1000);
    const futureEvent = mockScheduleApiEvent({
      start: formatLocalDateTime(futureStart),
      end: formatLocalDateTime(futureEnd),
    });
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
    (leagueService.deleteMatchesByEvent as jest.Mock).mockResolvedValue(undefined);
    (leagueService.deleteWeeklySchedulesForEvent as jest.Mock).mockResolvedValue(undefined);
    (eventService.deleteEventResult as jest.Mock).mockResolvedValue({ deleted: true, action: 'deleted' });

    try {
      renderWithMantine(<LeagueSchedulePage />);

      expect(await screen.findByRole('button', { name: /^manage$/i })).toBeInTheDocument();
      await clickMoreAction(/delete event/i);

      await waitFor(() => {
        expect(leagueService.deleteMatchesByEvent).toHaveBeenCalledWith('event_1');
      });
      expect(confirmSpy).toHaveBeenCalledWith('Delete this event? If it has registrations, billing, or schedule history, it will be archived instead.');
      expect(leagueService.deleteWeeklySchedulesForEvent).toHaveBeenCalledWith('event_1');
      expect(eventService.deleteEventResult).toHaveBeenCalledWith(
        expect.objectContaining({
          $id: 'event_1',
          start: futureEvent.start,
        }),
      );
      expect(mockRouter.push).toHaveBeenCalledWith('/organizations/org_42');
    } finally {
      confirmSpy.mockRestore();
    }
  });

  it('hides the delete event action after the event starts', async () => {
    useSearchParamsMock.mockReturnValue({
      get: (key: string) => {
        if (key === 'mode') return 'edit';
        if (key === 'preview') return null;
        return null;
      },
    });
    const pastStart = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const pastEnd = new Date(Date.now() - 22 * 60 * 60 * 1000);
    mockScheduleApiEvent({
      start: formatLocalDateTime(pastStart),
      end: formatLocalDateTime(pastEnd),
    });

    renderWithMantine(<LeagueSchedulePage />);

    await openMoreActionsMenu();

    expect(await screen.findByRole('menuitem', { name: /cancel manage/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /delete event/i })).not.toBeInTheDocument();
  });

  it('does not show Create Template for an unsaved create-mode draft', async () => {
    useSearchParamsMock.mockReturnValue({
      get: (key: string) => {
        if (key === 'create') return '1';
        if (key === 'mode') return 'edit';
        return null;
      },
    });

    apiRequestMock.mockImplementation((path: string) => {
      if (path.startsWith('/api/event-templates')) {
        return Promise.resolve({ templates: [] });
      }
      return Promise.resolve({});
    });

    renderWithMantine(<LeagueSchedulePage />);

    await waitFor(() => {
      expect(capturedEventFormProps?.event?.state).toBe('DRAFT');
    });

    expect(screen.queryByRole('menuitem', { name: /create template/i })).not.toBeInTheDocument();
    expect(eventService.createEvent).not.toHaveBeenCalled();
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
      if (path.startsWith('/api/event-templates')) {
        return Promise.resolve({ templates: [] });
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
      if (path.startsWith('/api/event-templates')) {
        return Promise.resolve({ templates: [] });
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

  it('creates a template from the persisted source event id in edit mode', async () => {
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
          location: '',
          lat: 0,
          long: 0,
          divisions: [openSourceDivisionId, advancedSourceDivisionId],
        },
        {
          $id: 'field_local_2',
          name: 'Court B',
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

    apiRequestMock.mockImplementation((path: string) => {
      if (path === '/api/events/event_1') {
        const event = buildApiEvent(persistedEvent);
        delete (event as any).matches;
        return Promise.resolve({ event });
      }
      if (path === '/api/events/event_1/matches') {
        return Promise.resolve({ matches: buildApiEvent().matches });
      }
      return Promise.resolve({});
    });

    renderWithMantine(<LeagueSchedulePage />);

    await clickMoreAction(/create template/i);

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith('/api/event-templates', {
        method: 'POST',
        body: {
          sourceEventId: 'event_1',
        },
      });
    });
    expect(eventService.createEvent).not.toHaveBeenCalled();
  });

  it('does not auto-seed create mode from a templateId query before a start date is chosen', async () => {
    useSearchParamsMock.mockReturnValue({
      get: (key: string) => {
        if (key === 'create') return '1';
        if (key === 'mode') return 'edit';
        if (key === 'templateId') return 'template_1';
        return null;
      },
    });

    apiRequestMock.mockImplementation((path: string, options?: any) => {
      if (path === '/api/chat/terms-consent') {
        return Promise.resolve({
          version: '2026-06-10',
          url: '/terms',
          summary: ['Sending chat messages or creating events requires agreement to the BracketIQ Terms and EULA.'],
          accepted: true,
          acceptedAt: '2026-04-14T12:00:00.000Z',
        });
      }
      if (path === '/api/event-templates/template_1/seed' && options?.method === 'POST') {
        return Promise.resolve({
          event: buildApiEvent({
            id: 'event_1',
            $id: 'event_1',
            name: 'Template League',
            state: 'DRAFT',
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
        });
      }
      if (path.startsWith('/api/event-templates')) {
        return Promise.resolve({ templates: [{ id: 'template_1', name: 'Template League' }] });
      }
      return Promise.resolve({});
    });

    renderWithMantine(<LeagueSchedulePage />);

    await waitFor(() => {
      expect(capturedEventFormProps?.event?.$id).toBe('event_1');
      expect(capturedEventFormProps?.event?.state).toBe('DRAFT');
    });
    expect(apiRequestMock.mock.calls.some(([path]) => (
      path === '/api/event-templates/template_1/seed'
    ))).toBe(false);

    const standingsCalls = apiRequestMock.mock.calls.filter(([path]) => (
      typeof path === 'string' && path.includes('/standings')
    ));
    expect(standingsCalls).toHaveLength(0);
  });

  it('does not auto-apply an org template before a start date is chosen', async () => {
    useSearchParamsMock.mockReturnValue({
      get: (key: string) => {
        if (key === 'create') return '1';
        if (key === 'mode') return 'edit';
        if (key === 'templateId') return 'template_org_1';
        if (key === 'orgId') return 'org_1';
        return null;
      },
    });

    (organizationService.getOrganizationById as jest.Mock).mockResolvedValue({
      $id: 'org_1',
      ownerId: 'owner_1',
      location: 'Organization HQ',
      coordinates: [-83.0, 42.0],
      fields: [
        {
          $id: 'field_org_1',
          name: 'Org Court',
          location: 'Organization HQ',
          lat: 42.0,
          long: -83.0,
        },
      ],
      officialIds: ['official_org_1'],
      officials: [{ $id: 'official_org_1' }],
    });

    apiRequestMock.mockImplementation((path: string, options?: any) => {
      if (path === '/api/chat/terms-consent') {
        return Promise.resolve({
          version: '2026-06-10',
          url: '/terms',
          summary: ['Sending chat messages or creating events requires agreement to the BracketIQ Terms and EULA.'],
          accepted: true,
          acceptedAt: '2026-04-14T12:00:00.000Z',
        });
      }
      if (path === '/api/event-templates/template_org_1/seed' && options?.method === 'POST') {
        return Promise.resolve({
          event: buildApiEvent({
            id: 'event_1',
            $id: 'event_1',
            name: 'Template League',
            state: 'DRAFT',
            eventType: 'LEAGUE',
            organizationId: 'org_1',
            location: 'Template Arena',
            coordinates: [-121.9, 37.3],
            fields: [
              {
                $id: 'field_template_1',
                name: 'Template Court',
                location: 'Template Arena',
                lat: 37.3,
                long: -121.9,
              },
            ],
          }),
        });
      }
      if (path.startsWith('/api/event-templates')) {
        return Promise.resolve({ templates: [{ id: 'template_org_1', name: 'Template League' }] });
      }
      return Promise.resolve({});
    });

    renderWithMantine(<LeagueSchedulePage />);

    expect(eventService.getEventWithRelations).not.toHaveBeenCalledWith('template_org_1');
    await waitFor(() => {
      expect(organizationService.getOrganizationById).toHaveBeenCalledWith('org_1', true);
    });
    expect(apiRequestMock.mock.calls.some(([path]) => (
      path === '/api/event-templates/template_org_1/seed'
    ))).toBe(false);
    await waitFor(() => {
      expect(capturedEventFormProps?.event?.organizationId).toBe('org_1');
      expect(capturedEventFormProps?.event?.location).toBe('Organization HQ');
      expect(capturedEventFormProps?.event?.coordinates).toEqual([-83.0, 42.0]);
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

  it('stages calendar drag edits for matches in manage mode', async () => {
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

    fireEvent.click(await screen.findByRole('button', { name: /move first match/i }));

    await waitFor(() => {
      expect(saveButton).toBeEnabled();
    });
    expect(await screen.findByRole('button', { name: /changes \(1\)/i })).toBeInTheDocument();
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

    await clickMoreAction(/cancel manage/i);

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
    expect(mockPutEventStaffState).toHaveBeenCalledWith(
      'event_unpublished',
      expect.objectContaining({ contractVersion: 1 }),
    );
    expect(eventService.updateEvent).toHaveBeenCalledWith(
      'event_unpublished',
      expect.any(Object),
      expect.objectContaining({ omitStaffAssignments: true }),
    );
    expect(mockGetEventStaffState).toHaveBeenCalledWith('event_unpublished');
    expect(mockPutEventStaffState).toHaveBeenCalledTimes(1);
    expect(mockApplyCanonicalStaffState).toHaveBeenCalledTimes(1);
  });

  it('saves a private league without changing lifecycle state', async () => {
    useSearchParamsMock.mockReturnValue({
      get: (key: string) => {
        if (key === 'preview') return '1';
        if (key === 'mode') return null;
        return null;
      },
    });

    const baseEvent = buildApiEvent({
      id: 'event_private',
      name: 'Private League',
      state: 'PRIVATE',
      attendees: 8,
      fields: [
        {
          id: 'field_1',
          name: 'Court A',
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
          id: 'match_private',
          field: {
            id: 'field_1',
            name: 'Court A',
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
          event: 'event_private',
        },
      ],
    });

    apiRequestMock.mockResolvedValue({ event: baseEvent });
    mockEventFormDirtyState = true;

    (eventService.updateEvent as jest.Mock).mockImplementation((_id: string, payload: any) =>
      Promise.resolve({
        ...payload,
        $id: 'event_private',
        state: 'PRIVATE',
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
    expect(payload.state).toBe('PRIVATE');
    expect(payload.matches).toHaveLength(1);
    expect(payload.timeSlots).toHaveLength(1);
    expect(payload.fields?.[0]?.rentalSlotIds).toBeUndefined();
    expect(payload).not.toHaveProperty('attendees');
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
    await clickMoreAction(/^reschedule$/i);

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
    await clickMoreAction(/^reschedule$/i);

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

  it('warns but allows Save and Reschedule when conflicts exist on the same field', async () => {
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
    expect(await screen.findByText(/You can still save/i)).toBeInTheDocument();

    const saveButton = await screen.findByRole('button', { name: /^save$/i });
    await waitFor(() => {
      expect(saveButton).toBeEnabled();
    });
    fireEvent.click(saveButton);
    await waitFor(() => {
      expect(eventService.updateEvent).toHaveBeenCalledTimes(1);
    });

    await openMoreActionsMenu();
    const rescheduleButton = await screen.findByRole('menuitem', { name: /^reschedule$/i });
    expect(rescheduleButton).toBeEnabled();
    await clickMoreActionElement(rescheduleButton);

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

  it('shows create event failure details returned by the server', async () => {
    useSearchParamsMock.mockReturnValue({
      get: (key: string) => {
        if (key === 'create') return '1';
        if (key === 'mode') return 'edit';
        return null;
      },
    });

    mockEventFormDraft = {
      $id: 'event_create_regular',
      name: 'Create Regular Event',
      description: '',
      location: 'Main Gym',
      coordinates: [-83.0, 42.0],
      start: '2026-01-05T09:00:00.000',
      end: '2026-01-05T11:00:00.000',
      eventType: 'EVENT',
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
      eventOfficials: [],
      fields: [
        {
          $id: 'field_local_1',
          name: 'Court A',
          location: '',
          lat: 0,
          long: 0,
          divisions: ['open'],
        },
      ],
      timeSlots: [
        {
          $id: 'slot_regular',
          dayOfWeek: 1,
          daysOfWeek: [1],
          divisions: ['open'],
          startTimeMinutes: 540,
          endTimeMinutes: 660,
          repeating: false,
          scheduledFieldId: 'field_local_1',
          startDate: '2026-01-05T09:00:00.000',
          endDate: '2026-01-05T11:00:00.000',
        },
      ],
    };
    (eventService.scheduleEvent as jest.Mock).mockRejectedValue(
      new Error('Selected resources and time range conflict with an existing reservation.'),
    );
    mockEventFormDirtyState = true;

    renderWithMantine(<LeagueSchedulePage />);

    const publishButton = await screen.findByRole('button', { name: /create event/i });
    await waitFor(() => {
      expect(publishButton).toBeEnabled();
    });
    fireEvent.click(publishButton);

    expect(await screen.findByText(
      'Failed to create event. Selected resources and time range conflict with an existing reservation.',
    )).toBeInTheDocument();
    expect(screen.getByTestId('event-form')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument();
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
      assistantHostIds: ['assistant_1'],
      officialIds: ['official_1'],
      officialPositions: [{ id: 'position_client_1', name: 'Referee', count: 1, order: 0 }],
      eventOfficials: [{
        id: 'official_client_1',
        userId: 'official_1',
        positionIds: ['position_client_1'],
        fieldIds: [],
        isActive: true,
      }],
      pendingStaffInvites: [{
        firstName: 'Casey',
        lastName: 'Official',
        email: 'casey@example.com',
        roles: ['OFFICIAL'],
      }],
      fields: [
        {
          $id: 'field_local_1',
          name: 'Court A',
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
    expect(payload.assistantHostIds).toEqual([]);
    expect(payload.officialIds).toEqual([]);
    expect(payload.eventOfficials).toEqual([]);
    expect(payload).not.toHaveProperty('pendingStaffInvites');
    expect(mockGetEventStaffState).toHaveBeenCalledWith('event_create_league');
    expect(mockPutEventStaffState).toHaveBeenCalledWith(
      'event_create_league',
      expect.objectContaining({
        contractVersion: 1,
        expectedRevision: 'revision_before_event_create_league',
        assistantHostIds: ['assistant_1'],
        eventOfficials: [expect.objectContaining({
          userId: 'official_1',
          positionIds: ['position_1'],
        })],
        pendingInvites: [expect.objectContaining({ email: 'casey@example.com' })],
      }),
    );
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
    (eventService.getEventParticipants as jest.Mock).mockResolvedValue({
      event,
      participants: {
        teamIds: ['team_real', 'team_placeholder'],
        userIds: [],
        waitListIds: [],
        freeAgentIds: [],
        divisions: [],
      },
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
          currentSize: 0,
          isFull: false,
          avatarUrl: '',
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
          currentSize: 0,
          isFull: false,
          avatarUrl: '',
        },
      ],
      users: [],
      participantCount: 2,
      participantCapacity: null,
      occurrence: null,
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

  it('requires two characters and scopes non-org add-team search to the current user personal teams', async () => {
    useSearchParamsMock.mockReturnValue({
      get: (key: string) => {
        if (key === 'mode') return 'edit';
        if (key === 'tab') return 'participants';
        if (key === 'preview') return null;
        return null;
      },
      toString: () => 'mode=edit&tab=participants',
    });

    const event = buildApiEvent({
      hostId: 'host_1',
      organizationId: null,
      eventType: 'TOURNAMENT',
      singleDivision: true,
      teamSignup: true,
      teams: [],
      teamIds: [],
    });
    delete (event as any).matches;

    apiRequestMock.mockImplementation((path: string) => {
      const requestPath = String(path);
      if (requestPath === '/api/chat/terms-consent') {
        return Promise.resolve({
          version: '2026-06-10',
          url: '/terms',
          summary: [],
          accepted: true,
          acceptedAt: '2026-04-14T12:00:00.000Z',
        });
      }
      if (requestPath === '/api/events/event_1') {
        return Promise.resolve({ event });
      }
      if (requestPath === '/api/events/event_1/matches') {
        return Promise.resolve({ matches: [] });
      }
      if (requestPath === '/api/events/event_1/teams/compliance') {
        return Promise.resolve({ teams: [] });
      }
      if (requestPath === '/api/teams?playerId=host_1&managerId=host_1&limit=100') {
        return Promise.resolve({
          teams: [
            { $id: 'team_personal', id: 'team_personal', name: 'Personal Aces', organizationId: null },
            { $id: 'team_org', id: 'team_org', name: 'Org Aces', organizationId: 'org_1' },
          ],
        });
      }
      if (requestPath.startsWith('/api/teams?ids=')) {
        return Promise.resolve({
          teams: [
            {
              $id: 'team_personal',
              id: 'team_personal',
              name: 'Personal Aces',
              division: 'Open',
              sport: 'Volleyball',
              playerIds: [],
              captainId: 'host_1',
              managerId: 'host_1',
              pending: [],
              teamSize: 2,
              organizationId: null,
            },
            {
              $id: 'team_org',
              id: 'team_org',
              name: 'Org Aces',
              division: 'Open',
              sport: 'Volleyball',
              playerIds: [],
              captainId: 'host_1',
              managerId: 'host_1',
              pending: [],
              teamSize: 2,
              organizationId: 'org_1',
            },
          ],
        });
      }
      return Promise.resolve({});
    });
    (eventService.getEventParticipants as jest.Mock).mockResolvedValue({
      event,
      participants: {
        teamIds: [],
        userIds: [],
        waitListIds: [],
        freeAgentIds: [],
        divisions: [],
      },
      teams: [],
      users: [],
      participantCount: 0,
      participantCapacity: null,
      occurrence: null,
    });

    renderWithMantine(<LeagueSchedulePage />);

    const addTeamButton = await screen.findByRole('button', { name: /add team/i });
    fireEvent.click(addTeamButton);

    const searchInput = await screen.findByLabelText(/search teams/i);
    expect(await screen.findByText('Enter at least 2 characters to search your teams.')).toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: 'A' } });
    await waitFor(() => {
      expect(screen.getByText('Enter at least 2 characters to search your teams.')).toBeInTheDocument();
    });
    expect(apiRequestMock.mock.calls.some(([requestPath]) => (
      String(requestPath) === '/api/teams?playerId=host_1&managerId=host_1&limit=100'
    ))).toBe(false);

    fireEvent.change(searchInput, { target: { value: 'Ac' } });

    expect(await screen.findByText('Personal Aces')).toBeInTheDocument();
    expect(screen.queryByText('Org Aces')).not.toBeInTheDocument();
    expect(apiRequestMock.mock.calls.some(([requestPath]) => String(requestPath) === '/api/teams?limit=200')).toBe(false);
  });

  it('uses organization teams only for add-team search on organization events', async () => {
    useSearchParamsMock.mockReturnValue({
      get: (key: string) => {
        if (key === 'mode') return 'edit';
        if (key === 'tab') return 'participants';
        if (key === 'preview') return null;
        return null;
      },
      toString: () => 'mode=edit&tab=participants',
    });

    const event = buildApiEvent({
      hostId: 'host_1',
      organizationId: 'org_1',
      eventType: 'TOURNAMENT',
      singleDivision: true,
      teamSignup: true,
      teams: [],
      teamIds: [],
    });
    delete (event as any).matches;

    apiRequestMock.mockImplementation((path: string) => {
      const requestPath = String(path);
      if (requestPath === '/api/chat/terms-consent') {
        return Promise.resolve({
          version: '2026-06-10',
          url: '/terms',
          summary: [],
          accepted: true,
          acceptedAt: '2026-04-14T12:00:00.000Z',
        });
      }
      if (requestPath === '/api/events/event_1') {
        return Promise.resolve({ event });
      }
      if (requestPath === '/api/events/event_1/matches') {
        return Promise.resolve({ matches: [] });
      }
      if (requestPath === '/api/events/event_1/teams/compliance') {
        return Promise.resolve({ teams: [] });
      }
      if (requestPath === '/api/teams?organizationId=org_1&limit=200') {
        return Promise.resolve({
          teams: [
            {
              $id: 'team_org',
              id: 'team_org',
              name: 'Org Aces',
              division: 'Open',
              sport: 'Volleyball',
              playerIds: [],
              captainId: '',
              pending: [],
              teamSize: 2,
              organizationId: 'org_1',
            },
            {
              $id: 'team_other',
              id: 'team_other',
              name: 'Sidewinders',
              division: 'Open',
              sport: 'Volleyball',
              playerIds: [],
              captainId: '',
              pending: [],
              teamSize: 2,
              organizationId: 'org_1',
            },
          ],
        });
      }
      return Promise.resolve({});
    });
    (eventService.getEventParticipants as jest.Mock).mockResolvedValue({
      event,
      participants: {
        teamIds: [],
        userIds: [],
        waitListIds: [],
        freeAgentIds: [],
        divisions: [],
      },
      teams: [],
      users: [],
      participantCount: 0,
      participantCapacity: null,
      occurrence: null,
    });

    renderWithMantine(<LeagueSchedulePage />);

    const addTeamButton = await screen.findByRole('button', { name: /add team/i });
    fireEvent.click(addTeamButton);

    const searchInput = await screen.findByLabelText(/search teams/i);
    expect(await screen.findByText('Org Aces')).toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: 'A' } });
    await waitFor(() => {
      expect(screen.getByText('Enter at least 2 characters to search organization teams.')).toBeInTheDocument();
    });
    expect(screen.queryByText('Org Aces')).not.toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: 'Ac' } });
    expect(await screen.findByText('Org Aces')).toBeInTheDocument();
    expect(screen.queryByText('Sidewinders')).not.toBeInTheDocument();
    expect(screen.queryByText('Search Results')).not.toBeInTheDocument();
    expect(apiRequestMock.mock.calls.some(([requestPath]) => String(requestPath) === '/api/teams?limit=200')).toBe(false);
    expect(apiRequestMock.mock.calls.some(([requestPath]) => String(requestPath).includes('playerId=host_1'))).toBe(false);
  });

  it('filters tournament pool standings rows to the selected pool', async () => {
    useSearchParamsMock.mockReturnValue({
      get: (key: string) => {
        if (key === 'mode') return 'edit';
        if (key === 'tab') return 'standings';
        if (key === 'preview') return null;
        return null;
      },
      toString: () => 'mode=edit&tab=standings',
    });

    const bracketDivisionId = 'bracket_open';
    const poolADivisionId = 'pool_a';
    const poolBDivisionId = 'pool_b';
    const poolATeam = {
      $id: 'team_pool_a',
      id: 'team_pool_a',
      name: 'Pool A Team',
      division: bracketDivisionId,
      sport: 'Volleyball',
      playerIds: [],
      captainId: 'captain_a',
      pending: [],
      teamSize: 2,
      currentSize: 2,
      isFull: true,
      avatarUrl: '',
      parentTeamId: 'parent_a',
    };
    const poolBTeam = {
      $id: 'team_pool_b',
      id: 'team_pool_b',
      name: 'Pool B Team',
      division: bracketDivisionId,
      sport: 'Volleyball',
      playerIds: [],
      captainId: 'captain_b',
      pending: [],
      teamSize: 2,
      currentSize: 2,
      isFull: true,
      avatarUrl: '',
      parentTeamId: 'parent_b',
    };
    const event = buildApiEvent({
      name: 'Pool Standings Tournament',
      eventType: 'TOURNAMENT',
      includePlayoffs: true,
      includePlayoffsOrPools: true,
      singleDivision: false,
      teamSignup: true,
      teamIds: [poolATeam.$id, poolBTeam.$id],
      teams: [poolATeam, poolBTeam],
      divisions: [poolADivisionId, poolBDivisionId],
      divisionDetails: [
        {
          id: poolADivisionId,
          key: 'pool_a',
          name: 'Pool A',
          kind: 'LEAGUE',
          teamIds: [poolATeam.$id],
          playoffPlacementDivisionIds: [bracketDivisionId],
        },
        {
          id: poolBDivisionId,
          key: 'pool_b',
          name: 'Pool B',
          kind: 'LEAGUE',
          teamIds: [poolBTeam.$id],
          playoffPlacementDivisionIds: [bracketDivisionId],
        },
      ],
      playoffDivisionDetails: [
        {
          id: bracketDivisionId,
          key: 'open',
          name: 'Open Bracket',
          kind: 'PLAYOFF',
          teamIds: [],
        },
      ],
      matches: [],
    });
    delete (event as any).matches;

    apiRequestMock.mockImplementation((path: string) => {
      if (path === '/api/chat/terms-consent') {
        return Promise.resolve({
          version: '2026-06-10',
          url: '/terms',
          summary: ['Sending chat messages or creating events requires agreement to the BracketIQ Terms and EULA.'],
          accepted: true,
          acceptedAt: '2026-04-14T12:00:00.000Z',
        });
      }
      if (path === '/api/events/event_1') {
        return Promise.resolve({ event });
      }
      if (path === '/api/events/event_1/matches') {
        return Promise.resolve({ matches: [] });
      }
      if (path.startsWith('/api/events/event_1/standings?')) {
        return Promise.resolve({
          division: {
            divisionId: poolADivisionId,
            divisionName: 'Pool A',
            standingsConfirmedAt: null,
            standingsConfirmedBy: null,
            playoffTeamCount: 1,
            playoffPlacementDivisionIds: [bracketDivisionId],
            standingsOverrides: null,
            standings: [
              {
                position: 1,
                teamId: poolATeam.$id,
                teamName: poolATeam.name,
                wins: 0,
                losses: 0,
                draws: 0,
                goalsFor: 0,
                goalsAgainst: 0,
                goalDifference: 0,
                matchesPlayed: 0,
                basePoints: 0,
                finalPoints: 0,
                pointsDelta: 0,
              },
            ],
            validation: {
              mappingErrors: [],
              capacityErrors: [],
            },
            playoffDivisions: [
              {
                id: bracketDivisionId,
                name: 'Open Bracket',
                maxParticipants: 2,
              },
            ],
          },
        });
      }
      return Promise.resolve({});
    });

    renderWithMantine(<LeagueSchedulePage />);

    expect(await screen.findByText('Pool A Team')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText('Pool B Team')).not.toBeInTheDocument();
    });
    expect(apiRequestMock).toHaveBeenCalledWith('/api/events/event_1/standings?divisionId=pool_a');
  });

  it('names unassigned split-division teams in the warning', async () => {
    useSearchParamsMock.mockReturnValue({
      get: (key: string) => {
        if (key === 'mode') return 'edit';
        if (key === 'preview') return null;
        return null;
      },
    });

    const teams = [
      {
        $id: 'team_assigned',
        id: 'team_assigned',
        name: 'Court Kings',
        division: 'Open',
        sport: 'Volleyball',
        playerIds: [],
        captainId: '',
        pending: [],
        teamSize: 2,
        currentSize: 0,
        isFull: false,
        avatarUrl: '',
        parentTeamId: 'parent_assigned',
      },
      {
        $id: 'team_unassigned_one',
        id: 'team_unassigned_one',
        name: 'Midnight Owls',
        division: 'Open',
        sport: 'Volleyball',
        playerIds: [],
        captainId: '',
        pending: [],
        teamSize: 2,
        currentSize: 0,
        isFull: false,
        avatarUrl: '',
        parentTeamId: 'parent_one',
      },
      {
        $id: 'team_unassigned_two',
        id: 'team_unassigned_two',
        name: 'Court Legends',
        division: 'Open',
        sport: 'Volleyball',
        playerIds: [],
        captainId: '',
        pending: [],
        teamSize: 2,
        currentSize: 0,
        isFull: false,
        avatarUrl: '',
        parentTeamId: 'parent_two',
      },
    ];
    const event = buildApiEvent({
      eventType: 'LEAGUE',
      singleDivision: false,
      teamSignup: true,
      teamIds: teams.map((team) => team.$id),
      teams,
      divisions: ['division_open', 'division_advanced'],
      divisionDetails: [
        {
          id: 'division_open',
          key: 'open',
          name: 'Open',
          kind: 'LEAGUE',
          teamIds: ['team_assigned'],
        },
        {
          id: 'division_advanced',
          key: 'advanced',
          name: 'Advanced',
          kind: 'LEAGUE',
          teamIds: [],
        },
      ],
    });
    delete (event as any).matches;

    apiRequestMock.mockImplementation((path: string) => {
      if (path === '/api/events/event_1') {
        return Promise.resolve({ event });
      }
      if (path === '/api/events/event_1/matches') {
        return Promise.resolve({ matches: [] });
      }
      if (path.startsWith('/api/events/event_1/standings?')) {
        return Promise.resolve({
          division: {
            divisionId: 'division_open',
            divisionName: 'Open',
            standingsConfirmedAt: null,
            standingsConfirmedBy: null,
            playoffTeamCount: null,
            playoffPlacementDivisionIds: [],
            standingsOverrides: null,
            standings: [],
            validation: {
              mappingErrors: [],
              capacityErrors: [],
            },
            playoffDivisions: [],
          },
        });
      }
      if (path.startsWith('/api/teams?ids=')) {
        return Promise.resolve({ teams });
      }
      if (path === '/api/events/event_1/teams/compliance') {
        return Promise.resolve({ teams: [] });
      }
      return Promise.resolve({});
    });
    (eventService.getEventParticipants as jest.Mock).mockResolvedValue({
      event,
      participants: {
        teamIds: teams.map((team) => team.$id),
        userIds: [],
        waitListIds: [],
        freeAgentIds: [],
        divisions: [],
      },
      teams,
      users: [],
      participantCount: 3,
      participantCapacity: null,
      occurrence: null,
    });

    renderWithMantine(<LeagueSchedulePage />);

    await waitFor(() => {
      const pageText = document.body.textContent?.replace(/\s+/g, ' ') ?? '';
      expect(pageText).toContain('Unassigned teams: Midnight Owls, Court Legends.');
      expect(pageText).not.toContain('team_unassigned_one');
      expect(pageText).not.toContain('team_unassigned_two');
    });
  });

  it('hides the unassigned split-division teams from non-host viewers', async () => {
    useAppMock.mockReturnValue({
      user: { $id: 'viewer_1' },
      isAuthenticated: true,
      isGuest: false,
      loading: false,
      setUser: jest.fn(),
    });

    const assignedTeam = {
      $id: 'team_assigned',
      id: 'team_assigned',
      name: 'Court Kings',
      division: 'Open',
      sport: 'Volleyball',
      playerIds: [],
      captainId: '',
      pending: [],
      teamSize: 2,
      currentSize: 0,
      isFull: false,
      avatarUrl: '',
      parentTeamId: 'parent_assigned',
    };
    const unassignedTeam = {
      $id: 'team_unassigned',
      id: 'team_unassigned',
      name: 'Midnight Owls',
      division: 'Open',
      sport: 'Volleyball',
      playerIds: [],
      captainId: '',
      pending: [],
      teamSize: 2,
      currentSize: 0,
      isFull: false,
      avatarUrl: '',
      parentTeamId: 'parent_unassigned',
    };
    const teams = [assignedTeam, unassignedTeam];
    const event = buildApiEvent({
      hostId: 'host_1',
      eventType: 'LEAGUE',
      singleDivision: false,
      teamSignup: true,
      teamIds: teams.map((team) => team.$id),
      teams,
      divisions: ['division_open', 'division_advanced'],
      divisionDetails: [
        {
          id: 'division_open',
          key: 'open',
          name: 'Open',
          kind: 'LEAGUE',
          teamIds: [assignedTeam.$id],
        },
        {
          id: 'division_advanced',
          key: 'advanced',
          name: 'Advanced',
          kind: 'LEAGUE',
          teamIds: [],
        },
      ],
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
        return Promise.resolve({ teams });
      }
      return Promise.resolve({});
    });
    (eventService.getEventParticipants as jest.Mock).mockResolvedValue({
      event,
      participants: {
        teamIds: teams.map((team) => team.$id),
        userIds: [],
        waitListIds: [],
        freeAgentIds: [],
        divisions: [],
      },
      teams,
      users: [],
      participantCount: 2,
      participantCapacity: null,
      occurrence: null,
    });

    renderWithMantine(<LeagueSchedulePage />);

    const divisionsTab = await screen.findByRole('tab', { name: /divisions/i });
    fireEvent.click(divisionsTab);

    expect((await screen.findAllByText('Court Kings')).length).toBeGreaterThan(0);
    await waitFor(() => {
      expect(screen.queryByText('Unassigned')).not.toBeInTheDocument();
      expect(screen.queryByText('Midnight Owls')).not.toBeInTheDocument();
      expect(screen.queryByText(/Unassigned teams:/)).not.toBeInTheDocument();
    });
  });

  it('shows the division selector above manage buttons for unassigned split-division teams in manage mode', async () => {
    useSearchParamsMock.mockReturnValue({
      get: (key: string) => {
        if (key === 'mode') return 'edit';
        if (key === 'preview') return null;
        return null;
      },
      toString: () => 'mode=edit',
    });

    const team = {
      $id: 'team_unassigned',
      id: 'team_unassigned',
      name: 'Sand Strikers',
      division: 'Open',
      sport: 'Volleyball',
      playerIds: [],
      captainId: '',
      pending: [],
      teamSize: 2,
      currentSize: 0,
      isFull: false,
      avatarUrl: '',
      parentTeamId: 'canonical_team_1',
    };
    const event = buildApiEvent({
      eventType: 'LEAGUE',
      singleDivision: false,
      teamSignup: true,
      teamIds: [team.$id],
      teams: [team],
      divisions: ['division_open', 'division_advanced'],
      divisionDetails: [
        {
          id: 'division_open',
          key: 'open',
          name: 'Open',
          kind: 'LEAGUE',
          teamIds: [],
        },
        {
          id: 'division_advanced',
          key: 'advanced',
          name: 'Advanced',
          kind: 'LEAGUE',
          teamIds: [],
        },
      ],
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
        return Promise.resolve({ teams: [team] });
      }
      if (path === '/api/events/event_1/teams/compliance') {
        return Promise.resolve({ teams: [] });
      }
      return Promise.resolve({});
    });
    (eventService.getEventParticipants as jest.Mock).mockResolvedValue({
      event,
      participants: {
        teamIds: [team.$id],
        userIds: [],
        waitListIds: [],
        freeAgentIds: [],
        divisions: [],
      },
      teams: [team],
      users: [],
      participantCount: 1,
      participantCapacity: null,
      occurrence: null,
    });

    renderWithMantine(<LeagueSchedulePage />);

    const divisionsTab = await screen.findByRole('tab', { name: /divisions/i });
    fireEvent.click(divisionsTab);

    const divisionSelector = (await screen.findAllByLabelText(/move sand strikers to division/i))
      .find((element) => element.tagName === 'INPUT');
    const refundButton = screen.getByRole('button', { name: /^refund$/i });
    const sendBillButton = screen.getByRole('button', { name: /^send bill$/i });
    const removeButton = screen.getByRole('button', { name: /^remove$/i });

    expect(divisionSelector).toBeDefined();
    expect(divisionSelector!.compareDocumentPosition(refundButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(divisionSelector!.compareDocumentPosition(sendBillButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(divisionSelector!.compareDocumentPosition(removeButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('hides participant team division and remove controls outside edit mode', async () => {
    useSearchParamsMock.mockReturnValue({
      get: (key: string) => {
        if (key === 'mode') return null;
        if (key === 'preview') return null;
        return null;
      },
      toString: () => '',
    });

    const team = {
      $id: 'team_assigned',
      id: 'team_assigned',
      name: 'Sand Strikers',
      division: 'Open',
      sport: 'Volleyball',
      playerIds: [],
      captainId: '',
      pending: [],
      teamSize: 2,
      currentSize: 0,
      isFull: false,
      avatarUrl: '',
      parentTeamId: 'canonical_team_1',
    };
    const event = buildApiEvent({
      hostId: 'host_1',
      eventType: 'LEAGUE',
      singleDivision: false,
      teamSignup: true,
      teamIds: [team.$id],
      teams: [team],
      divisions: ['division_open', 'division_advanced'],
      divisionDetails: [
        {
          id: 'division_open',
          key: 'open',
          name: 'Open',
          kind: 'LEAGUE',
          teamIds: [team.$id],
        },
        {
          id: 'division_advanced',
          key: 'advanced',
          name: 'Advanced',
          kind: 'LEAGUE',
          teamIds: [],
        },
      ],
    });
    delete (event as any).matches;

    apiRequestMock.mockImplementation((path: string) => {
      if (path === '/api/events/event_1') {
        return Promise.resolve({ event });
      }
      if (path === '/api/events/event_1/matches') {
        return Promise.resolve({ matches: [] });
      }
      return Promise.resolve({});
    });
    (eventService.getEventParticipants as jest.Mock).mockResolvedValue({
      event,
      participants: {
        teamIds: [team.$id],
        userIds: [],
        waitListIds: [],
        freeAgentIds: [],
        divisions: [],
      },
      teams: [team],
      users: [],
      participantCount: 1,
      participantCapacity: null,
      occurrence: null,
    });

    renderWithMantine(<LeagueSchedulePage />);

    const divisionsTab = await screen.findByRole('tab', { name: /divisions/i });
    fireEvent.click(divisionsTab);

    expect(await screen.findByText('Sand Strikers')).toBeInTheDocument();
    expect(screen.queryByLabelText(/move sand strikers to division/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^remove$/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Players')).not.toBeInTheDocument();
    expect(screen.queryByText('Volleyball')).not.toBeInTheDocument();
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
    (eventService.getEventParticipants as jest.Mock).mockResolvedValue({
      event,
      participants: {
        teamIds: [],
        userIds: ['user_1'],
        waitListIds: [],
        freeAgentIds: [],
        divisions: [],
      },
      teams: [],
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
      participantCount: 1,
      participantCapacity: null,
      occurrence: null,
    });

    try {
      renderWithMantine(<LeagueSchedulePage />);

      const participantsTab = await screen.findByRole('tab', { name: /participants/i });
      fireEvent.click(participantsTab);

      await screen.findByText('Casey Rivers');
      await screen.findByText('$30.00 paid of $50.00');
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

  it('lets managers add an existing participant for non-team events', async () => {
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
      userIds: [],
      players: [],
    });
    delete (event as any).matches;

    const participant = {
      $id: 'user_2',
      id: 'user_2',
      firstName: 'Casey',
      lastName: 'Rivers',
      userName: 'crivers',
      fullName: 'Casey Rivers',
      teamIds: [],
      friendIds: [],
      friendRequestIds: [],
      friendRequestSentIds: [],
      followingIds: [],
      uploadedImages: [],
      avatarUrl: '',
    };

    apiRequestMock.mockImplementation((path: string, options?: unknown) => {
      if (path === '/api/events/event_1') {
        return Promise.resolve({ event });
      }
      if (path === '/api/events/event_1/matches') {
        return Promise.resolve({ matches: [] });
      }
      if (
        path === '/api/events/event_1/participants'
        && typeof options === 'object'
        && options !== null
        && 'method' in options
        && (options as { method?: string }).method === 'POST'
      ) {
        return Promise.resolve({});
      }
      return Promise.resolve({});
    });

    (eventService.getEventById as jest.Mock).mockResolvedValue({
      ...event,
      userIds: ['user_2'],
      players: [participant],
    });

    const originalFetch = globalThis.fetch;
    (globalThis as typeof globalThis & {
      fetch: jest.Mock;
    }).fetch = jest.fn(async (input: RequestInfo | URL) => {
      const rawUrl = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
      const url = new URL(rawUrl, 'http://localhost');

      if (url.pathname === '/api/users' && url.searchParams.get('query') === 'Ca') {
        return {
          ok: true,
          json: async () => ({ users: [participant] }),
        } as Response;
      }

      if (url.pathname === '/api/users' && url.searchParams.get('ids') === 'user_2') {
        return {
          ok: true,
          json: async () => ({ users: [participant] }),
        } as Response;
      }

      return {
        ok: true,
        json: async () => ({ users: [] }),
      } as Response;
    });

    try {
      renderWithMantine(<LeagueSchedulePage />);

      const participantsTab = await screen.findByRole('tab', { name: /participants/i });
      fireEvent.click(participantsTab);

      const addParticipantButton = await screen.findByRole('button', { name: /add participants/i });
      fireEvent.click(addParticipantButton);

      const searchInput = await screen.findByLabelText(/search participants/i);
      fireEvent.change(searchInput, { target: { value: 'Ca' } });

      await screen.findByText('Casey Rivers');

      fireEvent.click(screen.getByRole('button', { name: /^add$/i }));

      await waitFor(() => {
        expect(apiRequestMock).toHaveBeenCalledWith(
          '/api/events/event_1/participants',
          expect.objectContaining({
            method: 'POST',
            body: { userId: 'user_2' },
          }),
        );
      });

      expect(await screen.findByText('Casey Rivers added to participants.')).toBeInTheDocument();
      expect(eventService.getEventById).toHaveBeenCalledWith('event_1');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('lets managers add an organization team roster to a non-team event from org team ids', async () => {
    useSearchParamsMock.mockReturnValue({
      get: (key: string) => {
        if (key === 'mode') return 'edit';
        if (key === 'preview') return null;
        return null;
      },
    });

    const rosterUsers = [
      {
        $id: 'user_2',
        id: 'user_2',
        firstName: 'Avery',
        lastName: 'Player',
        userName: 'aplayer',
        fullName: 'Avery Player',
        teamIds: ['team_1'],
        friendIds: [],
        friendRequestIds: [],
        friendRequestSentIds: [],
        followingIds: [],
        uploadedImages: [],
        avatarUrl: '',
      },
      {
        $id: 'user_3',
        id: 'user_3',
        firstName: 'Jordan',
        lastName: 'Player',
        userName: 'jplayer',
        fullName: 'Jordan Player',
        teamIds: ['team_1'],
        friendIds: [],
        friendRequestIds: [],
        friendRequestSentIds: [],
        followingIds: [],
        uploadedImages: [],
        avatarUrl: '',
      },
      {
        $id: 'user_4',
        id: 'user_4',
        firstName: 'Morgan',
        lastName: 'Manager',
        userName: 'mmanager',
        fullName: 'Morgan Manager',
        teamIds: ['team_1'],
        friendIds: [],
        friendRequestIds: [],
        friendRequestSentIds: [],
        followingIds: [],
        uploadedImages: [],
        avatarUrl: '',
      },
      {
        $id: 'user_5',
        id: 'user_5',
        firstName: 'Taylor',
        lastName: 'Coach',
        userName: 'tcoach',
        fullName: 'Taylor Coach',
        teamIds: ['team_1'],
        friendIds: [],
        friendRequestIds: [],
        friendRequestSentIds: [],
        followingIds: [],
        uploadedImages: [],
        avatarUrl: '',
      },
      {
        $id: 'user_6',
        id: 'user_6',
        firstName: 'Riley',
        lastName: 'Assistant',
        userName: 'rassistant',
        fullName: 'Riley Assistant',
        teamIds: ['team_1'],
        friendIds: [],
        friendRequestIds: [],
        friendRequestSentIds: [],
        followingIds: [],
        uploadedImages: [],
        avatarUrl: '',
      },
    ];

    const organizationTeam = {
      $id: 'team_1',
      id: 'team_1',
      name: 'Org Aces',
      division: 'Open',
      divisionTypeId: 'open',
      divisionTypeName: 'Open',
      sport: 'Volleyball',
      playerIds: ['user_2', 'user_3'],
      captainId: 'user_2',
      managerId: 'user_4',
      headCoachId: 'user_5',
      assistantCoachIds: ['user_6'],
      coachIds: ['user_6'],
      pending: [],
      teamSize: 8,
      currentSize: 2,
      isFull: false,
      avatarUrl: '',
      players: rosterUsers.slice(0, 2),
      captain: rosterUsers[0],
      manager: rosterUsers[2],
      headCoach: rosterUsers[3],
      assistantCoaches: [rosterUsers[4]],
      coaches: [rosterUsers[4]],
    };

    const event = buildApiEvent({
      eventType: 'EVENT',
      teamSignup: false,
      organizationId: 'org_1',
      organization: {
        $id: 'org_1',
        name: 'Org One',
      },
      teams: [],
      teamIds: [],
      userIds: [],
      players: [],
    });
    delete (event as any).matches;

    apiRequestMock.mockImplementation((path: string, options?: unknown) => {
      if (path === '/api/events/event_1') {
        return Promise.resolve({ event });
      }
      if (path === '/api/events/event_1/matches') {
        return Promise.resolve({ matches: [] });
      }
      if (path === '/api/teams?organizationId=org_1&limit=200') {
        return Promise.resolve({ teams: [organizationTeam] });
      }
      if (
        path === '/api/events/event_1/participants'
        && typeof options === 'object'
        && options !== null
        && 'method' in options
        && (options as { method?: string }).method === 'POST'
      ) {
        return Promise.resolve({});
      }
      return Promise.resolve({});
    });

    (organizationService.getOrganizationById as jest.Mock).mockResolvedValue({
      $id: 'org_1',
      name: 'Org One',
      teamIds: ['team_1'],
    });

    (eventService.getEventById as jest.Mock).mockResolvedValue({
      ...event,
      userIds: rosterUsers.map((userEntry) => userEntry.$id),
      players: rosterUsers,
    });

    const originalFetch = globalThis.fetch;
    (globalThis as typeof globalThis & {
      fetch: jest.Mock;
    }).fetch = jest.fn(async (input: RequestInfo | URL) => {
      const rawUrl = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
      const url = new URL(rawUrl, 'http://localhost');

      if (url.pathname === '/api/users' && url.searchParams.has('ids')) {
        return {
          ok: true,
          json: async () => ({ users: rosterUsers }),
        } as Response;
      }

      return {
        ok: true,
        json: async () => ({ users: [] }),
      } as Response;
    });

    try {
      renderWithMantine(<LeagueSchedulePage />);

      const participantsTab = await screen.findByRole('tab', { name: /participants/i });
      fireEvent.click(participantsTab);

      fireEvent.click(await screen.findByRole('button', { name: /add participants/i }));
      fireEvent.click(await screen.findByText('Add from team'));

      await screen.findByText('Org Aces');
      fireEvent.click(screen.getByRole('button', { name: /add roster/i }));

      await waitFor(() => {
        const participantCalls = apiRequestMock.mock.calls.filter(([path, options]) => (
          path === '/api/events/event_1/participants'
          && (options as { method?: string } | undefined)?.method === 'POST'
        ));
        expect(participantCalls).toHaveLength(5);
        expect(participantCalls.map(([, options]) => (options as { body: { userId: string } }).body.userId)).toEqual([
          'user_2',
          'user_3',
          'user_4',
          'user_5',
          'user_6',
        ]);
      });

      expect(await screen.findByText('Added 5 roster members from Org Aces.')).toBeInTheDocument();
      expect(eventService.getEventById).toHaveBeenCalledWith('event_1');
    } finally {
      globalThis.fetch = originalFetch;
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
    (eventService.getEventParticipants as jest.Mock).mockResolvedValue({
      event,
      participants: {
        teamIds: [],
        userIds: ['user_1'],
        waitListIds: [],
        freeAgentIds: [],
        divisions: [],
      },
      teams: [],
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
      participantCount: 1,
      participantCapacity: null,
      occurrence: null,
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

  it('shows the participants tab for empty non-team regular events', async () => {
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
      userIds: [],
      players: [],
    });
    delete (event as any).matches;

    apiRequestMock.mockImplementation((path: string) => {
      if (path === '/api/events/event_1') {
        return Promise.resolve({ event });
      }
      if (path === '/api/events/event_1/matches') {
        return Promise.resolve({ matches: [] });
      }
      return Promise.resolve({});
    });

    renderWithMantine(<LeagueSchedulePage />);

    const participantsTab = await screen.findByRole('tab', { name: /participants/i });
    fireEvent.click(participantsTab);

    await screen.findByText('No participants have been added yet.');
    expect(screen.queryByRole('button', { name: /add team/i })).not.toBeInTheDocument();
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
        if (key === 'rentalHostRequiredTemplateIds') return 'tmpl_host_contract';
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
    expect(capturedEventFormProps?.rentalPurchase?.requiredTemplateIds).toEqual([
      'tmpl_host_contract',
    ]);
  });

  it('submits rental self-create payload with null organizationId', async () => {
    const start = formatLocalDateTime(new Date());
    const end = formatLocalDateTime(new Date(Date.now() + 60 * 60 * 1000));

    useSearchParamsMock.mockReturnValue({
      get: (key: string) => {
        if (key === 'create') return '1';
        if (key === 'rentalStart') return start;
        if (key === 'rentalEnd') return end;
        if (key === 'rentalFieldId') return 'field_1';
        if (key === 'rentalOrgId') return 'org_rental';
        if (key === 'mode') return 'edit';
        return null;
      },
    });
    mockEventFormDirtyState = true;
    mockEventFormValidateResult = true;
    mockEventFormDraft = {
      ...buildApiEvent({
        id: 'event_1',
        $id: 'event_1',
        state: 'DRAFT',
        eventType: 'EVENT',
        organizationId: 'org_rental',
        organization: 'org_rental',
        fieldIds: ['field_1'],
        fields: [
          {
            $id: 'field_1',
            id: 'field_1',
            name: 'Rental Field',
            organizationId: 'org_rental',
            organization: { $id: 'org_rental' },
          },
        ],
      }),
    };

    (organizationService.getOrganizationById as jest.Mock).mockResolvedValue({
      $id: 'org_rental',
      name: 'Rental Org',
      fields: [],
    });
    (eventService.scheduleEvent as jest.Mock).mockResolvedValue({
      event: buildApiEvent({
        id: 'event_1',
        $id: 'event_1',
      }),
      warnings: [],
    });

    apiRequestMock.mockImplementation((path: string) => {
      if (path.startsWith('/api/event-templates')) {
        return Promise.resolve({ templates: [] });
      }
      return Promise.resolve({});
    });

    renderWithMantine(<LeagueSchedulePage />);

    await screen.findByTestId('event-form');
    const createButton = await screen.findByRole('button', { name: /^create event$/i });
    fireEvent.click(createButton);

    await waitFor(() => {
      expect(eventService.scheduleEvent).toHaveBeenCalled();
    });

    const schedulePayload = (eventService.scheduleEvent as jest.Mock).mock.calls[0]?.[0] as Record<string, unknown>;

    expect(schedulePayload?.organizationId).toBeNull();
    expect(schedulePayload?.organization).toBeUndefined();
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

  it('includes validation summaries from the event form when available', async () => {
    useSearchParamsMock.mockReturnValue({
      get: (key: string) => {
        if (key === 'create') return '1';
        return null;
      },
    });
    mockEventFormValidateResult = false;
    mockEventFormDirtyState = true;
    mockEventFormValidationErrors = [
      {
        path: 'end',
        message: 'End date/time must be after start date/time when no fixed end datetime scheduling is disabled.',
      },
      {
        path: 'leagueSlots.0.daysOfWeek',
        message: 'Select at least one day',
      },
    ];

    renderWithMantine(<LeagueSchedulePage />);

    await screen.findByTestId('event-form');

    const createButton = await screen.findByRole('button', { name: /^create event$/i });
    fireEvent.click(createButton);

    expect(
      await screen.findByText(
        'Please fix the highlighted fields before submitting. End date/time must be after start date/time when no fixed end datetime scheduling is disabled. Select at least one day',
      ),
    ).toBeInTheDocument();
  });

  it('shows schedule and participants tabs for weekly parent events', async () => {
    const { event } = buildWeeklyParentEvent();

    useSearchParamsMock.mockReturnValue({
      get: (key: string) => {
        if (key === 'mode') return null;
        if (key === 'preview') return null;
        return null;
      },
    });

    apiRequestMock.mockImplementation((path: string) => {
      if (path === '/api/events/event_1') {
        const payload = { ...event };
        delete (payload as any).matches;
        return Promise.resolve({ event: payload });
      }
      if (path === '/api/events/event_1/matches') {
        return Promise.resolve({ matches: [] });
      }
      return Promise.resolve({});
    });
    (eventService.getEvent as jest.Mock).mockResolvedValue({ ...event });
    (eventService.getEventById as jest.Mock).mockResolvedValue({ ...event });

    renderWithMantine(<LeagueSchedulePage />);

    await screen.findAllByText('Weekly Parent Event');

    expect(screen.getByRole('tab', { name: 'Schedule' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Participants' })).toBeInTheDocument();
  });

  it('reflects selected weekly sessions from the URL on the schedule tab', async () => {
    const { event, slotId, occurrenceDate } = buildWeeklyParentEvent({
      occurrenceDate: new Date(2026, 5, 16),
      slotEndOffsetDays: 21,
    });

    useSearchParamsMock.mockReturnValue({
      get: (key: string) => {
        if (key === 'tab') return 'schedule';
        if (key === 'slotId') return slotId;
        if (key === 'occurrenceDate') return occurrenceDate;
        if (key === 'mode') return null;
        if (key === 'preview') return null;
        return null;
      },
    });

    apiRequestMock.mockImplementation((path: string) => {
      if (path === '/api/events/event_1') {
        const payload = { ...event };
        delete (payload as any).matches;
        return Promise.resolve({ event: payload });
      }
      if (path === '/api/events/event_1/matches') {
        return Promise.resolve({ matches: [] });
      }
      return Promise.resolve({});
    });
    (eventService.getEvent as jest.Mock).mockResolvedValue({ ...event });
    (eventService.getEventById as jest.Mock).mockResolvedValue({ ...event });

    renderWithMantine(<LeagueSchedulePage />);

    await screen.findAllByText('Weekly Parent Event');

    expect(await screen.findByRole('button', { name: /clear selection/i })).toBeInTheDocument();
    expect(screen.getAllByText((content) => content.includes(occurrenceDate)).length).toBeGreaterThan(0);
    expect(screen.getByTestId('league-calendar')).toBeInTheDocument();
    expect(screen.getByTestId(`calendar-match-weekly-occurrence:${slotId}:${occurrenceDate}`)).toBeInTheDocument();
  });

  it('marks only the viewer registered weekly occurrence and passes division labels to the calendar', async () => {
    const { event, slotId, occurrenceDate } = buildWeeklyParentEvent({
      occurrenceDate: new Date(2026, 4, 5),
      slotEndOffsetDays: 21,
    });
    const nextOccurrenceDate = '2026-05-12';

    useSearchParamsMock.mockReturnValue({
      get: (key: string) => {
        if (key === 'tab') return 'schedule';
        if (key === 'mode') return null;
        if (key === 'preview') return null;
        return null;
      },
    });

    apiRequestMock.mockImplementation((path: string) => {
      if (path === '/api/events/event_1') {
        const payload = { ...event };
        delete (payload as any).matches;
        return Promise.resolve({ event: payload });
      }
      if (path === '/api/events/event_1/matches') {
        return Promise.resolve({ matches: [] });
      }
      if (path === '/api/profile/registrations?eventId=event_1') {
        return Promise.resolve({
          registrations: [
            {
              id: 'registration_weekly_selected',
              eventId: 'event_1',
              registrantId: 'host_1',
              registrantType: 'SELF',
              rosterRole: 'PARTICIPANT',
              status: 'ACTIVE',
              slotId,
              occurrenceDate,
            },
            {
              id: 'registration_weekly_waitlist',
              eventId: 'event_1',
              registrantId: 'host_1',
              registrantType: 'SELF',
              rosterRole: 'WAITLIST',
              status: 'ACTIVE',
              slotId,
              occurrenceDate: nextOccurrenceDate,
            },
          ],
        });
      }
      return Promise.resolve({});
    });
    (eventService.getEvent as jest.Mock).mockResolvedValue({ ...event });
    (eventService.getEventById as jest.Mock).mockResolvedValue({ ...event });

    renderWithMantine(<LeagueSchedulePage />);

    await screen.findAllByText('Weekly Parent Event');

    await waitFor(() => {
      expect(screen.getByTestId(`calendar-match-meta-weekly-occurrence:${slotId}:${occurrenceDate}`)).toHaveTextContent('Open|registered');
      expect(screen.getByTestId(`calendar-match-meta-weekly-occurrence:${slotId}:${nextOccurrenceDate}`)).toHaveTextContent('Open|not-registered');
    });
  });

  it('loads selected weekly session participants once for the same URL selection', async () => {
    const { event, slotId, occurrenceDate } = buildWeeklyParentEvent({
      occurrenceDate: new Date(2026, 5, 16),
      slotEndOffsetDays: 21,
    });
    const teamEvent = {
      ...event,
      teamSignup: true,
      teamIds: [],
      teams: [],
      userIds: [],
      players: [],
    };
    const participantTeam = {
      $id: 'team_weekly_1',
      id: 'team_weekly_1',
      name: 'Weeknight Strikers',
      division: 'Open',
      sport: 'Soccer',
      playerIds: [],
      captainId: '',
      pending: [],
      teamSize: 2,
      currentSize: 0,
      isFull: false,
      avatarUrl: '',
      parentTeamId: 'club_team_1',
    };

    useSearchParamsMock.mockReturnValue({
      get: (key: string) => {
        if (key === 'tab') return 'schedule';
        if (key === 'slotId') return slotId;
        if (key === 'occurrenceDate') return occurrenceDate;
        if (key === 'mode') return null;
        if (key === 'preview') return null;
        return null;
      },
    });

    apiRequestMock.mockImplementation((path: string) => {
      if (path === '/api/events/event_1') {
        const payload = { ...teamEvent };
        delete (payload as any).matches;
        return Promise.resolve({ event: payload });
      }
      if (path === '/api/events/event_1/matches') {
        return Promise.resolve({ matches: [] });
      }
      if (path.startsWith('/api/teams?ids=')) {
        return Promise.resolve({ teams: [participantTeam] });
      }
      if (path === '/api/events/event_1/teams/compliance') {
        return Promise.resolve({ teams: [] });
      }
      return Promise.resolve({});
    });
    (eventService.getEvent as jest.Mock).mockResolvedValue({ ...teamEvent });
    (eventService.getEventById as jest.Mock).mockResolvedValue({ ...teamEvent });
    (eventService.getEventParticipants as jest.Mock).mockResolvedValue({
      event: teamEvent,
      participants: {
        teamIds: ['team_weekly_1'],
        userIds: [],
        waitListIds: [],
        freeAgentIds: [],
        divisions: [],
      },
      teams: [participantTeam],
      users: [],
      participantCount: 1,
      participantCapacity: 10,
      occurrence: { slotId, occurrenceDate },
    });

    renderWithMantine(<LeagueSchedulePage />);

    await screen.findAllByText('Weekly Parent Event');
    await waitFor(() => {
      expect(eventService.getEventParticipants).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(eventService.getEventParticipants).toHaveBeenCalledTimes(1);
    expect(eventService.getEventParticipants).toHaveBeenCalledWith('event_1', {
      slotId,
      occurrenceDate,
    });
    expect(eventService.getEventDetailBootstrap).toHaveBeenCalledWith('event_1', {
      slotId,
      occurrenceDate,
    }, {
      manage: 'auto',
    });
    expect(
      apiRequestMock.mock.calls.filter(([path]) => (
        typeof path === 'string' && path.startsWith('/api/teams?ids=')
      )),
    ).toHaveLength(0);
  });

  it('loads weekly participant refunds with the selected occurrence context', async () => {
    const { event, slotId, occurrenceDate } = buildWeeklyParentEvent({
      occurrenceDate: new Date(2026, 5, 16),
      slotEndOffsetDays: 21,
    });
    const teamEvent = {
      ...event,
      teamSignup: true,
      singleDivision: true,
      teamIds: [],
      teams: [],
      userIds: [],
      players: [],
    };
    const participantTeam = {
      $id: 'team_weekly_1',
      id: 'team_weekly_1',
      name: 'Weeknight Strikers',
      division: 'Open',
      sport: 'Soccer',
      playerIds: [],
      captainId: '',
      pending: [],
      teamSize: 2,
      currentSize: 0,
      isFull: false,
      avatarUrl: '',
      parentTeamId: 'club_team_1',
    };

    useSearchParamsMock.mockReturnValue({
      get: (key: string) => {
        if (key === 'tab') return 'participants';
        if (key === 'mode') return 'edit';
        if (key === 'slotId') return slotId;
        if (key === 'occurrenceDate') return occurrenceDate;
        if (key === 'preview') return null;
        return null;
      },
    });

    apiRequestMock.mockImplementation((path: string) => {
      if (path === '/api/events/event_1') {
        const payload = { ...teamEvent };
        delete (payload as any).matches;
        return Promise.resolve({ event: payload });
      }
      if (path === '/api/events/event_1/matches') {
        return Promise.resolve({ matches: [] });
      }
      if (path.startsWith('/api/teams?ids=')) {
        return Promise.resolve({ teams: [participantTeam] });
      }
      if (path.startsWith('/api/events/event_1/teams/compliance')) {
        return Promise.resolve({ teams: [] });
      }
      if (path === `/api/events/event_1/teams/team_weekly_1/billing?slotId=${slotId}&occurrenceDate=${occurrenceDate}`) {
        return Promise.resolve({
          event: { id: 'event_1' },
          team: { id: 'team_weekly_1', name: 'Weeknight Strikers', playerIds: [] },
          users: [],
          bills: [],
          totals: {
            paidAmountCents: 0,
            refundedAmountCents: 0,
            refundableAmountCents: 0,
          },
        });
      }
      return Promise.resolve({});
    });
    (eventService.getEvent as jest.Mock).mockResolvedValue({ ...teamEvent });
    (eventService.getEventById as jest.Mock).mockResolvedValue({ ...teamEvent });
    (eventService.getEventParticipants as jest.Mock).mockResolvedValue({
      event: teamEvent,
      participants: {
        teamIds: ['team_weekly_1'],
        userIds: [],
        waitListIds: [],
        freeAgentIds: [],
        divisions: [],
      },
      teams: [participantTeam],
      users: [],
      participantCount: 1,
      participantCapacity: 10,
      occurrence: { slotId, occurrenceDate },
    });

    renderWithMantine(<LeagueSchedulePage />);

    await screen.findByText('Weeknight Strikers');
    fireEvent.click(await screen.findByRole('button', { name: /^refund$/i }));

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith(
        `/api/events/event_1/teams/team_weekly_1/billing?slotId=${slotId}&occurrenceDate=${occurrenceDate}`,
      );
    });
  });

  it('uses the weekly schedule calendar to select a session', async () => {
    const { event, slotId, occurrenceDate } = buildWeeklyParentEvent();

    useSearchParamsMock.mockReturnValue({
      get: (key: string) => {
        if (key === 'tab') return 'schedule';
        if (key === 'mode') return null;
        if (key === 'preview') return null;
        return null;
      },
    });

    apiRequestMock.mockImplementation((path: string) => {
      if (path === '/api/events/event_1') {
        const payload = { ...event };
        delete (payload as any).matches;
        return Promise.resolve({ event: payload });
      }
      if (path === '/api/events/event_1/matches') {
        return Promise.resolve({ matches: [] });
      }
      return Promise.resolve({});
    });
    (eventService.getEvent as jest.Mock).mockResolvedValue({ ...event });
    (eventService.getEventById as jest.Mock).mockResolvedValue({ ...event });

    renderWithMantine(<LeagueSchedulePage />);

    await screen.findAllByText('Weekly Parent Event');
    fireEvent.click(await screen.findByRole('button', { name: 'Select First Match' }));

    await waitFor(() => {
      expect(mockRouter.replace).toHaveBeenCalledWith(
        expect.stringContaining(`slotId=${slotId}`),
        { scroll: false },
      );
      expect(mockRouter.replace).toHaveBeenCalledWith(
        expect.stringContaining(`occurrenceDate=${occurrenceDate}`),
        { scroll: false },
      );
    });
  });

  it('recomputes weekly schedule occurrences for the visible calendar range', async () => {
    const { event } = buildWeeklyParentEvent({
      occurrenceDate: new Date(2026, 3, 7),
      slotEndOffsetDays: 21,
    });

    useSearchParamsMock.mockReturnValue({
      get: (key: string) => {
        if (key === 'tab') return 'schedule';
        if (key === 'mode') return null;
        if (key === 'preview') return null;
        return null;
      },
    });

    apiRequestMock.mockImplementation((path: string) => {
      if (path === '/api/events/event_1') {
        const payload = { ...event };
        delete (payload as any).matches;
        return Promise.resolve({ event: payload });
      }
      if (path === '/api/events/event_1/matches') {
        return Promise.resolve({ matches: [] });
      }
      return Promise.resolve({});
    });
    (eventService.getEvent as jest.Mock).mockResolvedValue({ ...event });
    (eventService.getEventById as jest.Mock).mockResolvedValue({ ...event });

    renderWithMantine(<LeagueSchedulePage />);

    await screen.findAllByText('Weekly Parent Event');

    await waitFor(() => {
      expect(screen.getAllByTestId(/calendar-match-weekly-occurrence:/)).toHaveLength(4);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Switch To Week View' }));
    await waitFor(() => {
      expect(screen.getAllByTestId(/calendar-match-weekly-occurrence:/)).toHaveLength(1);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Switch To Day View' }));
    await waitFor(() => {
      expect(screen.getAllByTestId(/calendar-match-weekly-occurrence:/)).toHaveLength(1);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Switch To Agenda View' }));
    await waitFor(() => {
      expect(screen.getAllByTestId(/calendar-match-weekly-occurrence:/)).toHaveLength(4);
    });
  });

  it('keeps the weekly calendar visible when the current range has no occurrences', async () => {
    const { event } = buildWeeklyParentEvent({
      occurrenceDate: new Date(2026, 3, 7),
      slotEndOffsetDays: 21,
    });

    useSearchParamsMock.mockReturnValue({
      get: (key: string) => {
        if (key === 'tab') return 'schedule';
        if (key === 'occurrenceDate') return '2026-03-01';
        if (key === 'slotId') return 'slot_weekly_parent_1';
        if (key === 'mode') return null;
        if (key === 'preview') return null;
        return null;
      },
    });

    apiRequestMock.mockImplementation((path: string) => {
      if (path === '/api/events/event_1') {
        const payload = { ...event };
        delete (payload as any).matches;
        return Promise.resolve({ event: payload });
      }
      if (path === '/api/events/event_1/matches') {
        return Promise.resolve({ matches: [] });
      }
      return Promise.resolve({});
    });
    (eventService.getEvent as jest.Mock).mockResolvedValue({ ...event });
    (eventService.getEventById as jest.Mock).mockResolvedValue({ ...event });

    renderWithMantine(<LeagueSchedulePage />);

    await screen.findAllByText('Weekly Parent Event');

    expect(screen.getByText('No weekly sessions are available for this calendar range.')).toBeInTheDocument();
    expect(screen.getByTestId('league-calendar')).toBeInTheDocument();
    expect(screen.queryAllByTestId(/calendar-match-weekly-occurrence:/)).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Jump To Next Month' }));

    await waitFor(() => {
      expect(screen.getAllByTestId(/calendar-match-weekly-occurrence:/)).toHaveLength(4);
    });
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
        if (key === 'rentalHostRequiredTemplateIds') return 'tmpl_rental_contract';
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
