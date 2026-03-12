import React from 'react';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithMantine } from '../../../../../../../test/utils/renderWithMantine';
import EventForm, { EventFormHandle } from '../EventForm';
import { userService } from '@/lib/userService';

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

jest.mock('@/app/discover/components/TournamentFields', () => () => <div data-testid="tournament-fields" />);
jest.mock('@/app/discover/components/LeagueFields', () => () => <div data-testid="league-fields" />);
jest.mock('@/app/discover/components/LeagueScoringConfigPanel', () => () => <div data-testid="league-scoring-config" />);
jest.mock('@/components/ui/CentsInput', () => () => <div data-testid="cents-input" />);
jest.mock('@/components/ui/PriceWithFeesPreview', () => () => <div data-testid="price-preview" />);
jest.mock('@/components/ui/UserCard', () => () => <div data-testid="user-card" />);
jest.mock('@/components/ui/ImageUploader', () => ({
  ImageUploader: () => <div data-testid="image-uploader" />,
}));

jest.mock('@/app/hooks/useSports', () => ({
  useSports: () => {
    const sport = { $id: 'volleyball', id: 'volleyball', name: 'Volleyball' };
    return {
      sports: [sport],
      sportsById: new Map([[sport.$id, sport]]),
      sportsByName: new Map([[sport.name.toLowerCase(), sport]]),
      loading: false,
      error: null,
    };
  },
}));

jest.mock('@/lib/eventService', () => ({
  eventService: {
    getEventWithRelations: jest.fn().mockResolvedValue(null),
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
    (userService.getUsersByIds as jest.Mock).mockResolvedValue([]);
    (userService.searchUsers as jest.Mock).mockResolvedValue([]);
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
    referees: [],
    refereeIds: [],
    assistantHostIds: [],
    doTeamsRef: false,
    teamRefsMaySwap: false,
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
    hostIds: ['host_1', 'host_2', 'assistant_1'],
    hosts: [
      { $id: 'host_1', email: 'host@example.com', firstName: 'Harper', lastName: 'Host' },
      { $id: 'host_2', email: 'host2@example.com', firstName: 'Jordan', lastName: 'Host' },
      { $id: 'assistant_1', email: 'assistant@example.com', firstName: 'Alex', lastName: 'Host' },
    ],
    refIds: ['ref_1', 'ref_2'],
    referees: [
      { $id: 'ref_1', email: 'ref1@example.com', firstName: 'Riley', lastName: 'Ref' },
      { $id: 'ref_2', email: 'ref2@example.com', firstName: 'Casey', lastName: 'Ref' },
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

    formRef.current?.commitDirtyBaseline();

    await waitFor(() => {
      expect(onDirtyStateChange).toHaveBeenLastCalledWith(false);
    });

    fireEvent.change(eventNameInput, { target: { value: 'Updated Event Name Again' } });
    fireEvent.blur(eventNameInput);

    await waitFor(() => {
      expect(onDirtyStateChange).toHaveBeenLastCalledWith(true);
    });
  });

  it('marks the form dirty when a referee is removed', async () => {
    const onDirtyStateChange = jest.fn();

    renderForm(onDirtyStateChange, undefined, {
      referees: [{ $id: 'ref_1', email: 'ref1@example.com', firstName: 'Riley', lastName: 'Ref' }],
      refereeIds: ['ref_1'],
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

  it('marks the form dirty when a referee is added', async () => {
    const onDirtyStateChange = jest.fn();
    (userService.searchUsers as jest.Mock).mockResolvedValue([
      { $id: 'ref_2', email: 'ref2@example.com', firstName: 'Casey', lastName: 'Ref' },
    ]);

    renderForm(onDirtyStateChange);

    await waitFor(() => {
      expect(onDirtyStateChange).toHaveBeenCalledWith(false);
    });

    fireEvent.change(screen.getAllByPlaceholderText('Search by name or username')[1], {
      target: { value: 'casey' },
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

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

    fireEvent.change(screen.getAllByPlaceholderText('Search by name or username')[0], {
      target: { value: 'alex' },
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

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

    fireEvent.change(screen.getByLabelText('Primary Host'), {
      target: { value: 'host_2' },
    });

    await waitFor(() => {
      expect(formRef.current?.getDraft()).toEqual(
        expect.objectContaining({
          hostId: 'host_2',
        }),
      );
    });

    await waitForStableDirtyState(onDirtyStateChange, true);
  });

  it('emits a staged draft delta when an organization primary host changes', async () => {
    const onDirtyStateChange = jest.fn();
    const onDraftStateChange = jest.fn();
    const organization = buildOrganization();

    renderForm(
      onDirtyStateChange,
      undefined,
      {
        organizationId: organization.$id,
        hostId: 'host_1',
        state: 'UNPUBLISHED',
      },
      organization,
      { onDraftStateChange },
    );

    await waitFor(() => {
      expect(onDraftStateChange).toHaveBeenCalledWith(
        expect.objectContaining({
          draft: expect.objectContaining({ hostId: 'host_1' }),
          baselineDraft: expect.objectContaining({ hostId: 'host_1' }),
        }),
      );
    });

    fireEvent.change(screen.getByLabelText('Primary Host'), {
      target: { value: 'host_2' },
    });

    await waitFor(() => {
      expect(onDraftStateChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          draft: expect.objectContaining({ hostId: 'host_2' }),
          baselineDraft: expect.objectContaining({ hostId: 'host_1' }),
        }),
      );
    });
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

    const assistantHostsSelect = screen.getByLabelText('Assistant Hosts') as HTMLSelectElement;
    Array.from(assistantHostsSelect.options).forEach((option) => {
      option.selected = option.value === 'assistant_1';
    });
    fireEvent.change(assistantHostsSelect);

    await waitForStableDirtyState(onDirtyStateChange, true);
  });

  it('marks the form dirty when an organization referee is removed', async () => {
    const onDirtyStateChange = jest.fn();
    const organization = buildOrganization();

    renderForm(
      onDirtyStateChange,
      undefined,
      {
        organizationId: organization.$id,
        refereeIds: ['ref_1'],
        referees: [{ $id: 'ref_1', email: 'ref1@example.com', firstName: 'Riley', lastName: 'Ref' }],
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

  it('marks the form dirty when a referee invite is edited', async () => {
    const onDirtyStateChange = jest.fn();

    renderForm(onDirtyStateChange);

    await waitFor(() => {
      expect(onDirtyStateChange).toHaveBeenCalledWith(false);
    });

    fireEvent.change(screen.getByLabelText('First name'), {
      target: { value: 'Casey' },
    });

    await waitForStableDirtyState(onDirtyStateChange, true);
  });

  it('stages referee invites until save and resolves them through the save hook', async () => {
    const onDirtyStateChange = jest.fn();
    const formRef = React.createRef<EventFormHandle>();
    (userService.inviteUsersByEmail as jest.Mock).mockResolvedValue({
      sent: [{ userId: 'ref_2' }],
      not_sent: [],
      failed: [],
    });
    (userService.getUsersByIds as jest.Mock).mockResolvedValue([
      { $id: 'ref_2', email: 'ref@example.com', firstName: 'Casey', lastName: 'Ref' },
    ]);

    renderForm(onDirtyStateChange, formRef, {
      pendingRefereeInvites: [
        { firstName: 'Casey', lastName: 'Ref', email: 'ref@example.com' },
      ],
    });

    await waitFor(() => {
      expect(onDirtyStateChange).toHaveBeenCalledWith(false);
    });
    expect(userService.inviteUsersByEmail).not.toHaveBeenCalled();

    await act(async () => {
      await formRef.current?.submitPendingRefereeInvites('event_1');
    });

    expect(userService.inviteUsersByEmail).toHaveBeenCalledWith('host_1', [
      expect.objectContaining({
        firstName: 'Casey',
        lastName: 'Ref',
        email: 'ref@example.com',
        type: 'EVENT',
        eventId: 'event_1',
      }),
    ]);

    await waitFor(() => {
      expect(screen.getAllByLabelText('Email')[0]).toHaveValue('');
    });

    expect(formRef.current?.getDraft()).toEqual(
      expect.objectContaining({
        refereeIds: expect.arrayContaining(['ref_2']),
        referees: expect.arrayContaining([
          expect.objectContaining({ $id: 'ref_2' }),
        ]),
      }),
    );
  });
});
