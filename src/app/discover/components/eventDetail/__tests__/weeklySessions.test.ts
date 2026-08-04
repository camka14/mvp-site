import { buildEvent, buildTimeSlot } from '../../../../../../test/factories';
import {
    buildWeeklySessionOptions,
    parseDateValue,
    resolveSelectedWeeklySessionOption,
} from '../weeklySessions';

describe('weekly event session calculations', () => {
    it('parses date-only values in local calendar time and rejects invalid dates', () => {
        const parsed = parseDateValue('2026-07-13');

        expect(parsed).not.toBeNull();
        expect(parsed?.getFullYear()).toBe(2026);
        expect(parsed?.getMonth()).toBe(6);
        expect(parsed?.getDate()).toBe(13);
        expect(parseDateValue('not-a-date')).toBeNull();
    });

    it('returns no sessions for non-weekly events or slots without a valid duration', () => {
        const league = buildEvent({
            eventType: 'LEAGUE',
            timeSlots: [buildTimeSlot({ startDate: '2026-07-13' })],
        });
        const invalidWeekly = buildEvent({
            eventType: 'WEEKLY_EVENT',
            timeSlots: [buildTimeSlot({
                startDate: '2026-07-13',
                startTimeMinutes: 600,
                endTimeMinutes: 600,
            })],
        });

        expect(buildWeeklySessionOptions(league, 2, new Date(2026, 6, 13))).toEqual([]);
        expect(buildWeeklySessionOptions(invalidWeekly, 2, new Date(2026, 6, 13))).toEqual([]);
    });

    it('builds sorted bounded occurrences and resolves canonical division labels', () => {
        const event = buildEvent({
            eventType: 'WEEKLY_EVENT',
            divisions: ['division-open'],
            divisionDetails: [{ id: 'division-open', name: 'Open' }] as any,
            timeSlots: [buildTimeSlot({
                $id: 'slot-weekly',
                dayOfWeek: undefined,
                daysOfWeek: [0, 2],
                divisions: ['division-open'],
                startDate: '2026-07-13',
                endDate: '2026-07-20',
                startTimeMinutes: 9 * 60,
                endTimeMinutes: 10 * 60 + 30,
            })],
        });

        const sessions = buildWeeklySessionOptions(event, 2, new Date(2026, 6, 13, 18));

        expect(sessions.map((session) => session.occurrenceDate)).toEqual([
            '2026-07-13',
            '2026-07-15',
            '2026-07-20',
        ]);
        expect(sessions.map((session) => session.id)).toEqual([
            'slot-weekly-2026-07-13',
            'slot-weekly-2026-07-15',
            'slot-weekly-2026-07-20',
        ]);
        expect(sessions.every((session) => session.divisionLabel === 'Open')).toBe(true);
        expect(sessions[0]?.start.getHours()).toBe(9);
        expect(sessions[0]?.end.getHours()).toBe(10);
        expect(sessions[0]?.end.getMinutes()).toBe(30);
    });

    it('shows a fixed supplemental slot once alongside weekly occurrences', () => {
        const event = buildEvent({
            eventType: 'WEEKLY_EVENT',
            timeSlots: [
                buildTimeSlot({
                    $id: 'slot-weekly',
                    repeating: true,
                    dayOfWeek: undefined,
                    daysOfWeek: [0],
                    startDate: '2026-07-13',
                    endDate: '2026-08-31',
                }),
                buildTimeSlot({
                    $id: 'slot-fixed',
                    repeating: false,
                    dayOfWeek: undefined,
                    daysOfWeek: [],
                    startDate: '2026-07-15',
                    endDate: '2026-07-15',
                    startTimeMinutes: 11 * 60,
                    endTimeMinutes: 12 * 60,
                }),
            ],
        });

        const sessions = buildWeeklySessionOptions(event, 3, new Date(2026, 6, 13));

        expect(sessions.filter((session) => session.slotId === 'slot-weekly')).toHaveLength(3);
        expect(sessions.filter((session) => session.slotId === 'slot-fixed')).toEqual([
            expect.objectContaining({
                id: 'slot-fixed-2026-07-15',
                occurrenceDate: '2026-07-15',
            }),
        ]);
        expect(resolveSelectedWeeklySessionOption(event, {
            slotId: 'slot-fixed',
            occurrenceDate: '2026-07-15',
        })).not.toBeNull();
        expect(resolveSelectedWeeklySessionOption(event, {
            slotId: 'slot-fixed',
            occurrenceDate: '2026-07-22',
        })).toBeNull();
    });

    it('resolves an explicitly selected occurrence and rejects invalid slot dates', () => {
        const event = buildEvent({
            eventType: 'WEEKLY_EVENT',
            divisions: ['division-open'],
            divisionDetails: [{ id: 'division-open', name: 'Open' }] as any,
            timeSlots: [buildTimeSlot({
                $id: 'slot-weekly',
                dayOfWeek: undefined,
                daysOfWeek: [0, 2],
                divisions: ['division-open'],
                startDate: '2026-07-13',
                endDate: '2026-08-31',
                startTimeMinutes: 18 * 60,
                endTimeMinutes: 19 * 60,
            })],
        });

        const selected = resolveSelectedWeeklySessionOption(event, {
            slotId: 'slot-weekly',
            occurrenceDate: '2026-08-19',
        });

        expect(selected).toMatchObject({
            id: 'slot-weekly-2026-08-19',
            slotId: 'slot-weekly',
            occurrenceDate: '2026-08-19',
            divisionLabel: 'Open',
        });
        expect(selected?.start.getHours()).toBe(18);
        expect(selected?.end.getHours()).toBe(19);
        expect(resolveSelectedWeeklySessionOption(event, {
            slotId: 'slot-weekly',
            occurrenceDate: '2026-08-18',
        })).toBeNull();
        expect(resolveSelectedWeeklySessionOption(event, {
            slotId: 'missing-slot',
            occurrenceDate: '2026-08-19',
        })).toBeNull();
        expect(resolveSelectedWeeklySessionOption(event, {
            slotId: 'slot-weekly',
            occurrenceDate: '2026-09-02',
        })).toBeNull();
    });
});
