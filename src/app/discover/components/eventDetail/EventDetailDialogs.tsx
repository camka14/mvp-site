import {
    Alert,
    Button,
    Group,
    Modal,
    PasswordInput,
    Stack,
    Text,
    TextInput,
} from '@mantine/core';

import type { UserData } from '@/types';
import { getUserFullName, getUserHandle } from '@/types';
import type {
    InlineEventAuthForm,
    InlineEventAuthMode,
} from './hooks/useInlineEventAuthController';

const EVENT_DETAIL_DIALOG_Z_INDEX = 2000;

type InlineEventAuthDialogProps = {
    opened: boolean;
    mode: InlineEventAuthMode;
    form: InlineEventAuthForm;
    loading: boolean;
    error: string;
    maxDateOfBirth: string;
    verificationEmail: string;
    verificationMessage: string;
    verificationMessageType: 'info' | 'success';
    resendingVerification: boolean;
    onFieldChange: (field: keyof InlineEventAuthForm, value: string) => void;
    onToggleMode: () => void;
    onResendVerification: () => void | Promise<void>;
    onContinueWithGoogle: () => void | Promise<void>;
    onSubmit: () => void | Promise<void>;
    onClose: () => void;
};

export function InlineEventAuthDialog({
    opened,
    mode,
    form,
    loading,
    error,
    maxDateOfBirth,
    verificationEmail,
    verificationMessage,
    verificationMessageType,
    resendingVerification,
    onFieldChange,
    onToggleMode,
    onResendVerification,
    onContinueWithGoogle,
    onSubmit,
    onClose,
}: InlineEventAuthDialogProps) {
    return (
        <Modal
            opened={opened}
            onClose={onClose}
            centered
            title={mode === 'login' ? 'Sign in to register' : 'Create account'}
            zIndex={EVENT_DETAIL_DIALOG_Z_INDEX}
        >
            <form
                onSubmit={(event) => {
                    event.preventDefault();
                    void onSubmit();
                }}
            >
                <Stack gap="sm">
                    <Text size="sm" c="dimmed">
                        {mode === 'login'
                            ? 'Sign in to continue with registration.'
                            : 'Create an account to continue with registration.'}
                    </Text>
                    {mode === 'signup' ? (
                        <>
                            <TextInput
                                label="First name"
                                value={form.firstName}
                                onChange={(event) => onFieldChange('firstName', event.currentTarget.value)}
                                required
                            />
                            <TextInput
                                label="Last name"
                                value={form.lastName}
                                onChange={(event) => onFieldChange('lastName', event.currentTarget.value)}
                                required
                            />
                            <TextInput
                                label="Username"
                                value={form.userName}
                                onChange={(event) => onFieldChange('userName', event.currentTarget.value)}
                                required
                            />
                            <TextInput
                                label="Date of birth"
                                type="date"
                                value={form.dateOfBirth}
                                onChange={(event) => onFieldChange('dateOfBirth', event.currentTarget.value)}
                                max={maxDateOfBirth}
                                required
                            />
                        </>
                    ) : null}
                    <TextInput
                        label="Email address"
                        type="email"
                        value={form.email}
                        onChange={(event) => onFieldChange('email', event.currentTarget.value)}
                        required
                    />
                    <PasswordInput
                        label="Password"
                        value={form.password}
                        onChange={(event) => onFieldChange('password', event.currentTarget.value)}
                        required
                        minLength={8}
                    />
                    {verificationMessage ? (
                        <Alert color={verificationMessageType === 'success' ? 'green' : 'yellow'} variant="light">
                            <Text size="sm">{verificationMessage}</Text>
                            {verificationEmail ? (
                                <Button
                                    type="button"
                                    variant="subtle"
                                    size="compact-sm"
                                    mt="xs"
                                    loading={resendingVerification}
                                    onClick={() => { void onResendVerification(); }}
                                >
                                    Resend verification email
                                </Button>
                            ) : null}
                        </Alert>
                    ) : null}
                    {error ? (
                        <Alert color="red" variant="light">
                            {error}
                        </Alert>
                    ) : null}
                    <Button type="submit" fullWidth loading={loading}>
                        {mode === 'login' ? 'Sign in' : 'Create account'}
                    </Button>
                    <Button type="button" variant="subtle" onClick={onToggleMode}>
                        {mode === 'login'
                            ? "Don't have an account? Sign up"
                            : 'Already have an account? Sign in'}
                    </Button>
                    <Group gap="xs" align="center" wrap="nowrap">
                        <div className="h-px flex-1 bg-gray-200" />
                        <Text size="xs" c="dimmed">or</Text>
                        <div className="h-px flex-1 bg-gray-200" />
                    </Group>
                    <Button
                        type="button"
                        fullWidth
                        variant="default"
                        onClick={() => { void onContinueWithGoogle(); }}
                        disabled={loading}
                    >
                        Continue with Google
                    </Button>
                </Stack>
            </form>
        </Modal>
    );
}

type FreeAgentActionsDialogProps = {
    user: UserData | null;
    eventId: string | null;
    onInvite: () => void;
    onClose: () => void;
};

export function FreeAgentActionsDialog({
    user,
    eventId,
    onInvite,
    onClose,
}: FreeAgentActionsDialogProps) {
    const handle = user ? getUserHandle(user) : '';

    return (
        <Modal
            opened={Boolean(user)}
            onClose={onClose}
            centered
            title={user ? getUserFullName(user) : 'Free Agent Actions'}
            zIndex={EVENT_DETAIL_DIALOG_Z_INDEX}
        >
            <Stack gap="sm">
                {handle ? (
                    <Text size="sm" c="dimmed">{handle}</Text>
                ) : null}
                <Button onClick={onInvite} disabled={!user || !eventId}>
                    Invite to Team
                </Button>
                <Button variant="default" onClick={onClose}>
                    Close
                </Button>
            </Stack>
        </Modal>
    );
}
