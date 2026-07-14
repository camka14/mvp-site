import { fireEvent, screen } from '@testing-library/react';

import { renderWithMantine } from '../../../../../../test/utils/renderWithMantine';
import { EventIndividualRegistrationPanel } from '../EventIndividualRegistrationPanel';

function renderPanel(
    overrides: Partial<React.ComponentProps<typeof EventIndividualRegistrationPanel>> = {},
) {
    const onLeaveWaitlist = jest.fn();
    const onJoinWaitlist = jest.fn();
    const onJoinEvent = jest.fn();
    renderWithMantine(
        <EventIndividualRegistrationPanel
            selfRegistrationBlockedReason={null}
            isMinor={false}
            showSelfWaitlistActions={false}
            isUserWaitlisted={false}
            selfWaitlistLeaveDisabled={false}
            selfWaitlistJoinDisabled={false}
            selfJoinDisabled={false}
            eventHasStarted={false}
            joining={false}
            confirmingPurchase={false}
            priceCents={2500}
            currentUserPaymentFailed={false}
            canShowScheduleButton={false}
            hostManageQrActions={null}
            childRegistrationPanel={null}
            onLeaveWaitlist={onLeaveWaitlist}
            onJoinWaitlist={onJoinWaitlist}
            onJoinEvent={onJoinEvent}
            {...overrides}
        />,
    );
    return { onLeaveWaitlist, onJoinWaitlist, onJoinEvent };
}

describe('EventIndividualRegistrationPanel', () => {
    it('renders registration blocks and guardian approval guidance', () => {
        renderPanel({
            selfRegistrationBlockedReason: 'Registration is closed.',
            isMinor: true,
        });

        expect(screen.getByText('Registration is closed.')).toBeInTheDocument();
        expect(screen.queryByText(/linked parent\/guardian/)).not.toBeInTheDocument();

        renderPanel({ selfRegistrationBlockedReason: null, isMinor: true, priceCents: 0 });
        expect(screen.getByText(/linked parent\/guardian/)).toBeInTheDocument();
    });

    it('forwards waitlist join and leave actions', () => {
        const join = renderPanel({ showSelfWaitlistActions: true });
        fireEvent.click(screen.getByRole('button', { name: 'Join Waitlist' }));
        expect(join.onJoinWaitlist).toHaveBeenCalledTimes(1);

        const leave = renderPanel({
            showSelfWaitlistActions: true,
            isUserWaitlisted: true,
        });
        fireEvent.click(screen.getByRole('button', { name: 'Leave Waitlist' }));
        expect(leave.onLeaveWaitlist).toHaveBeenCalledTimes(1);
    });

    it('shows paid and failed-payment join labels and forwards registration', () => {
        const active = renderPanel();
        fireEvent.click(screen.getByRole('button', { name: 'Join Event - $25.00' }));
        expect(active.onJoinEvent).toHaveBeenCalledTimes(1);

        renderPanel({ currentUserPaymentFailed: true });
        expect(screen.getByRole('button', { name: 'Complete payment' })).toBeInTheDocument();
    });

    it('composes host and linked-child presentation slots', () => {
        renderPanel({
            canShowScheduleButton: true,
            hostManageQrActions: <button type="button">Manage schedule</button>,
            childRegistrationPanel: <div>Register Avery</div>,
        });

        expect(screen.getByRole('button', { name: 'Manage schedule' })).toBeInTheDocument();
        expect(screen.getByText('Register Avery')).toBeInTheDocument();
    });
});
