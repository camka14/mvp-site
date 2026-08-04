import type { LeagueSlotForm } from '@/app/discover/components/LeagueFields';

import {
    inferEventSetupScheduleStyle,
    normalizeScheduleSlotsForStyle,
    scheduleStyleChangeDiscardsConfiguredSlots,
} from '../scheduleStyle';

const buildSlot = (overrides: Partial<LeagueSlotForm> = {}): LeagueSlotForm => ({
    key: 'slot-1',
    repeating: true,
    conflicts: [],
    checking: false,
    ...overrides,
});

describe('Simple Setup schedule styles', () => {
    it('infers fixed, weekly, one-time, and mixed styles from saved slots', () => {
        const start = '2026-08-10T09:00:00';
        const end = '2026-08-10T17:00:00';
        expect(inferEventSetupScheduleStyle({
            eventType: 'LEAGUE',
            eventStart: start,
            eventEnd: end,
            slots: [buildSlot({ repeating: false, startDate: start, endDate: end })],
        })).toBe('FIXED_WINDOW');
        expect(inferEventSetupScheduleStyle({ eventType: 'LEAGUE', slots: [buildSlot()] })).toBe('WEEKLY_SLOTS');
        expect(inferEventSetupScheduleStyle({
            eventType: 'LEAGUE',
            eventStart: start,
            eventEnd: end,
            slots: [buildSlot({ repeating: false, startDate: '2026-08-11T09:00:00', endDate: '2026-08-11T17:00:00' })],
        })).toBe('FIXED_SLOTS');
        expect(inferEventSetupScheduleStyle({
            eventType: 'LEAGUE',
            slots: [
                buildSlot({ daysOfWeek: [0], startTimeMinutes: 540, endTimeMinutes: 600 }),
                buildSlot({
                    key: 'slot-2',
                    repeating: false,
                    startDate: '2026-08-12T10:00:00',
                    endDate: '2026-08-12T11:00:00',
                }),
            ],
        })).toBe('MIXED_SLOTS');
    });

    it('ignores an untouched placeholder slot when selecting the default event schedule style', () => {
        expect(inferEventSetupScheduleStyle({
            eventType: 'EVENT',
            slots: [buildSlot()],
        })).toBe('FIXED_WINDOW');
        expect(inferEventSetupScheduleStyle({
            eventType: 'LEAGUE',
            slots: [buildSlot()],
        })).toBe('WEEKLY_SLOTS');
    });

    it('keeps one fixed-window slot synchronized with event, resource, and division values', () => {
        const first = normalizeScheduleSlotsForStyle({
            style: 'FIXED_WINDOW',
            slots: [buildSlot({ key: 'kept-key' }), buildSlot({ key: 'removed-key' })],
            eventStart: '2026-08-10T09:15:00',
            eventEnd: '2026-08-10T17:45:00',
            timeZone: 'America/Los_Angeles',
            fieldIds: ['field-1', 'field-1', 'field-2'],
            divisionKeys: ['open', 'OPEN', 'elite'],
        });

        expect(first).toHaveLength(1);
        expect(first[0]).toEqual(expect.objectContaining({
            key: 'kept-key',
            repeating: false,
            startDate: '2026-08-10T09:15:00',
            endDate: '2026-08-10T17:45:00',
            startTimeMinutes: 9 * 60 + 15,
            endTimeMinutes: 17 * 60 + 45,
            scheduledFieldIds: ['field-1', 'field-2'],
            divisions: ['open', 'elite'],
            timeZone: 'America/Los_Angeles',
        }));

        expect(normalizeScheduleSlotsForStyle({
            style: 'FIXED_WINDOW',
            slots: first,
            eventStart: '2026-08-10T09:15:00',
            eventEnd: '2026-08-10T17:45:00',
            timeZone: 'America/Los_Angeles',
            fieldIds: ['field-1', 'field-2'],
            divisionKeys: ['open', 'elite'],
        })).toEqual(first);
    });

    it('preserves compatible slots and seeds the selected style when none remain', () => {
        const weekly = buildSlot({ key: 'weekly', repeating: true, daysOfWeek: [1] });
        const fixed = buildSlot({
            key: 'fixed',
            repeating: false,
            startDate: '2026-08-12T10:00:00',
            endDate: '2026-08-12T11:00:00',
        });
        expect(normalizeScheduleSlotsForStyle({
            style: 'WEEKLY_SLOTS',
            slots: [weekly, fixed],
        })).toEqual([weekly]);
        expect(normalizeScheduleSlotsForStyle({
            style: 'FIXED_SLOTS',
            slots: [weekly],
            eventStart: '2026-08-10T09:00:00',
            eventEnd: '2026-08-10T10:00:00',
        })[0]).toEqual(expect.objectContaining({
            repeating: false,
            startDate: '2026-08-10T09:00:00',
            endDate: '2026-08-10T10:00:00',
        }));
        expect(normalizeScheduleSlotsForStyle({
            style: 'MIXED_SLOTS',
            slots: [weekly, fixed],
        })).toEqual([weekly, fixed]);
    });

    it('requests confirmation only when a style change removes configured slots', () => {
        const weekly = buildSlot({ daysOfWeek: [1], startTimeMinutes: 540, endTimeMinutes: 600 });
        const fixed = buildSlot({
            key: 'fixed',
            repeating: false,
            startDate: '2026-08-12T10:00:00',
            endDate: '2026-08-12T11:00:00',
        });
        expect(scheduleStyleChangeDiscardsConfiguredSlots([weekly], 'FIXED_SLOTS')).toBe(true);
        expect(scheduleStyleChangeDiscardsConfiguredSlots([fixed], 'WEEKLY_SLOTS')).toBe(true);
        expect(scheduleStyleChangeDiscardsConfiguredSlots([weekly, fixed], 'MIXED_SLOTS')).toBe(false);
        expect(scheduleStyleChangeDiscardsConfiguredSlots([buildSlot({ daysOfWeek: [] })], 'FIXED_SLOTS')).toBe(false);
    });
});
