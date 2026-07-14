import { act, renderHook } from '@testing-library/react';

jest.mock('@/lib/auth', () => {
    const actual = jest.requireActual('@/lib/auth');
    return {
        ...actual,
        authService: {
            login: jest.fn(),
            createAccount: jest.fn(),
            resendVerification: jest.fn(),
            oauthLoginWithGoogle: jest.fn(),
        },
    };
});

import { ApiError, authService } from '@/lib/auth';
import { useInlineEventAuthController } from '../useInlineEventAuthController';

const successfulAuthResult = {
    requiresProfileCompletion: false,
};

function createDeferred<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
}

function createOptions() {
    return {
        refreshSession: jest.fn().mockResolvedValue(undefined),
        onAuthenticated: jest.fn(),
        onSignedIn: jest.fn(),
        onProfileCompletionRequired: jest.fn(),
    };
}

describe('useInlineEventAuthController', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (authService.login as jest.Mock).mockResolvedValue(successfulAuthResult);
        (authService.createAccount as jest.Mock).mockResolvedValue(successfulAuthResult);
        (authService.resendVerification as jest.Mock).mockResolvedValue(undefined);
        (authService.oauthLoginWithGoogle as jest.Mock).mockResolvedValue(undefined);
    });

    it('owns modal mode, form state, and signup validation feedback', async () => {
        const options = createOptions();
        const { result } = renderHook(() => useInlineEventAuthController(options));

        act(() => {
            result.current.open();
            result.current.toggleMode();
            result.current.updateField('email', 'new-user@example.com');
            result.current.updateField('password', 'secret');
        });

        expect(result.current.opened).toBe(true);
        expect(result.current.mode).toBe('signup');
        expect(result.current.form.email).toBe('new-user@example.com');

        await act(async () => {
            await result.current.submit();
        });

        expect(result.current.error).toBe('Please provide first name, last name, username, and date of birth.');
        expect(authService.createAccount).not.toHaveBeenCalled();
        expect(result.current.opened).toBe(true);
    });

    it('refreshes the session and closes after a successful login', async () => {
        const options = createOptions();
        const { result } = renderHook(() => useInlineEventAuthController(options));

        act(() => {
            result.current.open();
            result.current.updateField('email', 'player@example.com');
            result.current.updateField('password', 'secret');
        });
        await act(async () => {
            await result.current.submit();
        });

        expect(authService.login).toHaveBeenCalledWith('player@example.com', 'secret');
        expect(options.refreshSession).toHaveBeenCalledTimes(1);
        expect(options.onAuthenticated).toHaveBeenCalledTimes(1);
        expect(options.onSignedIn).toHaveBeenCalledTimes(1);
        expect(options.onProfileCompletionRequired).not.toHaveBeenCalled();
        expect(result.current.opened).toBe(false);
        expect(result.current.form.email).toBe('');
        expect(result.current.loading).toBe(false);
    });

    it('retains verification context and can resend the verification email', async () => {
        const options = createOptions();
        (authService.login as jest.Mock).mockRejectedValue(new ApiError(
            'Verify your email before signing in.',
            403,
            { code: 'EMAIL_NOT_VERIFIED', email: 'pending@example.com' },
        ));
        const { result } = renderHook(() => useInlineEventAuthController(options));

        act(() => {
            result.current.open();
            result.current.updateField('email', 'PENDING@example.com');
            result.current.updateField('password', 'secret');
        });
        await act(async () => {
            await result.current.submit();
        });

        expect(result.current.verificationEmail).toBe('pending@example.com');
        expect(result.current.verificationMessage).toBe('Verify your email before signing in.');
        expect(result.current.error).toBe('');

        await act(async () => {
            await result.current.resendVerification();
        });

        expect(authService.resendVerification).toHaveBeenCalledWith('pending@example.com');
        expect(result.current.verificationMessage).toBe('Verification email sent to pending@example.com.');
        expect(result.current.resendingVerification).toBe(false);
    });

    it('ignores a deferred login result after the controller unmounts', async () => {
        const options = createOptions();
        const deferredLogin = createDeferred<typeof successfulAuthResult>();
        (authService.login as jest.Mock).mockReturnValue(deferredLogin.promise);
        const { result, unmount } = renderHook(() => useInlineEventAuthController(options));

        act(() => {
            result.current.open();
            result.current.updateField('email', 'player@example.com');
            result.current.updateField('password', 'secret');
        });
        let submission!: Promise<void>;
        act(() => {
            submission = result.current.submit();
        });
        expect(authService.login).toHaveBeenCalledTimes(1);

        unmount();
        await act(async () => {
            deferredLogin.resolve(successfulAuthResult);
            await submission;
        });

        expect(options.refreshSession).not.toHaveBeenCalled();
        expect(options.onAuthenticated).not.toHaveBeenCalled();
        expect(options.onSignedIn).not.toHaveBeenCalled();
    });
});
