import { fireEvent, screen, within } from '@testing-library/react';

import type { Sport } from '@/types';
import { renderWithMantine } from '../../../../../../../../../test/utils/renderWithMantine';

import { DivisionPhaseConfigurationControls } from '../DivisionPhaseRulesEditor';

const timedSport = {
    $id: 'sport_basketball',
    name: 'Basketball',
    matchRulesTemplate: {
        scoringModel: 'PERIODS',
        segmentCount: 4,
        segmentLabel: 'Quarter',
        timekeeping: {
            timerMode: 'COUNT_UP',
            segmentDurationMinutes: 10,
        },
    },
} as Sport;

describe('DivisionPhaseConfigurationControls', () => {
    it('shows phase timing beside the configuration and derives the match duration', () => {
        const onChange = jest.fn();
        const onCalculatedDurationChange = jest.fn();
        renderWithMantine(
            <DivisionPhaseConfigurationControls
                phase="POOL"
                divisionName="Open"
                phaseSettings={{
                    POOL: {
                        segmentLengthMinutes: 10,
                        segmentBreakMinutes: 2,
                    },
                }}
                sport={timedSport}
                usesSets={false}
                onChange={onChange}
                onCalculatedDurationChange={onCalculatedDurationChange}
            />,
        );

        expect(screen.getByLabelText('Quarter length')).toHaveValue('10 min');
        expect(screen.getByLabelText('Break between quarters')).toHaveValue('2 min');
        expect(screen.getByText('Calculated match duration: 46 minutes.')).toBeInTheDocument();

        fireEvent.change(screen.getByLabelText('Break between quarters'), {
            target: { value: '3' },
        });
        expect(onChange).toHaveBeenLastCalledWith('POOL', expect.objectContaining({
            segmentLengthMinutes: 10,
            segmentBreakMinutes: 3,
        }));
        expect(onCalculatedDurationChange).toHaveBeenLastCalledWith(49);
    });

    it('keeps a cleared sport-specific length blank and shows an inline error', () => {
        const onChange = jest.fn();
        const { unmount } = renderWithMantine(
            <DivisionPhaseConfigurationControls
                phase="POOL"
                divisionName="Open"
                phaseSettings={{
                    POOL: {
                        segmentLengthMinutes: 10,
                        segmentBreakMinutes: 2,
                    },
                }}
                sport={timedSport}
                usesSets={false}
                onChange={onChange}
            />,
        );

        fireEvent.change(screen.getByLabelText('Quarter length'), {
            target: { value: '' },
        });

        expect(onChange).toHaveBeenLastCalledWith('POOL', expect.objectContaining({
            segmentLengthMinutes: null,
        }));
        unmount();
        renderWithMantine(
            <DivisionPhaseConfigurationControls
                phase="POOL"
                divisionName="Open"
                phaseSettings={{
                    POOL: {
                        segmentLengthMinutes: null,
                        segmentBreakMinutes: 2,
                    },
                }}
                sport={timedSport}
                usesSets={false}
                onChange={onChange}
            />,
        );
        expect(screen.getByLabelText('Quarter length')).toHaveValue('');
        expect(screen.getByText('Enter at least 1 minute.')).toBeInTheDocument();
        expect(screen.getByText('Enter a quarter length to calculate match duration.')).toBeInTheDocument();
    });

    it('keeps segment count in the rules modal and leaves timing outside it', async () => {
        renderWithMantine(
            <DivisionPhaseConfigurationControls
                phase="BRACKET"
                divisionName="Open"
                phaseSettings={{
                    BRACKET: {
                        segmentLengthMinutes: 10,
                        segmentBreakMinutes: 2,
                    },
                }}
                sport={timedSport}
                usesSets={false}
                onChange={jest.fn()}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: 'Bracket rules' }));
        const dialog = await screen.findByRole('dialog');

        expect(within(dialog).getByLabelText('Quarter count')).toHaveValue('4');
        expect(within(dialog).queryByLabelText('Quarter length')).not.toBeInTheDocument();
        expect(within(dialog).queryByLabelText('Break between quarters')).not.toBeInTheDocument();
    });

    it('keeps set duration in the set-format configuration', () => {
        renderWithMantine(
            <DivisionPhaseConfigurationControls
                phase="PLAYOFF"
                divisionName="Open"
                sport={{
                    ...timedSport,
                    matchRulesTemplate: {
                        scoringModel: 'SETS',
                        segmentCount: 3,
                        segmentLabel: 'Set',
                    },
                } as Sport}
                usesSets
                setsPerMatch={3}
                onChange={jest.fn()}
            />,
        );

        expect(screen.queryByLabelText('Set length')).not.toBeInTheDocument();
        expect(screen.queryByLabelText('Break between sets')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Playoff rules' })).toBeInTheDocument();
    });
});
