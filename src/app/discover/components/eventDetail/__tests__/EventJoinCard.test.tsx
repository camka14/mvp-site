import { fireEvent, screen } from '@testing-library/react';

import { buildEvent } from '../../../../../../test/factories';
import { renderWithMantine } from '../../../../../../test/utils/renderWithMantine';
import { EventJoinCard } from '../EventJoinCard';

jest.mock('@/components/ui/RefundSection', () => ({
    __esModule: true,
    default: ({ onRefundSuccess }: { onRefundSuccess: () => void }) => (
        <button type="button" onClick={onRefundSuccess}>Request refund</button>
    ),
}));

const weeklySession = {
    id: 'slot-one-2099-08-01',
    slotId: 'slot-one',
    occurrenceDate: '2099-08-01',
    label: 'Wednesday, August 1 · 6:00 PM–7:00 PM',
    divisionLabel: 'Open',
    start: new Date('2099-08-01T18:00:00.000Z'),
    end: new Date('2099-08-01T19:00:00.000Z'),
};

function renderCard(overrides: Partial<React.ComponentProps<typeof EventJoinCard>> = {}) {
    const actions = {
        onToggleMobile: jest.fn(),
        onAffiliateClick: jest.fn(),
        onClearWeeklyOccurrence: jest.fn(),
        onWeeklySessionSelect: jest.fn(),
        onAuthenticate: jest.fn(),
        onViewBracket: jest.fn(),
        onRefundSuccess: jest.fn(),
    };
    renderWithMantine(
        <EventJoinCard
            renderInline
            mobileExpanded
            registrationTypeLabel="Individual registration"
            selectedDivisionOption={null}
            priceCents={2500}
            eventPriceSummary="$25.00 / player"
            joinError={null}
            joinNotice={null}
            event={buildEvent({ name: 'Summer Open' })}
            eventImageUrl="/event.jpg"
            affiliateActionUrl=""
            isAffiliateEvent={false}
            isWeeklyParentEvent={false}
            selectedWeeklyOccurrenceOption={null}
            weeklySessionOptions={[]}
            weeklySelectionRequired={false}
            hasAgeLimits={false}
            divisionOptionCount={0}
            registrationCutoffSummary="2 hours before start"
            refundSummary="24 hours before start"
            isDivisionSelectionMissing={false}
            registrationByDivisionType={false}
            hasUser={false}
            isUserRegistered={false}
            totalParticipants={4}
            participantCapacity={12}
            canShowScheduleButton={false}
            hostManageQrActions={null}
            isTournament={false}
            registrationPanel={<div>Registration panel</div>}
            hasRefundTarget={false}
            activeChildren={[]}
            eventStartDate={new Date('2099-08-01T18:00:00.000Z')}
            showSecurePaymentNote={false}
            showPoweredByBracketIqNote
            {...actions}
            {...overrides}
        />,
    );
    return actions;
}

describe('EventJoinCard', () => {
    it('renders and toggles the compact mobile summary', () => {
        const actions = renderCard({ mobileExpanded: false });

        expect(screen.getByText('Individual registration')).toBeInTheDocument();
        expect(screen.getByText('$25.00 / player')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Individual registration $25.00 / player' }));
        expect(actions.onToggleMobile).toHaveBeenCalledTimes(1);
    });

    it('renders the affiliate handoff and forwards analytics ownership', () => {
        const actions = renderCard({
            affiliateActionUrl: 'https://events.example.com/register',
            isAffiliateEvent: true,
        });

        fireEvent.click(screen.getByRole('link', { name: 'View Event' }));
        expect(actions.onAffiliateClick).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole('button', { name: 'Register / Login' })).not.toBeInTheDocument();
    });

    it('selects and clears weekly sessions while gating registration', () => {
        const actions = renderCard({
            isWeeklyParentEvent: true,
            selectedWeeklyOccurrenceOption: weeklySession,
            weeklySessionOptions: [weeklySession],
            weeklySelectionRequired: false,
        });

        fireEvent.click(screen.getByRole('button', { name: /Wednesday, August 1/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
        expect(actions.onWeeklySessionSelect).toHaveBeenCalledWith(weeklySession);
        expect(actions.onClearWeeklyOccurrence).toHaveBeenCalledTimes(1);

        renderCard({
            isWeeklyParentEvent: true,
            weeklySessionOptions: [weeklySession],
            weeklySelectionRequired: true,
        });
        expect(screen.getByText('Select a weekly session to see registration options.')).toBeInTheDocument();
    });

    it('composes registration, refund, and payment-trust presentation', () => {
        const actions = renderCard({
            hasUser: true,
            registrationPanel: <div>Team registration controls</div>,
            hasRefundTarget: true,
            showSecurePaymentNote: true,
        });

        expect(screen.getByText('Team registration controls')).toBeInTheDocument();
        expect(screen.getByText('Secure payments')).toBeInTheDocument();
        expect(screen.getByText('Powered by BracketIQ')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Request refund' }));
        expect(actions.onRefundSuccess).toHaveBeenCalledTimes(1);
    });
});
