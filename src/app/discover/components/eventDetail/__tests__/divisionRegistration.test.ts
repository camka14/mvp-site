import { buildEvent } from '../../../../../../test/factories';
import {
    buildDivisionOptionsForEvent,
    formatInstallmentDueDateLabel,
    formatInstallmentRelativeDueDayLabel,
    formatPaymentPlanPreviewPrice,
    getDivisionIdFromEventEntry,
    getNormalizedDivisionAliases,
    isActiveFamilyChild,
    isDivisionOptionEligibleForRegistrant,
    normalizeInstallmentAmountsCents,
    normalizeInstallmentDueDateValues,
    normalizeInstallmentDueRelativeDayValues,
    normalizePriceCents,
} from '../divisionRegistration';

describe('event division registration options', () => {
    it('lists one explicit tournament bracket instead of its generated pools', () => {
        const bracketId = 'event_pool__division__c_skill_open_age_18plus';
        const poolA = `${bracketId}_pool_a`;
        const poolB = `${bracketId}_pool_b`;
        const event = buildEvent({
            $id: 'event_pool',
            eventType: 'TOURNAMENT',
            includePlayoffs: true,
            includePlayoffsOrPools: true,
            price: 900,
            divisions: [poolA, poolB],
            divisionDetails: [
                {
                    id: poolA,
                    key: 'c_skill_open_age_18plus_pool_a',
                    name: 'CoEd Open 18+ Pool A',
                    playoffPlacementDivisionIds: [bracketId],
                    maxParticipants: 4,
                },
                {
                    id: poolB,
                    key: 'c_skill_open_age_18plus_pool_b',
                    name: 'CoEd Open 18+ Pool B',
                    playoffPlacementDivisionIds: [bracketId],
                    maxParticipants: 4,
                },
            ],
            playoffDivisionDetails: [{
                id: bracketId,
                key: 'c_skill_open_age_18plus',
                kind: 'PLAYOFF',
                name: 'CoEd Open 18+',
                price: 2500,
                maxParticipants: 8,
            }],
        });

        expect(buildDivisionOptionsForEvent(event)).toEqual([
            expect.objectContaining({
                id: bracketId,
                key: 'c_skill_open_age_18plus',
                name: 'CoEd Open 18+',
                priceCents: 2500,
                maxParticipants: 8,
            }),
        ]);
    });

    it('keeps league registration on its playable division and excludes playoff rows', () => {
        const event = buildEvent({
            eventType: 'LEAGUE',
            divisions: ['league_open', 'playoff_gold'],
            divisionDetails: [
                {
                    id: 'league_open',
                    key: 'c_skill_open_age_18plus',
                    name: 'Open League',
                    playoffPlacementDivisionIds: ['playoff_gold'],
                },
                {
                    id: 'playoff_gold',
                    key: 'playoff_gold',
                    kind: 'PLAYOFF',
                    name: 'Gold Playoff',
                },
            ],
        });

        expect(buildDivisionOptionsForEvent(event).map(({ id, name }) => ({ id, name }))).toEqual([
            { id: 'league_open', name: 'Open League' },
        ]);
    });

    it('applies division payment-plan overrides while preserving event defaults elsewhere', () => {
        const event = buildEvent({
            start: '2026-08-01T19:00:00.000Z',
            price: 3000,
            allowPaymentPlans: true,
            installmentCount: 3,
            installmentAmounts: [1000, '1000', 1000] as unknown as number[],
            installmentDueDates: ['2026-07-01', 'invalid', '2026-07-15'],
            installmentDueRelativeDays: [-14, '0', 14] as unknown as number[],
            divisions: ['division_default', 'division_override'],
            divisionDetails: [
                {
                    id: 'division_default',
                    key: 'c_skill_open_age_18plus',
                    name: 'Default Plan',
                },
                {
                    id: 'division_override',
                    key: 'c_skill_premier_age_18plus',
                    name: 'Override Plan',
                    price: 4200,
                    allowPaymentPlans: false,
                    installmentCount: 2,
                    installmentAmounts: [2100, 2100],
                    installmentDueDates: ['2026-06-20', '2026-07-20'],
                    installmentDueRelativeDays: [-7, 7],
                },
            ],
        });

        const [defaultPlan, overridePlan] = buildDivisionOptionsForEvent(event);

        expect(defaultPlan).toMatchObject({
            priceCents: 3000,
            allowPaymentPlans: true,
            installmentCount: 3,
            installmentAmounts: [1000, 1000, 1000],
            installmentDueRelativeDays: [-14, 0, 14],
        });
        expect(defaultPlan?.installmentDueDates).toHaveLength(2);
        expect(overridePlan).toMatchObject({
            priceCents: 4200,
            allowPaymentPlans: false,
            installmentCount: 2,
            installmentAmounts: [2100, 2100],
            installmentDueRelativeDays: [-7, 7],
        });
        expect(overridePlan?.installmentDueDates).toHaveLength(2);
    });

    it('normalizes identifiers, amounts, dates, offsets, and presentation labels', () => {
        expect(getDivisionIdFromEventEntry({ $id: '  Division_Open  ' })).toBe('division_open');
        expect(getDivisionIdFromEventEntry({ name: ' Recreation ' })).toBe('recreation');
        expect(getDivisionIdFromEventEntry({ id: '  ' })).toBeNull();
        expect(getNormalizedDivisionAliases('event_1__division__C_SKILL_OPEN_AGE_18PLUS')).toEqual([
            'event_1__division__c_skill_open_age_18plus',
            'c_skill_open_age_18plus',
        ]);

        expect(normalizePriceCents('-3.6')).toBe(0);
        expect(normalizePriceCents('1250.6')).toBe(1251);
        expect(normalizePriceCents('not-a-price')).toBe(0);
        expect(normalizeInstallmentAmountsCents([100, '250.4', -5, 'bad'])).toEqual([100, 250, 0, 0]);
        expect(normalizeInstallmentDueDateValues(['2026-07-01', 'bad'])).toHaveLength(1);
        expect(normalizeInstallmentDueRelativeDayValues([-2.9, '3.8', 'bad'])).toEqual([-2, 3]);

        expect(formatInstallmentDueDateLabel('bad')).toBe('TBD');
        expect(formatInstallmentRelativeDueDayLabel(-1)).toBe('1 day before session');
        expect(formatInstallmentRelativeDueDayLabel(0)).toBe('Session day');
        expect(formatInstallmentRelativeDueDayLabel(2)).toBe('2 days after session');
        expect(formatPaymentPlanPreviewPrice(2500)).toBe('$25.00 + fees');
    });

    it('filters inactive family links and enforces event and division age limits', () => {
        const [adultDivision] = buildDivisionOptionsForEvent(buildEvent({
            start: '2026-08-01T19:00:00.000Z',
            divisions: ['adult_open'],
            divisionDetails: [{
                id: 'adult_open',
                key: 'c_skill_open_age_18plus',
                name: 'Coed Open 18+',
            }],
        }));

        expect(isActiveFamilyChild({ linkStatus: undefined } as never)).toBe(true);
        expect(isActiveFamilyChild({ linkStatus: ' UNLINKED ' } as never)).toBe(false);
        expect(isDivisionOptionEligibleForRegistrant({
            division: adultDivision!,
            dateOfBirth: null,
            eventStartDate: new Date('2026-08-01T19:00:00.000Z'),
        })).toBe(true);
        expect(isDivisionOptionEligibleForRegistrant({
            division: adultDivision!,
            dateOfBirth: new Date('2010-01-01T00:00:00.000Z'),
            eventStartDate: new Date('2026-08-01T19:00:00.000Z'),
        })).toBe(false);
        expect(isDivisionOptionEligibleForRegistrant({
            division: adultDivision!,
            dateOfBirth: new Date('1990-01-01T00:00:00.000Z'),
            eventStartDate: new Date('2026-08-01T19:00:00.000Z'),
            eventMaxAge: 30,
        })).toBe(false);
        expect(isDivisionOptionEligibleForRegistrant({
            division: adultDivision!,
            dateOfBirth: new Date('1990-01-01T00:00:00.000Z'),
            eventStartDate: new Date('2026-08-01T19:00:00.000Z'),
            eventMinAge: 18,
        })).toBe(true);
    });
});
