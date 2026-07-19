import { fireEvent, screen } from '@testing-library/react';

import OrganizationsPage from '../page';
import { renderWithMantine } from '../../../../test/utils/renderWithMantine';

const pushMock = jest.fn();
const replaceMock = jest.fn();
const searchParamsGetMock = jest.fn();
const createOrganizationModalPropsMock = jest.fn();
const useAppMock = jest.fn();
const getOrganizationsByUserMock = jest.fn();
const getOrganizationsByIdsMock = jest.fn();
const listInvitesMock = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
  useSearchParams: () => ({ get: searchParamsGetMock }),
}));

jest.mock('@/app/providers', () => ({
  useApp: () => useAppMock(),
}));

jest.mock('@/components/layout/Navigation', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('@/components/ui/CreateOrganizationModal', () => ({
  __esModule: true,
  default: (props: { isOpen: boolean }) => {
    createOrganizationModalPropsMock(props);
    return props.isOpen ? <div data-testid="create-organization-modal" /> : null;
  },
}));

jest.mock('@/lib/organizationService', () => ({
  organizationService: {
    getOrganizationsByUser: (...args: unknown[]) => getOrganizationsByUserMock(...args),
    getOrganizationsByIds: (...args: unknown[]) => getOrganizationsByIdsMock(...args),
  },
}));

jest.mock('@/lib/userService', () => ({
  userService: {
    listInvites: (...args: unknown[]) => listInvitesMock(...args),
    acceptInvite: jest.fn(),
    declineInvite: jest.fn(),
  },
}));

const verifiedUserContext = () => ({
  user: { $id: 'user_1', firstName: 'Taylor', lastName: 'Host' },
  authUser: {
    $id: 'user_1',
    email: 'host@example.com',
    emailVerified: true,
    emailVerifiedAt: '2026-01-01T00:00:00.000Z',
  },
  loading: false,
  isGuest: false,
  isAuthenticated: true,
  requiresEmailVerification: false,
});

const renderPage = () => renderWithMantine(<OrganizationsPage />);

describe('OrganizationsPage', () => {
  beforeEach(() => {
    pushMock.mockReset();
    replaceMock.mockReset();
    searchParamsGetMock.mockReset().mockReturnValue(null);
    createOrganizationModalPropsMock.mockReset();
    useAppMock.mockReset();
    getOrganizationsByUserMock.mockReset();
    getOrganizationsByIdsMock.mockReset();
    listInvitesMock.mockReset();
    getOrganizationsByUserMock.mockReturnValue(new Promise(() => undefined));
    getOrganizationsByIdsMock.mockResolvedValue([]);
    listInvitesMock.mockReturnValue(new Promise(() => undefined));
    useAppMock.mockReturnValue(verifiedUserContext());
  });

  it('blocks unverified users from opening the create organization modal', () => {
    useAppMock.mockReturnValue({
      ...verifiedUserContext(),
      authUser: {
        $id: 'user_1',
        email: 'host@example.com',
        emailVerified: false,
        emailVerifiedAt: null,
      },
      requiresEmailVerification: true,
    });

    renderPage();

    const headerCreateButton = screen.getByRole('button', { name: /\+ create organization/i });
    expect(headerCreateButton).toBeDisabled();
    expect(headerCreateButton).toHaveAttribute('title', 'Verify your email before creating an organization.');

    fireEvent.click(headerCreateButton);
    expect(screen.queryByTestId('create-organization-modal')).not.toBeInTheDocument();
  });

  it('allows verified users to open the create organization modal', () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /\+ create organization/i }));

    expect(screen.getByTestId('create-organization-modal')).toBeInTheDocument();
  });

  it('opens club creation with club and event tools plus the Club tag preset', () => {
    searchParamsGetMock.mockImplementation((name: string) => {
      if (name === 'create') return '1';
      if (name === 'preset') return 'club';
      return null;
    });

    renderPage();

    expect(screen.getByTestId('create-organization-modal')).toBeInTheDocument();
    expect(createOrganizationModalPropsMock).toHaveBeenLastCalledWith(expect.objectContaining({
      initialFeatures: ['CLUB_TEAMS', 'EVENT_MANAGEMENT'],
      initialTagSlugs: ['club'],
    }));
  });

  it('lets guests view the page and prompts account creation before creating an organization', async () => {
    useAppMock.mockReturnValue({
      user: null,
      authUser: null,
      loading: false,
      isGuest: true,
      isAuthenticated: false,
      requiresEmailVerification: false,
    });

    renderPage();

    expect(pushMock).not.toHaveBeenCalledWith('/login');
    fireEvent.click(screen.getByRole('button', { name: /\+ create organization/i }));

    expect(await screen.findByRole('dialog', { name: /create an account first/i })).toBeInTheDocument();
    expect(screen.getByText(/create an account to create and manage an organization/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^create account$/i }));

    expect(pushMock).toHaveBeenCalledWith(
      '/login?mode=signup&onboardingIntent=ORGANIZATION&next=%2Forganizations%3Fcreate%3D1',
    );
    expect(screen.queryByTestId('create-organization-modal')).not.toBeInTheDocument();
  });
});
