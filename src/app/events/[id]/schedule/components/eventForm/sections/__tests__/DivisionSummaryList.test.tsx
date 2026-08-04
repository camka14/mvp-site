import { screen } from '@testing-library/react';

import { renderWithMantine } from '../../../../../../../../../test/utils/renderWithMantine';
import { DivisionSummaryList } from '../DivisionSummaryList';

const baseProps = {
    singleDivision: false,
    teamSignup: true,
    eventType: 'LEAGUE' as const,
    includePlayoffs: true,
    splitDivisionEditorEnabled: false,
    eventPrice: 0,
    eventMaxParticipants: 8,
    eventAllowPaymentPlans: false,
    eventInstallmentAmounts: [],
    disabled: false,
    playoffDivisionCapacityWarnings: [],
    derivePoolTeamCount: () => undefined,
    buildTournamentConfig: (source: any = {}) => ({
        doubleElimination: false,
        winnerSetCount: 1,
        loserSetCount: 1,
        winnerBracketPointsToVictory: [],
        loserBracketPointsToVictory: [],
        prize: '',
        fieldCount: 1,
        restTimeMinutes: 0,
        usesSets: false,
        ...source,
    }),
    onEditDivision: jest.fn(),
    onRemoveDivision: jest.fn(),
    onEditPlayoffDivision: jest.fn(),
    onRemovePlayoffDivision: jest.fn(),
};

const openDivision = {
    id: 'division_open',
    key: 'open',
    name: 'Open',
    divisionTypeId: 'skill_open_age_18plus',
    divisionTypeName: 'Open 18+',
    ratingType: 'SKILL' as const,
    gender: 'C' as const,
    skillDivisionTypeId: 'open',
    skillDivisionTypeName: 'Open',
    ageDivisionTypeId: '18plus',
    ageDivisionTypeName: '18+',
    price: 0,
    maxParticipants: 8,
    allowPaymentPlans: false,
    installmentDueDates: [],
    installmentDueRelativeDays: [],
    installmentAmounts: [],
};

describe('DivisionSummaryList phase rules', () => {
    it('labels generic event divisions as event divisions', () => {
        renderWithMantine(
            <DivisionSummaryList
                {...baseProps}
                eventType="EVENT"
                divisionDetails={[openDivision]}
                playoffDivisionDetails={[]}
            />,
        );

        expect(screen.getByText('Division Type: Event')).toBeInTheDocument();
        expect(screen.queryByText('Division Type: League')).not.toBeInTheDocument();
    });

    it('does not render phase-rule actions in league summary cards', () => {
        renderWithMantine(
            <DivisionSummaryList
                {...baseProps}
                divisionDetails={[openDivision]}
                playoffDivisionDetails={[]}
            />,
        );

        expect(screen.queryByRole('button', { name: 'League rules' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Playoff rules' })).not.toBeInTheDocument();
    });

    it('does not render phase-rule actions in tournament summary cards', () => {
        renderWithMantine(
            <DivisionSummaryList
                {...baseProps}
                eventType="TOURNAMENT"
                divisionDetails={[openDivision]}
                playoffDivisionDetails={[]}
            />,
        );

        expect(screen.queryByRole('button', { name: 'Pool rules' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Bracket rules' })).not.toBeInTheDocument();
    });
});
