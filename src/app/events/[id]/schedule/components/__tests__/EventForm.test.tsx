import React from 'react';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithMantine } from '../../../../../../../test/utils/renderWithMantine';
import EventForm, { EventFormHandle } from '../EventForm';
import { userService } from '@/lib/userService';
import { eventService } from '@/lib/eventService';

jest.setTimeout(20000);

jest.mock('@mantine/core', () => {
  const actual = jest.requireActual('@mantine/core');
  return {
    ...actual,
    Collapse: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    Select: ({ label, data = [], value = '', onChange, placeholder, disabled }: any) => (
      <label>
        <span>{typeof label === 'string' ? label : 'Select'}</span>
        <select
          aria-label={typeof label === 'string' ? label : 'Select'}
          value={value ?? ''}
          disabled={disabled}
          onChange={(event) => onChange?.(event.currentTarget.value || null)}
        >
          <option value="">{placeholder ?? ''}</option>
          {data.map((option: any) => (
            <option key={String(option.value)} value={String(option.value)}>
              {option.label ?? option.value}
            </option>
          ))}
        </select>
      </label>
    ),
    MultiSelect: ({ label, data = [], value = [], onChange, disabled }: any) => {
      const selectedValues = Array.isArray(value) ? value.map(String) : [];
      return (
        <label>
          <span>{typeof label === 'string' ? label : 'MultiSelect'}</span>
          <select
            multiple
            aria-label={typeof label === 'string' ? label : 'MultiSelect'}
            value={selectedValues}
            disabled={disabled}
            onChange={(event) => {
              const nextValues = Array.from(event.currentTarget.selectedOptions).map((option) => option.value);
              onChange?.(nextValues);
            }}
          >
            {data.map((option: any) => (
              <option key={String(option.value)} value={String(option.value)}>
                {option.label ?? option.value}
              </option>
            ))}
          </select>
        </label>
      );
    },
  };
});

jest.mock('@mantine/dates', () => ({
  DateTimePicker: ({ label, onChange }: { label?: React.ReactNode; onChange?: (value: Date) => void }) => (
    <button
      type="button"
      aria-label={typeof label === 'string' ? label : 'Date Time Picker'}
      onClick={() => onChange?.(new Date('2026-03-12T15:30:00'))}
    >
      {typeof label === 'string' ? label : 'Date Time Picker'}
    </button>
  ),
}));

jest.mock('@/components/location/LocationSelector', () => {
  function MockLocationSelector({ label = 'Location', value = '', onChange }: any) {
    return (
      <input
        aria-label={label}
        value={value}
        onChange={(event) => onChange?.(event.currentTarget.value, 37.0, -122.0)}
      />
    );
  }
  MockLocationSelector.displayName = 'MockLocationSelector';
  return {
    __esModule: true,
    default: MockLocationSelector,
  };
});

jest.mock('@/app/discover/components/TournamentFields', () => {
  function MockTournamentFields() {
    return <div data-testid="tournament-fields" />;
  }
  MockTournamentFields.displayName = 'MockTournamentFields';
  return MockTournamentFields;
});
jest.mock('@/app/discover/components/LeagueFields', () => {
  function MockLeagueFields() {
    return <div data-testid="league-fields" />;
  }
  MockLeagueFields.displayName = 'MockLeagueFields';
  return MockLeagueFields;
});
jest.mock('@/app/discover/components/LeagueScoringConfigPanel', () => {
  function MockLeagueScoringConfigPanel() {
    return <div data-testid="league-scoring-config" />;
  }
  MockLeagueScoringConfigPanel.displayName = 'MockLeagueScoringConfigPanel';
  return MockLeagueScoringConfigPanel;
});
jest.mock('@/components/ui/CentsInput', () => {
  function MockCentsInput() {
    return <div data-testid="cents-input" />;
  }
  MockCentsInput.displayName = 'MockCentsInput';
  return MockCentsInput;
});
jest.mock('@/components/ui/PriceWithFeesPreview', () => {
  function MockPriceWithFeesPreview() {
    return <div data-testid="price-preview" />;
  }
  MockPriceWithFeesPreview.displayName = 'MockPriceWithFeesPreview';
  return MockPriceWithFeesPreview;
});
jest.mock('@/components/ui/UserCard', () => {
  function MockUserCard({ user }: any) {
    return (
      <div data-testid="user-card">
        <span>{[user?.firstName, user?.lastName].filter(Boolean).join(' ').trim() || user?.userName || user?.email || user?.$id || 'User'}</span>
        {user?.email ? <span>{user.email}</span> : null}
      </div>
    );
  }
  MockUserCard.displayName = 'MockUserCard';
  return MockUserCard;
});
jest.mock('@/components/ui/ImageUploader', () => ({
  ImageUploader: function MockImageUploader() {
    return <div data-testid="image-uploader" />;
  },
}));

const mockSport = { $id: 'volleyball', id: 'volleyball', name: 'Volleyball' };
type MockUseSportsState = {
  sports: any[];
  sportsById: Map<string, any>;
  sportsByName: Map<string, any>;
  loading: boolean;
  error: Error | null;
};
const buildMockUseSportsState = (input: { sports?: any[]; loading?: boolean; error?: Error | null } = {}): MockUseSportsState => {
  const sports = input.sports ?? [mockSport];
  return {
    sports,
    sportsById: new Map(sports.map((sport) => [sport.$id, sport])),
    sportsByName: new Map(sports.map((sport) => [String(sport.name ?? '').toLowerCase(), sport])),
    loading: input.loading ?? false,
    error: input.error ?? null,
  };
};
let mockUseSportsState: MockUseSportsState = buildMockUseSportsState();

jest.mock('@/app/hooks/useSports', () => ({
  useSports: () => mockUseSportsState,
}));

jest.mock('@/lib/eventService', () => ({
  eventService: {
    getEventWithRelations: jest.fn().mockResolvedValue(null),
    getEventsForFieldInRange: jest.fn().mockResolvedValue([]),
    getBlockingForFieldInRange: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock('@/lib/paymentService', () => ({
  paymentService: {},
}));

jest.mock('@/lib/locationService', () => ({
  locationService: {},
}));

jest.mock('@/lib/userService', () => ({
  userService: {
    getUsersByIds: jest.fn().mockResolvedValue([]),
    searchUsers: jest.fn().mockResolvedValue([]),
    lookupEmailMembership: jest.fn().mockResolvedValue([]),
    inviteUsersByEmail: jest.fn().mockResolvedValue({ sent: [], not_sent: [], failed: [] }),
  },
}));

jest.mock('@/lib/organizationService', () => ({
  organizationService: {
    getOrganizationById: jest.fn().mockResolvedValue(null),
  },
}));

jest.mock('@/lib/fieldService', () => ({
  fieldService: {},
}));

jest.mock('@/lib/apiClient', () => ({
  apiRequest: jest.fn().mockResolvedValue({}),
}));

describe('EventForm dirty state', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseSportsState = buildMockUseSportsState();
    (eventService.getEventWithRelations as jest.Mock).mockResolvedValue(null);
    (eventService.getEventsForFieldInRange as jest.Mock).mockResolvedValue([]);
    (eventService.getBlockingForFieldInRange as jest.Mock).mockResolvedValue([]);
    (userService.getUsersByIds as jest.Mock).mockResolvedValue([]);
    (userService.searchUsers as jest.Mock).mockResolvedValue([]);
    (userService.lookupEmailMembership as jest.Mock).mockResolvedValue([]);
    (userService.inviteUsersByEmail as jest.Mock).mockResolvedValue({ sent: [], not_sent: [], failed: [] });
  });

  const buildEvent = () => ({
    $id: 'event_1',
    $createdAt: '2026-03-01T12:00:00.000Z',
    $updatedAt: '2026-03-01T12:00:00.000Z',
    name: 'Test Event',
    description: '',
    location: 'Test Gym',
    coordinates: [-122, 37],
    start: '2026-03-12T10:00',
    end: '2026-03-12T12:00',
    state: 'DRAFT',
    eventType: 'EVENT',
    sportId: 'volleyball',
    sport: { $id: 'volleyball', name: 'Volleyball' },
    sportConfig: { $id: 'volleyball', name: 'Volleyball' },
    price: 0,
    minAge: 0,
    maxAge: 99,
    allowPaymentPlans: false,
    installmentCount: 0,
    installmentDueDates: [],
    installmentAmounts: [],
    allowTeamSplitDefault: false,
    maxParticipants: 10,
    teamSizeLimit: 2,
    teamSignup: false,
    singleDivision: true,
    splitLeaguePlayoffDivisions: false,
    registrationByDivisionType: false,
    divisions: ['open'],
    divisionDetails: [
      {
        id: 'open',
        key: 'open',
        name: 'Open',
        divisionTypeId: 'open__18plus',
        divisionTypeName: 'Open / 18+',
        ratingType: 'SKILL',
        gender: 'C',
        skillDivisionTypeId: 'open',
        skillDivisionTypeName: 'Open',
        ageDivisionTypeId: '18plus',
        ageDivisionTypeName: '18+',
        price: 0,
        maxParticipants: 10,
        allowPaymentPlans: false,
        installmentCount: 0,
        installmentDueDates: [],
        installmentAmounts: [],
        sportId: 'volleyball',
        fieldIds: [],
      },
    ],
    playoffDivisionDetails: [],
    divisionFieldIds: {},
    selectedFieldIds: [],
    cancellationRefundHours: 24,
    registrationCutoffHours: 2,
    requiredTemplateIds: [],
    hostId: 'host_1',
    noFixedEndDateTime: false,
    imageId: 'image_1',
    seedColor: 0,
    waitListIds: [],
    freeAgentIds: [],
    waitList: [],
    freeAgents: [],
    players: [],
    teams: [],
    officials: [],
    officialIds: [],
    assistantHostIds: [],
    doTeamsOfficiate: false,
    teamOfficialsMaySwap: false,
    leagueScoringConfig: null,
    leagueSlots: [],
    leagueData: {
      gamesPerOpponent: 1,
      includePlayoffs: false,
    },
    playoffData: {},
    tournamentData: {},
    fields: [],
    fieldCount: 1,
    joinAsParticipant: true,
  });

  const renderForm = (
    onDirtyStateChange: jest.Mock,
    ref?: React.RefObject<EventFormHandle | null>,
    eventOverrides: Record<string, unknown> = {},
    organization: Record<string, unknown> | null = null,
    extraProps: Record<string, unknown> = {},
  ) => renderWithMantine(
    <EventForm
      ref={ref}
      isOpen
      currentUser={{ $id: 'host_1', email: 'host@example.com' } as any}
      event={{ ...buildEvent(), ...eventOverrides } as any}
      organization={organization as any}
      onDirtyStateChange={onDirtyStateChange}
      {...extraProps}
    />,
  );

  const buildOrganization = () => ({
    $id: 'org_1',
    ownerId: 'host_1',
    owner: { $id: 'host_1', email: 'host@example.com', firstName: 'Harper', lastName: 'Host' },
    staffMembers: [
      {
        $id: 'org_staff_host_2',
        organizationId: 'org_1',
        userId: 'host_2',
        types: ['HOST'],
        user: { $id: 'host_2', email: 'host2@example.com', firstName: 'Jordan', lastName: 'Host' },
        invite: { status: 'ACCEPTED' },
      },
      {
        $id: 'org_staff_assistant_1',
        organizationId: 'org_1',
        userId: 'assistant_1',
        types: ['HOST'],
        user: { $id: 'assistant_1', email: 'assistant@example.com', firstName: 'Alex', lastName: 'Host' },
        invite: { status: 'ACCEPTED' },
      },
      {
        $id: 'org_staff_official_1',
        organizationId: 'org_1',
        userId: 'official_1',
        types: ['OFFICIAL'],
        user: { $id: 'official_1', email: 'official1@example.com', firstName: 'Riley', lastName: 'Official' },
        invite: { status: 'ACCEPTED' },
      },
      {
        $id: 'org_staff_official_2',
        organizationId: 'org_1',
        userId: 'official_2',
        types: ['OFFICIAL'],
        user: { $id: 'official_2', email: 'official2@example.com', firstName: 'Casey', lastName: 'Official' },
        invite: { status: 'PENDING' },
      },
    ],
    staffInvites: [],
    hostIds: ['host_1', 'host_2', 'assistant_1'],
    hosts: [
      { $id: 'host_1', email: 'host@example.com', firstName: 'Harper', lastName: 'Host' },
      { $id: 'host_2', email: 'host2@example.com', firstName: 'Jordan', lastName: 'Host' },
      { $id: 'assistant_1', email: 'assistant@example.com', firstName: 'Alex', lastName: 'Host' },
    ],
    officialIds: ['official_1', 'official_2'],
    officials: [
      { $id: 'official_1', email: 'official1@example.com', firstName: 'Riley', lastName: 'Official' },
      { $id: 'official_2', email: 'official2@example.com', firstName: 'Casey', lastName: 'Official' },
    ],
  });

  const waitForStableDirtyState = async (onDirtyStateChange: jest.Mock, expected: boolean) => {
    await waitFor(() => {
      expect(onDirtyStateChange).toHaveBeenLastCalledWith(expected);
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(onDirtyStateChange).toHaveBeenLastCalledWith(expected);
  };

  it('marks the form dirty when the event name changes', async () => {
    const onDirtyStateChange = jest.fn();

    renderForm(onDirtyStateChange);

    await waitFor(() => {
      expect(onDirtyStateChange).toHaveBeenCalledWith(false);
    });

    fireEvent.change(screen.getByPlaceholderText('Enter event name'), { target: { value: 'Updated Event Name' } });
    fireEvent.blur(screen.getByPlaceholderText('Enter event name'));

    await waitFor(() => {
      expect(onDirtyStateChange).toHaveBeenLastCalledWith(true);
    });
  });

  it('marks the form dirty when the start time changes', async () => {
    const onDirtyStateChange = jest.fn();

    renderForm(onDirtyStateChange);

    await waitFor(() => {
      expect(onDirtyStateChange).toHaveBeenCalledWith(false);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Start Date & Time' }));

    await waitFor(() => {
      expect(onDirtyStateChange).toHaveBeenLastCalledWith(true);
    });
  });

  it('defaults official scheduling mode to SCHEDULE when missing on the event payload', async () => {
    const onDirtyStateChange = jest.fn();

    renderForm(onDirtyStateChange);

    await waitFor(() => {
      expect(onDirtyStateChange).toHaveBeenCalledWith(false);
    });

    expect((screen.getByLabelText('Official scheduling mode') as HTMLSelectElement).value).toBe('SCHEDULE');
  });

  it('blocks validation when STAFFING is selected without enough assigned officials', async () => {
    const onDirtyStateChange = jest.fn();
    const formRef = React.createRef<EventFormHandle>();

    renderForm(
      onDirtyStateChange,
      formRef,
      {
        officialSchedulingMode: 'STAFFING',
        officialIds: ['official_1'],
        officialPositions: [
          { id: 'position_r1', name: 'R1', count: 2, order: 0 },
        ],
        eventOfficials: [
          {
            id: 'event_official_1',
            userId: 'official_1',
            positionIds: ['position_r1'],
            fieldIds: [],
            isActive: true,
          },
        ],
      },
    );

    await waitFor(() => {
      expect(onDirtyStateChange).toHaveBeenCalledWith(false);
    });

    await waitFor(() => {
      expect(screen.getByText(/STAFFING requires at least 2 officials for each match/i)).toBeInTheDocument();
    });

    let isValid = true;
    await act(async () => {
      isValid = await formRef.current!.validate();
    });

    expect(isValid).toBe(false);
  });

  it('updates the dirty baseline after a successful save commit', async () => {
    const onDirtyStateChange = jest.fn();
    const formRef = React.createRef<EventFormHandle>();

    renderForm(onDirtyStateChange, formRef);

    await waitFor(() => {
      expect(onDirtyStateChange).toHaveBeenCalledWith(false);
    });

    const eventNameInput = screen.getByPlaceholderText('Enter event name');
    fireEvent.change(eventNameInput, { target: { value: 'Updated Event Name' } });
    fireEvent.blur(eventNameInput);

    await waitFor(() => {
      expect(onDirtyStateChange).toHaveBeenLastCalledWith(true);
    });

    await act(async () => {
      formRef.current?.commitDirtyBaseline();
    });

    await waitFor(() => {
      expect(onDirtyStateChange).toHaveBeenLastCalledWith(false);
    });

    fireEvent.change(eventNameInput, { target: { value: 'Updated Event Name Again' } });
    fireEvent.blur(eventNameInput);

    await waitFor(() => {
      expect(onDirtyStateChange).toHaveBeenLastCalledWith(true);
    });
  });

  it('re-establishes dirty tracking after the saved event reloads with the same id', async () => {
    const onDirtyStateChange = jest.fn();
    const formRef = React.createRef<EventFormHandle>();
    let setRenderedEvent: React.Dispatch<React.SetStateAction<any>> | null = null;
    const Harness = () => {
      const [event, setEvent] = React.useState<any>(buildEvent());
      React.useEffect(() => {
        setRenderedEvent = setEvent;
      }, [setEvent]);
      return (
        <EventForm
          ref={formRef}
          isOpen
          currentUser={{ $id: 'host_1', email: 'host@example.com' } as any}
          event={event}
          organization={null as any}
          onDirtyStateChange={onDirtyStateChange}
        />
      );
    };

    renderWithMantine(<Harness />);

    await waitFor(() => {
      expect(onDirtyStateChange).toHaveBeenCalledWith(false);
    });

    const eventNameInput = screen.getByPlaceholderText('Enter event name');
    fireEvent.change(eventNameInput, { target: { value: 'Saved Event Name' } });
    fireEvent.blur(eventNameInput);

    await waitFor(() => {
      expect(onDirtyStateChange).toHaveBeenLastCalledWith(true);
    });

    await act(async () => {
      formRef.current?.commitDirtyBaseline();
    });

    await act(async () => {
      setRenderedEvent?.({ ...buildEvent(), name: 'Saved Event Name', officialIds: ['official_1'] });
    });

    await waitFor(() => {
      expect(onDirtyStateChange).toHaveBeenLastCalledWith(false);
    });

    fireEvent.change(screen.getByPlaceholderText('Enter event name'), {
      target: { value: 'Saved Event Name Again' },
    });
    fireEvent.blur(screen.getByPlaceholderText('Enter event name'));

    await waitFor(() => {
      expect(onDirtyStateChange).toHaveBeenLastCalledWith(true);
    });
  });

  it('does not mark edit mode dirty when official data is already present', async () => {
    const onDirtyStateChange = jest.fn();

    renderForm(onDirtyStateChange, undefined, {
      state: 'UNPUBLISHED',
      officialIds: ['official_1'],
      officials: [{ $id: 'official_1', email: 'official1@example.com', firstName: 'Riley', lastName: 'Official' }] as any,
    });

    await waitForStableDirtyState(onDirtyStateChange, false);
    expect(userService.getUsersByIds).not.toHaveBeenCalledWith(['official_1']);
    expect(onDirtyStateChange).not.toHaveBeenCalledWith(true);
  });

  it('does not mark edit mode dirty when sport config hydrates from sportId', async () => {
    const onDirtyStateChange = jest.fn();

    renderForm(onDirtyStateChange, undefined, {
      state: 'UNPUBLISHED',
      sport: null,
    });

    await waitForStableDirtyState(onDirtyStateChange, false);
    expect(onDirtyStateChange).not.toHaveBeenCalledWith(true);
  });

  it('does not mark edit mode dirty when sports catalog loads after initial render', async () => {
    const onDirtyStateChange = jest.fn();
    const event = {
      ...buildEvent(),
      state: 'UNPUBLISHED',
      sport: null,
      sportConfig: null,
    } as any;
    let setRenderVersion: React.Dispatch<React.SetStateAction<number>> | null = null;
    const Harness = () => {
      const [renderVersion, setLocalRenderVersion] = React.useState(0);
      React.useEffect(() => {
        setRenderVersion = setLocalRenderVersion;
      }, [setLocalRenderVersion]);
      return (
        <EventForm
          key={`event-form-${renderVersion}`}
          isOpen
          currentUser={{ $id: 'host_1', email: 'host@example.com' } as any}
          event={event}
          organization={null as any}
          onDirtyStateChange={onDirtyStateChange}
        />
      );
    };
    mockUseSportsState = buildMockUseSportsState({ sports: [], loading: true });

    renderWithMantine(<Harness />);

    await waitForStableDirtyState(onDirtyStateChange, false);

    await act(async () => {
      mockUseSportsState = buildMockUseSportsState({ sports: [mockSport], loading: false });
      setRenderVersion?.((current) => current + 1);
    });

    await waitForStableDirtyState(onDirtyStateChange, false);
    expect(onDirtyStateChange).not.toHaveBeenCalledWith(true);
  });

  it('does not mark edit mode dirty when league set defaults hydrate for set-based sports', async () => {
    const onDirtyStateChange = jest.fn();
    const setBasedSport = {
      ...mockSport,
      $id: 'volleyball_sets',
      id: 'volleyball_sets',
      usePointsPerSetWin: true,
    };
    mockUseSportsState = buildMockUseSportsState({ sports: [setBasedSport], loading: false });

    renderForm(onDirtyStateChange, undefined, {
      state: 'UNPUBLISHED',
      eventType: 'LEAGUE',
      sportId: 'volleyball_sets',
      sport: null,
      sportConfig: null,
      teamSignup: true,
      leagueData: {
        gamesPerOpponent: 1,
        includePlayoffs: false,
      },
      timeSlots: [
        {
          $id: 'slot_1',
          scheduledFieldId: 'field_1',
          scheduledFieldIds: ['field_1'],
          dayOfWeek: 1,
          daysOfWeek: [1],
          divisions: ['open'],
          startTimeMinutes: 600,
          endTimeMinutes: 660,
          repeating: true,
          startDate: '2026-03-12T10:00',
          endDate: '2026-03-12T12:00',
        },
      ],
    });

    await waitForStableDirtyState(onDirtyStateChange, false);
    expect(onDirtyStateChange).not.toHaveBeenCalledWith(true);
  });

  it('does not mark edit mode dirty when timeslot conflict checks update slot metadata', async () => {
    const onDirtyStateChange = jest.fn();
    (eventService.getBlockingForFieldInRange as jest.Mock).mockResolvedValue([]);

    renderForm(onDirtyStateChange, undefined, {
      state: 'UNPUBLISHED',
      eventType: 'LEAGUE',
      teamSignup: true,
      noFixedEndDateTime: true,
      fields: [{ $id: 'field_1', name: 'Field 1', fieldNumber: 1, location: 'Main Gym' }],
      fieldIds: ['field_1'],
      selectedFieldIds: ['field_1'],
      timeSlots: [
        {
          $id: 'slot_1',
          scheduledFieldId: 'field_1',
          scheduledFieldIds: ['field_1'],
          dayOfWeek: 1,
          daysOfWeek: [1],
          divisions: ['open'],
          startTimeMinutes: 600,
          endTimeMinutes: 660,
          repeating: true,
          startDate: '2026-03-12T10:00',
          endDate: '2026-03-12T12:00',
        },
      ],
    });

    await waitFor(() => {
      expect(eventService.getBlockingForFieldInRange).toHaveBeenCalled();
    });

    await waitForStableDirtyState(onDirtyStateChange, false);
    expect(onDirtyStateChange).not.toHaveBeenCalledWith(true);
  });

  it('marks the form dirty when a official is removed', async () => {
    const onDirtyStateChange = jest.fn();

    renderForm(onDirtyStateChange, undefined, {
      officials: [{ $id: 'official_1', email: 'official1@example.com', firstName: 'Riley', lastName: 'Official' }],
      officialIds: ['official_1'],
    });

    await waitFor(() => {
      expect(onDirtyStateChange).toHaveBeenCalledWith(false);
    });

    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0]);

    await waitForStableDirtyState(onDirtyStateChange, true);
  });

  it('marks the form dirty when an assistant host is removed', async () => {
    const onDirtyStateChange = jest.fn();
    (userService.getUsersByIds as jest.Mock).mockResolvedValue([
      { $id: 'assistant_1', email: 'assistant@example.com', firstName: 'Alex', lastName: 'Host' },
    ]);

    renderForm(onDirtyStateChange, undefined, {
      assistantHostIds: ['assistant_1'],
    });

    await waitFor(() => {
      expect(onDirtyStateChange).toHaveBeenCalledWith(false);
    });

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Remove' }).length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0]);

    await waitForStableDirtyState(onDirtyStateChange, true);
  });

  it('marks the form dirty when a official is added', async () => {
    const onDirtyStateChange = jest.fn();
    (userService.searchUsers as jest.Mock).mockResolvedValue([
      { $id: 'official_2', email: 'official2@example.com', firstName: 'Casey', lastName: 'Official' },
    ]);

    renderForm(onDirtyStateChange);

    await waitFor(() => {
      expect(onDirtyStateChange).toHaveBeenCalledWith(false);
    });

    fireEvent.change(screen.getByLabelText('Search users'), {
      target: { value: 'casey' },
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Add as official' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Add as official' }));

    await waitForStableDirtyState(onDirtyStateChange, true);
  });

  it('marks the form dirty when an assistant host is added', async () => {
    const onDirtyStateChange = jest.fn();
    (userService.searchUsers as jest.Mock).mockResolvedValue([
      { $id: 'assistant_1', email: 'assistant@example.com', firstName: 'Alex', lastName: 'Host' },
    ]);

    renderForm(onDirtyStateChange);

    await waitFor(() => {
      expect(onDirtyStateChange).toHaveBeenCalledWith(false);
    });

    fireEvent.change(screen.getByLabelText('Search users'), {
      target: { value: 'alex' },
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Add as assistant host' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Add as assistant host' }));

    await waitForStableDirtyState(onDirtyStateChange, true);
  });

  it('marks the form dirty when an organization primary host changes', async () => {
    const onDirtyStateChange = jest.fn();
    const formRef = React.createRef<EventFormHandle>();
    const organization = buildOrganization();

    renderForm(
      onDirtyStateChange,
      formRef,
      {
        organizationId: organization.$id,
        hostId: 'host_1',
        state: 'UNPUBLISHED',
      },
      organization,
    );

    await waitFor(() => {
      expect(onDirtyStateChange).toHaveBeenCalledWith(false);
    });

    fireEvent.click(screen.getAllByRole('button', { name: 'Set as host' })[1]);

    await waitFor(() => {
      expect(formRef.current?.getDraft()).toEqual(
        expect.objectContaining({
          hostId: 'host_2',
        }),
      );
    });

    await waitForStableDirtyState(onDirtyStateChange, true);
  });

  it('marks the form dirty when an organization assistant host changes', async () => {
    const onDirtyStateChange = jest.fn();
    const organization = buildOrganization();

    renderForm(
      onDirtyStateChange,
      undefined,
      {
        organizationId: organization.$id,
        hostId: 'host_1',
        assistantHostIds: [],
        state: 'UNPUBLISHED',
      },
      organization,
    );

    await waitFor(() => {
      expect(onDirtyStateChange).toHaveBeenCalledWith(false);
    });

    fireEvent.click(screen.getAllByRole('button', { name: 'Add as assistant' })[1]);

    await waitForStableDirtyState(onDirtyStateChange, true);
  });

  it('marks the form dirty when an organization official is removed', async () => {
    const onDirtyStateChange = jest.fn();
    const organization = buildOrganization();

    renderForm(
      onDirtyStateChange,
      undefined,
      {
        organizationId: organization.$id,
        officialIds: ['official_1'],
        officials: [{ $id: 'official_1', email: 'official1@example.com', firstName: 'Riley', lastName: 'Official' }],
        state: 'UNPUBLISHED',
      },
      organization,
    );

    await waitFor(() => {
      expect(onDirtyStateChange).toHaveBeenCalledWith(false);
    });

    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0]);

    await waitForStableDirtyState(onDirtyStateChange, true);
  });

  it('shows a failed-email hint on staff cards when invite status is FAILED', async () => {
    const onDirtyStateChange = jest.fn();

    renderForm(
      onDirtyStateChange,
      undefined,
      {
        officialIds: ['official_1'],
        officials: [{ $id: 'official_1', email: 'official1@example.com', firstName: 'Riley', lastName: 'Official' }],
        staffInvites: [{
          $id: 'invite_failed_1',
          type: 'STAFF',
          eventId: 'event_1',
          userId: 'official_1',
          status: 'FAILED',
          staffTypes: ['OFFICIAL'],
        }],
      },
    );

    await waitFor(() => {
      expect(onDirtyStateChange).toHaveBeenCalledWith(false);
    });

    expect(screen.getByText('Email failed')).toBeInTheDocument();
    expect(screen.getByText('Email likely failed to send. Remove and re-add this invite to retry.')).toBeInTheDocument();
  });

  it('stages email invite staff cards and marks the form dirty', async () => {
    const onDirtyStateChange = jest.fn();

    renderForm(onDirtyStateChange);

    await waitFor(() => {
      expect(onDirtyStateChange).toHaveBeenCalledWith(false);
    });

    fireEvent.change(screen.getByLabelText('First name'), {
      target: { value: 'Casey' },
    });
    fireEvent.change(screen.getByLabelText('Last name'), {
      target: { value: 'Ref' },
    });
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'official@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Official' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add email invite' }));

    await waitForStableDirtyState(onDirtyStateChange, true);
    expect(screen.getByText('Email invite')).toBeInTheDocument();
  });

  it('does not stage a official email invite when the server reports that email already belongs to an assigned official', async () => {
    const onDirtyStateChange = jest.fn();
    const formRef = React.createRef<EventFormHandle>();
    (userService.lookupEmailMembership as jest.Mock).mockResolvedValue([
      { email: 'official@example.com', userId: 'official_1' },
    ]);

    renderForm(onDirtyStateChange, formRef, {
      officialIds: ['official_1'],
      officials: [],
    });

    await waitFor(() => {
      expect(onDirtyStateChange).toHaveBeenCalledWith(false);
    });

    fireEvent.change(screen.getByLabelText('First name'), {
      target: { value: 'Casey' },
    });
    fireEvent.change(screen.getByLabelText('Last name'), {
      target: { value: 'Ref' },
    });
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'official@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Official' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add email invite' }));

    await waitFor(() => {
      expect(screen.getByText('official@example.com is already added as official for this event.')).toBeInTheDocument();
    });
    expect(screen.queryByText('Email invite')).not.toBeInTheDocument();
    expect(userService.lookupEmailMembership).toHaveBeenCalledWith(
      ['official@example.com'],
      expect.arrayContaining(['host_1', 'official_1']),
    );
  });

  it('rejects pending staff save validation when the server reports a same-role email match', async () => {
    const onDirtyStateChange = jest.fn();
    const formRef = React.createRef<EventFormHandle>();
    (userService.lookupEmailMembership as jest.Mock).mockResolvedValue([
      { email: 'assistant@example.com', userId: 'assistant_1' },
    ]);

    renderForm(onDirtyStateChange, formRef, {
      assistantHostIds: ['assistant_1'],
      pendingStaffInvites: [
        { firstName: 'Alex', lastName: 'Host', email: 'assistant@example.com', roles: ['ASSISTANT_HOST'] },
      ],
    });

    await waitFor(() => {
      expect(onDirtyStateChange).toHaveBeenCalledWith(false);
    });

    let thrown: Error | null = null;
    await act(async () => {
      try {
        await formRef.current?.validatePendingStaffAssignments();
      } catch (error) {
        thrown = error as Error;
      }
    });

    expect(thrown?.message).toBe('assistant@example.com is already added as assistant host for this event.');
    expect(screen.getByText('assistant@example.com is already added as assistant host for this event.')).toBeInTheDocument();
    expect(userService.lookupEmailMembership).toHaveBeenCalledWith(
      ['assistant@example.com'],
      expect.arrayContaining(['assistant_1', 'host_1']),
    );
  });

  it('stages staff invites until save and resolves them through the save hook', async () => {
    const onDirtyStateChange = jest.fn();
    const formRef = React.createRef<EventFormHandle>();
    (userService.inviteUsersByEmail as jest.Mock).mockResolvedValue({
      sent: [{ userId: 'official_2', email: 'official@example.com', staffTypes: ['OFFICIAL', 'HOST'] }],
      not_sent: [],
      failed: [],
    });
    (userService.getUsersByIds as jest.Mock).mockResolvedValue([
      { $id: 'official_2', email: 'official@example.com', firstName: 'Casey', lastName: 'Official' },
    ]);

    renderForm(onDirtyStateChange, formRef, {
      pendingStaffInvites: [
        { firstName: 'Casey', lastName: 'Official', email: 'official@example.com', roles: ['OFFICIAL', 'ASSISTANT_HOST'] },
      ],
    });

    await waitFor(() => {
      expect(onDirtyStateChange).toHaveBeenCalledWith(false);
    });
    expect(userService.inviteUsersByEmail).not.toHaveBeenCalled();

    await act(async () => {
      await formRef.current?.submitPendingStaffInvites('event_1');
    });

    const [inviteUserIdArg, invitePayloadArg] = (userService.inviteUsersByEmail as jest.Mock).mock.calls[0];
    expect(inviteUserIdArg).toBe('host_1');
    expect(invitePayloadArg).toHaveLength(1);
    expect(invitePayloadArg[0]).toEqual(expect.objectContaining({
      firstName: 'Casey',
      lastName: 'Official',
      email: 'official@example.com',
      type: 'STAFF',
      eventId: 'event_1',
      replaceStaffTypes: true,
      staffTypes: expect.arrayContaining(['OFFICIAL', 'HOST']),
    }));

    await waitFor(() => {
      expect(screen.getByLabelText('Email')).toHaveValue('');
    });

    expect(formRef.current?.getDraft()).toEqual(
      expect.objectContaining({
        officialIds: expect.arrayContaining(['official_2']),
        assistantHostIds: expect.arrayContaining(['official_2']),
        officials: expect.arrayContaining([
          expect.objectContaining({ $id: 'official_2' }),
        ]),
      }),
    );
  });

  it('does not resend invites for unchanged assigned staff', async () => {
    const onDirtyStateChange = jest.fn();
    const formRef = React.createRef<EventFormHandle>();

    renderForm(onDirtyStateChange, formRef, {
      officialIds: ['official_1'],
      assistantHostIds: ['assistant_1'],
      staffInvites: [],
      pendingStaffInvites: [],
    });

    await waitFor(() => {
      expect(onDirtyStateChange).toHaveBeenCalledWith(false);
    });

    await act(async () => {
      await formRef.current?.submitPendingStaffInvites('event_1');
    });

    expect(userService.inviteUsersByEmail).not.toHaveBeenCalled();
  });

  it('updates existing pending invites when assigned roles change', async () => {
    const onDirtyStateChange = jest.fn();
    const formRef = React.createRef<EventFormHandle>();
    (userService.inviteUsersByEmail as jest.Mock).mockResolvedValue({
      sent: [],
      not_sent: [],
      failed: [],
    });

    renderForm(onDirtyStateChange, formRef, {
      officialIds: ['official_1'],
      assistantHostIds: ['official_1'],
      staffInvites: [
        {
          $id: 'invite_1',
          type: 'STAFF',
          eventId: 'event_1',
          userId: 'official_1',
          status: 'PENDING',
          staffTypes: ['OFFICIAL'],
          email: 'official1@example.com',
        },
      ],
      pendingStaffInvites: [],
    });

    await waitFor(() => {
      expect(onDirtyStateChange).toHaveBeenCalledWith(false);
    });

    await act(async () => {
      await formRef.current?.submitPendingStaffInvites('event_1');
    });

    expect(userService.inviteUsersByEmail).toHaveBeenCalledTimes(1);
    const [, invitePayloadArg] = (userService.inviteUsersByEmail as jest.Mock).mock.calls[0];
    expect(invitePayloadArg).toHaveLength(1);
    expect(invitePayloadArg[0]).toEqual(expect.objectContaining({
      userId: 'official_1',
      type: 'STAFF',
      eventId: 'event_1',
      replaceStaffTypes: true,
      staffTypes: ['HOST', 'OFFICIAL'],
    }));
  });

  it('allows null team capacity limits in form state while surfacing warning and errors', async () => {
    const onDirtyStateChange = jest.fn();
    const formRef = React.createRef<EventFormHandle>();

    renderForm(onDirtyStateChange, formRef, {
      teamSignup: true,
      maxParticipants: 10,
      teamSizeLimit: 2,
    });

    await waitFor(() => {
      expect(onDirtyStateChange).toHaveBeenCalledWith(false);
    });

    const maxTeamsInput = screen.getByLabelText('Max Teams');
    const teamSizeLimitInput = screen.getByLabelText('Team Size Limit');

    fireEvent.change(maxTeamsInput, {
      target: { value: '' },
    });
    fireEvent.blur(maxTeamsInput);
    fireEvent.change(teamSizeLimitInput, {
      target: { value: '' },
    });
    fireEvent.blur(teamSizeLimitInput);

    await waitFor(() => {
      expect(screen.getByText('Capacity limits are required before save')).toBeInTheDocument();
    });

    let isValid: boolean | undefined;
    await act(async () => {
      isValid = await formRef.current?.validate();
    });

    expect(isValid).toBe(false);
  });

});
