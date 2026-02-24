import { applyEventDefaultsToDivisionDetails } from '../divisionDefaults';

type DivisionRow = {
    id: string;
    price: number;
    maxParticipants: number;
    playoffTeamCount?: number;
};

describe('applyEventDefaultsToDivisionDetails', () => {
    it('applies price, max participants, and playoff team count defaults when playoffs are enabled', () => {
        const current: DivisionRow[] = [
            { id: 'div_1', price: 25, maxParticipants: 10, playoffTeamCount: 6 },
            { id: 'div_2', price: 40, maxParticipants: 12, playoffTeamCount: 8 },
        ];

        const result = applyEventDefaultsToDivisionDetails({
            details: current,
            defaultPrice: 15,
            defaultMaxParticipants: 14,
            includePlayoffs: true,
            defaultPlayoffTeamCount: 4,
        });

        expect(result.changed).toBe(true);
        expect(result.details).toEqual([
            { id: 'div_1', price: 15, maxParticipants: 14, playoffTeamCount: 4 },
            { id: 'div_2', price: 15, maxParticipants: 14, playoffTeamCount: 4 },
        ]);
    });

    it('does not mark changed when rows already match defaults', () => {
        const current: DivisionRow[] = [
            { id: 'div_1', price: 0, maxParticipants: 8, playoffTeamCount: 8 },
            { id: 'div_2', price: 0, maxParticipants: 8, playoffTeamCount: 8 },
        ];

        const result = applyEventDefaultsToDivisionDetails({
            details: current,
            defaultPrice: 0,
            defaultMaxParticipants: 8,
            includePlayoffs: true,
            defaultPlayoffTeamCount: 8,
        });

        expect(result.changed).toBe(false);
        expect(result.details[0]).toBe(current[0]);
        expect(result.details[1]).toBe(current[1]);
    });

    it('leaves playoff counts untouched when playoffs are disabled', () => {
        const current: DivisionRow[] = [
            { id: 'div_1', price: 5, maxParticipants: 6, playoffTeamCount: 3 },
            { id: 'div_2', price: 6, maxParticipants: 7, playoffTeamCount: 5 },
        ];

        const result = applyEventDefaultsToDivisionDetails({
            details: current,
            defaultPrice: 11,
            defaultMaxParticipants: 9,
            includePlayoffs: false,
            defaultPlayoffTeamCount: 2,
        });

        expect(result.changed).toBe(true);
        expect(result.details).toEqual([
            { id: 'div_1', price: 11, maxParticipants: 9, playoffTeamCount: 3 },
            { id: 'div_2', price: 11, maxParticipants: 9, playoffTeamCount: 5 },
        ]);
    });
});
