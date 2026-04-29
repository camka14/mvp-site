import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';

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
  },
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
};

describe('TeamDetailModal', () => {
  beforeEach(() => {
    (useApp as jest.Mock).mockReturnValue({
      user: null,
    });
    userServiceMock.getUsersByIds.mockReset();
    userServiceMock.listInvites.mockReset();
    userServiceMock.searchUsers.mockReset();
    userServiceMock.getUserById.mockReset();
    teamServiceMock.getInviteFreeAgentContext.mockReset();
    teamServiceMock.inviteUserToTeamRole.mockReset();
    teamServiceMock.inviteEmailToTeamRole.mockReset();
    teamServiceMock.getTeamById.mockReset();
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

  it('allows a pending paid team registration to resume payment even when the team is full', async () => {
    (useApp as jest.Mock).mockReturnValue({
      user: buildUser({
        $id: 'player_1',
        firstName: 'Alex',
        lastName: 'Stone',
        fullName: 'Alex Stone',
      }),
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
});
