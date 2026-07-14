import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError, authService } from '@/lib/auth';

export type InlineEventAuthMode = 'login' | 'signup';

export type InlineEventAuthForm = {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    userName: string;
    dateOfBirth: string;
};

type UseInlineEventAuthControllerOptions = {
    refreshSession: () => Promise<void>;
    onAuthenticated: () => void;
    onSignedIn: () => void;
    onProfileCompletionRequired: () => void;
};

const emptyInlineEventAuthForm: InlineEventAuthForm = {
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    userName: '',
    dateOfBirth: '',
};

export function useInlineEventAuthController({
    refreshSession,
    onAuthenticated,
    onSignedIn,
    onProfileCompletionRequired,
}: UseInlineEventAuthControllerOptions) {
    const [opened, setOpened] = useState(false);
    const [mode, setMode] = useState<InlineEventAuthMode>('login');
    const [form, setForm] = useState<InlineEventAuthForm>(emptyInlineEventAuthForm);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [verificationEmail, setVerificationEmail] = useState('');
    const [verificationMessage, setVerificationMessage] = useState('');
    const [verificationMessageType, setVerificationMessageType] = useState<'info' | 'success'>('info');
    const [resendingVerification, setResendingVerification] = useState(false);
    const mountedRef = useRef(true);
    const requestGenerationRef = useRef(0);
    const resendGenerationRef = useRef(0);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            requestGenerationRef.current += 1;
            resendGenerationRef.current += 1;
        };
    }, []);

    const resetFeedback = useCallback(() => {
        setError('');
        setVerificationEmail('');
        setVerificationMessage('');
    }, []);

    const invalidatePendingRequests = useCallback(() => {
        requestGenerationRef.current += 1;
        resendGenerationRef.current += 1;
        setLoading(false);
        setResendingVerification(false);
    }, []);

    const open = useCallback(() => {
        invalidatePendingRequests();
        setMode('login');
        resetFeedback();
        setOpened(true);
    }, [invalidatePendingRequests, resetFeedback]);

    const close = useCallback(() => {
        invalidatePendingRequests();
        setOpened(false);
    }, [invalidatePendingRequests]);

    const toggleMode = useCallback(() => {
        invalidatePendingRequests();
        setMode((previous) => (previous === 'login' ? 'signup' : 'login'));
        resetFeedback();
    }, [invalidatePendingRequests, resetFeedback]);

    const updateField = useCallback((field: keyof InlineEventAuthForm, value: string) => {
        setForm((previous) => ({ ...previous, [field]: value }));
    }, []);

    const submit = useCallback(async () => {
        const requestGeneration = requestGenerationRef.current + 1;
        requestGenerationRef.current = requestGeneration;
        resendGenerationRef.current += 1;
        setResendingVerification(false);
        setLoading(true);
        resetFeedback();

        const isCurrentRequest = () => (
            mountedRef.current
            && requestGenerationRef.current === requestGeneration
        );

        try {
            if (
                mode === 'signup'
                && (!form.firstName || !form.lastName || !form.userName || !form.dateOfBirth)
            ) {
                throw new Error('Please provide first name, last name, username, and date of birth.');
            }

            const authResult = mode === 'login'
                ? await authService.login(form.email, form.password)
                : await authService.createAccount(
                    form.email,
                    form.password,
                    form.firstName,
                    form.lastName,
                    form.userName,
                    form.dateOfBirth,
                );

            if (!isCurrentRequest()) {
                return;
            }
            await refreshSession();
            if (!isCurrentRequest()) {
                return;
            }

            setOpened(false);
            setForm(emptyInlineEventAuthForm);
            onAuthenticated();

            if (authResult.requiresProfileCompletion) {
                onProfileCompletionRequired();
                return;
            }

            onSignedIn();
        } catch (caughtError) {
            if (!isCurrentRequest()) {
                return;
            }
            if (caughtError instanceof ApiError && caughtError.code === 'EMAIL_NOT_VERIFIED') {
                const pendingEmail = caughtError.email || form.email.trim().toLowerCase();
                setVerificationEmail(pendingEmail);
                setVerificationMessage(caughtError.message || 'Please verify your email before signing in.');
                setVerificationMessageType('info');
                setError('');
                return;
            }
            setError(caughtError instanceof Error ? caughtError.message : 'Authentication failed.');
        } finally {
            if (isCurrentRequest()) {
                setLoading(false);
            }
        }
    }, [form, mode, onAuthenticated, onProfileCompletionRequired, onSignedIn, refreshSession, resetFeedback]);

    const resendVerification = useCallback(async () => {
        if (!verificationEmail) {
            return;
        }
        const resendGeneration = resendGenerationRef.current + 1;
        resendGenerationRef.current = resendGeneration;
        setResendingVerification(true);
        setError('');

        const isCurrentRequest = () => (
            mountedRef.current
            && resendGenerationRef.current === resendGeneration
        );

        try {
            await authService.resendVerification(verificationEmail);
            if (!isCurrentRequest()) {
                return;
            }
            setVerificationMessage(`Verification email sent to ${verificationEmail}.`);
            setVerificationMessageType('info');
        } catch (caughtError) {
            if (isCurrentRequest()) {
                setError(caughtError instanceof Error ? caughtError.message : 'Failed to resend verification email.');
            }
        } finally {
            if (isCurrentRequest()) {
                setResendingVerification(false);
            }
        }
    }, [verificationEmail]);

    const continueWithGoogle = useCallback(async () => {
        const requestGeneration = requestGenerationRef.current + 1;
        requestGenerationRef.current = requestGeneration;
        setError('');
        try {
            await authService.oauthLoginWithGoogle();
        } catch (caughtError) {
            if (mountedRef.current && requestGenerationRef.current === requestGeneration) {
                setError(caughtError instanceof Error
                    ? caughtError.message
                    : 'Google sign-in failed. Please try again.');
            }
        }
    }, []);

    return {
        opened,
        mode,
        form,
        loading,
        error,
        verificationEmail,
        verificationMessage,
        verificationMessageType,
        resendingVerification,
        open,
        close,
        toggleMode,
        updateField,
        submit,
        resendVerification,
        continueWithGoogle,
    };
}
