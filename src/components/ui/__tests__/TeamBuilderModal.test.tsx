import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import TeamBuilderModal from '../TeamBuilderModal';
import { buildEvent, buildTeam, buildUser } from '../../../../test/factories';
import { renderWithMantine } from '../../../../test/utils/renderWithMantine';

jest.mock('@/lib/eventService', () => ({
  eventService: {
    getEventParticipants: jest.fn(),
    getEventById: jest.fn(),
  },
}));

jest.mock('@/lib/teamService', () => ({
  teamService: {
    createTeam: jest.fn(),
    inviteUserToTeamRole: jest.fn(),
    createTeamMemberInvite: jest.fn(),
  },
}));

jest.mock('@/lib/userService', () => ({
  userService: {
    searchUsers: jest.fn(),
  },
}));

const eventServiceMock = jest.requireMock('@/lib/eventService').eventService as {
  getEventParticipants: jest.Mock;
  getEventById: jest.Mock;
};
const teamServiceMock = jest.requireMock('@/lib/teamService').teamService as {
  createTeam: jest.Mock;
  inviteUserToTeamRole: jest.Mock;
  createTeamMemberInvite: jest.Mock;
};
const userServiceMock = jest.requireMock('@/lib/userService').userService as {
  searchUsers: jest.Mock;
};

describe('TeamBuilderModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const freeAgent = buildUser({
      $id: 'free_agent_1',
      firstName: 'Frankie',
      lastName: 'Free',
      fullName: 'Frankie Free',
    });
    eventServiceMock.getEventParticipants.mockResolvedValue({
      event: buildEvent({
        $id: 'event_1',
        name: 'Summer Open',
        sport: 'Volleyball',
        start: '2099-07-20T18:00:00.000Z',
        teamSizeLimit: 4,
      }),
      participants: {
        teamIds: [],
        userIds: [],
        waitListIds: [],
        freeAgentIds: [freeAgent.$id],
        divisions: [],
      },
      teams: [],
      users: [freeAgent],
    });
    eventServiceMock.getEventById.mockResolvedValue(null);
    teamServiceMock.createTeam.mockResolvedValue(buildTeam({ $id: 'created_team_1', name: 'Created team' }));
    teamServiceMock.inviteUserToTeamRole.mockResolvedValue(true);
    teamServiceMock.createTeamMemberInvite.mockResolvedValue({
      ok: true,
      invite: { $id: 'invite_link_1' },
      shareUrl: 'http://localhost/i/invite_link_1?v=1&e=2&s=signed',
    });
    userServiceMock.searchUsers.mockResolvedValue([]);
  });

  it('allows removal on the free-agent step and keeps that row read-only on the invite step', async () => {
    const user = userEvent.setup();
    renderWithMantine(
      <TeamBuilderModal
        isOpen
        onClose={jest.fn()}
        currentUser={buildUser({ $id: 'captain_1', firstName: 'Casey', lastName: 'Captain', fullName: 'Casey Captain' })}
        eventId="event_1"
      />,
    );

    await screen.findByText('Summer Open');
    await user.type(screen.getByLabelText(/Team name/i), 'Cascade Crew');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByText('Set team leadership')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByText('Frankie Free')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove Frankie Free' })).not.toBeInTheDocument();

    const newPersonButton = screen.getByRole('button', { name: 'New person' });
    expect(newPersonButton).toBeEnabled();
    fireEvent.click(newPersonButton);
    expect(screen.getAllByText('New person')).toHaveLength(2);
    await user.type(await screen.findByLabelText(/First name/i), 'Jordan');
    await user.type(screen.getByLabelText(/Last name/i), 'Guest');
    await user.click(screen.getByRole('button', { name: 'Save invite' }));

    expect(screen.getByText('Jordan Guest')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Jordan Guest' })).toBeInTheDocument();
  });

  it('uses the email invite label when a valid optional email is entered', async () => {
    const user = userEvent.setup();
    renderWithMantine(
      <TeamBuilderModal
        isOpen
        onClose={jest.fn()}
        currentUser={buildUser({ $id: 'captain_2' })}
      />,
    );

    await user.type(screen.getByLabelText(/Team name/i), 'Harbor Strikers');
    const sportInput = screen
      .getAllByLabelText('Sport')
      .find((element) => element.tagName.toLowerCase() === 'input');
    expect(sportInput).toBeDefined();
    await user.click(sportInput as HTMLElement);
    await user.click(await screen.findByText('Indoor Volleyball'));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    const newPersonButton = screen.getByRole('button', { name: 'New person' });
    expect(newPersonButton).toBeEnabled();
    fireEvent.click(newPersonButton);
    expect(screen.getAllByText('New person')).toHaveLength(2);
    await user.type(screen.getByLabelText(/First name/i), 'Riley');
    await user.type(screen.getByLabelText(/Last name/i), 'Player');
    await user.type(screen.getByLabelText('Email (optional)'), 'riley@test.com');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Send email invite' })).toBeInTheDocument();
    });
  });

  it('omits free agents without an upcoming event and requires a replacement manager', async () => {
    const user = userEvent.setup();
    renderWithMantine(
      <TeamBuilderModal
        isOpen
        onClose={jest.fn()}
        currentUser={buildUser({ $id: 'creator_3', firstName: 'Morgan', lastName: 'Maker' })}
      />,
    );

    await user.type(screen.getByLabelText(/Team name/i), 'Metro Five');
    const sportInput = screen.getAllByLabelText('Sport').find((element) => element.tagName.toLowerCase() === 'input');
    await user.click(sportInput as HTMLElement);
    await user.click(await screen.findByText('Indoor Volleyball'));
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByText('Step 2 of 4')).toBeInTheDocument();
    expect(screen.getByText('Staff')).toBeInTheDocument();
    expect(screen.queryByText('Invite free agents from this event')).not.toBeInTheDocument();

    await user.click(screen.getByLabelText('I will manage this team'));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText(/Choose a manager before continuing/i)).toBeInTheDocument();
  });

  it('searches for existing accounts in both the staff and player steps', async () => {
    const user = userEvent.setup();
    const match = buildUser({
      $id: 'search_match_1',
      firstName: 'Avery',
      lastName: 'Morgan',
      fullName: 'Avery Morgan',
      userName: 'avery.morgan',
    });
    userServiceMock.searchUsers.mockResolvedValue([match]);

    renderWithMantine(
      <TeamBuilderModal
        isOpen
        onClose={jest.fn()}
        currentUser={buildUser({ $id: 'creator_search_1' })}
      />,
    );

    await user.type(screen.getByLabelText(/Team name/i), 'Riverside FC');
    const sportInput = screen.getAllByLabelText('Sport').find((element) => element.tagName.toLowerCase() === 'input');
    await user.click(sportInput as HTMLElement);
    await user.click(await screen.findByText('Indoor Volleyball'));
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await user.type(screen.getByLabelText('Search BracketIQ staff'), 'Avery');
    await user.click(await screen.findByRole('button', { name: 'Add' }));
    expect(screen.getByText('Avery Morgan')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await user.type(screen.getByLabelText('Search BracketIQ'), 'Avery');
    await user.click(await screen.findByRole('button', { name: 'Add' }));
    expect(screen.getAllByText('Avery Morgan')).toHaveLength(1);
    expect(userServiceMock.searchUsers).toHaveBeenCalledWith('Avery');
    await user.click(screen.getByRole('button', { name: 'Review team' }));
    await user.click(screen.getByRole('button', { name: 'Create team' }));

    await waitFor(() => expect(teamServiceMock.inviteUserToTeamRole).toHaveBeenCalledTimes(2));
    expect(teamServiceMock.inviteUserToTeamRole).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ $id: 'created_team_1' }),
      expect.objectContaining({ $id: 'search_match_1' }),
      'player',
    );
    expect(teamServiceMock.inviteUserToTeamRole).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ $id: 'created_team_1' }),
      expect.objectContaining({ $id: 'search_match_1' }),
      'team_manager',
    );
  });

  it('creates a link-backed staff invite with optional contact information', async () => {
    const user = userEvent.setup();
    renderWithMantine(
      <TeamBuilderModal
        isOpen
        onClose={jest.fn()}
        currentUser={buildUser({ $id: 'creator_staff_1', firstName: 'Taylor', lastName: 'Stone' })}
      />,
    );

    await user.type(screen.getByLabelText(/Team name/i), 'Harbor United');
    const sportInput = screen.getAllByLabelText('Sport').find((element) => element.tagName.toLowerCase() === 'input');
    await user.click(sportInput as HTMLElement);
    await user.click(await screen.findByText('Indoor Volleyball'));
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await screen.findByText('Set team leadership');
    await user.click(screen.getByRole('button', { name: 'New staff member' }));
    expect(screen.getAllByText('New staff member')).toHaveLength(2);
    await user.type(await screen.findByLabelText(/First name/i), 'Morgan');
    await user.type(screen.getByLabelText(/Last name/i), 'Reed');
    await user.type(screen.getByLabelText('Email (optional)'), 'morgan@qa.invalid');
    await user.type(screen.getByLabelText('Phone (optional)'), '+15035550118');
    await user.click(screen.getByRole('button', { name: 'Send email invite' }));

    expect(screen.getByText('Morgan Reed')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Review team' }));
    await user.click(screen.getByRole('button', { name: 'Create team' }));

    await screen.findByText('Team created');
    expect(screen.getByText('Morgan Reed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeInTheDocument();
    expect(teamServiceMock.createTeamMemberInvite).toHaveBeenCalledWith('created_team_1', {
      role: 'team_manager',
      firstName: 'Morgan',
      lastName: 'Reed',
      email: 'morgan@qa.invalid',
      phone: '(503) 555-0118',
      shareOnly: false,
    });
  });
});
