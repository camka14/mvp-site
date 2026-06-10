import React from 'react';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';

import { renderWithMantine } from '../../../../test/utils/renderWithMantine';
import { buildTeam, buildUser } from '../../../../test/factories';

jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: any) => {
    const { src, alt, fill, unoptimized, ...rest } = props;
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={typeof src === 'string' ? src : ''} alt={alt ?? ''} {...rest} />;
  },
}));

jest.mock('@/app/providers', () => ({
  useApp: jest.fn(),
}));

jest.mock('@/lib/userService', () => ({
  userService: {
    getUsersByIds: jest.fn(),
    listInvites: jest.fn(),
    searchUsers: jest.fn(),
    getUserById: jest.fn(),
  },
}));

jest.mock('@/lib/teamService', () => ({
  teamService: {
    getInviteFreeAgentContext: jest.fn(),
    inviteUserToTeamRole: jest.fn(),
    inviteEmailToTeamRole: jest.fn(),
    getTeamById: jest.fn(),
    getRegistrationQuestions: jest.fn(),
    getTeamJoinRequestContext: jest.fn(),
    listTeamJoinRequests: jest.fn(),
    requestToJoinTeam: jest.fn(),
    registerSelfForTeam: jest.fn(),
    registerChildForTeam: jest.fn(),
  },
}));
jest.mock('@/lib/apiClient', () => ({
  apiRequest: jest.fn(async (path: string) => {
    if (path.includes('/templates')) {
      return { templates: [] };
    }
    if (path.includes('/compliance')) {
      return { team: null };
    }
    return {};
  }),
  isApiRequestError: jest.fn(() => false),
}));
jest.mock('@/lib/familyService', () => ({
  familyService: {
    listChildren: jest.fn(),
  },
}));
jest.mock('@/lib/paymentService', () => ({
  paymentService: {
    createTeamRegistrationPaymentIntent: jest.fn(),
  },
}));
jest.mock('@/lib/boldsignService', () => ({
  boldsignService: {
    createSignLinks: jest.fn(),
    getOperationStatus: jest.fn(),
  },
}));
jest.mock('@/lib/signedDocumentService', () => ({
  signedDocumentService: {
    isDocumentSigned: jest.fn(),
  },
}));
jest.mock('../TeamFinancePanel', () => ({
  __esModule: true,
  default: ({ teamId, organizationId, isActive, canManage }: any) => (
    <div data-testid="team-finance-panel">
      {`${teamId}:${organizationId}:${isActive}:${canManage}`}
    </div>
  ),
}));

import TeamDetailModal from '../TeamDetailModal';
import { useApp } from '@/app/providers';

const userServiceMock = jest.requireMock('@/lib/userService').userService as {
  getUsersByIds: jest.Mock;
  listInvites: jest.Mock;
  searchUsers: jest.Mock;
  getUserById: jest.Mock;
};
const teamServiceMock = jest.requireMock('@/lib/teamService').teamService as {
  getInviteFreeAgentContext: jest.Mock;
  inviteUserToTeamRole: jest.Mock;
  inviteEmailToTeamRole: jest.Mock;
  getTeamById: jest.Mock;
  getRegistrationQuestions: jest.Mock;
  getTeamJoinRequestContext: jest.Mock;
  listTeamJoinRequests: jest.Mock;
  requestToJoinTeam: jest.Mock;
  registerSelfForTeam: jest.Mock;
  registerChildForTeam: jest.Mock;
};
const familyServiceMock = jest.requireMock('@/lib/familyService').familyService as {
  listChildren: jest.Mock;
};

describe('TeamDetailModal', () => {
  beforeEach(() => {
    (useApp as jest.Mock).mockReturnValue({
      user: null,
      authUser: null,
    });
    userServiceMock.getUsersByIds.mockReset();
    userServiceMock.listInvites.mockReset();
    userServiceMock.searchUsers.mockReset();
    userServiceMock.getUserById.mockReset();
    teamServiceMock.getInviteFreeAgentContext.mockReset();
    teamServiceMock.inviteUserToTeamRole.mockReset();
    teamServiceMock.inviteEmailToTeamRole.mockReset();
    teamServiceMock.getTeamById.mockReset();
    teamServiceMock.getRegistrationQuestions.mockReset();
    teamServiceMock.getTeamJoinRequestContext.mockReset();
    teamServiceMock.listTeamJoinRequests.mockReset();
    teamServiceMock.requestToJoinTeam.mockReset();
    teamServiceMock.registerSelfForTeam.mockReset();
    teamServiceMock.registerChildForTeam.mockReset();
    familyServiceMock.listChildren.mockReset();
    userServiceMock.getUsersByIds.mockResolvedValue([]);
    userServiceMock.listInvites.mockResolvedValue([]);
    userServiceMock.searchUsers.mockResolvedValue([]);
    userServiceMock.getUserById.mockResolvedValue(undefined);
    teamServiceMock.getInviteFreeAgentContext.mockResolvedValue({
      users: [],
      eventIds: [],
      freeAgentIds: [],
      eventTeams: [],
      freeAgentEventsByUserId: {},
      freeAgentEventTeamIdsByUserId: {},
    });
    teamServiceMock.inviteUserToTeamRole.mockResolvedValue(true);
    teamServiceMock.inviteEmailToTeamRole.mockResolvedValue(true);
    teamServiceMock.getTeamById.mockResolvedValue(undefined);
    teamServiceMock.getRegistrationQuestions.mockResolvedValue([]);
    teamServiceMock.getTeamJoinRequestContext.mockResolvedValue({
      questions: [],
      currentRequest: null,
      joinPolicy: 'CLOSED',
      openRegistration: false,
      registrationPriceCents: 0,
    });
    teamServiceMock.listTeamJoinRequests.mockResolvedValue([]);
    teamServiceMock.requestToJoinTeam.mockResolvedValue({
      id: 'request_1',
      status: 'PENDING',
    });
    teamServiceMock.registerSelfForTeam.mockResolvedValue({});
    teamServiceMock.registerChildForTeam.mockResolvedValue({});
    familyServiceMock.listChildren.mockResolvedValue([]);
  });

  it('renders safely when eventFreeAgents prop is omitted', () => {
    const team = buildTeam({
      captainId: 'captain_1',
      playerIds: [],
      pending: [],
      teamSize: 6,
    });

    expect(() => {
      renderWithMantine(
        <TeamDetailModal
          currentTeam={team}
          isOpen={false}
          onClose={jest.fn()}
        />,
      );
    }).not.toThrow();
  });

  it('uses jersey numbers for registered team player avatars', async () => {
    const player = buildUser({
      $id: 'player_1',
      firstName: 'Alex',
      lastName: 'Stone',
      fullName: 'Alex Stone',
    });
    const team = buildTeam({
      $id: 'team_1',
      captainId: 'player_1',
      managerId: '',
      playerIds: ['player_1'],
      pending: [],
      playerRegistrations: [{
        id: 'registration_1',
        teamId: 'team_1',
        userId: 'player_1',
        status: 'ACTIVE',
        jerseyNumber: '12',
      }],
      teamSize: 6,
    });
    userServiceMock.getUsersByIds.mockResolvedValueOnce([player]);

    renderWithMantine(
      <TeamDetailModal
        currentTeam={team}
        isOpen
        onClose={jest.fn()}
        canManage={false}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Alex Stone')).toBeInTheDocument();
      expect(screen.getByAltText('Alex Stone')).toHaveAttribute(
        'src',
        expect.stringContaining('name=12'),
      );
    });
  });

  it('renders roster and finance as page tabs for organization teams', async () => {
    const manager = buildUser({
      $id: 'manager_1',
      firstName: 'Morgan',
      lastName: 'Manager',
      fullName: 'Morgan Manager',
    });
    (useApp as jest.Mock).mockReturnValue({
      user: manager,
      authUser: { email: 'morgan@example.com' },
    });
    const team = buildTeam({
      $id: 'team_1',
      organizationId: 'org_1',
      captainId: 'manager_1',
      managerId: 'manager_1',
      playerIds: [],
      pending: [],
      teamSize: 6,
    });
    const onActiveTabChange = jest.fn();
    const { unmount } = renderWithMantine(
      <TeamDetailModal
        currentTeam={team}
        isOpen
        onClose={jest.fn()}
        canManage={false}
        variant="page"
        activeTab="roster"
        onActiveTabChange={onActiveTabChange}
      />,
    );

    expect(screen.getByText('Roster')).toBeInTheDocument();
    expect(screen.getByText('Finance')).toBeInTheDocument();
    expect(screen.getByText('Player Slots')).toBeInTheDocument();
    expect(screen.queryByTestId('team-finance-panel')).not.toBeInTheDocument();
    await waitFor(() => {
      expect(userServiceMock.listInvites).toHaveBeenCalled();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    fireEvent.click(screen.getByText('Finance'));
    expect(onActiveTabChange).toHaveBeenCalledWith('finance');

    unmount();
    renderWithMantine(
      <TeamDetailModal
        currentTeam={team}
        isOpen
        onClose={jest.fn()}
        canManage={false}
        variant="page"
        activeTab="finance"
        onActiveTabChange={onActiveTabChange}
      />,
    );

    expect(screen.getByText('Finance is available to team managers.')).toBeInTheDocument();
    expect(screen.queryByTestId('team-finance-panel')).not.toBeInTheDocument();
    expect(screen.queryByText('Player Slots')).not.toBeInTheDocument();
    await waitFor(() => {
      expect(userServiceMock.listInvites).toHaveBeenCalledTimes(2);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  });

  it('allows a pending paid team registration to resume payment even when the team is full', async () => {
    const currentUser = buildUser({
      $id: 'player_1',
      firstName: 'Alex',
      lastName: 'Stone',
      fullName: 'Alex Stone',
    });
    (useApp as jest.Mock).mockReturnValue({
      user: currentUser,
      authUser: { email: 'alex@example.com' },
    });
    const team = buildTeam({
      $id: 'team_1',
      captainId: 'captain_1',
      managerId: '',
      playerIds: [],
      pending: [],
      openRegistration: true,
      registrationPriceCents: 2500,
      playerRegistrations: [{
        id: 'registration_1',
        teamId: 'team_1',
        userId: 'player_1',
        status: 'STARTED',
      }],
      teamSize: 1,
    });
    teamServiceMock.getTeamJoinRequestContext.mockResolvedValueOnce({
      questions: [],
      currentRequest: null,
      joinPolicy: 'OPEN_REGISTRATION',
      openRegistration: true,
      registrationPriceCents: 2500,
    });

    renderWithMantine(
      <TeamDetailModal
        currentTeam={team}
        isOpen
        onClose={jest.fn()}
        canManage={false}
      />,
    );

    expect(await screen.findByRole('button', { name: /resume payment/i })).toBeEnabled();
    expect(screen.getByText(/waiting for payment confirmation/i)).toBeInTheDocument();
    expect(screen.queryByText('This team is full.')).not.toBeInTheDocument();
  });

  it('registers an event team snapshot through its canonical parent team', async () => {
    const currentUser = buildUser({
      $id: 'player_1',
      firstName: 'Alex',
      lastName: 'Stone',
      fullName: 'Alex Stone',
    });
    (useApp as jest.Mock).mockReturnValue({
      user: currentUser,
      authUser: { email: 'alex@example.com' },
    });
    const eventTeam = buildTeam({
      $id: 'event_team_1',
      parentTeamId: 'team_1',
      name: 'Open Event Team',
      captainId: 'captain_1',
      managerId: 'manager_1',
      playerIds: [],
      pending: [],
      openRegistration: true,
      registrationPriceCents: 0,
      requiredTemplateIds: [],
      playerRegistrations: [],
      teamSize: 6,
    });
    const canonicalTeam = buildTeam({
      ...eventTeam,
      $id: 'team_1',
      parentTeamId: null,
      openRegistration: true,
    });
    teamServiceMock.getTeamById.mockResolvedValue(canonicalTeam);
    teamServiceMock.getTeamJoinRequestContext.mockResolvedValueOnce({
      questions: [],
      currentRequest: null,
      joinPolicy: 'OPEN_REGISTRATION',
      openRegistration: true,
      registrationPriceCents: 0,
    });
    teamServiceMock.registerSelfForTeam.mockResolvedValue({
      registrationId: 'team_1__player_1',
      status: 'ACTIVE',
      team: buildTeam({
        ...canonicalTeam,
        playerIds: ['player_1'],
        playerRegistrations: [{
          id: 'team_1__player_1',
          teamId: 'team_1',
          userId: 'player_1',
          status: 'ACTIVE',
        }],
      }),
    });

    renderWithMantine(
      <TeamDetailModal
        currentTeam={eventTeam}
        isOpen
        onClose={jest.fn()}
        canManage={false}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: /join team/i }));

    await waitFor(() => {
      expect(teamServiceMock.registerSelfForTeam.mock.calls.some(([teamId]) => teamId === 'team_1')).toBe(true);
    });
    expect(teamServiceMock.registerSelfForTeam.mock.calls.some(([teamId]) => teamId === 'event_team_1')).toBe(false);
  });

  it('prechecks source event teams when selecting a free-agent invite', async () => {
    const manager = buildUser({
      $id: 'manager_1',
      firstName: 'Morgan',
      lastName: 'Manager',
      fullName: 'Morgan Manager',
    });
    const freeAgent = buildUser({
      $id: 'free_1',
      firstName: 'Free',
      lastName: 'Agent',
      fullName: 'Free Agent',
      userName: 'freeagent',
    });
    (useApp as jest.Mock).mockReturnValue({ user: manager });
    userServiceMock.getUserById.mockResolvedValue(freeAgent);
    teamServiceMock.getInviteFreeAgentContext.mockResolvedValue({
      users: [freeAgent],
      eventIds: ['event_1'],
      freeAgentIds: ['free_1'],
      eventTeams: [{
        eventId: 'event_1',
        eventTeamId: 'event_team_1',
        eventName: 'Future Event',
        eventStart: '2026-06-01T16:00:00.000Z',
        eventEnd: null,
        teamName: 'Test team',
      }],
      freeAgentEventsByUserId: {
        free_1: ['event_1'],
      },
      freeAgentEventTeamIdsByUserId: {
        free_1: ['event_team_1'],
      },
    });
    const team = buildTeam({
      $id: 'team_1',
      captainId: 'manager_1',
      managerId: 'manager_1',
      playerIds: [],
      pending: [],
      teamSize: 6,
      name: 'Test team',
    });

    renderWithMantine(
      <TeamDetailModal
        currentTeam={team}
        isOpen
        onClose={jest.fn()}
        canManage
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /invite team members/i }));
    expect(await screen.findByRole('tab', { name: /free agents/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /invite user/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /invite by email/i })).toBeInTheDocument();
    expect(await screen.findByText('Free Agent')).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: /select/i })[0]);
    const checkbox = await screen.findByRole('checkbox', { name: /future event - test team/i });
    expect(checkbox).toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: /send player invite/i }));

    await waitFor(() => {
      expect(teamServiceMock.inviteUserToTeamRole).toHaveBeenCalledWith(
        team,
        freeAgent,
        'player',
        { eventTeamIds: ['event_team_1'] },
      );
    });
  });

  it('blocks player invites when team registration slots are full', async () => {
    const manager = buildUser({
      $id: 'manager_1',
      firstName: 'Morgan',
      lastName: 'Manager',
      fullName: 'Morgan Manager',
    });
    (useApp as jest.Mock).mockReturnValue({ user: manager });
    const team = buildTeam({
      $id: 'team_1',
      captainId: 'manager_1',
      managerId: 'manager_1',
      playerIds: ['manager_1'],
      pending: ['pending_1'],
      playerRegistrations: [
        {
          id: 'team_1__manager_1',
          teamId: 'team_1',
          userId: 'manager_1',
          status: 'ACTIVE',
        },
        {
          id: 'team_1__pending_1',
          teamId: 'team_1',
          userId: 'pending_1',
          status: 'INVITED',
        },
      ],
      teamSize: 2,
      name: 'Test team',
    });

    renderWithMantine(
      <TeamDetailModal
        currentTeam={team}
        isOpen
        onClose={jest.fn()}
        canManage
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /invite team members/i }));

    expect(await screen.findByText(/already has 2 of 2 player slots filled/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /invite by email/i }));
    fireEvent.change(screen.getByPlaceholderText('name@example.com'), {
      target: { value: 'new.player@example.com' },
    });

    expect(screen.getByRole('button', { name: /send player invite/i })).toBeDisabled();
  });
});
