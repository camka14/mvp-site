import { render } from '@testing-library/react';
import PostHogIdentity from '@/components/analytics/PostHogIdentity';
import { useApp } from '@/app/providers';
import { identifyUser, resetAnalytics } from '@/lib/analytics/posthogClient';

jest.mock('@/app/providers', () => ({
  useApp: jest.fn(),
}));

jest.mock('@/lib/analytics/posthogClient', () => ({
  identifyUser: jest.fn(),
  resetAnalytics: jest.fn(),
}));

const useAppMock = useApp as jest.MockedFunction<typeof useApp>;
const identifyUserMock = identifyUser as jest.MockedFunction<typeof identifyUser>;
const resetAnalyticsMock = resetAnalytics as jest.MockedFunction<typeof resetAnalytics>;

function mockAppState(overrides: Partial<ReturnType<typeof useApp>> = {}) {
  useAppMock.mockReturnValue({
    authUser: null,
    user: null,
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
    requiresEmailVerification: false,
    ...overrides,
  });
}

describe('PostHogIdentity', () => {
  it('identifies a signed-in web user with non-sensitive properties', () => {
    mockAppState({
      authUser: {
        $id: 'user_1',
        email: 'private@example.com',
        isAdmin: true,
        emailVerified: true,
      },
      isAuthenticated: true,
    });

    render(<PostHogIdentity />);

    expect(identifyUserMock).toHaveBeenCalledWith('user_1', {
      platform: 'web',
      is_admin: true,
      email_verified: true,
    });
    expect(JSON.stringify(identifyUserMock.mock.calls)).not.toContain('private@example.com');
  });

  it('does not identify while auth state is loading', () => {
    mockAppState({
      loading: true,
      authUser: { $id: 'user_1', email: 'private@example.com' },
    });

    render(<PostHogIdentity />);

    expect(identifyUserMock).not.toHaveBeenCalled();
  });

  it('resets analytics when an identified user signs out', () => {
    mockAppState({
      authUser: { $id: 'user_1', email: 'private@example.com' },
      isAuthenticated: true,
    });

    const { rerender } = render(<PostHogIdentity />);
    expect(identifyUserMock).toHaveBeenCalledTimes(1);

    mockAppState({
      authUser: null,
      isAuthenticated: false,
      isGuest: true,
    });
    rerender(<PostHogIdentity />);

    expect(resetAnalyticsMock).toHaveBeenCalledTimes(1);
  });

  it('does not identify the same user repeatedly across rerenders', () => {
    mockAppState({
      authUser: { $id: 'user_1', email: 'private@example.com' },
      isAuthenticated: true,
    });

    const { rerender } = render(<PostHogIdentity />);
    rerender(<PostHogIdentity />);

    expect(identifyUserMock).toHaveBeenCalledTimes(1);
  });
});
