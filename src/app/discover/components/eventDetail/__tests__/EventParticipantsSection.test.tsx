import { fireEvent, screen } from '@testing-library/react';

import { renderWithMantine } from '../../../../../../test/utils/renderWithMantine';
import {
    EventParticipantDropdowns,
    EventParticipantsSection,
} from '../EventParticipantsSection';

const player = {
    $id: 'player_1',
    firstName: 'Jordan',
    lastName: 'Lee',
    userName: 'jordanlee',
};

const team = {
    $id: 'team_1',
    name: 'Cascade Crew',
};

describe('EventParticipantsSection', () => {
    it('renders participant capacity and forwards non-team preview actions', () => {
        const onToggleCapacityBreakdown = jest.fn();
        const onOpenPlayers = jest.fn();

        renderWithMantine(
            <EventParticipantsSection
                isTeamSignup={false}
                participantCapacity={4}
                totalParticipants={2}
                freeAgentCount={0}
                waitlistCount={1}
                spotsLeft={2}
                fillPercent={50}
                divisionCapacityRows={[{
                    id: 'open',
                    label: 'Open',
                    filled: 2,
                    capacity: 4,
                    spotsLeft: 2,
                    fillPercent: 50,
                }]}
                capacityBreakdownOpened={false}
                players={[player]}
                teams={[]}
                freeAgents={[]}
                loading={false}
                onToggleCapacityBreakdown={onToggleCapacityBreakdown}
                onOpenPlayers={onOpenPlayers}
                onOpenTeams={jest.fn()}
                onOpenFreeAgents={jest.fn()}
            />,
        );

        expect(screen.getAllByText('2/4')).toHaveLength(2);
        expect(screen.getAllByText('50% full • 2 left')).toHaveLength(2);
        expect(screen.getByText('1 player')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Show division breakdown' }));
        fireEvent.click(screen.getByText('View all →'));
        expect(onToggleCapacityBreakdown).toHaveBeenCalledTimes(1);
        expect(onOpenPlayers).toHaveBeenCalledTimes(1);
    });

    it('forwards both team and free-agent preview actions', () => {
        const onOpenTeams = jest.fn();
        const onOpenFreeAgents = jest.fn();

        renderWithMantine(
            <EventParticipantsSection
                isTeamSignup
                participantCapacity={8}
                totalParticipants={1}
                freeAgentCount={1}
                waitlistCount={0}
                spotsLeft={7}
                fillPercent={13}
                divisionCapacityRows={[]}
                capacityBreakdownOpened={false}
                players={[]}
                teams={[team]}
                freeAgents={[player]}
                loading={false}
                onToggleCapacityBreakdown={jest.fn()}
                onOpenPlayers={jest.fn()}
                onOpenTeams={onOpenTeams}
                onOpenFreeAgents={onOpenFreeAgents}
            />,
        );

        const viewAllActions = screen.getAllByText('View all →');
        fireEvent.click(viewAllActions[0]);
        fireEvent.click(viewAllActions[1]);
        expect(onOpenTeams).toHaveBeenCalledTimes(1);
        expect(onOpenFreeAgents).toHaveBeenCalledTimes(1);
    });

    it('renders player identity in the non-team dropdown', () => {
        renderWithMantine(
            <EventParticipantDropdowns
                visible
                isTeamSignup={false}
                playersOpened
                teamsOpened={false}
                freeAgentsOpened={false}
                players={[player]}
                teams={[]}
                freeAgents={[]}
                loading={false}
                renderTeam={jest.fn()}
                onClosePlayers={jest.fn()}
                onCloseTeams={jest.fn()}
                onCloseFreeAgents={jest.fn()}
                onOpenFreeAgentActions={jest.fn()}
            />,
        );

        expect(screen.getByRole('heading', { name: 'Event Players' })).toBeInTheDocument();
        expect(screen.getByText('Jordan Lee')).toBeInTheDocument();
        expect(screen.getByText('@jordanlee')).toBeInTheDocument();
    });

    it('uses the supplied team renderer for team dropdown rows', () => {
        renderWithMantine(
            <EventParticipantDropdowns
                visible
                isTeamSignup
                playersOpened={false}
                teamsOpened
                freeAgentsOpened={false}
                players={[]}
                teams={[team]}
                freeAgents={[]}
                loading={false}
                renderTeam={(row) => <div>Rendered {row.$id}</div>}
                onClosePlayers={jest.fn()}
                onCloseTeams={jest.fn()}
                onCloseFreeAgents={jest.fn()}
                onOpenFreeAgentActions={jest.fn()}
            />,
        );

        expect(screen.getByText('Rendered team_1')).toBeInTheDocument();
    });
});
