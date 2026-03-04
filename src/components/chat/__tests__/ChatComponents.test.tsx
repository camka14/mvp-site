import { render, screen } from '@testing-library/react';
import { ChatComponents } from '../ChatComponents';

const useAppMock = jest.fn();
jest.mock('@/app/providers', () => ({
  useApp: () => useAppMock(),
}));

jest.mock('../ChatDrawer', () => ({
  ChatDrawer: () => <div data-testid="chat-drawer" />,
}));

jest.mock('../InviteUsersModal', () => ({
  InviteUsersModal: () => <div data-testid="invite-users-modal" />,
}));

describe('ChatComponents', () => {
  beforeEach(() => {
    useAppMock.mockReset();
  });

  it('does not render chat UI while auth state is loading', () => {
    useAppMock.mockReturnValue({
      loading: true,
      isAuthenticated: false,
      isGuest: false,
    });

    render(<ChatComponents />);

    expect(screen.queryByTestId('chat-drawer')).not.toBeInTheDocument();
    expect(screen.queryByTestId('invite-users-modal')).not.toBeInTheDocument();
  });

  it('does not render chat UI for signed-out users', () => {
    useAppMock.mockReturnValue({
      loading: false,
      isAuthenticated: false,
      isGuest: false,
    });

    render(<ChatComponents />);

    expect(screen.queryByTestId('chat-drawer')).not.toBeInTheDocument();
    expect(screen.queryByTestId('invite-users-modal')).not.toBeInTheDocument();
  });

  it('renders chat UI for authenticated non-guest users', () => {
    useAppMock.mockReturnValue({
      loading: false,
      isAuthenticated: true,
      isGuest: false,
    });

    render(<ChatComponents />);

    expect(screen.getByTestId('chat-drawer')).toBeInTheDocument();
    expect(screen.getByTestId('invite-users-modal')).toBeInTheDocument();
  });
});
