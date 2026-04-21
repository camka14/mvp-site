import React from 'react';
import { screen, waitFor } from '@testing-library/react';

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
  },
}));

import TeamDetailModal from '../TeamDetailModal';
import { useApp } from '@/app/providers';

const userServiceMock = jest.requireMock('@/lib/userService').userService as {
  getUsersByIds: jest.Mock;
  listInvites: jest.Mock;
  searchUsers: jest.Mock;
};

describe('TeamDetailModal', () => {
  beforeEach(() => {
    (useApp as jest.Mock).mockReturnValue({
      user: null,
    });
    userServiceMock.getUsersByIds.mockReset();
    userServiceMock.listInvites.mockReset();
    userServiceMock.searchUsers.mockReset();
    userServiceMock.getUsersByIds.mockResolvedValue([]);
    userServiceMock.listInvites.mockResolvedValue([]);
    userServiceMock.searchUsers.mockResolvedValue([]);
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
});
