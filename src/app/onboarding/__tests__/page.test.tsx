import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import OnboardingPage from '../page';

const replaceMock = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

const useAppMock = jest.fn();
jest.mock('@/app/providers', () => ({
  useApp: () => useAppMock(),
}));

jest.mock('@/components/layout/Navigation', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('@/components/ui/Loading', () => ({
  __esModule: true,
  default: ({ text }: { text?: string }) => <div>{text ?? 'Loading'}</div>,
}));

jest.mock('@/lib/id', () => ({
  createId: () => 'event_1',
}));

const renderPage = () => render(
  <MantineProvider>
    <OnboardingPage />
  </MantineProvider>,
);

describe('OnboardingPage', () => {
  beforeEach(() => {
    replaceMock.mockReset();
    useAppMock.mockReset();
    useAppMock.mockReturnValue({
      user: null,
      loading: false,
      isAuthenticated: false,
      isGuest: true,
      requiresEmailVerification: false,
      updateUser: jest.fn(),
    });
  });

  it('routes guest users without persisting a selection', async () => {
    const updateUser = jest.fn();
    useAppMock.mockReturnValue({
      user: null,
      loading: false,
      isAuthenticated: false,
      isGuest: true,
      requiresEmailVerification: false,
      updateUser,
    });

    renderPage();

    fireEvent.click(screen.getByText(/search for events to join/i).closest('button') as HTMLButtonElement);

    expect(updateUser).not.toHaveBeenCalled();
    expect(replaceMock).toHaveBeenCalledWith('/discover');
  });

  it('saves signed-in user selections once before routing', async () => {
    const updateUser = jest.fn().mockResolvedValue({
      $id: 'user_1',
      onboardingIntent: 'ORGANIZATION',
    });
    useAppMock.mockReturnValue({
      user: { $id: 'user_1', onboardingIntent: null },
      loading: false,
      isAuthenticated: true,
      isGuest: false,
      requiresEmailVerification: false,
      updateUser,
    });

    renderPage();

    fireEvent.click(screen.getByText(/create a facility or organization/i).closest('button') as HTMLButtonElement);

    await waitFor(() => {
      expect(updateUser).toHaveBeenCalledWith({ onboardingIntent: 'ORGANIZATION' });
    });
    expect(replaceMock).toHaveBeenCalledWith('/organizations');
  });

  it('routes individual creators to the create-event page', async () => {
    const updateUser = jest.fn().mockResolvedValue({
      $id: 'user_1',
      onboardingIntent: 'INDIVIDUAL_EVENTS',
    });
    useAppMock.mockReturnValue({
      user: { $id: 'user_1', onboardingIntent: null },
      loading: false,
      isAuthenticated: true,
      isGuest: false,
      requiresEmailVerification: false,
      updateUser,
    });

    renderPage();

    fireEvent.click(screen.getByText(/create events as an individual/i).closest('button') as HTMLButtonElement);

    await waitFor(() => {
      expect(updateUser).toHaveBeenCalledWith({ onboardingIntent: 'INDIVIDUAL_EVENTS' });
    });
    expect(replaceMock).toHaveBeenCalledWith('/events/event_1/schedule?create=1&mode=edit&tab=details');
  });

  it('does not ask again after a signed-in user has selected an intent', async () => {
    useAppMock.mockReturnValue({
      user: { $id: 'user_1', onboardingIntent: 'DISCOVER_EVENTS', homePageOrganizationId: null },
      loading: false,
      isAuthenticated: true,
      isGuest: false,
      requiresEmailVerification: false,
      updateUser: jest.fn(),
    });

    renderPage();

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/discover');
    });
  });

  it('warns signed-in unverified users that creation needs verification', () => {
    useAppMock.mockReturnValue({
      user: { $id: 'user_1', onboardingIntent: null },
      loading: false,
      isAuthenticated: true,
      isGuest: false,
      requiresEmailVerification: true,
      updateUser: jest.fn(),
    });

    renderPage();

    expect(screen.getByText(/creating events or organizations is available after email verification/i)).toBeInTheDocument();
  });
});
