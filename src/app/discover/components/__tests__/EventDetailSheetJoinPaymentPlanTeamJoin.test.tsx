import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';

import { renderWithMantine } from '../../../../../test/utils/renderWithMantine';
import { buildEvent, buildTeam, buildUser } from '../../../../../test/factories';

jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: any) => {
    const { src, alt, fill, unoptimized, ...rest } = props;
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={typeof src === 'string' ? src : ''} alt={alt ?? ''} {...rest} />;
  },
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@/app/providers', () => ({
  useApp: jest.fn(),
}));

jest.mock('@/lib/eventService', () => ({
  eventService: {
    getEventWithRelations: jest.fn(),
    getEvent: jest.fn(),
    getEventParticipants: jest.fn(),
    addToWaitlist: jest.fn(),
    removeFromWaitlist: jest.fn(),
    addFreeAgent: jest.fn(),
    removeFreeAgent: jest.fn(),
  },
}));

jest.mock('@/lib/userService', () => ({
  userService: {
    getUserById: jest.fn(),
    getUsersByIds: jest.fn(),
  },
}));

jest.mock('@/lib/teamService', () => ({
  teamService: {
    getTeamsByIds: jest.fn(),
  },
}));

jest.mock('@/lib/paymentService', () => ({
  paymentService: {
    createPaymentIntent: jest.fn(),
    joinEvent: jest.fn(),
    leaveEvent: jest.fn(),
    requestTeamRefund: jest.fn(),
  },
}));

jest.mock('@/lib/billService', () => ({
  billService: {
    createBill: jest.fn(),
  },
}));

jest.mock('@/lib/billingAddressService', () => ({
  billingAddressService: {
    getBillingAddressProfile: jest.fn(),
  },
}));

jest.mock('@/lib/boldsignService', () => ({
  boldsignService: {
    createSignLinks: jest.fn(),
  },
}));

jest.mock('@/lib/signedDocumentService', () => ({
  signedDocumentService: {
    isDocumentSigned: jest.fn(),
  },
}));

jest.mock('@/lib/familyService', () => ({
  familyService: {
    listChildren: jest.fn(),
  },
}));

jest.mock('@/lib/registrationService', () => ({
  registrationService: {
    registerSelfForEvent: jest.fn(),
    registerChildForEvent: jest.fn(),
  },
}));

jest.mock('@/components/ui/ParticipantsPreview', () => () => null);
jest.mock('@/components/ui/ParticipantsDropdown', () => () => null);
jest.mock('@/components/ui/PaymentModal', () => {
  function MockPaymentModal(props: any) {
    if (!props.isOpen) {
      return null;
    }
    return (
      <button type="button" onClick={() => void props.onPaymentSuccess()}>
        Complete Mock Payment
      </button>
    );
  }
  MockPaymentModal.displayName = 'MockPaymentModal';
  return MockPaymentModal;
});
jest.mock('@/components/ui/RefundSection', () => () => null);
jest.mock('@/components/ui/UserCard', () => () => null);

import EventDetailSheet from '../EventDetailSheet';
import { useApp } from '@/app/providers';
import { billingAddressService } from '@/lib/billingAddressService';
import { billService } from '@/lib/billService';
import { eventService } from '@/lib/eventService';
import { familyService } from '@/lib/familyService';
import { paymentService } from '@/lib/paymentService';
import { teamService } from '@/lib/teamService';
import { userService } from '@/lib/userService';

const completeBillingAddressProfile = {
  email: 'user@example.com',
  billingAddress: {
    name: 'Test User',
    line1: '123 Court St',
    line2: '',
    city: 'Portland',
    state: 'OR',
    postalCode: '97201',
    countryCode: 'US',
  },
};

async function findDivisionButton(name: RegExp) {
  try {
    const buttons = await screen.findAllByRole('button', { name });
    expect(buttons.length).toBeGreaterThan(0);
    return buttons[0];
  } catch (error) {
    const buttonLabels = screen
      .queryAllByRole('button', { hidden: true })
      .map((button) => button.textContent?.replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    throw new Error(`Unable to find division button ${name}. Available buttons: ${buttonLabels.join(' | ')}`);
  }
}

describe('EventDetailSheet payment-plan team join', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (userService.getUserById as jest.Mock).mockResolvedValue(undefined);
    (billingAddressService.getBillingAddressProfile as jest.Mock).mockResolvedValue(completeBillingAddressProfile);
    (eventService.getEventParticipants as jest.Mock).mockResolvedValue({
      participants: {
        teamIds: [],
        userIds: [],
        waitListIds: [],
        freeAgentIds: [],
        divisions: [],
      },
      registrations: {
        teams: [],
        users: [],
        children: [],
        waitlist: [],
        freeAgents: [],
      },
      teams: [],
      users: [],
      participantCount: 0,
      participantCapacity: null,
      divisionWarnings: [],
    });
  });

  it('lists tournament bracket divisions, not generated pools, for tournament pool registration', async () => {
    const futureStart = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const futureEnd = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString();
    const bracketId = 'event_pool__division__c_skill_open_age_18plus';
    const poolA = `${bracketId}_pool_a`;
    const poolB = `${bracketId}_pool_b`;

    const event = buildEvent({
      $id: 'event_pool',
      eventType: 'TOURNAMENT',
      includePlayoffs: true,
      includePlayoffsOrPools: true,
      teamSignup: true,
      singleDivision: false,
      start: futureStart,
      end: futureEnd,
      price: 0,
      requiredTemplateIds: [],
      divisions: [poolA, poolB],
      divisionDetails: [
        {
          id: poolA,
          key: 'c_skill_open_age_18plus_pool_a',
          name: 'CoEd Open 18+ Pool A',
          playoffPlacementDivisionIds: [bracketId],
          maxParticipants: 4,
        },
        {
          id: poolB,
          key: 'c_skill_open_age_18plus_pool_b',
          name: 'CoEd Open 18+ Pool B',
          playoffPlacementDivisionIds: [bracketId],
          maxParticipants: 4,
        },
      ] as any,
      playoffDivisionDetails: [
        {
          id: bracketId,
          key: 'c_skill_open_age_18plus',
          kind: 'PLAYOFF',
          name: 'CoEd Open 18+',
          price: 2500,
          maxParticipants: 8,
        },
      ] as any,
    });

    const user = buildUser({ $id: 'user_pool', dateOfBirth: '1990-01-01', teamIds: [] });
    const authUser = { $id: user.$id, email: 'user@example.com', name: user.fullName };

    (useApp as jest.Mock).mockReturnValue({ user, authUser, isAuthenticated: true, isGuest: false, loading: false });
    (familyService.listChildren as jest.Mock).mockResolvedValue([]);
    (eventService.getEventWithRelations as jest.Mock).mockResolvedValue(event);
    (eventService.getEvent as jest.Mock).mockResolvedValue(event);
    (teamService.getTeamsByIds as jest.Mock).mockResolvedValue([]);

    renderWithMantine(
      <EventDetailSheet event={event} isOpen={true} onClose={jest.fn()} renderInline={true} />,
    );

    expect(await screen.findAllByRole('button', { name: /CoEd Open 18\+/i })).not.toHaveLength(0);
    expect(screen.queryByRole('button', { name: /Pool A/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Pool B/i })).not.toBeInTheDocument();
  });

  it('lists league divisions, not playoff divisions, for league playoff registration', async () => {
    const futureStart = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const futureEnd = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString();

    const event = buildEvent({
      $id: 'event_league_playoff',
      eventType: 'LEAGUE',
      includePlayoffs: true,
      teamSignup: true,
      singleDivision: false,
      start: futureStart,
      end: futureEnd,
      price: 0,
      requiredTemplateIds: [],
      divisions: ['league_open', 'playoff_gold'],
      divisionDetails: [
        {
          id: 'league_open',
          key: 'league_open',
          name: 'Open League',
          playoffPlacementDivisionIds: ['playoff_gold'],
        },
        {
          id: 'playoff_gold',
          key: 'playoff_gold',
          kind: 'PLAYOFF',
          name: 'Gold Playoff',
        },
      ] as any,
    });

    const user = buildUser({ $id: 'user_league', dateOfBirth: '1990-01-01', teamIds: [] });
    const authUser = { $id: user.$id, email: 'user@example.com', name: user.fullName };

    (useApp as jest.Mock).mockReturnValue({ user, authUser, isAuthenticated: true, isGuest: false, loading: false });
    (familyService.listChildren as jest.Mock).mockResolvedValue([]);
    (eventService.getEventWithRelations as jest.Mock).mockResolvedValue(event);
    (eventService.getEvent as jest.Mock).mockResolvedValue(event);
    (teamService.getTeamsByIds as jest.Mock).mockResolvedValue([]);

    renderWithMantine(
      <EventDetailSheet event={event} isOpen={true} onClose={jest.fn()} renderInline={true} />,
    );

    expect(await screen.findAllByRole('button', { name: /Open League/i })).not.toHaveLength(0);
    expect(screen.queryByRole('button', { name: /Gold Playoff/i })).not.toBeInTheDocument();
  });

  it('registers the team immediately, then creates the payment-plan bill', async () => {
    const futureStart = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const futureEnd = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString();
    const openDivisionId = 'event_1__division__c_skill_open_age_18plus';
    const premierDivisionId = 'event_1__division__c_skill_premier_age_18plus';

    const event = buildEvent({
      $id: 'event_1',
      teamSignup: true,
      start: futureStart,
      end: futureEnd,
      price: 2500,
      allowPaymentPlans: true,
      requiredTemplateIds: [],
      divisions: [openDivisionId, premierDivisionId],
      divisionDetails: [
        { id: openDivisionId, key: 'c_skill_open_age_18plus', name: 'Open 18+' },
        { id: premierDivisionId, key: 'c_skill_premier_age_18plus', name: 'Premier 18+' },
      ] as any,
    });

    const team = buildTeam({
      $id: 'team_1',
      name: 'Camka Team',
      division: 'Premier 18+',
      sport: 'Volleyball',
      managerId: 'user_1',
    });

    const user = buildUser({
      $id: 'user_1',
      dateOfBirth: '1990-01-01',
      teamIds: [team.$id],
    });
    const authUser = { $id: user.$id, email: 'user@example.com', name: user.fullName };

    (useApp as jest.Mock).mockReturnValue({
      user,
      authUser,
      isAuthenticated: true,
      isGuest: false,
      loading: false,
      userTeams: [team],
      userTeamsLoading: false,
    });
    (familyService.listChildren as jest.Mock).mockResolvedValue([]);
    (eventService.getEventWithRelations as jest.Mock).mockResolvedValue(event);
    (eventService.getEvent as jest.Mock).mockResolvedValue(event);
    (teamService.getTeamsByIds as jest.Mock).mockResolvedValue([team]);
    (paymentService.joinEvent as jest.Mock).mockResolvedValue(undefined);
    (billService.createBill as jest.Mock).mockResolvedValue({ bill: { id: 'bill_1' } });

    renderWithMantine(
      <EventDetailSheet event={event} isOpen={true} onClose={jest.fn()} renderInline={true} />,
    );

    fireEvent.click(await findDivisionButton(/Premier 18\+/i));

    const joinAsTeamButton = await screen.findByRole('button', { name: /View Team Options/i });
    fireEvent.click(joinAsTeamButton);

    const teamSelect = await screen.findByPlaceholderText(/Choose a team/i);
    fireEvent.click(teamSelect);
    const teamOption = Array.from(document.querySelectorAll('[data-combobox-option]')).find((element) =>
      /Camka Team/i.test(element.textContent ?? ''),
    );
    if (!teamOption) {
      throw new Error('Expected a combobox option for Camka Team.');
    }
    fireEvent.click(teamOption);

    fireEvent.click(screen.getByRole('button', { name: /Join for/i }));
    expect(await screen.findByText(/Payment plan preview/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Continue with Payment Plan/i }));

    await waitFor(() => {
      expect(screen.getByText(/payment plan started/i)).toBeInTheDocument();
    });

    expect(paymentService.joinEvent).toHaveBeenCalled();
    expect(billService.createBill).toHaveBeenCalled();

    const joinSelectionArg = (paymentService.joinEvent as jest.Mock).mock.calls[0][3];
    expect(joinSelectionArg).toEqual(expect.objectContaining({ divisionId: premierDivisionId }));

    const joinCallOrder = (paymentService.joinEvent as jest.Mock).mock.invocationCallOrder[0];
    const billCallOrder = (billService.createBill as jest.Mock).mock.invocationCallOrder[0];
    expect(joinCallOrder).toBeLessThan(billCallOrder);

    expect(billService.createBill).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerType: 'TEAM',
        ownerId: team.$id,
        eventId: event.$id,
        timeoutMs: 5000,
      }),
    );

    expect(paymentService.joinEvent).toHaveBeenCalledWith(
      user,
      expect.objectContaining({ $id: event.$id }),
      expect.objectContaining({ $id: team.$id }),
      expect.objectContaining({ divisionId: premierDivisionId }),
      5000,
      undefined,
      undefined,
    );
  });

  it('shows an already-in-event disabled join button and a withdraw action for registered teams', async () => {
    const futureStart = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const futureEnd = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString();

    const event = buildEvent({
      $id: 'event_2',
      teamSignup: true,
      start: futureStart,
      end: futureEnd,
      price: 0,
      requiredTemplateIds: [],
      divisions: ['u17'],
      divisionDetails: [{ id: 'u17', name: 'U17' }] as any,
      teams: [
        buildTeam({
          $id: 'slot_1',
          name: 'Camka Team',
          parentTeamId: 'team_1',
          managerId: 'user_1',
          sport: 'Volleyball',
        }),
      ],
    });

    const managedTeam = buildTeam({
      $id: 'team_1',
      name: 'Camka Team',
      division: 'c_skill_open_age_18plus',
      sport: 'Volleyball',
      managerId: 'user_1',
    });

    const user = buildUser({
      $id: 'user_1',
      dateOfBirth: '1990-01-01',
      teamIds: [managedTeam.$id],
    });
    const authUser = { $id: user.$id, email: 'user@example.com', name: user.fullName };

    (useApp as jest.Mock).mockReturnValue({
      user,
      authUser,
      isAuthenticated: true,
      isGuest: false,
      loading: false,
      userTeams: [managedTeam],
      userTeamsLoading: false,
    });
    (familyService.listChildren as jest.Mock).mockResolvedValue([]);
    (eventService.getEventWithRelations as jest.Mock).mockResolvedValue(event);
    (eventService.getEvent as jest.Mock).mockResolvedValue(event);
    (eventService.getEventParticipants as jest.Mock).mockResolvedValue({
      participants: {
        teamIds: ['slot_1'],
        userIds: [],
        waitListIds: [],
        freeAgentIds: [],
        divisions: [],
      },
      registrations: {
        teams: [],
        users: [],
        children: [],
        waitlist: [],
        freeAgents: [],
      },
      teams: event.teams,
      users: [],
      participantCount: 1,
      participantCapacity: 24,
      divisionWarnings: [],
    });
    (teamService.getTeamsByIds as jest.Mock).mockResolvedValue([managedTeam]);

    renderWithMantine(
      <EventDetailSheet event={event} isOpen={true} onClose={jest.fn()} renderInline={true} />,
    );

    const joinAsTeamButton = await screen.findByRole('button', { name: /View Team Options/i });
    fireEvent.click(joinAsTeamButton);

    const teamSelect = await screen.findByPlaceholderText(/Choose a team/i);
    fireEvent.click(teamSelect);
    const teamOption = Array.from(document.querySelectorAll('[data-combobox-option]')).find((element) =>
      /Camka Team/i.test(element.textContent ?? ''),
    );
    if (!teamOption) {
      throw new Error('Expected a combobox option for Camka Team.');
    }
    expect(teamOption.textContent).toBe('Camka Team');
    expect(teamOption.textContent).not.toContain('c_skill_open_age_18plus');
    fireEvent.click(teamOption);

    const disabledJoinButton = await screen.findByRole('button', { name: /Already in Event/i });
    expect(disabledJoinButton).toBeDisabled();
    expect(screen.getByRole('button', { name: /Withdraw Team/i })).toBeInTheDocument();
  });

  it('requests payment intent for host when joining a paid team event', async () => {
    const futureStart = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const futureEnd = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString();

    const event = buildEvent({
      $id: 'event_3',
      teamSignup: true,
      hostId: 'user_1',
      start: futureStart,
      end: futureEnd,
      price: 5000,
      allowPaymentPlans: false,
      requiredTemplateIds: [],
      divisions: ['open'],
      divisionDetails: [{ id: 'open', name: 'Open' }] as any,
    });

    const team = buildTeam({
      $id: 'team_3',
      name: 'Beach Legends',
      division: 'Open',
      sport: 'Volleyball',
      managerId: 'user_1',
    });

    const user = buildUser({
      $id: 'user_1',
      dateOfBirth: '1990-01-01',
      teamIds: [team.$id],
    });
    const authUser = { $id: user.$id, email: 'user@example.com', name: user.fullName };

    (useApp as jest.Mock).mockReturnValue({
      user,
      authUser,
      isAuthenticated: true,
      isGuest: false,
      loading: false,
      userTeams: [team],
      userTeamsLoading: false,
    });
    (familyService.listChildren as jest.Mock).mockResolvedValue([]);
    (eventService.getEventWithRelations as jest.Mock).mockResolvedValue(event);
    (eventService.getEvent as jest.Mock).mockResolvedValue(event);
    (teamService.getTeamsByIds as jest.Mock).mockResolvedValue([team]);
    (paymentService.joinEvent as jest.Mock).mockResolvedValue(undefined);
    (paymentService.createPaymentIntent as jest.Mock).mockResolvedValue({
      clientSecret: 'pi_secret',
      paymentIntentId: 'pi_1',
    });

    renderWithMantine(
      <EventDetailSheet event={event} isOpen={true} onClose={jest.fn()} renderInline={true} />,
    );

    fireEvent.click(await findDivisionButton(/Open/i));

    const joinAsTeamButton = await screen.findByRole('button', { name: /View Team Options/i });
    fireEvent.click(joinAsTeamButton);

    const teamSelect = await screen.findByPlaceholderText(/Choose a team/i);
    fireEvent.click(teamSelect);
    const teamOption = Array.from(document.querySelectorAll('[data-combobox-option]')).find((element) =>
      /Beach Legends/i.test(element.textContent ?? ''),
    );
    if (!teamOption) {
      throw new Error('Expected a combobox option for Beach Legends.');
    }
    fireEvent.click(teamOption);

    fireEvent.click(screen.getByRole('button', { name: /Join for/i }));
    fireEvent.click(await screen.findByRole('button', { name: /^Checkout$/i }));

    await waitFor(() => {
      expect(paymentService.createPaymentIntent).toHaveBeenCalled();
    });

    const [paymentIntentCall] = (paymentService.createPaymentIntent as jest.Mock).mock.calls;
    expect(paymentIntentCall?.[0]).toEqual(user);
    expect(paymentIntentCall?.[1]).toEqual(expect.objectContaining({ $id: event.$id, price: 5000 }));
    expect(paymentIntentCall?.[2]).toEqual(expect.objectContaining({ $id: team.$id }));

    expect(paymentService.joinEvent).not.toHaveBeenCalled();
    expect(billService.createBill).not.toHaveBeenCalled();
  });

  it('completes team registration after instant payment success', async () => {
    const futureStart = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const futureEnd = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString();

    const event = buildEvent({
      $id: 'event_4',
      teamSignup: true,
      hostId: 'host_1',
      start: futureStart,
      end: futureEnd,
      price: 5000,
      allowPaymentPlans: false,
      requiredTemplateIds: [],
      divisions: ['open'],
      divisionDetails: [{ id: 'open', name: 'Open' }] as any,
      teams: [],
    });

    const registeredSlotTeam = buildTeam({
      $id: 'slot_4',
      name: 'Beach Legends',
      parentTeamId: 'team_4',
      managerId: 'user_1',
      sport: 'Volleyball',
      division: 'Open',
    });

    const team = buildTeam({
      $id: 'team_4',
      name: 'Beach Legends',
      division: 'Open',
      sport: 'Volleyball',
      managerId: 'user_1',
    });

    const user = buildUser({
      $id: 'user_1',
      dateOfBirth: '1990-01-01',
      teamIds: [team.$id],
    });
    const authUser = { $id: user.$id, email: 'user@example.com', name: user.fullName };

    let eventFetchCount = 0;
    (useApp as jest.Mock).mockReturnValue({
      user,
      authUser,
      isAuthenticated: true,
      isGuest: false,
      loading: false,
      userTeams: [team],
      userTeamsLoading: false,
    });
    (familyService.listChildren as jest.Mock).mockResolvedValue([]);
    (eventService.getEventWithRelations as jest.Mock).mockImplementation(async () => {
      eventFetchCount += 1;
      return eventFetchCount >= 2 ? { ...event, teams: [registeredSlotTeam] } : event;
    });
    (eventService.getEvent as jest.Mock).mockResolvedValue(event);
    (teamService.getTeamsByIds as jest.Mock).mockResolvedValue([team]);
    (paymentService.createPaymentIntent as jest.Mock).mockResolvedValue({
      paymentIntent: 'pi_secret',
      publishableKey: 'pk_test_123',
      feeBreakdown: {
        eventPrice: 5000,
        stripeFee: 175,
        processingFee: 50,
        totalCharge: 5225,
        hostReceives: 5000,
        feePercentage: 1,
        purchaseType: 'event',
      },
    });
    (paymentService.joinEvent as jest.Mock).mockResolvedValue(undefined);

    renderWithMantine(
      <EventDetailSheet event={event} isOpen={true} onClose={jest.fn()} renderInline={true} />,
    );

    fireEvent.click(await findDivisionButton(/Open/i));

    const joinAsTeamButton = await screen.findByRole('button', { name: /View Team Options/i });
    fireEvent.click(joinAsTeamButton);

    const teamSelect = await screen.findByPlaceholderText(/Choose a team/i);
    fireEvent.click(teamSelect);
    const teamOption = Array.from(document.querySelectorAll('[data-combobox-option]')).find((element) =>
      /Beach Legends/i.test(element.textContent ?? ''),
    );
    if (!teamOption) {
      throw new Error('Expected a combobox option for Beach Legends.');
    }
    fireEvent.click(teamOption);

    const baselineEventFetchCount = eventFetchCount;

    fireEvent.click(screen.getByRole('button', { name: /Join for/i }));
    fireEvent.click(await screen.findByRole('button', { name: /^Checkout$/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Complete Mock Payment/i }));

    await waitFor(() => {
      expect(eventFetchCount).toBeGreaterThan(baselineEventFetchCount);
    }, { timeout: 4000 });
    expect(paymentService.joinEvent).not.toHaveBeenCalled();
  });
});

