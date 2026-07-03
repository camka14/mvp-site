import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import CreateTeamModal from '../CreateTeamModal';
import { buildTeam, buildUser } from '../../../../test/factories';
import { renderWithMantine } from '../../../../test/utils/renderWithMantine';

jest.mock('@/lib/teamService', () => ({
  teamService: {
    createTeam: jest.fn(),
  },
}));

jest.mock('../ImageUploader', () => ({
  ImageUploader: () => <div data-testid="image-uploader" />,
}));

const teamServiceMock = jest.requireMock('@/lib/teamService').teamService as {
  createTeam: jest.Mock;
};

const selectSport = async (user: ReturnType<typeof userEvent.setup>, sport = 'Indoor Volleyball') => {
  const sportInput = screen
    .getAllByLabelText(/Sport/i)
    .find((element) => element.tagName.toLowerCase() === 'input');
  expect(sportInput).toBeDefined();
  await user.click(sportInput as HTMLElement);
  await user.click(await screen.findByText(sport));
};

describe('CreateTeamModal', () => {
  beforeEach(() => {
    teamServiceMock.createTeam.mockReset();
    teamServiceMock.createTeam.mockResolvedValue(buildTeam());
  });

  it('allows team size to be cleared and set to 0 while showing the size warning', async () => {
    const user = userEvent.setup();

    renderWithMantine(
      <CreateTeamModal
        isOpen
        onClose={jest.fn()}
        currentUser={buildUser({ $id: 'user_1' })}
      />,
    );

    const teamSizeInput = screen.getByLabelText(/Team Size/i);

    await user.clear(teamSizeInput);
    expect((teamSizeInput as HTMLInputElement).value).toBe('');
    expect(screen.getByText('Team size must be 2 or above.')).toBeInTheDocument();

    await user.type(teamSizeInput, '0');
    expect((teamSizeInput as HTMLInputElement).value).toBe('0');
    expect(screen.getByText('Team size must be 2 or above.')).toBeInTheDocument();

    await user.type(screen.getByLabelText(/Team Name/i), 'Test team');
    await selectSport(user);
    await user.click(screen.getByRole('button', { name: /Create Team/i }));

    expect(teamServiceMock.createTeam).not.toHaveBeenCalled();
    expect(screen.getAllByText('Team size must be 2 or above.')).toHaveLength(2);
  });

  it('submits a team size of 2', async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();
    const onTeamCreated = jest.fn();
    const currentUser = {
      ...buildUser({ $id: '' }),
      id: 'user_legacy',
    } as any;

    renderWithMantine(
      <CreateTeamModal
        isOpen
        onClose={onClose}
        currentUser={currentUser}
        onTeamCreated={onTeamCreated}
      />,
    );

    await user.type(screen.getByLabelText(/Team Name/i), 'Test team');
    await selectSport(user);
    const teamSizeInput = screen.getByLabelText(/Team Size/i);
    await user.clear(teamSizeInput);
    await user.type(teamSizeInput, '2');
    await user.click(screen.getByRole('button', { name: /Create Team/i }));

    await waitFor(() => {
      expect(teamServiceMock.createTeam).toHaveBeenCalledWith(
        'Test team',
        'user_legacy',
        expect.any(String),
        expect.any(String),
        2,
        undefined,
        expect.objectContaining({
          addSelfAsPlayer: true,
        }),
      );
    });
    expect(onTeamCreated).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('submits affiliate team registration settings', async () => {
    const user = userEvent.setup();

    renderWithMantine(
      <CreateTeamModal
        isOpen
        onClose={jest.fn()}
        currentUser={buildUser({ $id: 'user_1' })}
      />,
    );

    await user.type(screen.getByLabelText(/Team Name/i), 'Partner team');
    await selectSport(user);
    await user.click(screen.getByLabelText(/External team registration/i));
    await user.type(screen.getByLabelText(/Affiliate registration link/i), 'https://partner.example.com/signup');
    await user.click(screen.getByRole('button', { name: /Create Team/i }));

    await waitFor(() => {
      expect(teamServiceMock.createTeam).toHaveBeenCalledWith(
        'Partner team',
        'user_1',
        expect.any(String),
        expect.any(String),
        6,
        undefined,
        expect.objectContaining({
          affiliateUrl: 'https://partner.example.com/signup',
          joinPolicy: 'OPEN_REGISTRATION',
          openRegistration: true,
        }),
      );
    });
  });

  it('shows a sign-in warning instead of submitting without a current user id', async () => {
    const user = userEvent.setup();

    renderWithMantine(
      <CreateTeamModal
        isOpen
        onClose={jest.fn()}
        currentUser={null}
      />,
    );

    await user.type(screen.getByLabelText(/Team Name/i), 'Test team');
    await selectSport(user);
    const teamSizeInput = screen.getByLabelText(/Team Size/i);
    await user.clear(teamSizeInput);
    await user.type(teamSizeInput, '3');
    await user.click(screen.getByRole('button', { name: /Create Team/i }));

    expect(teamServiceMock.createTeam).not.toHaveBeenCalled();
    expect(screen.getByText('Sign in again before creating a team.')).toBeInTheDocument();
  });
});
