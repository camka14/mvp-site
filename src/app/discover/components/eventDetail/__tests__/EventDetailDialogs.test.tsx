import { fireEvent, screen } from '@testing-library/react';

import { renderWithMantine } from '../../../../../../test/utils/renderWithMantine';
import { FreeAgentActionsDialog, InlineEventAuthDialog } from '../EventDetailDialogs';

const authForm = {
    email: 'player@test.com',
    password: 'password123',
    firstName: 'Taylor',
    lastName: 'Morgan',
    userName: 'taylormorgan',
    dateOfBirth: '1995-06-15',
};

describe('EventDetailDialogs', () => {
    it('forwards inline login fields and actions to the auth controller', () => {
        const onFieldChange = jest.fn();
        const onSubmit = jest.fn();
        const onToggleMode = jest.fn();
        const onContinueWithGoogle = jest.fn();

        renderWithMantine(
            <InlineEventAuthDialog
                opened
                mode="login"
                form={authForm}
                loading={false}
                error=""
                maxDateOfBirth="2026-07-14"
                verificationEmail=""
                verificationMessage=""
                verificationMessageType="info"
                resendingVerification={false}
                onFieldChange={onFieldChange}
                onToggleMode={onToggleMode}
                onResendVerification={jest.fn()}
                onContinueWithGoogle={onContinueWithGoogle}
                onSubmit={onSubmit}
                onClose={jest.fn()}
            />,
        );

        fireEvent.change(screen.getByLabelText(/Email address/), {
            target: { value: 'next@test.com' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
        fireEvent.click(screen.getByRole('button', { name: /Don't have an account/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));

        expect(onFieldChange).toHaveBeenCalledWith('email', 'next@test.com');
        expect(onSubmit).toHaveBeenCalledTimes(1);
        expect(onToggleMode).toHaveBeenCalledTimes(1);
        expect(onContinueWithGoogle).toHaveBeenCalledTimes(1);
    });

    it('renders signup identity fields and verification resend feedback', () => {
        const onResendVerification = jest.fn();

        renderWithMantine(
            <InlineEventAuthDialog
                opened
                mode="signup"
                form={authForm}
                loading={false}
                error=""
                maxDateOfBirth="2026-07-14"
                verificationEmail="player@test.com"
                verificationMessage="Verify your email before continuing."
                verificationMessageType="info"
                resendingVerification={false}
                onFieldChange={jest.fn()}
                onToggleMode={jest.fn()}
                onResendVerification={onResendVerification}
                onContinueWithGoogle={jest.fn()}
                onSubmit={jest.fn()}
                onClose={jest.fn()}
            />,
        );

        expect(screen.getByLabelText(/First name/)).toBeInTheDocument();
        expect(screen.getByLabelText(/Date of birth/)).toHaveAttribute('max', '2026-07-14');
        expect(screen.getByText('Verify your email before continuing.')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Resend verification email' }));
        expect(onResendVerification).toHaveBeenCalledTimes(1);
    });

    it('renders free-agent identity and forwards invite and close actions', () => {
        const onInvite = jest.fn();
        const onClose = jest.fn();

        renderWithMantine(
            <FreeAgentActionsDialog
                user={{
                    $id: 'user_1',
                    firstName: 'Jordan',
                    lastName: 'Lee',
                    userName: 'jordanlee',
                }}
                eventId="event_1"
                onInvite={onInvite}
                onClose={onClose}
            />,
        );

        expect(screen.getByRole('heading', { name: 'Jordan Lee' })).toBeInTheDocument();
        expect(screen.getByText('@jordanlee')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Invite to Team' }));
        fireEvent.click(screen.getByRole('button', { name: 'Close' }));
        expect(onInvite).toHaveBeenCalledTimes(1);
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
