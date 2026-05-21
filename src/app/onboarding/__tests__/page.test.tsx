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

const mockGetOrganizationsByUser = jest.fn();
const mockGetOrganizationsByIds = jest.fn();
jest.mock('@/lib/organizationService', () => ({
  organizationService: {
    getOrganizationsByUser: (...args: any[]) => mockGetOrganizationsByUser(...args),
    getOrganizationsByIds: (...args: any[]) => mockGetOrganizationsByIds(...args),
  },
}));

const mockListInvites = jest.fn();
const mockAcceptInvite = jest.fn();
jest.mock('@/lib/userService', () => ({
  userService: {
    listInvites: (...args: any[]) => mockListInvites(...args),
    acceptInvite: (...args: any[]) => mockAcceptInvite(...args),
  },
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
    mockGetOrganizationsByUser.mockReset();
    mockGetOrganizationsByIds.mockReset();
    mockListInvites.mockReset();
    mockAcceptInvite.mockReset();
    mockGetOrganizationsByUser.mockResolvedValue([]);
    mockGetOrganizationsByIds.mockResolvedValue([]);
    mockListInvites.mockResolvedValue([]);
    mockAcceptInvite.mockResolvedValue(true);
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

    const optionButton = screen.getByText(/create a facility or organization/i).closest('button') as HTMLButtonElement;
    await waitFor(() => {
      expect(mockGetOrganizationsByUser).toHaveBeenCalledWith('user_1');
      expect(optionButton).not.toBeDisabled();
    });
    fireEvent.click(optionButton);

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

    const optionButton = screen.getByText(/create events as an individual/i).closest('button') as HTMLButtonElement;
    await waitFor(() => {
      expect(mockGetOrganizationsByUser).toHaveBeenCalledWith('user_1');
      expect(optionButton).not.toBeDisabled();
    });
    fireEvent.click(optionButton);

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

  it('warns signed-in unverified users that creation needs verification', async () => {
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
    await waitFor(() => {
      expect(screen.getByText(/create a facility or organization/i).closest('button')).not.toBeDisabled();
    });
  });

  it('asks organization users for privacy and saves their home organization', async () => {
    const updateUser = jest.fn().mockResolvedValue({
      $id: 'user_1',
      onboardingIntent: 'DISCOVER_EVENTS',
      accountVisibility: 'PRIVATE_TO_ORGS',
      homePageOrganizationId: 'org_1',
    });
    mockGetOrganizationsByUser.mockResolvedValue([{ $id: 'org_1', name: 'Main Facility' }]);
    useAppMock.mockReturnValue({
      user: { $id: 'user_1', onboardingIntent: null, homePageOrganizationId: null },
      loading: false,
      isAuthenticated: true,
      isGuest: false,
      requiresEmailVerification: false,
      updateUser,
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/account visibility/i)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByLabelText(/private account/i));
    fireEvent.click(screen.getByText(/search for events to join/i).closest('button') as HTMLButtonElement);

    await waitFor(() => {
      expect(updateUser).toHaveBeenCalledWith({
        onboardingIntent: 'DISCOVER_EVENTS',
        accountVisibility: 'PRIVATE_TO_ORGS',
        homePageOrganizationId: 'org_1',
      });
    });
    expect(replaceMock).toHaveBeenCalledWith('/discover');
  });

  it('accepts a pending organization invite and routes to the organization page', async () => {
    const updateUser = jest.fn().mockResolvedValue({
      $id: 'user_1',
      onboardingIntent: 'ORGANIZATION',
      accountVisibility: 'PUBLIC',
      homePageOrganizationId: 'org_1',
    });
    mockGetOrganizationsByUser.mockResolvedValue([{ $id: 'org_1', name: 'Razumly', logoId: 'file_1' }]);
    mockListInvites.mockResolvedValue([{
      $id: 'invite_1',
      type: 'STAFF',
      status: 'PENDING',
      organizationId: 'org_1',
      userId: 'user_1',
    }]);
    useAppMock.mockReturnValue({
      user: { $id: 'user_1', onboardingIntent: null, homePageOrganizationId: null },
      loading: false,
      isAuthenticated: true,
      isGuest: false,
      requiresEmailVerification: false,
      updateUser,
    });

    renderPage();

    const inviteButton = await screen.findByText(/accept razumly invite/i);
    fireEvent.click(inviteButton.closest('button') as HTMLButtonElement);

    await waitFor(() => {
      expect(mockAcceptInvite).toHaveBeenCalledWith('invite_1');
      expect(updateUser).toHaveBeenCalledWith({
        onboardingIntent: 'ORGANIZATION',
        accountVisibility: 'PUBLIC',
        homePageOrganizationId: 'org_1',
      });
    });
    expect(replaceMock).toHaveBeenCalledWith('/organizations/org_1');
  });

  it('does not set a pending invite organization as home from a generic option', async () => {
    const updateUser = jest.fn().mockResolvedValue({
      $id: 'user_1',
      onboardingIntent: 'DISCOVER_EVENTS',
      accountVisibility: 'PUBLIC',
    });
    mockGetOrganizationsByUser.mockResolvedValue([{ $id: 'org_1', name: 'Razumly' }]);
    mockListInvites.mockResolvedValue([{
      $id: 'invite_1',
      type: 'STAFF',
      status: 'PENDING',
      organizationId: 'org_1',
      userId: 'user_1',
    }]);
    useAppMock.mockReturnValue({
      user: { $id: 'user_1', onboardingIntent: null, homePageOrganizationId: null },
      loading: false,
      isAuthenticated: true,
      isGuest: false,
      requiresEmailVerification: false,
      updateUser,
    });

    renderPage();

    await screen.findByText(/accept razumly invite/i);
    fireEvent.click(screen.getByText(/search for events to join/i).closest('button') as HTMLButtonElement);

    await waitFor(() => {
      expect(mockAcceptInvite).not.toHaveBeenCalled();
      expect(updateUser).toHaveBeenCalledWith({
        onboardingIntent: 'DISCOVER_EVENTS',
        accountVisibility: 'PUBLIC',
      });
    });
    expect(replaceMock).toHaveBeenCalledWith('/discover');
  });
});
