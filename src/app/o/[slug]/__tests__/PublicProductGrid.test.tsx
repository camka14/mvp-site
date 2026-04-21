import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';

const pushMock = jest.fn();
const createProductPaymentIntentMock = jest.fn();
const createSubscriptionCheckoutMock = jest.fn();
const showNotificationMock = jest.fn();
const oauthLoginWithGoogleMock = jest.fn();
const loginMock = jest.fn();
const createAccountMock = jest.fn();
const resendVerificationMock = jest.fn();
const mockUseApp = jest.fn();

jest.mock('@mantine/core', () => {
  const actual = jest.requireActual('@mantine/core');
  return {
    ...actual,
    Modal: ({ opened, title, children }: any) => (opened ? (
      <div>
        <div>{title}</div>
        {children}
      </div>
    ) : null),
  };
});

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

jest.mock('../PublicOrganizationPage.module.css', () => new Proxy({}, {
  get: (_target, property) => String(property),
}));

jest.mock('@/app/providers', () => ({
  useApp: () => mockUseApp(),
}));

jest.mock('@/components/ui/BillingAddressModal', () => () => null);
jest.mock('@/components/ui/PaymentModal', () => ({
  __esModule: true,
  default: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <div>Payment modal</div> : null),
}));

jest.mock('@mantine/notifications', () => ({
  notifications: {
    show: (...args: any[]) => showNotificationMock(...args),
  },
}));

jest.mock('@/lib/paymentService', () => ({
  paymentService: {
    createProductPaymentIntent: (...args: any[]) => createProductPaymentIntentMock(...args),
  },
}));

jest.mock('@/lib/productService', () => ({
  productService: {
    createSubscriptionCheckout: (...args: any[]) => createSubscriptionCheckoutMock(...args),
  },
}));

jest.mock('@/lib/auth', () => {
  const actual = jest.requireActual('@/lib/auth');
  return {
    ...actual,
    authService: {
      ...actual.authService,
      oauthLoginWithGoogle: (...args: any[]) => oauthLoginWithGoogleMock(...args),
      login: (...args: any[]) => loginMock(...args),
      createAccount: (...args: any[]) => createAccountMock(...args),
      resendVerification: (...args: any[]) => resendVerificationMock(...args),
    },
  };
});

import PublicProductGrid from '../PublicProductGrid';

const organization = {
  id: 'org_1',
  slug: 'summit',
  name: 'Summit Indoor Volleyball Facility',
  description: null,
  location: 'Seattle',
  website: null,
  logoUrl: '/logo.png',
  sports: ['Indoor Volleyball'],
  brandPrimaryColor: '#0f766e',
  brandAccentColor: '#f59e0b',
  publicHeadline: 'Play here',
  publicIntroText: 'Welcome',
  publicPageEnabled: true,
  publicWidgetsEnabled: true,
  publicCompletionRedirectUrl: null,
} as const;

const membershipProduct = {
  id: 'prod_membership',
  name: 'Monthly Membership',
  description: 'Access every week.',
  priceCents: 4900,
  period: 'month',
  detailsUrl: '/o/summit/products/prod_membership',
};

describe('PublicProductGrid', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseApp.mockReturnValue({
      user: null,
      authUser: null,
      loading: false,
      setUser: jest.fn(),
      setAuthUser: jest.fn(),
      updateUser: jest.fn(),
      refreshUser: jest.fn(),
      refreshSession: jest.fn(),
      isGuest: false,
      isAuthenticated: false,
      requiresProfileCompletion: false,
      missingProfileFields: [],
    });
    createProductPaymentIntentMock.mockResolvedValue({ paymentIntent: 'pi_single' });
    createSubscriptionCheckoutMock.mockResolvedValue({ paymentIntent: 'pi_subscription' });
  });

  it('shows registration required for guests and opens the auth modal from the public page', async () => {
    const user = userEvent.setup();

    render(
      <MantineProvider>
        <PublicProductGrid
          slug="summit"
          organization={organization}
          products={[membershipProduct]}
        />
      </MantineProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Registration required' }));

    expect(screen.getByText('Create account to purchase')).toBeInTheDocument();
    expect(createSubscriptionCheckoutMock).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('starts checkout immediately for signed-in users instead of redirecting to a product page', async () => {
    const user = userEvent.setup();
    mockUseApp.mockReturnValue({
      user: { $id: 'user_1', firstName: 'Sam', lastName: 'User' },
      authUser: { $id: 'user_1', email: 'sam@example.com' },
      loading: false,
      setUser: jest.fn(),
      setAuthUser: jest.fn(),
      updateUser: jest.fn(),
      refreshUser: jest.fn(),
      refreshSession: jest.fn(),
      isGuest: false,
      isAuthenticated: true,
      requiresProfileCompletion: false,
      missingProfileFields: [],
    });

    render(
      <MantineProvider>
        <PublicProductGrid
          slug="summit"
          organization={organization}
          products={[membershipProduct]}
        />
      </MantineProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Buy now' }));

    await waitFor(() => {
      expect(createSubscriptionCheckoutMock).toHaveBeenCalledWith({ productId: 'prod_membership', billingAddress: undefined });
    });
    expect(screen.getByText('Payment modal')).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });
});
