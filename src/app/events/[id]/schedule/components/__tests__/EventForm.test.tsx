import React from 'react';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithMantine } from '../../../../../../../test/utils/renderWithMantine';
import EventForm, { EventFormHandle } from '../EventForm';
import { userService } from '@/lib/userService';
import { eventService } from '@/lib/eventService';
import { organizationService } from '@/lib/organizationService';
import { fieldService } from '@/lib/fieldService';
import { apiRequest } from '@/lib/apiClient';
import { CONFIRMED_ORGANIZER_LIABLE_EVENT_TAX_RULES } from '@/lib/taxPolicy';

jest.setTimeout(20000);

let mockDateTimePickerValuesByLabel: Record<string, string> = {};
let mockLeagueFieldsProps: any[] = [];

const createDeferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

jest.mock('@mantine/core', () => {
  const actual = jest.requireActual('@mantine/core');
  return {
    ...actual,
    Collapse: ({
      children,
      in: opened = true,
      transitionTimingFunction,
      className,
    }: {
      children: React.ReactNode;
      in?: boolean;
      transitionTimingFunction?: string;
      className?: string;
    }) => (
      transitionTimingFunction === 'ease' && !opened
        ? null
        : className
          ? <div className={className}>{children}</div>
          : <>{children}</>
    ),
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
  DateTimePicker: ({ label, onChange, value, disabled }: {
    label?: React.ReactNode;
    onChange?: (value: Date) => void;
    value?: Date | null;
    disabled?: boolean;
  }) => {
    const labelText = typeof label === 'string' ? label : 'Date Time Picker';
    const valueText = value instanceof Date && !Number.isNaN(value.getTime())
      ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}T${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`
      : '';
    return (
      <button
        type="button"
        aria-label={labelText}
        data-value={valueText}
        disabled={disabled}
        onClick={() => onChange?.(new Date(mockDateTimePickerValuesByLabel[labelText] ?? '2026-03-12T15:30:00'))}
      >
        {labelText}
      </button>
    );
  },
}));

jest.mock('motion/react', () => {
  const React = require('react');
  return {
    AnimatePresence: ({ children }: any) => React.createElement(React.Fragment, null, children),
    motion: {
      div: ({
        children,
        layout,
        initial,
        animate,
        exit,
        transition,
        ...props
      }: any) => React.createElement('div', props, children),
    },
  };
});

jest.mock('@/components/location/LocationSelector', () => {
  function MockLocationSelector({ label = 'Location', value = '', onChange }: any) {
    return (
      <input
        aria-label={label}
        value={value}
        onChange={(event) => onChange?.(
          event.currentTarget.value,
          37.0,
          -122.0,
          event.currentTarget.value,
          { selected: true, source: 'prediction' },
        )}
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
  function MockLeagueFields(props: any) {
    mockLeagueFieldsProps.push(props);
    const conflictCount = Array.isArray(props?.slots)
      ? props.slots.reduce((count: number, slot: any) => count + (Array.isArray(slot?.conflicts) ? slot.conflicts.length : 0), 0)
      : 0;
    return (
      <div data-testid="league-fields" data-configuration-title={props?.configurationTitle}>
        {props?.showTimeslots === false ? null : (
          <span data-testid="league-conflict-count">{conflictCount}</span>
        )}
      </div>
    );
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
  function MockCentsInput({ label = 'Price' }: { label?: string }) {
    return <div aria-label={label} data-testid="cents-input" />;
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
    getOrganizationByIdForEventForm: jest.fn().mockResolvedValue(null),
    listOrganizationDivisions: jest.fn().mockResolvedValue([]),
    createOrganizationDivision: jest.fn(),
  },
}));

jest.mock('@/lib/fieldService', () => ({
  fieldService: {
    listFields: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock('@/lib/apiClient', () => ({
  apiRequest: jest.fn().mockResolvedValue({}),
}));

describe('EventForm dirty state', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDateTimePickerValuesByLabel = {};
    mockLeagueFieldsProps = [];
    mockUseSportsState = buildMockUseSportsState();
    (eventService.getEventWithRelations as jest.Mock).mockResolvedValue(null);
    (eventService.getEventsForFieldInRange as jest.Mock).mockResolvedValue([]);
    (eventService.getBlockingForFieldInRange as jest.Mock).mockResolvedValue([]);
    (userService.getUsersByIds as jest.Mock).mockResolvedValue([]);
    (userService.searchUsers as jest.Mock).mockResolvedValue([]);
    (userService.lookupEmailMembership as jest.Mock).mockResolvedValue([]);
    (userService.inviteUsersByEmail as jest.Mock).mockResolvedValue({ sent: [], not_sent: [], failed: [] });
    (organizationService.getOrganizationById as jest.Mock).mockResolvedValue(null);
    (organizationService.getOrganizationByIdForEventForm as jest.Mock).mockResolvedValue(null);
    (organizationService.listOrganizationDivisions as jest.Mock).mockResolvedValue([]);
    (fieldService.listFields as jest.Mock).mockResolvedValue([]);
    (apiRequest as jest.Mock).mockResolvedValue({});
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ tags: [] }),
    }) as jest.Mock;
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
        divisionTypeName: 'Open 18+',
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
      initialSetupMode={extraProps.isCreateMode ? 'ADVANCED' : undefined}
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
    hosts: [
      { $id: 'host_1', email: 'host@example.com', firstName: 'Harper', lastName: 'Host' },
      { $id: 'host_2', email: 'host2@example.com', firstName: 'Jordan', lastName: 'Host' },
      { $id: 'assistant_1', email: 'assistant@example.com', firstName: 'Alex', lastName: 'Host' },
    ],
    officials: [
      { $id: 'official_1', email: 'official1@example.com', firstName: 'Riley', lastName: 'Official' },
    ],
  });

  it('exposes every imperative form command, including registration question drafts', async () => {
    const formRef = React.createRef<EventFormHandle>();

    renderForm(jest.fn(), formRef, {}, null, { isCreateMode: true });

    await waitFor(() => {
      expect(formRef.current).not.toBeNull();
    });

    expect(Object.keys(formRef.current!).sort()).toEqual([
      'applyCanonicalStaffState',
      'commitDirtyBaseline',
      'getDraft',
      'getRegistrationQuestionDrafts',
      'getValidationErrors',
      'validate',
      'validatePendingStaffAssignments',
    ]);
    expect(formRef.current!.getDraft()).toEqual(expect.objectContaining({ name: 'Test Event' }));
    expect(formRef.current!.getRegistrationQuestionDrafts()).toEqual([]);
    expect(formRef.current!.getValidationErrors()).toEqual([]);
    await act(async () => {
      await formRef.current!.validatePendingStaffAssignments();
    });
  });

  it('opens new events in Simple Setup and unlocks Basics after Format', async () => {
    renderForm(jest.fn(), undefined, {}, null, {
      isCreateMode: true,
      initialSetupMode: 'SIMPLE',
    });

    expect(await screen.findByRole('heading', { name: 'Format' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Basics: Locked' })).toBeInTheDocument();
    expect(screen.queryByText('Basic Information')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(await screen.findByRole('heading', { name: 'Basics' })).toBeInTheDocument();
    expect(screen.getByText('Basic Information')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Format: Complete' })).toBeInTheDocument();
  });

  it('preserves the event draft when switching from Simple to Advanced Setup', async () => {
    renderForm(jest.fn(), undefined, {}, null, {
      isCreateMode: true,
      initialSetupMode: 'SIMPLE',
    });

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    const nameInput = await screen.findByPlaceholderText('Enter event name');
    fireEvent.change(nameInput, { target: { value: 'Shared draft event' } });
    fireEvent.click(screen.getByLabelText('Advanced Setup'));

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Enter event name')).toHaveValue('Shared draft event');
    });
  });

  it('keeps organization Tryout division settings read only while editing the Tryout price', async () => {
    const formRef = React.createRef<EventFormHandle>();
    const sourceDivision = {
      id: 'organization_division_1',
      name: 'Girls U14 Competitive',
      organizationId: 'org_1',
      scope: 'ORGANIZATION',
      status: 'ACTIVE',
      sportId: 'volleyball',
      gender: 'F',
      skillDivisionTypeId: 'competitive',
      ageDivisionTypeId: 'u14',
      price: 42500,
      maxParticipants: 24,
    };
    (organizationService.listOrganizationDivisions as jest.Mock).mockResolvedValue([sourceDivision]);

    renderForm(jest.fn(), formRef, {
      eventType: 'TRYOUT',
      organizationId: 'org_1',
      registrationPaymentMode: 'MANUAL',
      teamSignup: false,
      singleDivision: false,
      noFixedEndDateTime: true,
      divisions: ['tryout_division_1'],
      divisionDetails: [{
        ...buildEvent().divisionDetails[0],
        id: 'tryout_division_1',
        sourceDivisionId: sourceDivision.id,
        name: sourceDivision.name,
        gender: sourceDivision.gender,
        skillDivisionTypeId: sourceDivision.skillDivisionTypeId,
        ageDivisionTypeId: sourceDivision.ageDivisionTypeId,
        price: 2500,
        maxParticipants: sourceDivision.maxParticipants,
      }],
    }, {
      ...buildOrganization(),
      enabledFeatures: ['CLUB_TEAMS'],
    });

    expect((await screen.findAllByText('Girls U14 Competitive')).length).toBeGreaterThan(0);
    expect(screen.queryByLabelText('Division name')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Gender')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Tryout price for Girls U14 Competitive'), {
      target: { value: '35' },
    });

    await waitFor(() => {
      expect(formRef.current?.getDraft().divisionDetails?.[0]?.price).toBe(3500);
    });
  });

  it('allows event payment plan totals to drive price instead of matching the existing price', async () => {
    const onDirtyStateChange = jest.fn();
    const formRef = React.createRef<EventFormHandle>();

    renderForm(onDirtyStateChange, formRef, {
      price: 10000,
      allowPaymentPlans: true,
      installmentCount: 2,
      installmentAmounts: [2500, 2500],
    });

    await waitFor(() => {
      expect(onDirtyStateChange).toHaveBeenCalledWith(false);
    });

    expect(screen.getByLabelText('Event Type')).not.toBeDisabled();

    let isValid: boolean | undefined;
    await act(async () => {
      isValid = await formRef.current?.validate();
    });

    expect(isValid).toBe(true);
  });

  it('allows division payment plan totals to drive division price instead of matching the existing price', async () => {
    const onDirtyStateChange = jest.fn();
    const formRef = React.createRef<EventFormHandle>();

    renderForm(onDirtyStateChange, formRef, {
      singleDivision: false,
      divisions: ['open'],
      divisionDetails: [
        {
          ...buildEvent().divisionDetails[0],
          price: 10000,
          allowPaymentPlans: true,
          installmentCount: 2,
          installmentAmounts: [2500, 2500],
        },
      ],
    });

    await waitFor(() => {
      expect(onDirtyStateChange).toHaveBeenCalledWith(false);
    });

    let isValid: boolean | undefined;
    await act(async () => {
      isValid = await formRef.current?.validate();
    });

    expect(isValid).toBe(true);
  });

  it('shows per-installment fee previews when event payment plans are enabled', async () => {
    const onDirtyStateChange = jest.fn();

    renderForm(onDirtyStateChange, undefined, {
      price: 5000,
      allowPaymentPlans: true,
      installmentCount: 2,
      installmentAmounts: [2500, 2500],
    });

    await waitFor(() => {
      expect(onDirtyStateChange).toHaveBeenCalledWith(false);
    });

    expect(screen.getAllByTestId('price-preview')).toHaveLength(2);
  });

  it('warns when payment plans make the event unavailable for mobile editing', async () => {
    renderForm(jest.fn(), undefined, {
      price: 5000,
      allowPaymentPlans: true,
      installmentCount: 2,
      installmentAmounts: [2500, 2500],
    });

    expect(await screen.findByText(
      'This event is not editable on mobile because it uses payment plans/installments. Teams and matches can still be managed from mobile.',
    )).toBeInTheDocument();
  });

  it('warns when split league playoffs make the event unavailable for mobile editing', async () => {
    renderForm(jest.fn(), undefined, {
      eventType: 'LEAGUE',
      includePlayoffs: true,
      singleDivision: false,
      leagueData: {
        gamesPerOpponent: 1,
        includePlayoffs: true,
      },
      splitLeaguePlayoffDivisions: true,
    });

    expect(await screen.findByText(
      'This event is not editable on mobile because it uses split league/playoff divisions. Teams and matches can still be managed from mobile.',
    )).toBeInTheDocument();
  });

  it('shows organizer tax responsibility next to price when policy assigns organizer liability', async () => {
    const organizerRules = CONFIRMED_ORGANIZER_LIABLE_EVENT_TAX_RULES as unknown as Array<{
      stateCode: string;
      purchaseTypes: string[];
      taxCategories: string[];
      allowedCollectionStrategies: Array<'ORGANIZER_MANUAL_TAX' | 'ORGANIZER_STRIPE_TAX'>;
      ruleId: string;
      ruleVersion: string;
    }>;
    const originalRuleCount = organizerRules.length;
    organizerRules.push({
      stateCode: 'ID',
      purchaseTypes: ['event'],
      taxCategories: ['EVENT_PARTICIPANT'],
      allowedCollectionStrategies: ['ORGANIZER_MANUAL_TAX', 'ORGANIZER_STRIPE_TAX'],
      ruleId: 'test-id-organizer-liable',
      ruleVersion: 'test-2026-05-08',
    });

    try {
      renderForm(
        jest.fn(),
        undefined,
        {
          address: '123 Main St, Boise, ID 83702',
          location: 'Boise, ID',
          price: 2500,
          taxHandling: 'ORGANIZER_MANUAL_TAX',
          organizerManualTaxRateBps: 600,
        },
      );

      expect(await screen.findByText('You are responsible for reporting and collecting sales tax in your state.')).toBeInTheDocument();
      expect(screen.getByLabelText('Tax handling')).toHaveValue('ORGANIZER_MANUAL_TAX');
      expect(screen.getByLabelText('Sales tax rate')).toBeInTheDocument();
    } finally {
      organizerRules.splice(originalRuleCount);
    }
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

    await waitForStableDirtyState(onDirtyStateChange, false);

    fireEvent.change(screen.getByPlaceholderText('Enter event name'), { target: { value: 'Updated Event Name' } });
    fireEvent.blur(screen.getByPlaceholderText('Enter event name'));

    await waitFor(() => {
      expect(onDirtyStateChange).toHaveBeenLastCalledWith(true);
    });
  });

  it('marks the form dirty when the start time changes', async () => {
    const onDirtyStateChange = jest.fn();

    renderForm(onDirtyStateChange);

    await waitForStableDirtyState(onDirtyStateChange, false);

    fireEvent.click(screen.getByRole('button', { name: 'Start Date & Time' }));

    await waitForStableDirtyState(onDirtyStateChange, true);
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

  it('allows TEAM STAFFING without assigned officials', async () => {
    const onDirtyStateChange = jest.fn();
    const formRef = React.createRef<EventFormHandle>();

    renderForm(
      onDirtyStateChange,
      formRef,
      {
        officialSchedulingMode: 'TEAM_STAFFING',
        doTeamsOfficiate: false,
        officialIds: [],
        officialPositions: [
          { id: 'position_r1', name: 'R1', count: 2, order: 0 },
        ],
        eventOfficials: [],
      },
    );

    await waitFor(() => {
      expect(onDirtyStateChange).toHaveBeenCalledWith(false);
    });

    expect(screen.queryByText(/STAFFING requires at least/i)).not.toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /Teams provide officials/i })).toBeChecked();

    let isValid = false;
    await act(async () => {
      isValid = await formRef.current!.validate();
    });

    expect(isValid).toBe(true);
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

  it('requires users to add a division instead of relying on a default', async () => {
    const formRef = React.createRef<EventFormHandle>();

    renderForm(jest.fn(), formRef, {
      divisions: [],
      divisionDetails: [],
    });

    await waitFor(() => {
      expect(formRef.current).not.toBeNull();
    });

    let isValid = true;
    await act(async () => {
      isValid = await formRef.current!.validate();
    });

    expect(isValid).toBe(false);
  });

  it('allows rental create flow to start without event image or divisions', async () => {
    const formRef = React.createRef<EventFormHandle>();

    renderForm(
      jest.fn(),
      formRef,
      {
        imageId: '',
        divisions: [],
        divisionDetails: [],
      },
      null,
      {
        isCreateMode: true,
        rentalPurchase: {
          start: '2026-03-12T10:00',
          end: '2026-03-12T12:00',
          fieldId: 'field_1',
          organization: null,
        },
      },
    );

    await waitFor(() => {
      expect(formRef.current).not.toBeNull();
    });

    let isValid = false;
    await act(async () => {
      isValid = await formRef.current!.validate();
    });

    expect(isValid).toBe(true);
    expect(formRef.current?.getValidationErrors()).toEqual([]);
  });

  it('requires every league division to be assigned to at least one timeslot', async () => {
    const formRef = React.createRef<EventFormHandle>();
    const baseDivision = buildEvent().divisionDetails[0];
    const divisionA = { ...baseDivision, id: 'division-a', key: 'division-a', name: 'Division A' };
    const divisionB = { ...baseDivision, id: 'division-b', key: 'division-b', name: 'Division B' };

    renderForm(jest.fn(), formRef, {
      eventType: 'LEAGUE',
      singleDivision: false,
      noFixedEndDateTime: true,
      divisions: ['division-a', 'division-b'],
      divisionDetails: [divisionA, divisionB],
      leagueSlots: [
        {
          $id: 'slot-a',
          key: 'slot-a',
          repeating: true,
          daysOfWeek: [1],
          dayOfWeek: 1,
          startTimeMinutes: 600,
          endTimeMinutes: 660,
          scheduledFieldId: 'field-a',
          scheduledFieldIds: ['field-a'],
          divisions: ['division-a'],
        },
      ],
      fields: [{ $id: 'field-a', name: 'Field A' }],
      fieldCount: 1,
    });

    await waitFor(() => {
      expect(formRef.current).not.toBeNull();
    });

    let isValid = true;
    await act(async () => {
      isValid = await formRef.current!.validate();
    });

    expect(isValid).toBe(false);
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

  it('hydrates the primary host for standalone event host staff', async () => {
    const onDirtyStateChange = jest.fn();
    (userService.getUsersByIds as jest.Mock).mockResolvedValue([
      { $id: 'host_2', email: 'host2@example.com', firstName: 'Jordan', lastName: 'Host' },
    ]);

    renderForm(onDirtyStateChange, undefined, {
      hostId: 'host_2',
      organizationId: null,
      assistantHostIds: [],
      state: 'UNPUBLISHED',
    });

    expect(await screen.findByText('Jordan Host')).toBeInTheDocument();
    expect(screen.queryByText('host_2')).not.toBeInTheDocument();
    expect(userService.getUsersByIds).toHaveBeenCalledWith(['host_2']);
    await waitForStableDirtyState(onDirtyStateChange, false);
  });

  it('does not fetch an organization primary host already present in the org roster', async () => {
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

    expect(await screen.findByText('Harper Host')).toBeInTheDocument();
    expect(userService.getUsersByIds).not.toHaveBeenCalledWith(['host_1']);
    await waitForStableDirtyState(onDirtyStateChange, false);
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
      fields: [{ $id: 'field_1', name: 'Field 1', location: 'Main Gym' }],
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

  it('defaults generated local field locations to the event location in create drafts', async () => {
    const onDirtyStateChange = jest.fn();
    const formRef = React.createRef<EventFormHandle>();

    renderForm(
      onDirtyStateChange,
      formRef,
      {
        state: 'UNPUBLISHED',
        eventType: 'LEAGUE',
        location: 'City Rec Center',
        fields: [],
        fieldIds: [],
        selectedFieldIds: [],
        fieldCount: 2,
        timeSlots: [],
      },
      null,
      { isCreateMode: true },
    );

    await waitFor(() => {
      const draft = formRef.current?.getDraft();
      expect(draft?.fields).toHaveLength(2);
      expect(draft?.fields?.[0]?.location).toBe('City Rec Center');
      expect(draft?.fields?.[1]?.location).toBe('City Rec Center');
    });
  });

  it('rechecks recurring slot conflicts from the updated event start when the saved slot start mirrored the original event start', async () => {
    const onDirtyStateChange = jest.fn();
    const formRef = React.createRef<EventFormHandle>();
    mockDateTimePickerValuesByLabel['Start Date & Time'] = '2026-05-04T09:00:00';
    (eventService.getBlockingForFieldInRange as jest.Mock).mockResolvedValue({
      events: [
        {
          $id: 'event_blocking_1',
          name: 'TEST DOC',
          eventType: 'EVENT',
          start: '2026-04-20T09:00:00',
          end: '2026-04-20T17:00:00',
        },
      ],
      rentalSlots: [],
    });

    renderForm(onDirtyStateChange, formRef, {
      state: 'UNPUBLISHED',
      eventType: 'LEAGUE',
      teamSignup: true,
      start: '2026-04-20T09:00:00',
      end: '2026-06-01T17:00:00',
      noFixedEndDateTime: false,
      fields: [{ $id: 'field_1', name: 'Field 1', location: 'Main Gym' }],
      fieldIds: ['field_1'],
      selectedFieldIds: ['field_1'],
      timeSlots: [
        {
          $id: 'slot_1',
          scheduledFieldId: 'field_1',
          scheduledFieldIds: ['field_1'],
          dayOfWeek: 0,
          daysOfWeek: [0],
          divisions: ['open'],
          startTimeMinutes: 9 * 60,
          endTimeMinutes: 21 * 60,
          repeating: true,
          startDate: '2026-04-20T09:00:00',
          endDate: '2026-06-01T17:00:00',
        },
      ],
    });

    await waitFor(() => {
      expect(screen.getByTestId('league-conflict-count')).toHaveTextContent('1');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Start Date & Time' }));

    await waitFor(() => {
      expect(screen.getByTestId('league-conflict-count')).toHaveTextContent('0');
    });
    await waitFor(() => {
      const draft = formRef.current?.getDraft();
      expect(draft?.timeSlots?.[0]?.startDate).toBe('2026-05-04T09:00:00');
    });
  });

  it('ignores a late slot-conflict response after the event schedule changes', async () => {
    const firstRequest = createDeferred<{ events: any[]; rentalSlots: any[] }>();
    const secondRequest = createDeferred<{ events: any[]; rentalSlots: any[] }>();
    let requestCount = 0;
    mockDateTimePickerValuesByLabel['Start Date & Time'] = '2026-05-04T09:00:00';
    (eventService.getBlockingForFieldInRange as jest.Mock).mockImplementation(() => {
      requestCount += 1;
      return requestCount === 1 ? firstRequest.promise : secondRequest.promise;
    });

    renderForm(jest.fn(), undefined, {
      state: 'UNPUBLISHED',
      eventType: 'LEAGUE',
      teamSignup: true,
      start: '2026-04-20T09:00:00',
      end: '2026-06-01T17:00:00',
      noFixedEndDateTime: false,
      fields: [{ $id: 'field_1', name: 'Field 1', location: 'Main Gym' }],
      fieldIds: ['field_1'],
      selectedFieldIds: ['field_1'],
      timeSlots: [{
        $id: 'slot_1',
        scheduledFieldId: 'field_1',
        scheduledFieldIds: ['field_1'],
        dayOfWeek: 0,
        daysOfWeek: [0],
        divisions: ['open'],
        startTimeMinutes: 9 * 60,
        endTimeMinutes: 21 * 60,
        repeating: true,
        startDate: '2026-04-20T09:00:00',
        endDate: '2026-06-01T17:00:00',
      }],
    });

    await waitFor(() => {
      expect(eventService.getBlockingForFieldInRange).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Start Date & Time' }));

    await waitFor(() => {
      expect(eventService.getBlockingForFieldInRange).toHaveBeenCalledTimes(2);
    });

    await act(async () => {
      secondRequest.resolve({ events: [], rentalSlots: [] });
      await secondRequest.promise;
    });
    await waitFor(() => {
      expect(screen.getByTestId('league-conflict-count')).toHaveTextContent('0');
    });

    await act(async () => {
      firstRequest.resolve({
        events: [{
          $id: 'stale_blocking_event',
          name: 'Stale blocking event',
          eventType: 'EVENT',
          start: '2026-04-20T09:00:00',
          end: '2026-04-20T17:00:00',
        }],
        rentalSlots: [],
      });
      await firstRequest.promise;
    });

    expect(screen.getByTestId('league-conflict-count')).toHaveTextContent('0');
  });

  it('keeps external timeslot field conflicts as warnings during validation', async () => {
    const onDirtyStateChange = jest.fn();
    const formRef = React.createRef<EventFormHandle>();
    (eventService.getBlockingForFieldInRange as jest.Mock).mockResolvedValue({
      events: [
        {
          $id: 'event_blocking_1',
          name: 'Conflicting League',
          eventType: 'LEAGUE',
          start: '2026-04-20T09:00:00',
          end: '2026-06-01T17:00:00',
          timeSlots: [
            {
              $id: 'blocking_slot_1',
              scheduledFieldId: 'field_1',
              scheduledFieldIds: ['field_1'],
              dayOfWeek: 0,
              daysOfWeek: [0],
              startTimeMinutes: 9 * 60,
              endTimeMinutes: 21 * 60,
              repeating: true,
              startDate: '2026-04-20T09:00:00',
              endDate: '2026-06-01T17:00:00',
            },
          ],
        },
      ],
      rentalSlots: [],
    });

    renderForm(onDirtyStateChange, formRef, {
      state: 'UNPUBLISHED',
      eventType: 'LEAGUE',
      teamSignup: true,
      start: '2026-04-20T09:00:00',
      end: '2026-06-01T17:00:00',
      noFixedEndDateTime: false,
      fields: [{ $id: 'field_1', name: 'Field 1', location: 'Main Gym' }],
      fieldIds: ['field_1'],
      selectedFieldIds: ['field_1'],
      timeSlots: [
        {
          $id: 'slot_1',
          scheduledFieldId: 'field_1',
          scheduledFieldIds: ['field_1'],
          dayOfWeek: 0,
          daysOfWeek: [0],
          divisions: ['open'],
          startTimeMinutes: 9 * 60,
          endTimeMinutes: 21 * 60,
          repeating: true,
          startDate: '2026-04-20T09:00:00',
          endDate: '2026-06-01T17:00:00',
        },
      ],
    });

    await waitFor(() => {
      expect(screen.getByTestId('league-conflict-count')).toHaveTextContent('1');
    });

    let isValid: boolean | undefined;
    await act(async () => {
      isValid = await formRef.current?.validate();
    });

    expect(isValid).toBe(true);
    expect(formRef.current?.getValidationErrors()).toEqual([]);
    expect(screen.getByText(/Timeslot field conflicts are warnings/i)).toBeInTheDocument();
  });

  it('does not treat rental slots as external timeslot field conflicts', async () => {
    const onDirtyStateChange = jest.fn();
    const formRef = React.createRef<EventFormHandle>();
    (eventService.getBlockingForFieldInRange as jest.Mock).mockResolvedValue({
      events: [],
      rentalSlots: [
        {
          $id: 'rental_slot_1',
          scheduledFieldId: 'field_1',
          scheduledFieldIds: ['field_1'],
          dayOfWeek: 0,
          daysOfWeek: [0],
          startTimeMinutes: 9 * 60,
          endTimeMinutes: 21 * 60,
          repeating: true,
          startDate: '2026-04-20T09:00:00',
          endDate: '2026-06-01T17:00:00',
        },
      ],
    });

    renderForm(onDirtyStateChange, formRef, {
      state: 'UNPUBLISHED',
      eventType: 'LEAGUE',
      teamSignup: true,
      start: '2026-04-20T09:00:00',
      end: '2026-06-01T17:00:00',
      noFixedEndDateTime: false,
      fields: [{ $id: 'field_1', name: 'Field 1', location: 'Main Gym' }],
      fieldIds: ['field_1'],
      selectedFieldIds: ['field_1'],
      timeSlots: [
        {
          $id: 'slot_1',
          scheduledFieldId: 'field_1',
          scheduledFieldIds: ['field_1'],
          dayOfWeek: 0,
          daysOfWeek: [0],
          divisions: ['open'],
          startTimeMinutes: 9 * 60,
          endTimeMinutes: 21 * 60,
          repeating: true,
          startDate: '2026-04-20T09:00:00',
          endDate: '2026-06-01T17:00:00',
        },
      ],
    });

    await waitFor(() => {
      expect(eventService.getBlockingForFieldInRange).toHaveBeenCalled();
    });
    expect(screen.getByTestId('league-conflict-count')).toHaveTextContent('0');

    let isValid: boolean | undefined;
    await act(async () => {
      isValid = await formRef.current?.validate();
    });

    expect(isValid).toBe(true);
    expect(formRef.current?.getValidationErrors()).toEqual([]);
    expect(screen.queryByText(/Timeslot field conflicts are warnings/i)).not.toBeInTheDocument();
  });

  it('keeps the end date value visible and serialized when no fixed end datetime scheduling is enabled', async () => {
    const onDirtyStateChange = jest.fn();
    const formRef = React.createRef<EventFormHandle>();

    renderForm(onDirtyStateChange, formRef, {
      state: 'UNPUBLISHED',
      eventType: 'LEAGUE',
      teamSignup: true,
      start: '2026-04-20T09:00:00',
      end: '2026-05-03T01:20:00',
      noFixedEndDateTime: true,
      fields: [{ $id: 'field_1', name: 'Field 1', location: 'Main Gym' }],
      fieldIds: ['field_1'],
      selectedFieldIds: ['field_1'],
      timeSlots: [
        {
          $id: 'slot_1',
          scheduledFieldId: 'field_1',
          scheduledFieldIds: ['field_1'],
          dayOfWeek: 5,
          daysOfWeek: [5],
          divisions: ['open'],
          startTimeMinutes: 9 * 60,
          endTimeMinutes: 17 * 60,
          repeating: true,
          startDate: '2026-04-20T09:00:00',
          endDate: null,
        },
      ],
    });

    const endDateButton = screen.getByRole('button', { name: 'End Date & Time' });
    expect(endDateButton).toBeDisabled();
    expect(endDateButton).toHaveAttribute('data-value', '2026-05-03T01:20');
    expect(screen.getByRole('checkbox', { name: 'No fixed end datetime scheduling' })).toBeChecked();
    expect(screen.queryByText('Scheduling can extend past the displayed end date/time. Turn this off to enforce the end date/time.')).not.toBeInTheDocument();

    await waitFor(() => {
      const draft = formRef.current?.getDraft();
      expect(draft?.noFixedEndDateTime).toBe(true);
      expect(draft?.end).toBe('2026-05-03T01:20:00');
      expect(draft?.timeSlots?.[0]?.endDate).toBeUndefined();
    });
  });

  it('marks the form dirty when a official is removed', async () => {
    const onDirtyStateChange = jest.fn();

    renderForm(onDirtyStateChange, undefined, {
      officials: [{ $id: 'official_1', email: 'official1@example.com', firstName: 'Riley', lastName: 'Official' }],
      officialIds: ['official_1'],
    });

    await waitForStableDirtyState(onDirtyStateChange, false);

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

    // `getByRole` recomputes the accessibility tree for the entire form on
    // every waitFor retry. EventForm is intentionally large, so use the
    // result text to await the async search and then assert its button owner.
    const addOfficialButton = (await screen.findByText('Add as official', {}, { timeout: 10_000 })).closest('button');
    expect(addOfficialButton).toBeInTheDocument();

    fireEvent.click(addOfficialButton as HTMLButtonElement);

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

    const addAssistantHostButton = (await screen.findByText('Add as assistant host', {}, { timeout: 10_000 })).closest('button');
    expect(addAssistantHostButton).toBeInTheDocument();

    fireEvent.click(addAssistantHostButton as HTMLButtonElement);

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

    const hostName = await screen.findByText('Jordan Host');
    let hostCard = hostName.parentElement;
    while (hostCard && !within(hostCard).queryByRole('button', { name: 'Set as host' })) {
      hostCard = hostCard.parentElement;
    }
    expect(hostCard).not.toBeNull();
    const setHostButton = within(hostCard as HTMLElement).getByRole('button', { name: 'Set as host' });
    expect(setHostButton).toBeEnabled();

    fireEvent.click(setHostButton);

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

    await waitForStableDirtyState(onDirtyStateChange, false);

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
      { eventId: 'event_1' },
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
      { eventId: 'event_1' },
    );
  });

  it('applies the canonical atomic staff response and clears staged invites without generic invite calls', async () => {
    const onDirtyStateChange = jest.fn();
    const formRef = React.createRef<EventFormHandle>();

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
      formRef.current?.applyCanonicalStaffState({
        contractVersion: 1,
        eventId: 'event_1',
        revision: 'canonical_revision',
        assistantHostIds: ['official_2'],
        officialPositions: [{
          id: 'position_server_1',
          name: 'Referee',
          count: 1,
          order: 0,
        }],
        eventOfficials: [{
          id: 'event_official_2',
          userId: 'official_2',
          positionIds: ['position_server_1'],
          fieldIds: [],
          isActive: true,
        }],
        officialIds: ['official_2'],
        staffInvites: [{
          $id: 'invite_2',
          type: 'STAFF',
          eventId: 'event_1',
          userId: 'official_2',
          email: 'official@example.com',
          status: 'PENDING',
          staffTypes: ['HOST', 'OFFICIAL'],
        }],
      });
    });

    expect(formRef.current?.getDraft()).toEqual(
      expect.objectContaining({
        officialIds: expect.arrayContaining(['official_2']),
        assistantHostIds: expect.arrayContaining(['official_2']),
        officialPositions: [expect.objectContaining({ id: 'position_server_1' })],
        eventOfficials: [expect.objectContaining({
          id: 'event_official_2',
          userId: 'official_2',
          positionIds: ['position_server_1'],
        })],
        pendingStaffInvites: [],
      }),
    );
    expect(userService.inviteUsersByEmail).not.toHaveBeenCalled();
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
    const teamSizeLimitInput = screen.getByLabelText('Team Size');

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

  it('renders the team signup switch under Team Size inside Event Details', async () => {
    const onDirtyStateChange = jest.fn();

    renderForm(onDirtyStateChange);

    await waitFor(() => {
      expect(onDirtyStateChange).toHaveBeenCalledWith(false);
    });

    const eventDetailsSection = document.getElementById('section-event-details');
    const teamSizeControl = screen.getByTestId('team-size-control');
    const teamSizeInput = screen.getByLabelText('Team Size');
    const teamSignupSwitch = screen.getByTestId('team-signup-switch');

    expect(eventDetailsSection).not.toBeNull();
    expect(eventDetailsSection).toContainElement(teamSizeControl);
    expect(teamSizeControl).toContainElement(teamSizeInput);
    expect(teamSizeControl).toContainElement(teamSignupSwitch);
    expect(teamSizeInput.compareDocumentPosition(teamSignupSwitch) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(teamSignupSwitch).toBeInTheDocument();
  });

  it('keeps Event Details datetime controls compact so cutoff fields fit in the first row', async () => {
    const onDirtyStateChange = jest.fn();

    renderForm(onDirtyStateChange);

    await waitFor(() => {
      expect(onDirtyStateChange).toHaveBeenCalledWith(false);
    });

    const eventDetailsGrid = document.getElementById('section-event-details-content');
    const startControl = screen.getByRole('button', { name: 'Start Date & Time' }).closest('.md\\:col-span-2');
    const endControl = screen.getByRole('button', { name: 'End Date & Time' }).closest('.md\\:col-span-2');
    const registrationCutoffControl = screen.getByLabelText('Registration Cutoff (Hours)').closest('.md\\:col-span-2');
    const refundCutoffControl = screen.getByLabelText('Refund Cutoff (Hours)').closest('.md\\:col-span-2');

    expect(eventDetailsGrid).not.toBeNull();
    expect(startControl).not.toBeNull();
    expect(endControl).not.toBeNull();
    expect(registrationCutoffControl).not.toBeNull();
    expect(refundCutoffControl).not.toBeNull();
    expect(eventDetailsGrid).toContainElement(startControl as HTMLElement);
    expect(eventDetailsGrid).toContainElement(endControl as HTMLElement);
    expect(eventDetailsGrid).toContainElement(registrationCutoffControl as HTMLElement);
    expect(eventDetailsGrid).toContainElement(refundCutoffControl as HTMLElement);
  });

  it('renders fixed team event checkbox under Team Size and division mode switches before division fields', async () => {
    const onDirtyStateChange = jest.fn();

    renderForm(onDirtyStateChange, undefined, {
      eventType: 'LEAGUE',
      includePlayoffs: true,
      includePlayoffsOrPools: true,
      teamSignup: true,
      leagueData: {
        gamesPerOpponent: 1,
        includePlayoffs: true,
      },
    });

    await waitFor(() => {
      expect(onDirtyStateChange).toHaveBeenCalledWith(false);
    });

    const eventDetailsSection = document.getElementById('section-event-details');
    const divisionSettingsSection = document.getElementById('section-division-settings-content');
    const teamSizeControl = screen.getByTestId('team-size-control');
    const teamSizeInput = screen.getByLabelText('Team Size');
    const teamEventCheckbox = screen.getByTestId('team-event-checkbox');
    const divisionModeSwitches = screen.getByTestId('division-mode-switches');
    const singleDivisionSettings = screen.getByText('Single Division');

    expect(eventDetailsSection).not.toBeNull();
    expect(eventDetailsSection).toContainElement(teamSizeControl);
    expect(teamSizeControl).toContainElement(teamSizeInput);
    expect(teamSizeControl).toContainElement(teamEventCheckbox);
    expect(teamSizeInput.compareDocumentPosition(teamEventCheckbox) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(teamEventCheckbox).toBeChecked();
    expect(teamEventCheckbox).toBeDisabled();
    expect(divisionSettingsSection).not.toBeNull();
    expect(divisionSettingsSection).toContainElement(divisionModeSwitches);
    expect(divisionModeSwitches).not.toContainElement(teamEventCheckbox);
    expect(divisionModeSwitches).toContainElement(screen.getByText('Single Division (all skill levels play together)'));
    expect(divisionModeSwitches).toContainElement(screen.getByText('Register by Division Type'));
    expect(divisionModeSwitches).toContainElement(screen.getByText('Split League & Playoff Divisions'));
    expect(divisionModeSwitches.compareDocumentPosition(singleDivisionSettings) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByLabelText('Playoff Team Count')).toBeInTheDocument();
  });

  it('renders location map beside documents and age controls in Event Details', async () => {
    const onDirtyStateChange = jest.fn();

    renderForm(onDirtyStateChange);

    await waitFor(() => {
      expect(onDirtyStateChange).toHaveBeenCalledWith(false);
    });

    const eventDetailsSection = document.getElementById('section-event-details');
    const locationMapColumn = screen.getByTestId('event-details-location-map');
    const mapSideControls = screen.getByTestId('event-details-map-side-controls');
    const locationInput = screen.getByLabelText('Location');
    const requiredDocumentsInput = screen.getByLabelText('Required Documents');
    const minimumAgeInput = screen.getByLabelText('Minimum Age');
    const maximumAgeInput = screen.getByLabelText('Maximum Age');

    expect(eventDetailsSection).not.toBeNull();
    expect(eventDetailsSection).toContainElement(locationMapColumn);
    expect(eventDetailsSection).toContainElement(mapSideControls);
    expect(locationMapColumn).toContainElement(locationInput);
    expect(mapSideControls).toContainElement(requiredDocumentsInput);
    expect(mapSideControls).toContainElement(minimumAgeInput);
    expect(mapSideControls).toContainElement(maximumAgeInput);
    expect(locationMapColumn.compareDocumentPosition(mapSideControls) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(locationMapColumn).queryByRole('button', { name: /show map|hide map/i })).not.toBeInTheDocument();
  });

  it('keeps affiliate capacity in Event Details while pricing affiliate divisions in the division editor', async () => {
    const onDirtyStateChange = jest.fn();
    const baseDivision = buildEvent().divisionDetails[0];

    renderForm(onDirtyStateChange, undefined, {
      eventType: 'LEAGUE',
      isAffiliateEvent: true,
      affiliateUrl: 'https://partner.example/events/open-play',
      teamSignup: false,
      singleDivision: true,
      allowPaymentPlans: false,
      price: 1500,
      maxParticipants: 40,
      divisions: ['division_open'],
      divisionDetails: [
        {
          ...baseDivision,
          id: 'division_open',
          key: 'division_open',
          name: 'Open Division',
          price: 9900,
          maxParticipants: 99,
          allowPaymentPlans: true,
          installmentCount: 1,
          installmentAmounts: [9900],
        },
      ],
    }, buildOrganization());

    await waitFor(() => {
      expect(onDirtyStateChange).toHaveBeenCalledWith(false);
    });

    const eventDetailsSection = document.getElementById('section-event-details');
    const divisionSettingsSection = document.getElementById('section-division-settings-content');
    const mapSideControls = screen.getByTestId('event-details-map-side-controls');
    const maxParticipantsInput = screen.getByLabelText('Max Participants');
    const divisionModeSwitches = screen.getByTestId('division-mode-switches');
    const divisionPriceInput = within(divisionSettingsSection as HTMLElement).getByLabelText('Division price');

    expect(eventDetailsSection).not.toBeNull();
    expect(divisionSettingsSection).not.toBeNull();
    expect(mapSideControls).toContainElement(maxParticipantsInput);
    expect(within(mapSideControls).queryByTestId('cents-input')).not.toBeInTheDocument();
    expect(divisionModeSwitches).toContainElement(screen.getByText('Single Division (all skill levels play together)'));
    expect(divisionModeSwitches).not.toContainElement(screen.queryByText('Register by Division Type'));
    expect(divisionSettingsSection).toContainElement(divisionPriceInput);
    expect(screen.getByText('New Division')).toBeInTheDocument();
    expect(screen.getByLabelText('Gender')).toBeInTheDocument();
    expect(screen.getByLabelText('Skill Division')).toBeInTheDocument();
    expect(screen.getByLabelText('Age Division')).toBeInTheDocument();
    expect(screen.getByLabelText('Division Max Participants')).toBeInTheDocument();
    expect(screen.getByText('Open Division')).toBeInTheDocument();
    expect(screen.queryByText('Capacity & Price')).not.toBeInTheDocument();
    expect(screen.queryByText('Listing Capacity')).not.toBeInTheDocument();
    expect(screen.queryByText('Payment Plans')).not.toBeInTheDocument();
    expect(screen.getByText('Price: $99.00 • Max participants: 99')).toBeInTheDocument();
    expect(screen.queryByText(/Payment plan:/)).not.toBeInTheDocument();
  });

  it('transitions division-specific controls when single division is toggled', async () => {
    const onDirtyStateChange = jest.fn();

    renderForm(onDirtyStateChange);

    await waitFor(() => {
      expect(onDirtyStateChange).toHaveBeenCalledWith(false);
    });

    const getSingleDivisionSwitch = () => screen.getByRole('switch', {
      name: 'Single Division (all skill levels play together)',
    });

    expect(screen.getByLabelText('Max Participants')).toBeInTheDocument();
    expect(screen.queryByLabelText('Division Max Participants')).not.toBeInTheDocument();
    expect(screen.queryByText('Division Payment Plan')).not.toBeInTheDocument();

    await userEvent.click(getSingleDivisionSwitch());

    await waitFor(() => {
      expect(getSingleDivisionSwitch()).not.toBeChecked();
      expect(screen.queryByLabelText('Max Participants')).not.toBeInTheDocument();
      expect(screen.getByLabelText('Division Max Participants')).toBeInTheDocument();
      expect(screen.getByText('Division Payment Plan')).toBeInTheDocument();
    });

    await userEvent.click(getSingleDivisionSwitch());

    await waitFor(() => {
      expect(getSingleDivisionSwitch()).toBeChecked();
      expect(screen.getByLabelText('Max Participants')).toBeInTheDocument();
      expect(screen.queryByLabelText('Division Max Participants')).not.toBeInTheDocument();
      expect(screen.queryByText('Division Payment Plan')).not.toBeInTheDocument();
    });
  });

  it('renders event-level capacity controls only for single division mode', async () => {
    const onDirtyStateChange = jest.fn();

    renderForm(onDirtyStateChange);

    await waitFor(() => {
      expect(onDirtyStateChange).toHaveBeenCalledWith(false);
    });

    const divisionSettingsSection = document.getElementById('section-division-settings-content');

    expect(divisionSettingsSection).not.toBeNull();
    expect(divisionSettingsSection).toContainElement(screen.getByLabelText('Max Participants'));
    expect(screen.queryByLabelText('Division Max Participants')).not.toBeInTheDocument();
    expect(screen.queryByText('Division Price')).not.toBeInTheDocument();
  });

  it('uses division-level capacity controls in multi-division mode', async () => {
    const onDirtyStateChange = jest.fn();

    renderForm(onDirtyStateChange, undefined, {
      singleDivision: false,
      maxParticipants: null,
    });

    await waitFor(() => {
      expect(onDirtyStateChange).toHaveBeenCalledWith(false);
    });

    const divisionSettingsSection = document.getElementById('section-division-settings-content');

    expect(divisionSettingsSection).not.toBeNull();
    expect(screen.queryByLabelText('Max Participants')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Division Max Participants')).toBeInTheDocument();
  });

  it('commits one normalized division patch to the form draft', async () => {
    const formRef = React.createRef<EventFormHandle>();

    renderForm(jest.fn(), formRef, {
      singleDivision: false,
      divisions: [],
      divisionDetails: [],
      maxParticipants: null,
    });

    const selectFirstAvailableOption = (label: string) => {
      const select = screen.getByLabelText(label) as HTMLSelectElement;
      const option = Array.from(select.options).find((candidate) => candidate.value.length > 0);
      expect(option).toBeDefined();
      fireEvent.change(select, { target: { value: option!.value } });
      return option!.value;
    };

    const selectedGender = selectFirstAvailableOption('Gender');
    const selectedSkill = selectFirstAvailableOption('Skill Division');
    const selectedAge = selectFirstAvailableOption('Age Division');
    fireEvent.change(screen.getByLabelText('Division Name'), { target: { value: 'River City Open' } });
    fireEvent.change(screen.getByLabelText('Division Max Participants'), { target: { value: '8' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Division' }));

    await waitFor(() => {
      const draft = formRef.current!.getDraft();
      expect(draft.divisionDetails).toHaveLength(1);
      expect(draft.divisions).toEqual([draft.divisionDetails?.[0]?.id]);
      expect(draft.divisionDetails?.[0]).toEqual(expect.objectContaining({
        name: 'River City Open',
        gender: selectedGender,
        skillDivisionTypeId: selectedSkill,
        ageDivisionTypeId: selectedAge,
        maxParticipants: 8,
        price: 0,
      }));
      expect(draft.maxParticipants).toBe(8);
    });
  });

  it('warns for division max teams below two without coercing the input to two', async () => {
    const onDirtyStateChange = jest.fn();

    renderForm(onDirtyStateChange, undefined, {
      teamSignup: true,
      singleDivision: false,
      maxParticipants: null,
    });

    await waitFor(() => {
      expect(onDirtyStateChange).toHaveBeenCalledWith(false);
    });

    const selectFirstAvailableOption = (label: string) => {
      const select = screen.getByLabelText(label) as HTMLSelectElement;
      const option = Array.from(select.options).find((candidate) => candidate.value.length > 0);
      expect(option).toBeDefined();
      fireEvent.change(select, {
        target: { value: option!.value },
      });
    };

    selectFirstAvailableOption('Gender');
    selectFirstAvailableOption('Skill Division');
    selectFirstAvailableOption('Age Division');

    const maxTeamsInput = screen.getByLabelText('Division Max Teams') as HTMLInputElement;

    await waitFor(() => {
      expect(maxTeamsInput).toBeEnabled();
    });

    fireEvent.change(maxTeamsInput, {
      target: { value: '1' },
    });
    fireEvent.blur(maxTeamsInput);

    await waitFor(() => {
      expect(maxTeamsInput.value).toBe('1');
      expect(screen.getByText('Warning: make division max teams at least 2.')).toBeInTheDocument();
    });

    fireEvent.change(maxTeamsInput, {
      target: { value: '0' },
    });
    fireEvent.blur(maxTeamsInput);

    await waitFor(() => {
      expect(maxTeamsInput.value).toBe('0');
      expect(screen.getByText('Warning: make division max teams at least 2.')).toBeInTheDocument();
    });
  });

  it('uses division playoff team count as the multi-division league default source', async () => {
    const onDirtyStateChange = jest.fn();

    renderForm(onDirtyStateChange, undefined, {
      eventType: 'LEAGUE',
      includePlayoffs: true,
      includePlayoffsOrPools: true,
      playoffTeamCount: 4,
      singleDivision: false,
      leagueData: {
        gamesPerOpponent: 1,
        includePlayoffs: true,
        playoffTeamCount: 4,
      },
    });

    await waitFor(() => {
      expect(onDirtyStateChange).toHaveBeenCalledWith(false);
    });

    const divisionSettingsSection = document.getElementById('section-division-settings-content');

    expect(divisionSettingsSection).not.toBeNull();
    expect(screen.queryByText('Event Pricing Defaults')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Default Playoff Team Count')).not.toBeInTheDocument();
    expect(screen.queryByText('Default Payment Plan')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Division Playoff Team Count')).toBeInTheDocument();
  });

  it('keeps non-split league division playoff settings on each division draft', async () => {
    const onDirtyStateChange = jest.fn();
    const formRef = React.createRef<EventFormHandle>();
    const leagueDivisionId = 'event_1__division__open';
    const baseDivision = buildEvent().divisionDetails[0];
    mockUseSportsState = buildMockUseSportsState({
      sports: [{ ...mockSport, usePointsPerSetWin: true }],
    });

    renderForm(onDirtyStateChange, formRef, {
      eventType: 'LEAGUE',
      sportConfig: { ...mockSport, usePointsPerSetWin: true },
      includePlayoffs: true,
      includePlayoffsOrPools: true,
      playoffTeamCount: 4,
      singleDivision: false,
      splitLeaguePlayoffDivisions: false,
      teamSignup: true,
      divisions: [leagueDivisionId],
      leagueData: {
        gamesPerOpponent: 1,
        includePlayoffs: true,
        playoffTeamCount: 4,
      },
      divisionDetails: [
        {
          ...baseDivision,
          id: leagueDivisionId,
          key: 'open',
          maxParticipants: 4,
          playoffTeamCount: 4,
          playoffConfig: {
            doubleElimination: false,
            winnerSetCount: 3,
            loserSetCount: 1,
            winnerBracketPointsToVictory: [25, 25, 15],
            loserBracketPointsToVictory: [25],
            prize: '',
            fieldCount: 1,
            restTimeMinutes: 18,
          },
        },
      ],
      playoffDivisionDetails: [],
    });

    await waitFor(() => {
      expect(formRef.current).not.toBeNull();
    });

    expect(screen.getByTestId('tournament-fields')).toBeInTheDocument();
    expect(formRef.current?.getDraft()).toEqual(
      expect.objectContaining({
        splitLeaguePlayoffDivisions: false,
        playoffDivisionDetails: [],
        divisionDetails: [
          expect.objectContaining({
            id: leagueDivisionId,
            playoffConfig: expect.objectContaining({
              winnerSetCount: 3,
              restTimeMinutes: 18,
            }),
          }),
        ],
      }),
    );
  });

  it('does not create a default playoff division when split playoff mode is enabled', async () => {
    const onDirtyStateChange = jest.fn();
    const formRef = React.createRef<EventFormHandle>();
    const leagueDivisionId = 'event_1__division__open';

    renderForm(onDirtyStateChange, formRef, {
      eventType: 'LEAGUE',
      includePlayoffs: true,
      includePlayoffsOrPools: true,
      playoffTeamCount: 4,
      singleDivision: false,
      splitLeaguePlayoffDivisions: true,
      teamSignup: true,
      divisions: [leagueDivisionId],
      leagueData: {
        gamesPerOpponent: 1,
        includePlayoffs: true,
        playoffTeamCount: 4,
      },
      divisionDetails: [
        {
          ...buildEvent().divisionDetails[0],
          id: leagueDivisionId,
          key: 'open',
          playoffTeamCount: 4,
        },
      ],
      playoffDivisionDetails: [],
    });

    await waitFor(() => {
      expect(onDirtyStateChange).toHaveBeenCalledWith(false);
    });

    expect(screen.getByText('Add at least one playoff division before saving split league/playoff divisions.')).toBeInTheDocument();
    expect(screen.queryByText('Playoff Division 1')).not.toBeInTheDocument();
    expect(screen.queryByText('Division Type: Playoff')).not.toBeInTheDocument();
    expect(formRef.current?.getDraft()?.playoffDivisionDetails).toEqual([]);

    let isValid: boolean | undefined;
    await act(async () => {
      isValid = await formRef.current?.validate();
    });

    expect(isValid).toBe(false);
  });

  it('uses one responsive division grid for league and playoff divisions in split playoff mode', async () => {
    const onDirtyStateChange = jest.fn();
    const upperDivisionId = 'event_1__division__playoff_1';
    const lowerDivisionId = 'event_1__division__playoff_2';
    const leagueDivisionId = 'event_1__division__m_skill_open_age_16u';

    renderForm(onDirtyStateChange, undefined, {
      eventType: 'LEAGUE',
      includePlayoffs: true,
      includePlayoffsOrPools: true,
      playoffTeamCount: 4,
      singleDivision: false,
      splitLeaguePlayoffDivisions: true,
      registrationByDivisionType: true,
      teamSignup: true,
      divisions: [leagueDivisionId],
      leagueData: {
        gamesPerOpponent: 1,
        includePlayoffs: true,
        playoffTeamCount: 4,
      },
      divisionDetails: [
        {
          ...buildEvent().divisionDetails[0],
          id: leagueDivisionId,
          key: 'm_skill_open_age_16u',
          name: 'Mens Open U16 - A',
          gender: 'M',
          playoffTeamCount: 4,
          playoffPlacementDivisionIds: [upperDivisionId, upperDivisionId, lowerDivisionId, lowerDivisionId],
        },
      ],
      playoffDivisionDetails: [
        {
          id: upperDivisionId,
          key: 'playoff_1',
          kind: 'PLAYOFF',
          name: 'Upper Division',
          maxParticipants: 8,
          playoffConfig: {},
        },
        {
          id: lowerDivisionId,
          key: 'playoff_2',
          kind: 'PLAYOFF',
          name: 'Lower Division',
          maxParticipants: 8,
          playoffConfig: {},
        },
      ],
    });

    await waitFor(() => {
      expect(onDirtyStateChange).toHaveBeenCalledWith(false);
    });

    expect(screen.getByText('New Division')).toBeInTheDocument();
    expect(screen.queryByText('League Divisions')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Division Type')).toHaveValue('LEAGUE');
    expect(screen.getByLabelText('Placement #1')).toBeInTheDocument();
    expect(document.querySelector('.responsive-card-grid')).not.toBeNull();
    expect(screen.getByText('Division Type: League')).toBeInTheDocument();
    expect(screen.getAllByText('Division Type: Playoff')).toHaveLength(2);
  });

  it('switches the split-division editor between league and playoff inputs', async () => {
    const onDirtyStateChange = jest.fn();

    renderForm(onDirtyStateChange, undefined, {
      eventType: 'LEAGUE',
      includePlayoffs: true,
      includePlayoffsOrPools: true,
      playoffTeamCount: 4,
      singleDivision: false,
      splitLeaguePlayoffDivisions: true,
      teamSignup: true,
      leagueData: {
        gamesPerOpponent: 1,
        includePlayoffs: true,
        playoffTeamCount: 4,
      },
      playoffDivisionDetails: [
        {
          id: 'event_1__division__playoff_1',
          key: 'playoff_1',
          kind: 'PLAYOFF',
          name: 'Upper Division',
          maxParticipants: 8,
          playoffConfig: {},
        },
      ],
    });

    await waitFor(() => {
      expect(onDirtyStateChange).toHaveBeenCalledWith(false);
    });

    await userEvent.selectOptions(screen.getByLabelText('Division Type'), 'PLAYOFF');

    await waitFor(() => {
      expect(screen.getByLabelText('Playoff Division Name')).toBeInTheDocument();
      expect(screen.getByLabelText('Teams Count')).toBeInTheDocument();
      expect(screen.getByTestId('tournament-fields')).toBeInTheDocument();
      expect(screen.queryByLabelText('Gender')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Skill Division')).not.toBeInTheDocument();
    });
  });

  it('warns for playoff division counts below two without coercing the input to two', async () => {
    const onDirtyStateChange = jest.fn();
    const formRef = React.createRef<EventFormHandle>();

    renderForm(onDirtyStateChange, formRef, {
      eventType: 'LEAGUE',
      includePlayoffs: true,
      includePlayoffsOrPools: true,
      playoffTeamCount: 4,
      singleDivision: false,
      splitLeaguePlayoffDivisions: true,
      teamSignup: true,
      leagueData: {
        gamesPerOpponent: 1,
        includePlayoffs: true,
        playoffTeamCount: 4,
      },
      playoffDivisionDetails: [],
    });

    await waitFor(() => {
      expect(onDirtyStateChange).toHaveBeenCalledWith(false);
    });

    await userEvent.selectOptions(screen.getByLabelText('Division Type'), 'PLAYOFF');

    const teamsCountInput = await screen.findByLabelText('Teams Count');
    fireEvent.change(teamsCountInput, {
      target: { value: '1' },
    });
    fireEvent.blur(teamsCountInput);

    await userEvent.click(screen.getByText('Add Division'));

    await waitFor(() => {
      expect(screen.getByText('Playoff division teams count must be at least 2.')).toBeInTheDocument();
      expect((teamsCountInput as HTMLInputElement).value).toBe('1');
      expect(formRef.current?.getDraft()?.playoffDivisionDetails).toEqual([]);
    });

    fireEvent.change(teamsCountInput, {
      target: { value: '' },
    });
    fireEvent.blur(teamsCountInput);

    await userEvent.click(screen.getByText('Add Division'));

    await waitFor(() => {
      expect(screen.getByText('Playoff division teams count must be at least 2.')).toBeInTheDocument();
      expect((teamsCountInput as HTMLInputElement).value).toBe('');
      expect(formRef.current?.getDraft()?.playoffDivisionDetails).toEqual([]);
    });
  });

  it('renames a playoff division without reading from a released change event', async () => {
    const onDirtyStateChange = jest.fn();
    const formRef = React.createRef<EventFormHandle>();
    const playoffDivisionId = 'event_1__division__playoff_1';

    renderForm(onDirtyStateChange, formRef, {
      eventType: 'LEAGUE',
      includePlayoffs: true,
      includePlayoffsOrPools: true,
      playoffTeamCount: 4,
      singleDivision: false,
      splitLeaguePlayoffDivisions: true,
      teamSignup: true,
      leagueData: {
        gamesPerOpponent: 1,
        includePlayoffs: true,
        playoffTeamCount: 4,
      },
      playoffDivisionDetails: [
        {
          id: playoffDivisionId,
          key: 'playoff_1',
          kind: 'PLAYOFF',
          name: 'Upper Division',
          maxParticipants: 8,
          playoffConfig: {},
        },
      ],
    });

    await waitFor(() => {
      expect(onDirtyStateChange).toHaveBeenCalledWith(false);
    });

    await userEvent.click(screen.getAllByText('Edit').at(-1) as HTMLElement);

    const nameInput = await screen.findByLabelText('Playoff Division Name');
    fireEvent.change(nameInput, {
      target: { value: 'Gold Division' },
    });

    await userEvent.click(screen.getByText('Update Division'));

    await waitFor(() => {
      expect(formRef.current?.getDraft()?.playoffDivisionDetails?.[0]).toMatchObject({
        id: playoffDivisionId,
        name: 'Gold Division',
      });
    });
  });

  it('keeps a blank persisted playoff division count blank instead of displaying two', async () => {
    const onDirtyStateChange = jest.fn();
    const upperDivisionId = 'event_1__division__playoff_1';
    const leagueDivisionId = 'event_1__division__m_skill_open_age_16u';

    renderForm(onDirtyStateChange, undefined, {
      eventType: 'LEAGUE',
      includePlayoffs: true,
      includePlayoffsOrPools: true,
      playoffTeamCount: 1,
      singleDivision: false,
      splitLeaguePlayoffDivisions: true,
      registrationByDivisionType: true,
      teamSignup: true,
      divisions: [leagueDivisionId],
      leagueData: {
        gamesPerOpponent: 1,
        includePlayoffs: true,
        playoffTeamCount: 1,
      },
      divisionDetails: [
        {
          ...buildEvent().divisionDetails[0],
          id: leagueDivisionId,
          key: 'm_skill_open_age_16u',
          name: 'Mens Open U16 - A',
          gender: 'M',
          playoffTeamCount: 1,
          playoffPlacementDivisionIds: [upperDivisionId],
        },
      ],
      playoffDivisionDetails: [
        {
          id: upperDivisionId,
          key: 'playoff_1',
          kind: 'PLAYOFF',
          name: 'Upper Division',
          maxParticipants: null,
          playoffConfig: {},
        },
      ],
    });

    await waitFor(() => {
      expect(onDirtyStateChange).toHaveBeenCalledWith(false);
    });

    expect(screen.getByText('Teams count: Not set')).toBeInTheDocument();
    await userEvent.click(screen.getAllByText('Edit').at(-1) as HTMLElement);

    await waitFor(() => {
      expect(screen.getByText('Edit Division')).toBeInTheDocument();
      expect((screen.getByLabelText('Teams Count') as HTMLInputElement).value).toBe('');
    });
  });

  it('saves split playoff placement mapping from the league division editor', async () => {
    const onDirtyStateChange = jest.fn();
    const formRef = React.createRef<EventFormHandle>();
    const upperDivisionId = 'event_1__division__playoff_1';
    const lowerDivisionId = 'event_1__division__playoff_2';
    const leagueDivisionId = 'event_1__division__m_skill_open_age_16u';

    renderForm(onDirtyStateChange, formRef, {
      eventType: 'LEAGUE',
      includePlayoffs: true,
      includePlayoffsOrPools: true,
      playoffTeamCount: 4,
      singleDivision: false,
      splitLeaguePlayoffDivisions: true,
      registrationByDivisionType: true,
      teamSignup: true,
      divisions: [leagueDivisionId],
      leagueData: {
        gamesPerOpponent: 1,
        includePlayoffs: true,
        playoffTeamCount: 4,
      },
      divisionDetails: [
        {
          ...buildEvent().divisionDetails[0],
          id: leagueDivisionId,
          key: 'm_skill_open_age_16u',
          name: 'Mens Open U16 - A',
          gender: 'M',
          playoffTeamCount: 4,
          playoffPlacementDivisionIds: [upperDivisionId, upperDivisionId, lowerDivisionId, lowerDivisionId],
        },
      ],
      playoffDivisionDetails: [
        {
          id: upperDivisionId,
          key: 'playoff_1',
          kind: 'PLAYOFF',
          name: 'Upper Division',
          maxParticipants: 8,
          playoffConfig: {},
        },
        {
          id: lowerDivisionId,
          key: 'playoff_2',
          kind: 'PLAYOFF',
          name: 'Lower Division',
          maxParticipants: 8,
          playoffConfig: {},
        },
      ],
    });

    await waitFor(() => {
      expect(onDirtyStateChange).toHaveBeenCalledWith(false);
    });

    expect(screen.getByText('Division Type: League')).toBeInTheDocument();
    await userEvent.click(screen.getAllByText('Edit')[0]);

    await waitFor(() => {
      expect(screen.getByText('Edit Division')).toBeInTheDocument();
      expect(screen.getByLabelText('Placement #1')).toHaveValue(upperDivisionId);
    });

    await userEvent.selectOptions(screen.getByLabelText('Placement #1'), lowerDivisionId);
    await userEvent.click(screen.getByText('Update Division'));

    await waitFor(() => {
      const draft = formRef.current?.getDraft();
      expect(draft?.divisionDetails?.[0]?.playoffPlacementDivisionIds).toEqual([
        lowerDivisionId,
        upperDivisionId,
        lowerDivisionId,
        lowerDivisionId,
      ]);
    });
  });

  it('normalizes split playoff data for save while preserving it until saved', async () => {
    const onDirtyStateChange = jest.fn();
    const formRef = React.createRef<EventFormHandle>();
    const upperDivisionId = 'event_1__division__playoff_1';
    const lowerDivisionId = 'event_1__division__playoff_2';
    const leagueDivisionId = 'event_1__division__m_skill_open_age_16u';

    renderForm(onDirtyStateChange, formRef, {
      eventType: 'LEAGUE',
      includePlayoffs: true,
      includePlayoffsOrPools: true,
      playoffTeamCount: 4,
      singleDivision: false,
      splitLeaguePlayoffDivisions: true,
      registrationByDivisionType: true,
      teamSignup: true,
      divisions: [leagueDivisionId],
      leagueData: {
        gamesPerOpponent: 1,
        includePlayoffs: true,
        playoffTeamCount: 4,
      },
      divisionDetails: [
        {
          ...buildEvent().divisionDetails[0],
          id: leagueDivisionId,
          key: 'm_skill_open_age_16u',
          name: 'Mens Open U16 - A',
          gender: 'M',
          playoffTeamCount: 4,
          playoffPlacementDivisionIds: [upperDivisionId, upperDivisionId, lowerDivisionId, lowerDivisionId],
        },
      ],
      playoffDivisionDetails: [
        {
          id: upperDivisionId,
          key: 'playoff_1',
          kind: 'PLAYOFF',
          name: 'Upper Division',
          maxParticipants: 8,
          playoffConfig: {},
        },
        {
          id: lowerDivisionId,
          key: 'playoff_2',
          kind: 'PLAYOFF',
          name: 'Lower Division',
          maxParticipants: 8,
          playoffConfig: {},
        },
      ],
    });

    await waitFor(() => {
      expect(onDirtyStateChange).toHaveBeenCalledWith(false);
    });

    const splitSwitch = screen.getByRole('switch', { name: /Split League & Playoff Divisions/ });
    await userEvent.click(splitSwitch);

    await waitFor(() => {
      expect(splitSwitch).not.toBeChecked();
      const draft = formRef.current?.getDraft();
      expect(draft?.splitLeaguePlayoffDivisions).toBe(false);
      expect(draft?.playoffDivisionDetails).toEqual([]);
      expect(draft?.divisionDetails?.[0]?.playoffPlacementDivisionIds).toEqual([]);
    });

    await userEvent.click(splitSwitch);

    await waitFor(() => {
      expect(splitSwitch).toBeChecked();
      expect(screen.getAllByText('Upper Division').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Lower Division').length).toBeGreaterThan(0);
      const draft = formRef.current?.getDraft();
      expect(draft?.playoffDivisionDetails).toHaveLength(2);
      expect(draft?.divisionDetails?.[0]?.playoffPlacementDivisionIds).toEqual([
        upperDivisionId,
        upperDivisionId,
        lowerDivisionId,
        lowerDivisionId,
      ]);
    });
  });

  it('does not require an event-level max participant value for multi-division events', async () => {
    const onDirtyStateChange = jest.fn();
    const formRef = React.createRef<EventFormHandle>();

    renderForm(onDirtyStateChange, formRef, {
      singleDivision: false,
      maxParticipants: null,
    });

    await waitFor(() => {
      expect(onDirtyStateChange).toHaveBeenCalledWith(false);
    });

    let isValid: boolean | undefined;
    await act(async () => {
      isValid = await formRef.current?.validate();
    });

    expect(isValid).toBe(true);
  });

  it('keeps weekly event team signup in Event Details and out of Divisions', async () => {
    const onDirtyStateChange = jest.fn();

    renderForm(onDirtyStateChange, undefined, {
      eventType: 'WEEKLY_EVENT',
      parentEvent: null,
      teamSignup: false,
    });

    await waitFor(() => {
      expect(onDirtyStateChange).toHaveBeenCalledWith(false);
    });

    const eventDetailsSection = document.getElementById('section-event-details-content');
    const divisionSettingsSection = document.getElementById('section-division-settings-content');
    const teamSignupSwitch = screen.getByTestId('team-signup-switch');

    expect(eventDetailsSection).not.toBeNull();
    expect(teamSignupSwitch).toBeInTheDocument();
    expect(divisionSettingsSection?.textContent).not.toContain('Team Event (teams compete rather than individuals)');
  });

  it('hides match rules for event and weekly event forms', async () => {
    const eventDirtyStateChange = jest.fn();
    const eventRender = renderForm(eventDirtyStateChange);

    await waitFor(() => {
      expect(eventDirtyStateChange).toHaveBeenCalledWith(false);
    });

    expect(document.getElementById('section-match-rules')).toBeNull();
    expect(screen.queryByText('Match Rules')).not.toBeInTheDocument();

    eventRender.unmount();

    const weeklyDirtyStateChange = jest.fn();
    renderForm(weeklyDirtyStateChange, undefined, {
      eventType: 'WEEKLY_EVENT',
      parentEvent: null,
    });

    await waitFor(() => {
      expect(weeklyDirtyStateChange).toHaveBeenCalledWith(false);
    });

    expect(document.getElementById('section-match-rules')).toBeNull();
    expect(screen.queryByText('Match Rules')).not.toBeInTheDocument();
  });

  it('shows match rules for league and tournament forms', async () => {
    const leagueDirtyStateChange = jest.fn();
    const leagueRender = renderForm(leagueDirtyStateChange, undefined, {
      eventType: 'LEAGUE',
      leagueData: {
        gamesPerOpponent: 1,
        includePlayoffs: false,
        usesSets: true,
        setsPerMatch: 3,
      },
    });

    await waitFor(() => {
      expect(leagueDirtyStateChange).toHaveBeenCalledWith(false);
    });

    expect(document.getElementById('section-match-rules')).not.toBeNull();
    expect(screen.getAllByText('Match Rules').length).toBeGreaterThan(0);

    leagueRender.unmount();

    const tournamentDirtyStateChange = jest.fn();
    renderForm(tournamentDirtyStateChange, undefined, {
      eventType: 'TOURNAMENT',
      tournamentData: {
        usesSets: true,
        winnerSetCount: 3,
      },
    });

    await waitFor(() => {
      expect(tournamentDirtyStateChange).toHaveBeenCalledWith(false);
    });

    expect(document.getElementById('section-match-rules')).not.toBeNull();
    expect(screen.getAllByText('Match Rules').length).toBeGreaterThan(0);
  });

  it('renders tournament pool settings and pool scoring config when pool play is enabled', async () => {
    const onDirtyStateChange = jest.fn();

    renderForm(onDirtyStateChange, undefined, {
      eventType: 'TOURNAMENT',
      includePlayoffs: true,
      includePlayoffsOrPools: true,
      teamSignup: true,
      singleDivision: true,
      noFixedEndDateTime: true,
      leagueData: {
        gamesPerOpponent: 1,
        includePlayoffs: true,
      },
      divisionDetails: [
        {
          ...buildEvent().divisionDetails[0],
          playoffTeamCount: 4,
          poolCount: 2,
          poolTeamCount: 5,
        },
      ],
      leagueScoringConfig: {
        pointsForWin: 3,
        pointsForDraw: 1,
        pointsForLoss: 0,
      },
    });

    expect(screen.queryByText('Pool Play Settings')).not.toBeInTheDocument();
    const defaultsContent = document.getElementById('division-defaults-content');
    expect(defaultsContent).not.toBeNull();
    expect(defaultsContent).toContainElement(screen.getByLabelText('Bracket Teams'));
    expect(defaultsContent).toContainElement(screen.getByLabelText('Pool Count'));
    expect(defaultsContent).toContainElement(screen.getByLabelText('Pool Team Count'));
    expect(screen.getByLabelText('Pool Team Count')).toBeDisabled();
    expect(document.querySelectorAll('[data-configuration-title="Pool Configuration"]')).toHaveLength(1);
    expect(screen.getAllByText('Pool Scoring Config').length).toBeGreaterThan(0);
  });

  it('carries single-division tournament pool settings into multi-division defaults', async () => {
    const onDirtyStateChange = jest.fn();
    const formRef = React.createRef<EventFormHandle>();

    renderForm(onDirtyStateChange, formRef, {
      eventType: 'TOURNAMENT',
      includePlayoffs: true,
      includePlayoffsOrPools: true,
      teamSignup: true,
      singleDivision: true,
      maxParticipants: 12,
      noFixedEndDateTime: true,
      leagueData: {
        gamesPerOpponent: 1,
        includePlayoffs: true,
      },
      divisionDetails: [
        {
          ...buildEvent().divisionDetails[0],
          maxParticipants: 10,
          playoffTeamCount: 6,
          poolCount: 3,
          poolTeamCount: 5,
        },
      ],
    });

    await waitFor(() => {
      expect(onDirtyStateChange).toHaveBeenCalledWith(false);
    });

    await userEvent.click(screen.getByRole('switch', {
      name: 'Single Division (all skill levels play together)',
    }));

    await waitFor(() => {
      expect(screen.getByRole('switch', {
        name: 'Single Division (all skill levels play together)',
      })).not.toBeChecked();
    });

    const draft = formRef.current?.getDraft();
    expect(draft?.playoffDivisionDetails?.[0]).toMatchObject({
      maxParticipants: 12,
      playoffTeamCount: 6,
      poolCount: 3,
      poolTeamCount: 4,
    });
  });

  it('hydrates tournament bracket pool counts from persisted pool divisions', async () => {
    const onDirtyStateChange = jest.fn();
    const formRef = React.createRef<EventFormHandle>();
    const baseDivision = buildEvent().divisionDetails[0];
    const bracketDivisionId = 'event_1__division__c_skill_open_age_18plus';
    const poolADivisionId = 'event_1__division__c_skill_open_age_18plus_pool_a';
    const poolBDivisionId = 'event_1__division__c_skill_open_age_18plus_pool_b';

    renderForm(onDirtyStateChange, formRef, {
      eventType: 'TOURNAMENT',
      includePlayoffs: true,
      includePlayoffsOrPools: true,
      teamSignup: true,
      singleDivision: false,
      maxParticipants: 8,
      noFixedEndDateTime: true,
      leagueData: {
        gamesPerOpponent: 1,
        includePlayoffs: true,
      },
      divisions: [poolADivisionId, poolBDivisionId],
      divisionDetails: [
        {
          ...baseDivision,
          id: poolADivisionId,
          key: 'c_skill_open_age_18plus_pool_a',
          name: 'CoEd Open 18+ Pool A',
          maxParticipants: 4,
          playoffPlacementDivisionIds: [bracketDivisionId, bracketDivisionId],
        },
        {
          ...baseDivision,
          id: poolBDivisionId,
          key: 'c_skill_open_age_18plus_pool_b',
          name: 'CoEd Open 18+ Pool B',
          maxParticipants: 4,
          playoffPlacementDivisionIds: [bracketDivisionId, bracketDivisionId],
        },
      ],
      playoffDivisionDetails: [
        {
          ...baseDivision,
          id: bracketDivisionId,
          key: 'c_skill_open_age_18plus',
          kind: 'PLAYOFF',
          name: 'CoEd Open 18+',
          maxParticipants: 8,
          playoffTeamCount: 4,
          playoffConfig: {},
        },
      ],
    });

    await waitFor(() => {
      expect(formRef.current).not.toBeNull();
    });

    expect(formRef.current?.getDraft()).toEqual(
      expect.objectContaining({
        divisions: [bracketDivisionId],
        divisionDetails: [],
        playoffDivisionDetails: [
          expect.objectContaining({
            id: bracketDivisionId,
            maxParticipants: 8,
            playoffTeamCount: 4,
            poolCount: 2,
            poolTeamCount: 4,
          }),
        ],
      }),
    );
  });

  it('keeps league scoring config in tournament pool-play draft payloads', async () => {
    const onDirtyStateChange = jest.fn();
    const formRef = React.createRef<EventFormHandle>();

    renderForm(onDirtyStateChange, formRef, {
      eventType: 'TOURNAMENT',
      includePlayoffs: true,
      includePlayoffsOrPools: true,
      teamSignup: true,
      singleDivision: true,
      noFixedEndDateTime: true,
      leagueData: {
        gamesPerOpponent: 1,
        includePlayoffs: true,
      },
      divisionDetails: [
        {
          ...buildEvent().divisionDetails[0],
          playoffTeamCount: 4,
          poolCount: 2,
          poolTeamCount: 5,
        },
      ],
      leagueScoringConfig: {
        pointsForWin: 5,
        pointsForDraw: 2,
        pointsForLoss: 0,
      },
    });

    await waitFor(() => {
      expect(formRef.current).not.toBeNull();
    });

    expect(formRef.current?.getDraft()).toEqual(
      expect.objectContaining({
        includePlayoffs: true,
        includePlayoffsOrPools: true,
        leagueScoringConfig: expect.objectContaining({
          pointsForWin: 5,
          pointsForDraw: 2,
          pointsForLoss: 0,
        }),
      }),
    );
  });

  it('renders organization resources next to required documents in Event Details for managed events', async () => {
    const onDirtyStateChange = jest.fn();

    renderForm(
      onDirtyStateChange,
      undefined,
      {
        eventType: 'EVENT',
        organizationId: 'org_1',
      },
      buildOrganization(),
    );

    await waitFor(() => {
      expect(onDirtyStateChange).toHaveBeenCalledWith(false);
    });

    const eventDetailsSection = document.getElementById('section-event-details');
    const divisionSettingsSection = document.getElementById('section-division-settings-content');

    expect(eventDetailsSection).not.toBeNull();
    expect(eventDetailsSection?.textContent).toContain('Required Documents');
    expect(eventDetailsSection?.textContent).toContain('Resources');
    expect(divisionSettingsSection?.textContent).not.toContain('Resources');
  });

  it('shows organization resource selection with zero default resource count for organization events with resources', async () => {
    const onDirtyStateChange = jest.fn();
    const organization = {
      ...buildOrganization(),
      fields: [
        {
          $id: 'org_field_1',
          name: 'Court 1',
          location: 'Main Gym',
          lat: 0,
          long: 0,
          organization: 'org_1',
        },
      ],
    };

    renderForm(
      onDirtyStateChange,
      undefined,
      {
        eventType: 'EVENT',
        organizationId: 'org_1',
        fieldCount: 0,
      },
      organization,
      { isCreateMode: true },
    );

    await waitFor(() => {
      expect(onDirtyStateChange).toHaveBeenCalledWith(false);
    });

    expect(screen.getByRole('group', { name: 'Resources' })).toBeInTheDocument();
    expect(screen.getByLabelText('Count')).toHaveValue('0');
    expect(screen.getByText('Custom Resources')).toBeInTheDocument();
  });

  it('defaults organization event creation to host only without assigning officials', async () => {
    const onDirtyStateChange = jest.fn();
    const formRef = React.createRef<EventFormHandle>();

    renderForm(
      onDirtyStateChange,
      formRef,
      {
        eventType: 'EVENT',
        organizationId: 'org_1',
      },
      buildOrganization(),
      { isCreateMode: true },
    );

    await waitFor(() => {
      const draft = formRef.current?.getDraft();
      expect(draft?.hostId).toBe('host_1');
      expect(draft?.officialIds).toEqual([]);
    });
  });

  it('builds organization event drafts with selected org fields and unassigned local resources', async () => {
    const onDirtyStateChange = jest.fn();
    const formRef = React.createRef<EventFormHandle>();
    const organization = {
      ...buildOrganization(),
      fields: [
        {
          $id: 'org_field_1',
          name: 'Court 1',
          location: 'Main Gym',
          lat: 0,
          long: 0,
          organization: 'org_1',
        },
      ],
    };

    renderForm(
      onDirtyStateChange,
      formRef,
      {
        eventType: 'EVENT',
        organizationId: 'org_1',
        fieldIds: ['org_field_1', 'local_field_1'],
        fields: [
          {
            $id: 'local_field_1',
            name: 'Pop-up Court',
            location: 'Park',
            lat: 0,
            long: 0,
          },
        ],
        fieldCount: 1,
      },
      organization,
      { isCreateMode: true },
    );

    await waitFor(() => {
      const draft = formRef.current?.getDraft();
      expect(draft?.fieldIds).toEqual(['org_field_1', 'local_field_1']);
      expect(draft?.fields).toEqual([
        expect.objectContaining({
          $id: 'local_field_1',
          name: 'Pop-up Court',
        }),
      ]);
    });
  });

  it('groups rented and organization resources by facility while preserving rented selections', async () => {
    const onDirtyStateChange = jest.fn();
    const formRef = React.createRef<EventFormHandle>();
    const organization = {
      ...buildOrganization(),
      fields: [
        {
          $id: 'org_field_1',
          name: 'Main Court',
          location: 'Home Gym',
          lat: 0,
          long: 0,
          organization: 'org_1',
          facilityId: 'facility_home',
          facility: {
            $id: 'facility_home',
            organizationId: 'org_1',
            name: 'Home Facility',
            location: 'Home Gym',
          },
        },
      ],
    };

    renderForm(
      onDirtyStateChange,
      formRef,
      {
        eventType: 'EVENT',
        organizationId: 'org_1',
        fieldIds: ['rental_field_1'],
        fields: [
          {
            $id: 'rental_field_1',
            name: 'Rental Court',
            location: 'Rented Gym',
            lat: 0,
            long: 0,
            organization: 'rental_org_1',
            facilityId: 'facility_rented',
            facility: {
              $id: 'facility_rented',
              organizationId: 'rental_org_1',
              name: 'Rented Facility',
              location: 'Rented Gym',
            },
          },
        ],
      },
      organization,
      { isCreateMode: true },
    );

    await waitFor(() => {
      expect(screen.getByText('Home Facility')).toBeInTheDocument();
      expect(screen.getByText('Rented Facility')).toBeInTheDocument();
    });

    expect(screen.getByText('Rented')).toBeInTheDocument();
    expect(screen.getByLabelText('Rental Court')).toBeChecked();
    expect(screen.getByRole('button', { name: 'Start Date & Time' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'End Date & Time' })).not.toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: /Home Facility/i }));
    await userEvent.click(screen.getByLabelText('Main Court'));

    await waitFor(() => {
      expect(new Set(formRef.current?.getDraft().fieldIds)).toEqual(new Set(['rental_field_1', 'org_field_1']));
    });
  });

  it('loads reserved rental resources and serializes selected rentals as locked booking slots', async () => {
    const onDirtyStateChange = jest.fn();
    const formRef = React.createRef<EventFormHandle>();
    const organization = {
      ...buildOrganization(),
      fields: [
        {
          $id: 'org_field_1',
          name: 'Main Court',
          location: 'Home Gym',
          lat: 0,
          long: 0,
          organization: 'org_1',
          facilityId: 'facility_home',
          facility: {
            $id: 'facility_home',
            organizationId: 'org_1',
            name: 'Home Facility',
            location: 'Home Gym',
          },
        },
      ],
    };

    (apiRequest as jest.Mock).mockImplementation((url: string) => {
      if (url.startsWith('/api/rentals/bookings')) {
        return Promise.resolve({
          bookings: [
            {
              $id: 'booking_1',
              items: [
                {
                  $id: 'booking_item_1',
                  fieldId: 'rental_field_1',
                  facilityId: 'facility_rented',
                  facility: {
                    $id: 'facility_rented',
                    organizationId: 'rental_org_1',
                    name: 'Rented Facility',
                    location: 'Rented Gym',
                  },
                  start: '2026-03-12T15:00:00.000Z',
                  end: '2026-03-12T16:00:00.000Z',
                  field: {
                    $id: 'rental_field_1',
                    name: 'Rental Court',
                    location: 'Rented Gym',
                    lat: 0,
                    long: 0,
                    organization: 'rental_org_1',
                  },
                },
                {
                  $id: 'booking_item_2',
                  fieldId: 'rental_field_1',
                  facilityId: 'facility_rented',
                  facility: {
                    $id: 'facility_rented',
                    organizationId: 'rental_org_1',
                    name: 'Rented Facility',
                    location: 'Rented Gym',
                  },
                  start: '2026-03-13T17:00:00.000Z',
                  end: '2026-03-13T18:00:00.000Z',
                  field: {
                    $id: 'rental_field_1',
                    name: 'Rental Court',
                    location: 'Rented Gym',
                    lat: 0,
                    long: 0,
                    organization: 'rental_org_1',
                  },
                },
              ],
            },
          ],
        });
      }
      return Promise.resolve({});
    });

    renderForm(
      onDirtyStateChange,
      formRef,
      {
        eventType: 'EVENT',
        organizationId: 'org_1',
      },
      organization,
      { isCreateMode: true },
    );

    await waitFor(() => {
      expect(screen.getByText('Rented Facility')).toBeInTheDocument();
    });

    expect(apiRequest).toHaveBeenCalledWith('/api/rentals/bookings?organizationId=org_1');
    expect(screen.getByLabelText('Count')).toHaveValue('0');
    const firstRentalResource = screen.getByLabelText(/Rental Court - Mar 12, 2026/i);
    const secondRentalResource = screen.getByLabelText(/Rental Court - Mar 13, 2026/i);
    expect(screen.queryByLabelText('Rental Court')).not.toBeInTheDocument();
    expect(firstRentalResource).not.toBeChecked();
    expect(secondRentalResource).not.toBeChecked();

    await userEvent.click(firstRentalResource);

    await waitFor(() => {
      const draft = formRef.current?.getDraft();
      expect(draft?.fieldIds).toEqual(['rental_field_1']);
      expect(draft?.timeSlots).toEqual([
        expect.objectContaining({
          sourceType: 'RENTAL_BOOKING',
          rentalBookingId: 'booking_1',
          rentalBookingItemId: 'booking_item_1',
          rentalLocked: true,
          scheduledFieldId: 'rental_field_1',
          scheduledFieldIds: ['rental_field_1'],
        }),
      ]);
      expect(secondRentalResource).not.toBeChecked();
    });
  });

  it('rehydrates selected rental bookings from a failed create draft', async () => {
    const onDirtyStateChange = jest.fn();
    const formRef = React.createRef<EventFormHandle>();
    const organization = {
      ...buildOrganization(),
      fields: [],
    };
    const rentalField = {
      $id: 'rental_field_1',
      name: 'Rental Court',
      location: 'Rented Gym',
      lat: 0,
      long: 0,
      organization: 'rental_org_1',
      facilityId: 'facility_rented',
      facility: {
        $id: 'facility_rented',
        organizationId: 'rental_org_1',
        name: 'Rented Facility',
        location: 'Rented Gym',
      },
    };

    (apiRequest as jest.Mock).mockImplementation((url: string) => {
      if (url.startsWith('/api/rentals/bookings')) {
        return Promise.resolve({
          bookings: [
            {
              $id: 'booking_1',
              items: [
                {
                  $id: 'booking_item_1',
                  fieldId: 'rental_field_1',
                  start: '2026-03-12T15:00:00.000Z',
                  end: '2026-03-12T16:00:00.000Z',
                  field: rentalField,
                },
              ],
            },
          ],
        });
      }
      return Promise.resolve({});
    });

    renderForm(
      onDirtyStateChange,
      formRef,
      {
        eventType: 'EVENT',
        organizationId: 'org_1',
        fieldIds: ['rental_field_1'],
        fields: [rentalField],
        timeSlots: [
          {
            $id: 'slot_rental_1',
            sourceType: 'RENTAL_BOOKING',
            rentalBookingId: 'booking_1',
            rentalBookingItemId: 'booking_item_1',
            rentalLocked: true,
            scheduledFieldId: 'rental_field_1',
            scheduledFieldIds: ['rental_field_1'],
            dayOfWeek: 3,
            daysOfWeek: [3],
            startTimeMinutes: 15 * 60,
            endTimeMinutes: 16 * 60,
            startDate: '2026-03-12T15:00:00.000Z',
            endDate: '2026-03-12T16:00:00.000Z',
            repeating: false,
          },
        ],
      },
      organization,
      { isCreateMode: true },
    );

    const selectedRentalResource = await screen.findByLabelText(/Rental Court - Mar 12, 2026/i);
    expect(selectedRentalResource).toBeChecked();
    expect(screen.getByRole('button', { name: 'Start Date & Time' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'End Date & Time' })).not.toBeDisabled();
  });

  it('allows selected rental resources to use no fixed end datetime scheduling for leagues', async () => {
    const onDirtyStateChange = jest.fn();
    const formRef = React.createRef<EventFormHandle>();
    const organization = {
      ...buildOrganization(),
      fields: [],
    };
    const rentalField = {
      $id: 'rental_field_1',
      name: 'Rental Court',
      location: 'Rented Gym',
      lat: 0,
      long: 0,
      organization: 'rental_org_1',
      facilityId: 'facility_rented',
      facility: {
        $id: 'facility_rented',
        organizationId: 'rental_org_1',
        name: 'Rented Facility',
        location: 'Rented Gym',
      },
    };

    renderForm(
      onDirtyStateChange,
      formRef,
      {
        eventType: 'LEAGUE',
        teamSignup: true,
        organizationId: 'org_1',
        start: '2026-04-20T09:00:00',
        end: '2026-05-03T17:00:00',
        noFixedEndDateTime: false,
        fieldIds: ['rental_field_1'],
        selectedFieldIds: ['rental_field_1'],
        fields: [rentalField],
        timeSlots: [
          {
            $id: 'slot_rental_1',
            sourceType: 'RENTAL_BOOKING',
            rentalBookingId: 'booking_1',
            rentalBookingItemId: 'booking_item_1',
            rentalLocked: true,
            scheduledFieldId: 'rental_field_1',
            scheduledFieldIds: ['rental_field_1'],
            dayOfWeek: 3,
            daysOfWeek: [3],
            divisions: ['open'],
            startTimeMinutes: 15 * 60,
            endTimeMinutes: 16 * 60,
            startDate: '2026-03-12T15:00:00.000Z',
            endDate: '2026-03-12T16:00:00.000Z',
            repeating: false,
          },
        ],
      },
      organization,
      { isCreateMode: true },
    );

    const noFixedEndDateTimeCheckbox = await screen.findByRole('checkbox', { name: 'No fixed end datetime scheduling' });
    expect(noFixedEndDateTimeCheckbox).not.toBeDisabled();
    expect(noFixedEndDateTimeCheckbox).not.toBeChecked();

    await userEvent.click(noFixedEndDateTimeCheckbox);

    expect(noFixedEndDateTimeCheckbox).toBeChecked();
    await waitFor(() => {
      const draft = formRef.current?.getDraft();
      expect(draft?.noFixedEndDateTime).toBe(true);
      expect(draft?.fieldIds).toEqual(['rental_field_1']);
      expect(draft?.timeSlots?.[0]).toEqual(expect.objectContaining({
        sourceType: 'RENTAL_BOOKING',
        rentalBookingItemId: 'booking_item_1',
        rentalLocked: true,
      }));
    });
  });

  it('replaces a preserved rental timeslot when the same slot is edited to an organization resource', async () => {
    const onDirtyStateChange = jest.fn();
    const formRef = React.createRef<EventFormHandle>();
    const organization = {
      ...buildOrganization(),
      fields: [
        {
          $id: 'org_field_1',
          name: 'Main Court',
          location: 'Home Gym',
          lat: 0,
          long: 0,
          organization: 'org_1',
        },
      ],
    };
    const rentalField = {
      $id: 'rental_field_1',
      name: 'Rental Court',
      location: 'Rented Gym',
      lat: 0,
      long: 0,
      organization: 'rental_org_1',
    };

    renderForm(
      onDirtyStateChange,
      formRef,
      {
        eventType: 'LEAGUE',
        teamSignup: true,
        organizationId: 'org_1',
        fields: [rentalField],
        fieldIds: ['rental_field_1'],
        selectedFieldIds: ['rental_field_1'],
        timeSlots: [
          {
            $id: 'slot_rental_1',
            sourceType: 'RENTAL_BOOKING',
            rentalBookingId: 'booking_1',
            rentalBookingItemId: 'booking_item_1',
            rentalLocked: true,
            scheduledFieldId: 'rental_field_1',
            scheduledFieldIds: ['rental_field_1'],
            dayOfWeek: 3,
            daysOfWeek: [3],
            divisions: ['open'],
            startTimeMinutes: 15 * 60,
            endTimeMinutes: 16 * 60,
            startDate: '2026-03-12T15:00:00.000Z',
            endDate: '2026-03-12T16:00:00.000Z',
            repeating: false,
          },
        ],
      },
      organization,
      { isCreateMode: true },
    );

    await waitFor(() => {
      expect(mockLeagueFieldsProps.some((props) => typeof props?.onUpdateSlot === 'function')).toBe(true);
    });

    const scheduleProps = [...mockLeagueFieldsProps].reverse().find((props) => (
      typeof props?.onUpdateSlot === 'function' && Array.isArray(props?.slots) && props.slots.length > 0
    ));

    await act(async () => {
      scheduleProps?.onUpdateSlot(0, {
        $id: 'slot_rental_1',
        scheduledFieldId: 'org_field_1',
        scheduledFieldIds: ['org_field_1'],
        sourceType: undefined,
        rentalBookingId: undefined,
        rentalBookingItemId: undefined,
        rentalLocked: false,
        repeating: true,
        dayOfWeek: 3,
        daysOfWeek: [3],
        startTimeMinutes: 15 * 60,
        endTimeMinutes: 16 * 60,
        startDate: '2026-03-12T10:00:00',
        endDate: '2026-03-19T10:00:00',
      });
    });

    await waitFor(() => {
      const draftSlots = formRef.current?.getDraft().timeSlots ?? [];
      expect(draftSlots).toHaveLength(1);
      expect(draftSlots[0]).toEqual(expect.objectContaining({
        $id: 'slot_rental_1',
        scheduledFieldId: 'org_field_1',
        scheduledFieldIds: ['org_field_1'],
        rentalLocked: false,
      }));
      expect(draftSlots[0]?.sourceType).toBeUndefined();
      expect(draftSlots[0]?.rentalBookingId).toBeUndefined();
      expect(draftSlots[0]?.rentalBookingItemId).toBeUndefined();
    });
  });

  it('does not auto-select rental booking defaults in editable league weekly resource selection', async () => {
    const onDirtyStateChange = jest.fn();
    const formRef = React.createRef<EventFormHandle>();
    const organization = {
      ...buildOrganization(),
      fields: [
        {
          $id: 'org_field_1',
          name: 'Main Court',
          location: 'Home Gym',
          lat: 0,
          long: 0,
          organization: 'org_1',
          facilityId: 'facility_home',
          facility: {
            $id: 'facility_home',
            organizationId: 'org_1',
            name: 'Home Facility',
            location: 'Home Gym',
          },
        },
      ],
    };
    const rentalField = {
      $id: 'rental_field_1',
      name: 'Rental Court',
      location: 'Rented Gym',
      lat: 0,
      long: 0,
      organization: 'rental_org_1',
      facilityId: 'facility_rented',
      facility: {
        $id: 'facility_rented',
        organizationId: 'rental_org_1',
        name: 'Rented Facility',
        location: 'Rented Gym',
      },
    };
    const rentalSlot = {
      $id: 'rental_slot_1',
      sourceType: 'RENTAL_BOOKING',
      rentalBookingId: 'booking_1',
      rentalBookingItemId: 'booking_item_1',
      rentalLocked: true,
      scheduledFieldId: 'rental_field_1',
      scheduledFieldIds: ['rental_field_1'],
      dayOfWeek: 3,
      daysOfWeek: [3],
      startTimeMinutes: 15 * 60,
      endTimeMinutes: 16 * 60,
      startDate: '2026-03-12T15:00:00.000Z',
      endDate: '2026-03-12T16:00:00.000Z',
      repeating: false,
    };

    (apiRequest as jest.Mock).mockImplementation((url: string) => {
      if (url.startsWith('/api/rentals/bookings')) {
        return Promise.resolve({
          bookings: [
            {
              $id: 'booking_1',
              items: [
                {
                  $id: 'booking_item_1',
                  fieldId: 'rental_field_1',
                  start: '2026-03-12T15:00:00.000Z',
                  end: '2026-03-12T16:00:00.000Z',
                  field: rentalField,
                },
              ],
            },
          ],
        });
      }
      return Promise.resolve({});
    });

    renderForm(
      onDirtyStateChange,
      formRef,
      {
        eventType: 'LEAGUE',
        organizationId: 'org_1',
      },
      organization,
      {
        isCreateMode: true,
        immutableDefaults: {
          fields: [rentalField],
          fieldIds: ['rental_field_1'],
          timeSlots: [rentalSlot],
        },
      },
    );

    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalledWith('/api/rentals/bookings?organizationId=org_1');
    });

    expect(screen.getByLabelText('Count')).toBeInTheDocument();

    await waitFor(() => {
      const scheduleProps = [...mockLeagueFieldsProps].reverse().find((props) => (
        props?.showTimeslots !== false && Array.isArray(props?.slots) && props.slots.length > 0
      ));
      expect(scheduleProps?.readOnly).toBe(false);
      expect(scheduleProps?.fields.map((field: any) => field.$id)).toEqual(
        expect.arrayContaining(['org_field_1', 'rental_field_1']),
      );
      expect(
        scheduleProps?.fieldOptions
          ?.filter((option: any) => option.fieldId === 'rental_field_1')
          .map((option: any) => option.value),
      ).toEqual(['rental:booking_item_1']);
      expect(scheduleProps?.slots[0].scheduledFieldIds ?? []).toEqual([]);
    });

    await waitFor(() => {
      const draft = formRef.current?.getDraft();
      expect(draft?.timeSlots).toEqual([
        expect.objectContaining({
          sourceType: 'RENTAL_BOOKING',
          rentalBookingId: 'booking_1',
          rentalBookingItemId: 'booking_item_1',
          rentalLocked: true,
          scheduledFieldId: 'rental_field_1',
          scheduledFieldIds: ['rental_field_1'],
        }),
      ]);
    });
  });

  it('shows organization resources without resource-count controls for weekly events', async () => {
    const onDirtyStateChange = jest.fn();

    renderForm(
      onDirtyStateChange,
      undefined,
      {
        eventType: 'WEEKLY_EVENT',
        organizationId: 'org_1',
        parentEvent: null,
      },
      buildOrganization(),
    );

    await waitFor(() => {
      expect(onDirtyStateChange).toHaveBeenCalledWith(false);
    });

    expect(screen.getByRole('group', { name: 'Resources' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Count')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Required Documents')).toBeInTheDocument();
  });

  it('defaults organization event creation to one local resource when the org has no resources or rentals', async () => {
    const onDirtyStateChange = jest.fn();
    const organization = {
      ...buildOrganization(),
      fields: [],
    };

    renderForm(
      onDirtyStateChange,
      undefined,
      {
        eventType: 'EVENT',
        organizationId: 'org_1',
      },
      organization,
      { isCreateMode: true },
    );

    await waitFor(() => {
      expect(onDirtyStateChange).toHaveBeenCalledWith(false);
    });

    expect(screen.getByLabelText('Count')).toHaveValue('1');
  });

  it.each(['EVENT', 'LEAGUE', 'TOURNAMENT'] as const)(
    'shows field-count controls for non-organization %s creation',
    async (eventType) => {
      const onDirtyStateChange = jest.fn();

      renderForm(
        onDirtyStateChange,
        undefined,
        { eventType },
        null,
        { isCreateMode: true },
      );

      await waitFor(() => {
        expect(onDirtyStateChange).toHaveBeenCalledWith(false);
      });

      expect(screen.getByLabelText('Count')).toHaveValue('1');
    },
  );

  it('places custom resource controls below registration questions', async () => {
    const onDirtyStateChange = jest.fn();

    renderForm(
      onDirtyStateChange,
      undefined,
      { eventType: 'EVENT' },
      null,
      { isCreateMode: true },
    );

    await waitFor(() => {
      expect(onDirtyStateChange).toHaveBeenCalledWith(false);
    });

    const registrationQuestionsHeading = screen.getByText('Registration questions');
    const customResourcesHeading = screen.getByText('Custom Resources');
    const resourceCountInput = screen.getByLabelText('Count');

    expect(
      Boolean(registrationQuestionsHeading.compareDocumentPosition(customResourcesHeading) & Node.DOCUMENT_POSITION_FOLLOWING),
    ).toBe(true);
    expect(
      Boolean(customResourcesHeading.compareDocumentPosition(resourceCountInput) & Node.DOCUMENT_POSITION_FOLLOWING),
    ).toBe(true);
  });

  it.each(['LEAGUE', 'TOURNAMENT'] as const)(
    'defaults organization %s creation to zero local resources when the org has resources',
    async (eventType) => {
      const onDirtyStateChange = jest.fn();
      const organization = {
        ...buildOrganization(),
        fields: [
          {
            $id: 'org_field_1',
            name: 'Main Court',
            location: 'Main Gym',
            lat: 0,
            long: 0,
            organization: 'org_1',
          },
        ],
      };

      renderForm(
        onDirtyStateChange,
        undefined,
        {
          eventType,
          organizationId: 'org_1',
        },
        organization,
        { isCreateMode: true },
      );

      await waitFor(() => {
        expect(onDirtyStateChange).toHaveBeenCalledWith(false);
      });

      expect(screen.getByLabelText('Count')).toHaveValue('0');
    },
  );

  it.each(['LEAGUE', 'TOURNAMENT'] as const)(
    'defaults organization %s creation to one local resource when the org has no resources or rentals',
    async (eventType) => {
      const onDirtyStateChange = jest.fn();

      renderForm(
        onDirtyStateChange,
        undefined,
        {
          eventType,
          organizationId: 'org_1',
        },
        buildOrganization(),
        { isCreateMode: true },
      );

      await waitFor(() => {
        expect(onDirtyStateChange).toHaveBeenCalledWith(false);
      });

      expect(screen.getByLabelText('Count')).toHaveValue('1');
    },
  );

  it.each(['LEAGUE', 'TOURNAMENT'] as const)(
    'preserves organization local resource count when switching from event to %s',
    async (eventType) => {
      const onDirtyStateChange = jest.fn();
      const formRef = React.createRef<EventFormHandle>();

      renderForm(
        onDirtyStateChange,
        formRef,
        {
          eventType: 'EVENT',
          organizationId: 'org_1',
          fieldCount: 1,
          fields: [
            {
              $id: 'local_field_1',
              name: 'Field 1',
              location: 'Test Gym',
              lat: 0,
              long: 0,
            },
          ],
        },
        buildOrganization(),
        { isCreateMode: true },
      );

      await waitFor(() => {
        expect(onDirtyStateChange).toHaveBeenCalledWith(false);
      });

      expect(screen.getByLabelText('Count')).toHaveValue('1');

      fireEvent.change(screen.getByLabelText('Event Type'), {
        target: { value: eventType },
      });

      await waitFor(() => {
        expect(screen.getByLabelText('Event Type')).toHaveValue(eventType);
        expect(screen.getByLabelText('Count')).toHaveValue('1');
        expect(formRef.current?.getDraft().fields).toEqual([
          expect.objectContaining({
            $id: 'local_field_1',
            name: 'Field 1',
          }),
        ]);
      });
      expect(formRef.current?.getDraft().fieldCount).toBe(1);
    },
  );

  it('syncs league and tournament tags to the selected event type and keeps them locked', async () => {
    const onDirtyStateChange = jest.fn();
    const formRef = React.createRef<EventFormHandle>();
    const user = userEvent.setup();

    renderForm(
      onDirtyStateChange,
      formRef,
      {
        eventType: 'EVENT',
        tags: [],
      },
      null,
      { isCreateMode: true },
    );

    await waitFor(() => {
      expect(onDirtyStateChange).toHaveBeenCalledWith(false);
    });

    await user.selectOptions(screen.getByLabelText('Event Type'), 'LEAGUE');

    await waitFor(() => {
      expect(screen.getByLabelText('Event Type')).toHaveValue('LEAGUE');
      expect(formRef.current?.getDraft().tags).toEqual([
        { name: 'League', slug: 'league' },
      ]);
    });

    fireEvent.keyDown(screen.getByPlaceholderText('Add tag'), {
      key: 'Backspace',
      code: 'Backspace',
    });

    await waitFor(() => {
      expect(formRef.current?.getDraft().tags).toEqual([
        { name: 'League', slug: 'league' },
      ]);
    });

    await user.selectOptions(screen.getByLabelText('Event Type'), 'TOURNAMENT');

    await waitFor(() => {
      expect(formRef.current?.getDraft().tags).toEqual([
        { name: 'Tournament', slug: 'tournament' },
      ]);
    });

    await user.selectOptions(screen.getByLabelText('Event Type'), 'EVENT');

    await waitFor(() => {
      expect(formRef.current?.getDraft().tags).toEqual([]);
    });
  });

  it('hydrates organization fields once during create mode without refetch looping', async () => {
    const onDirtyStateChange = jest.fn();
    const organization = {
      ...buildOrganization(),
      fields: [],
    };
    let fieldFetchCount = 0;

    (organizationService.getOrganizationByIdForEventForm as jest.Mock).mockResolvedValue(organization);
    (organizationService.getOrganizationById as jest.Mock).mockResolvedValue(organization);
    (fieldService.listFields as jest.Mock).mockImplementation(async () => {
      fieldFetchCount += 1;
      if (fieldFetchCount > 1) {
        throw new Error('Organization fields refetched more than once');
      }
      return [
        {
          $id: 'field_1',
          name: 'Field 1',
          location: 'Main Gym',
        },
      ];
    });

    renderForm(
      onDirtyStateChange,
      undefined,
      {
        organizationId: organization.$id,
      },
      organization,
      { isCreateMode: true },
    );

    await waitFor(() => {
      expect(fieldService.listFields).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(fieldService.listFields).toHaveBeenCalledTimes(1);
  });

});
