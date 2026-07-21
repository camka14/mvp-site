import type { Event, TimeSlot } from '@/types';
import { deriveDivisionTypeDisplayName } from '@/lib/divisionTypes';
import type { EventDivisionOption } from './divisionRegistration';

export const uniqueNonEmptyStrings = (values: Array<string | null | undefined>): string[] => {
    const normalizedValues = values
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter((value): value is string => value.length > 0);
    return Array.from(new Set(normalizedValues));
};

export const normalizeComparableLabel = (value: string | null | undefined): string => (
    typeof value === 'string'
        ? value.trim().replace(/\s+/g, ' ').toLowerCase()
        : ''
);

export const formatReadOnlyValueList = (
    values: Array<string | null | undefined>,
    emptyText: string = 'None',
): string => {
    const normalizedValues = uniqueNonEmptyStrings(values);
    return normalizedValues.length > 0 ? normalizedValues.join(', ') : emptyText;
};

export const getOrganizationName = (organization: Event['organization'] | null | undefined): string | null => {
    if (organization && typeof organization === 'object' && typeof organization.name === 'string') {
        const normalized = organization.name.trim();
        return normalized.length > 0 ? normalized : null;
    }
    return null;
};

export const getOrganizationId = (
    organization: Event['organization'] | null | undefined,
    fallbackId?: string | null,
): string | null => {
    if (organization && typeof organization === 'object') {
        const id = typeof organization.$id === 'string' ? organization.$id.trim() : '';
        if (id) {
            return id;
        }
    }
    const normalizedFallbackId = typeof fallbackId === 'string' ? fallbackId.trim() : '';
    return normalizedFallbackId || null;
};

export const getOrganizationHostedByHref = (params: {
    organization: Event['organization'] | null | undefined;
    organizationId?: string | null;
    affiliateUrl?: string | null;
    isAffiliateEvent: boolean;
}): string | null => {
    const organization = params.organization && typeof params.organization === 'object'
        ? params.organization
        : null;
    const organizationId = getOrganizationId(organization, params.organizationId);
    return organizationId ? `/organizations/${encodeURIComponent(organizationId)}` : null;
};

export const getSportLabel = (event: Event): string => {
    const rawSport: unknown = (event as { sport?: unknown }).sport;
    if (typeof rawSport === 'string' && rawSport.trim().length > 0) {
        return rawSport.trim();
    }
    if (
        rawSport
        && typeof rawSport === 'object'
        && typeof (rawSport as { name?: unknown }).name === 'string'
        && ((rawSport as { name: string }).name).trim().length > 0
    ) {
        return (rawSport as { name: string }).name.trim();
    }
    if (typeof event.sportId === 'string' && event.sportId.trim().length > 0) {
        return event.sportId.trim();
    }
    return 'TBD';
};

export const formatRegistrationCutoffSummary = (value: number | null | undefined): string => {
    const hours = Number(value);
    if (!Number.isFinite(hours) || hours <= 0) {
        return 'No cutoff';
    }
    return `${Math.trunc(hours)}h before start`;
};

export const formatRefundSummary = (value: number | null | undefined): string => {
    if (value == null) {
        return 'Automatic refunds disabled';
    }
    const hours = Number(value);
    if (!Number.isFinite(hours)) {
        return 'Automatic refunds disabled';
    }
    return hours <= 0 ? 'Until event start' : `${Math.trunc(hours)}h before start`;
};

export const formatNotSpecifiedValue = (value: unknown): string => {
    if (value == null) {
        return 'Not specified';
    }
    if (typeof value === 'number') {
        return Number.isFinite(value) && value > 0 ? String(Math.trunc(value)) : 'Not specified';
    }
    const normalized = String(value).trim();
    return normalized.length ? normalized : 'Not specified';
};

export const formatOfficialSchedulingModeLabel = (value: Event['officialSchedulingMode']): string => {
    switch (value) {
        case 'STAFFING':
            return 'Staffing first';
        case 'TEAM_STAFFING':
            return 'Team staffing';
        case 'SCHEDULE':
            return 'Schedule first';
        case 'OFF':
            return 'Ignore staffing conflicts';
        default:
            return 'Schedule first';
    }
};

export const formatMinutesTo12Hour = (totalMinutes: number): string => {
    const normalizedMinutes = ((totalMinutes % 1440) + 1440) % 1440;
    const hour24 = Math.floor(normalizedMinutes / 60);
    const minute = normalizedMinutes % 60;
    const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
    const meridiem = hour24 >= 12 ? 'PM' : 'AM';
    return `${hour12}:${String(minute).padStart(2, '0')} ${meridiem}`;
};

export const formatSlotTimeRange = (
    startMinutes: number | null | undefined,
    endMinutes: number | null | undefined,
): string => {
    const startLabel = typeof startMinutes === 'number' ? formatMinutesTo12Hour(startMinutes) : 'Start not set';
    const endLabel = typeof endMinutes === 'number' ? formatMinutesTo12Hour(endMinutes) : 'End not set';
    return `${startLabel} - ${endLabel}`;
};

export const getDayOfWeekLabel = (day: number): string => {
    switch (day) {
        case 0:
            return 'Monday';
        case 1:
            return 'Tuesday';
        case 2:
            return 'Wednesday';
        case 3:
            return 'Thursday';
        case 4:
            return 'Friday';
        case 5:
            return 'Saturday';
        case 6:
            return 'Sunday';
        default:
            return 'Unassigned day';
    }
};

export const buildScheduleTimeslotGroups = (slots: TimeSlot[]): Array<[number, TimeSlot[]]> => {
    if (!slots.length) {
        return [];
    }

    const grouped = new Map<number, TimeSlot[]>();
    slots.forEach((slot) => {
        const sourceDays = (
            Array.isArray(slot.daysOfWeek) && slot.daysOfWeek.length
                ? slot.daysOfWeek
                : typeof slot.dayOfWeek === 'number'
                    ? [slot.dayOfWeek]
                    : []
        )
            .map((value): number => Number(value))
            .filter((value): value is number => Number.isInteger(value) && value >= 0 && value <= 6);
        const normalizedDays = Array.from(new Set<number>(sourceDays));
        const targetDays = normalizedDays.length > 0 ? normalizedDays : [-1];
        targetDays.forEach((day) => {
            const existing = grouped.get(day) ?? [];
            existing.push(slot);
            grouped.set(day, existing);
        });
    });

    const dayOrder = [0, 1, 2, 3, 4, 5, 6, -1];
    return Array.from(grouped.entries())
        .sort((left, right) => dayOrder.indexOf(left[0]) - dayOrder.indexOf(right[0]))
        .map(([day, daySlots]) => [
            day,
            [...daySlots].sort((left, right) => {
                const leftStart = typeof left.startTimeMinutes === 'number' ? left.startTimeMinutes : Number.MAX_SAFE_INTEGER;
                const rightStart = typeof right.startTimeMinutes === 'number' ? right.startTimeMinutes : Number.MAX_SAFE_INTEGER;
                if (leftStart !== rightStart) {
                    return leftStart - rightStart;
                }
                const leftEnd = typeof left.endTimeMinutes === 'number' ? left.endTimeMinutes : Number.MAX_SAFE_INTEGER;
                const rightEnd = typeof right.endTimeMinutes === 'number' ? right.endTimeMinutes : Number.MAX_SAFE_INTEGER;
                return leftEnd - rightEnd;
            }),
        ]);
};

const getPublicDivisionGenderLabel = (gender: EventDivisionOption['gender']): string => {
    if (gender === 'M') return "Men's";
    if (gender === 'F') return "Women's";
    return 'Coed';
};

const stripDivisionGenderPrefix = (value: string): string => (
    value
        .replace(/^(mens|men'?s|womens|women'?s|coed|co-ed)\s+/i, '')
        .trim()
        || value
);

const stripDefaultAgePrefix = (value: string): string => (
    value
        .replace(/^open\s+/i, '')
        .trim()
        || value
);

const stripDefaultSkillAgeSuffix = (value: string): string => (
    value
        .replace(/\s+18\+$/i, '')
        .trim()
        || value
);

export const getPublicDivisionAgeSkillParts = (
    division: EventDivisionOption,
): { ageLabel: string; skillLabel: string } => {
    const compositeMatch = division.divisionTypeId.match(/^skill_(.+?)_age_([a-z0-9_]+)$/);
    const skillDivisionTypeId = compositeMatch
        ? compositeMatch[1]
        : division.ratingType === 'SKILL'
            ? division.divisionTypeId
            : 'open';
    const ageDivisionTypeId = compositeMatch
        ? compositeMatch[2]
        : division.ratingType === 'AGE'
            ? division.divisionTypeId
            : '18plus';
    const sportInput = division.sportId;
    const ageLabel = stripDefaultAgePrefix(stripDivisionGenderPrefix(deriveDivisionTypeDisplayName({
        sportInput,
        gender: 'C',
        ratingType: 'AGE',
        divisionTypeId: ageDivisionTypeId,
    })));
    const skillLabel = stripDefaultSkillAgeSuffix(stripDivisionGenderPrefix(deriveDivisionTypeDisplayName({
        sportInput,
        gender: 'C',
        ratingType: 'SKILL',
        divisionTypeId: skillDivisionTypeId,
    })));
    return {
        ageLabel,
        skillLabel,
    };
};

export type PublicDivisionSkillGroup = {
    key: string;
    label: string;
    options: EventDivisionOption[];
};

export type PublicDivisionAgeGroup = {
    key: string;
    label: string;
    skillGroups: PublicDivisionSkillGroup[];
};

export type PublicDivisionGenderGroup = {
    key: string;
    label: string;
    ageGroups: PublicDivisionAgeGroup[];
};

export const buildPublicDivisionGroups = (
    divisionOptions: EventDivisionOption[],
): PublicDivisionGenderGroup[] => {
    const genderGroups: PublicDivisionGenderGroup[] = [];
    const genderIndex = new Map<string, PublicDivisionGenderGroup>();

    divisionOptions.forEach((division) => {
        const genderKey = division.gender;
        let genderGroup = genderIndex.get(genderKey);
        if (!genderGroup) {
            genderGroup = {
                key: genderKey,
                label: getPublicDivisionGenderLabel(division.gender),
                ageGroups: [],
            };
            genderIndex.set(genderKey, genderGroup);
            genderGroups.push(genderGroup);
        }

        const { ageLabel, skillLabel } = getPublicDivisionAgeSkillParts(division);
        const ageKey = ageLabel.toLowerCase();
        let ageGroup = genderGroup.ageGroups.find((group) => group.key === ageKey);
        if (!ageGroup) {
            ageGroup = {
                key: ageKey,
                label: ageLabel,
                skillGroups: [],
            };
            genderGroup.ageGroups.push(ageGroup);
        }

        const skillKey = skillLabel.toLowerCase();
        let skillGroup = ageGroup.skillGroups.find((group) => group.key === skillKey);
        if (!skillGroup) {
            skillGroup = {
                key: skillKey,
                label: skillLabel,
                options: [],
            };
            ageGroup.skillGroups.push(skillGroup);
        }
        skillGroup.options.push(division);
    });

    return genderGroups;
};
