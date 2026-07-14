import { buildEvent, buildTimeSlot } from '../../../../../../test/factories';
import type { EventDivisionOption } from '../divisionRegistration';
import {
    buildPublicDivisionGroups,
    buildScheduleTimeslotGroups,
    formatMinutesTo12Hour,
    formatNotSpecifiedValue,
    formatOfficialSchedulingModeLabel,
    formatReadOnlyValueList,
    formatRefundSummary,
    formatRegistrationCutoffSummary,
    formatSlotTimeRange,
    getDayOfWeekLabel,
    getOrganizationHostedByHref,
    getOrganizationId,
    getOrganizationName,
    getPublicDivisionAgeSkillParts,
    getSportLabel,
    normalizeComparableLabel,
    uniqueNonEmptyStrings,
} from '../eventDetailPresentation';

const buildDivisionOption = (
    overrides: Partial<EventDivisionOption> = {},
): EventDivisionOption => ({
    id: 'division_open',
    key: 'c_skill_open_age_18plus',
    name: 'Coed Open 18+',
    divisionTypeId: 'skill_open_age_18plus',
    divisionTypeName: 'Coed Open 18+',
    divisionTypeKey: 'c_skill_open_age_18plus',
    ratingType: 'SKILL',
    gender: 'C',
    sportId: 'Volleyball',
    ...overrides,
});

describe('event detail presentation helpers', () => {
    it('normalizes repeated labels and read-only list fallbacks', () => {
        expect(uniqueNonEmptyStrings([' Open ', null, '', 'Open', 'Premier'])).toEqual(['Open', 'Premier']);
        expect(normalizeComparableLabel('  River   City CLUB ')).toBe('river city club');
        expect(formatReadOnlyValueList([' Court 1 ', 'Court 1', 'Court 2'])).toBe('Court 1, Court 2');
        expect(formatReadOnlyValueList([], 'All fields')).toBe('All fields');
    });

    it('builds safe organization labels and hosted-by destinations', () => {
        const organization = {
            $id: 'org id',
            name: ' River City Sports Club ',
            publicSlug: 'river city',
            website: 'https://rivercity.test/events',
        } as NonNullable<ReturnType<typeof buildEvent>['organization']>;

        expect(getOrganizationName(organization)).toBe('River City Sports Club');
        expect(getOrganizationId(organization, 'fallback')).toBe('org id');
        expect(getOrganizationId(null, ' fallback ')).toBe('fallback');
        expect(getOrganizationHostedByHref({
            organization,
            isAffiliateEvent: false,
        })).toBe('/o/river%20city');
        expect(getOrganizationHostedByHref({
            organization,
            isAffiliateEvent: true,
            affiliateUrl: 'https://affiliate.test/join',
        })).toBe('https://rivercity.test/events');
        expect(getOrganizationHostedByHref({
            organization: { ...organization, website: 'javascript:alert(1)' },
            isAffiliateEvent: true,
            affiliateUrl: 'https://affiliate.test/join',
        })).toBe('https://affiliate.test/join');
    });

    it('formats sport, policy, staffing, and missing-value summaries', () => {
        expect(getSportLabel(buildEvent())).toBe('Volleyball');
        expect(getSportLabel({
            ...buildEvent(),
            sport: '' as unknown as ReturnType<typeof buildEvent>['sport'],
            sportId: 'pickleball',
        })).toBe('pickleball');
        expect(formatRegistrationCutoffSummary(25.9)).toBe('25h before start');
        expect(formatRegistrationCutoffSummary(0)).toBe('No cutoff');
        expect(formatRefundSummary(null)).toBe('Automatic refunds disabled');
        expect(formatRefundSummary(0)).toBe('Until event start');
        expect(formatRefundSummary(48.9)).toBe('48h before start');
        expect(formatOfficialSchedulingModeLabel('TEAM_STAFFING')).toBe('Team staffing');
        expect(formatOfficialSchedulingModeLabel(undefined)).toBe('Schedule first');
        expect(formatNotSpecifiedValue(3.9)).toBe('3');
        expect(formatNotSpecifiedValue(0)).toBe('Not specified');
    });

    it('formats 12-hour time boundaries and incomplete ranges', () => {
        expect(formatMinutesTo12Hour(0)).toBe('12:00 AM');
        expect(formatMinutesTo12Hour(12 * 60)).toBe('12:00 PM');
        expect(formatMinutesTo12Hour(23 * 60 + 59)).toBe('11:59 PM');
        expect(formatMinutesTo12Hour(-30)).toBe('11:30 PM');
        expect(formatSlotTimeRange(9 * 60, 10 * 60 + 30)).toBe('9:00 AM - 10:30 AM');
        expect(formatSlotTimeRange(null, undefined)).toBe('Start not set - End not set');
    });

    it('groups multi-day slots in calendar order and sorts by start time', () => {
        const later = buildTimeSlot({
            $id: 'later',
            dayOfWeek: undefined,
            daysOfWeek: [2, 0, 2],
            startTimeMinutes: 12 * 60,
            endTimeMinutes: 13 * 60,
        });
        const earlier = buildTimeSlot({
            $id: 'earlier',
            dayOfWeek: 0,
            daysOfWeek: undefined,
            startTimeMinutes: 9 * 60,
            endTimeMinutes: 10 * 60,
        });
        const unassigned = buildTimeSlot({
            $id: 'unassigned',
            dayOfWeek: undefined,
            daysOfWeek: [],
        });

        const groups = buildScheduleTimeslotGroups([later, unassigned, earlier]);

        expect(groups.map(([day]) => day)).toEqual([0, 2, -1]);
        expect(groups[0]?.[1].map((slot) => slot.$id)).toEqual(['earlier', 'later']);
        expect(groups[1]?.[1].map((slot) => slot.$id)).toEqual(['later']);
        expect(groups[2]?.[1].map((slot) => slot.$id)).toEqual(['unassigned']);
        expect(getDayOfWeekLabel(0)).toBe('Monday');
        expect(getDayOfWeekLabel(-1)).toBe('Unassigned day');
    });

    it('groups public divisions by gender, age, and skill without dropping options', () => {
        const open = buildDivisionOption();
        const premier = buildDivisionOption({
            id: 'division_premier',
            key: 'c_skill_premier_age_18plus',
            name: 'Coed Premier 18+',
            divisionTypeId: 'skill_premier_age_18plus',
            divisionTypeName: 'Coed Premier 18+',
            divisionTypeKey: 'c_skill_premier_age_18plus',
            sportId: 'Soccer',
        });
        const womens = buildDivisionOption({
            id: 'division_womens',
            key: 'f_skill_open_age_18plus',
            name: "Women's Open 18+",
            divisionTypeName: "Women's Open 18+",
            divisionTypeKey: 'f_skill_open_age_18plus',
            gender: 'F',
        });

        expect(getPublicDivisionAgeSkillParts(open)).toEqual({ ageLabel: '18+', skillLabel: 'Open' });
        expect(buildPublicDivisionGroups([open, premier, womens])).toEqual([
            {
                key: 'C',
                label: 'Coed',
                ageGroups: [{
                    key: '18+',
                    label: '18+',
                    skillGroups: [
                        { key: 'open', label: 'Open', options: [open] },
                        { key: 'premier', label: 'Premier', options: [premier] },
                    ],
                }],
            },
            {
                key: 'F',
                label: "Women's",
                ageGroups: [{
                    key: '18+',
                    label: '18+',
                    skillGroups: [{ key: 'open', label: 'Open', options: [womens] }],
                }],
            },
        ]);
    });
});
