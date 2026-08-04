import {
    buildEventFormErrorIndex,
    resolveEventFormErrorOwnership,
} from '../errorOwnership';

describe('event form error ownership', () => {
    it.each([
        ['manualPaymentLinks.0.url', 'pricing-registration', 'section-manual-payments'],
        ['divisionDetails.1.playoffTeamCount', 'divisions', 'section-division-settings'],
        ['divisionDetails[1].price', 'pricing-registration', 'section-division-settings'],
        ['leagueSlots.2.fieldIds', 'schedule-location', 'section-schedule-config'],
        ['officialPositions.0.name', 'staff-operations', 'section-officials'],
        ['leagueScoringConfig.winPoints', 'divisions', 'section-league-scoring-config'],
    ])('maps %s to its Simple page and Advanced section', (path, simplePageId, advancedSectionId) => {
        expect(resolveEventFormErrorOwnership(path)).toEqual({ simplePageId, advancedSectionId });
    });

    it('builds ordered page and section groups with normalized focus names', () => {
        const index = buildEventFormErrorIndex([
            { path: 'manualPaymentLinks[0].url', message: 'Enter a valid Cash App username.' },
            { path: 'leagueSlots.2.fieldIds', message: 'Select a resource.' },
        ]);

        expect(index.ordered.map((error) => error.focusFieldName)).toEqual([
            'manualPaymentLinks.0.url',
            'leagueSlots.2.fieldIds',
        ]);
        expect(index.bySimplePage['pricing-registration']).toHaveLength(1);
        expect(index.byAdvancedSection['section-manual-payments']).toHaveLength(1);
        expect(index.byAdvancedSection['section-schedule-config']).toHaveLength(1);
    });
});
