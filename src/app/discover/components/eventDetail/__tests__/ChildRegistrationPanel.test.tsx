import { fireEvent, screen } from '@testing-library/react';

import { renderWithMantine } from '../../../../../../test/utils/renderWithMantine';
import type { ConsentLinks, EventRegistration } from '@/lib/registrationService';

import { ChildRegistrationPanel } from '../ChildRegistrationPanel';

const baseProps = {
    visible: true,
    isTeamSignup: false,
    waitlistMode: false,
    childrenError: null,
    childrenLoading: false,
    childOptions: [{ value: 'child_1', label: 'Jordan Lee (14y at event)' }],
    selectedChildId: 'child_1',
    selectedChildPresent: true,
    selectedChildHasEmail: true,
    selectedChildEligible: true,
    selectedChildIsFreeAgent: false,
    selectedChildIsWaitlisted: false,
    selectedChildIsRegistered: false,
    joiningChildFreeAgent: false,
    registeringChild: false,
    canRegisterChild: true,
    weeklySelectionRequired: false,
    isDivisionSelectionMissing: false,
    hasAgeLimits: true,
    eventMinAge: 12,
    eventMaxAge: 17,
    showRegistrationStatus: false,
    registration: null,
    consent: null,
    comboboxProps: { withinPortal: true, zIndex: 1_800 },
    onChildChange: jest.fn(),
    onAction: jest.fn(),
};

describe('ChildRegistrationPanel', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('does not render when child registration is unavailable', () => {
        renderWithMantine(
            <ChildRegistrationPanel {...baseProps} visible={false} />,
        );

        expect(screen.queryByText('Register a child')).not.toBeInTheDocument();
    });

    it('renders child registration and forwards the primary action', () => {
        const onAction = jest.fn();
        renderWithMantine(
            <ChildRegistrationPanel {...baseProps} onAction={onAction} />,
        );

        expect(screen.getByText('Register a child')).toBeInTheDocument();
        expect(screen.getByText('Eligible ages: 12-17.')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Register child' }));
        expect(onAction).toHaveBeenCalledTimes(1);
    });

    it('shows a team free-agent operation and disables it while updating', () => {
        renderWithMantine(
            <ChildRegistrationPanel
                {...baseProps}
                isTeamSignup
                selectedChildIsFreeAgent
                joiningChildFreeAgent
            />,
        );

        expect(screen.getByText('Child Free Agent')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Updating…' })).toBeDisabled();
        expect(screen.getByText(
            'Team registration is only for teams. Child profiles can join as free agents.',
        )).toBeInTheDocument();
    });

    it('shows waitlist state, missing-email guidance, and consent links', () => {
        const registration = { id: 'registration_1', status: 'pendingConsent' } as EventRegistration;
        const consent = {
            status: 'parentSigned',
            parentSignLink: '/parent-sign',
            childSignLink: '/child-sign',
        } as ConsentLinks;
        renderWithMantine(
            <ChildRegistrationPanel
                {...baseProps}
                waitlistMode
                selectedChildHasEmail={false}
                selectedChildIsWaitlisted
                showRegistrationStatus
                registration={registration}
                consent={consent}
            />,
        );

        expect(screen.getByText('Child Waitlist')).toBeInTheDocument();
        expect(screen.getByText('The selected child is currently on the waitlist.')).toBeInTheDocument();
        expect(screen.getByText(/child-signature steps remain pending/)).toBeInTheDocument();
        expect(screen.getByText('Registration status: pendingConsent')).toBeInTheDocument();
        expect(screen.getByText('Consent status: parentSigned')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Parent Sign' })).toHaveAttribute('href', '/parent-sign');
        expect(screen.getByRole('link', { name: 'Child Sign' })).toHaveAttribute('href', '/child-sign');
    });

    it('disables a new waitlist request when the division is missing', () => {
        renderWithMantine(
            <ChildRegistrationPanel
                {...baseProps}
                waitlistMode
                isDivisionSelectionMissing
            />,
        );

        expect(screen.getByRole('button', { name: 'Add child to waitlist' })).toBeDisabled();
    });
});
