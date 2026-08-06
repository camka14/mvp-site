import userEvent from '@testing-library/user-event';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import ProfileHeaderActions from '../ProfileHeaderActions';

const renderActions = (props: Partial<React.ComponentProps<typeof ProfileHeaderActions>> = {}) => render(
  <MantineProvider>
    <ProfileHeaderActions
      isEditing={false}
      saving={false}
      loggingOut={false}
      onCancel={jest.fn()}
      onEdit={jest.fn()}
      onSave={jest.fn()}
      onLogout={jest.fn()}
      {...props}
    />
  </MantineProvider>,
);

describe('ProfileHeaderActions', () => {
  it('shows Edit profile and Log out in view mode', () => {
    renderActions();

    expect(screen.getByRole('button', { name: /edit profile/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /log out/i })).toBeInTheDocument();
  });

  it('shows only Cancel and Save actions in edit mode', () => {
    renderActions({ isEditing: true });

    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /log out/i })).not.toBeInTheDocument();
  });

  it('disables logout while pending', async () => {
    const user = userEvent.setup();
    const onLogout = jest.fn();
    renderActions({ loggingOut: true, onLogout });

    const logout = screen.getByRole('button', { name: /log out/i });
    expect(logout).toBeDisabled();
    await user.click(logout);
    expect(onLogout).not.toHaveBeenCalled();
  });
});
