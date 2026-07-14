import { fireEvent, screen } from '@testing-library/react';

import type { Event, Team } from '@/types';
import { renderWithMantine } from '../../../../../../test/utils/renderWithMantine';

import { EventTeamParticipantCard } from '../EventTeamParticipantCard';

const mockOpenFlow = jest.fn();
let mockFlowState: Record<string, unknown>;
let mockFlowProps: Record<string, unknown>;

jest.mock('@/components/ui/TeamRegistrationFlow', () => ({
    __esModule: true,
    default: ({ children, ...props }: {
        children: (state: Record<string, unknown>) => React.ReactNode;
    } & Record<string, unknown>) => {
        mockFlowProps = props;
        return <>{children(mockFlowState)}</>;
    },
}));

const event = {
    $id: 'event-1',
    eventType: 'TOURNAMENT',
    location: 'River City Sports Club',
    organizationId: 'org-1',
    organization: { name: 'River City Sports Club' },
    sport: 'volleyball',
    divisionDetails: [{ id: 'division-open', name: 'Open' }],
} as Event;

const team = {
    $id: 'team-1',
    name: 'Cascade Crew',
    currentSize: 4,
    division: 'division-open',
    registrationPriceCents: 2500,
} as Team;

function renderCard(overrides: Partial<React.ComponentProps<typeof EventTeamParticipantCard>> = {}) {
    const onRequireAuth = jest.fn();
    const onReload = jest.fn().mockResolvedValue(undefined);
    const onNotice = jest.fn();
    renderWithMantine(
        <EventTeamParticipantCard
            event={event}
            team={team}
            divisionNameIndex={new Map([['division-open', 'Open']])}
            onRequireAuth={onRequireAuth}
            onReload={onReload}
            onNotice={onNotice}
            {...overrides}
        />,
    );
    return { onRequireAuth, onReload, onNotice };
}

describe('EventTeamParticipantCard', () => {
    beforeEach(() => {
        mockOpenFlow.mockReset();
        mockFlowProps = {};
        mockFlowState = {
            registrationError: null,
            currentUserActiveMember: false,
            shouldOfferDocumentReview: false,
            actionVisible: true,
            actionLoading: false,
            actionDisabled: false,
            actionLabel: 'Join team',
            openFlow: mockOpenFlow,
        };
    });

    it('renders the team identity, resolved division, and registration price contract', () => {
        renderCard();

        expect(screen.getByText('Cascade Crew')).toBeInTheDocument();
        expect(screen.getByText('4 members • Open Division')).toBeInTheDocument();
        expect(mockFlowProps.paymentSummary).toEqual({
            name: 'Cascade Crew',
            location: 'River City Sports Club',
            eventType: 'TOURNAMENT',
            price: 2500,
        });
    });

    it('forwards the visible registration action', () => {
        renderCard();

        fireEvent.click(screen.getByRole('button', { name: 'Join team' }));

        expect(mockOpenFlow).toHaveBeenCalledTimes(1);
    });

    it('shows registration feedback owned by the flow', () => {
        mockFlowState = {
            ...mockFlowState,
            registrationError: 'Registration failed',
            currentUserActiveMember: true,
        };

        renderCard();

        expect(screen.getByText('Registration failed')).toBeInTheDocument();
        expect(screen.getByText('Already on this team')).toBeInTheDocument();
    });

    it('publishes completion notice and reloads event details', async () => {
        const { onNotice, onReload } = renderCard();
        const onCompleted = mockFlowProps.onCompleted as () => Promise<void>;

        await onCompleted();

        expect(onNotice).toHaveBeenCalledWith('You joined Cascade Crew.');
        expect(onReload).toHaveBeenCalledTimes(1);
    });
});
