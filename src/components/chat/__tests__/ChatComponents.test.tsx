import { render, screen } from '@testing-library/react';
import { ChatComponents } from '../ChatComponents';

const useAppMock = jest.fn();
const usePathnameMock = jest.fn();

jest.mock('next/navigation', () => ({
  usePathname: () => usePathnameMock(),
}));

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
    usePathnameMock.mockReset();
    usePathnameMock.mockReturnValue('/discover');
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

  it('does not render chat UI on the landing page', () => {
    useAppMock.mockReturnValue({
      loading: false,
      isAuthenticated: true,
      isGuest: false,
    });
    usePathnameMock.mockReturnValue('/');

    render(<ChatComponents />);

    expect(screen.queryByTestId('chat-drawer')).not.toBeInTheDocument();
    expect(screen.queryByTestId('invite-users-modal')).not.toBeInTheDocument();
  });

  it('does not render chat UI on blog pages', () => {
    useAppMock.mockReturnValue({
      loading: false,
      isAuthenticated: true,
      isGuest: false,
    });
    usePathnameMock.mockReturnValue('/blog/tournament-schedule-maker');

    render(<ChatComponents />);

    expect(screen.queryByTestId('chat-drawer')).not.toBeInTheDocument();
    expect(screen.queryByTestId('invite-users-modal')).not.toBeInTheDocument();
  });

  it('does not render chat UI on the request demo page', () => {
    useAppMock.mockReturnValue({
      loading: false,
      isAuthenticated: true,
      isGuest: false,
    });
    usePathnameMock.mockReturnValue('/request-demo');

    render(<ChatComponents />);

    expect(screen.queryByTestId('chat-drawer')).not.toBeInTheDocument();
    expect(screen.queryByTestId('invite-users-modal')).not.toBeInTheDocument();
  });
});
