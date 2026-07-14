import { fireEvent, screen } from '@testing-library/react';

import { buildTeam } from '../../../../../../test/factories';
import { renderWithMantine } from '../../../../../../test/utils/renderWithMantine';
import { EventTeamRegistrationPanel } from '../EventTeamRegistrationPanel';

function renderPanel(
    overrides: Partial<React.ComponentProps<typeof EventTeamRegistrationPanel>> = {},
) {
    const actions = {
        onToggleTeamOptions: jest.fn(),
        onSelectedTeamChange: jest.fn(),
        onManageTeams: jest.fn(),
        onJoinTeamWaitlist: jest.fn(),
        onJoinAsTeam: jest.fn(),
        onWithdrawTeam: jest.fn(),
        onLeaveFreeAgents: jest.fn(),
        onJoinFreeAgents: jest.fn(),
        onViewBracket: jest.fn(),
    };
    renderWithMantine(
        <EventTeamRegistrationPanel
            eventHasStarted={false}
            selectedWeeklySession={false}
            showTeamJoinOptions={false}
            isLoadingTeams={false}
            userTeams={[buildTeam({ $id: 'team-one', name: 'Cascade Crew' })]}
            selectedTeamId="team-one"
            showTeamWaitlistActions={false}
            joining={false}
            weeklySelectionRequired={false}
            selectedTeamIsWaitlisted={false}
            isDivisionSelectionMissing={false}
            selectedTeamIsRegistered={false}
            confirmingPurchase={false}
            isFreeForUser={false}
            priceCents={2500}
            selectedTeamPaymentFailed={false}
            selfRegistrationBlockedReason={null}
            isMinor={false}
            isUserFreeAgent={false}
            freeAgentJoinBlockedReason={null}
            childRegistrationPanel={null}
            canShowScheduleButton={false}
            hostManageQrActions={null}
            renderInline
            isTournament={false}
            sportName="Volleyball"
            totalParticipants={4}
            participantCapacity={8}
            comboboxProps={{ withinPortal: false }}
            {...actions}
            {...overrides}
        />,
    );
    return actions;
}

describe('EventTeamRegistrationPanel', () => {
    it('forwards the team-options toggle and explains closed weekly sessions', () => {
        renderPanel({
            eventHasStarted: true,
            selectedWeeklySession: true,
        });

        expect(screen.getByText(/weekly session has already started/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'View Team Options' })).toBeDisabled();

        const actions = renderPanel();
        const enabledToggle = screen.getAllByRole('button', { name: 'View Team Options' })
            .find((button) => !button.hasAttribute('disabled'));
        expect(enabledToggle).toBeDefined();
        fireEvent.click(enabledToggle!);
        expect(actions.onToggleTeamOptions).toHaveBeenCalledTimes(1);
    });

    it('renders managed teams and forwards selection and management', () => {
        const actions = renderPanel({ showTeamJoinOptions: true, selectedTeamId: '' });

        fireEvent.click(screen.getByRole('textbox'));
        fireEvent.click(screen.getByText('Cascade Crew'));
        expect(actions.onSelectedTeamChange).toHaveBeenCalledWith('team-one');

        fireEvent.click(screen.getByRole('button', { name: 'Manage Teams' }));
        expect(actions.onManageTeams).toHaveBeenCalledTimes(1);
    });

    it('forwards team join, waitlist, and withdrawal actions', () => {
        const join = renderPanel({ showTeamJoinOptions: true });
        fireEvent.click(screen.getByRole('button', { name: 'Join for $25.00' }));
        expect(join.onJoinAsTeam).toHaveBeenCalledTimes(1);

        const waitlist = renderPanel({
            showTeamJoinOptions: true,
            showTeamWaitlistActions: true,
        });
        fireEvent.click(screen.getByRole('button', { name: 'Join Waitlist' }));
        expect(waitlist.onJoinTeamWaitlist).toHaveBeenCalledTimes(1);

        const registered = renderPanel({
            showTeamJoinOptions: true,
            selectedTeamIsRegistered: true,
        });
        fireEvent.click(screen.getByRole('button', { name: 'Withdraw Team' }));
        expect(registered.onWithdrawTeam).toHaveBeenCalledTimes(1);
    });

    it('composes free-agent, child, host, and bracket actions', () => {
        const actions = renderPanel({
            isUserFreeAgent: true,
            childRegistrationPanel: <div>Register Avery</div>,
            canShowScheduleButton: true,
            hostManageQrActions: <button type="button">Manage schedule</button>,
            renderInline: false,
            isTournament: true,
        });

        fireEvent.click(screen.getByRole('button', { name: 'Leave Free Agent List' }));
        fireEvent.click(screen.getByRole('button', { name: 'View Tournament Bracket' }));
        expect(actions.onLeaveFreeAgents).toHaveBeenCalledTimes(1);
        expect(actions.onViewBracket).toHaveBeenCalledTimes(1);
        expect(screen.getByText('Register Avery')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Manage schedule' })).toBeInTheDocument();
    });
});
