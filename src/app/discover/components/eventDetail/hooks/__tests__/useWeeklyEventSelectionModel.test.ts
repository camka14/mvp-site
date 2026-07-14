import { renderHook } from '@testing-library/react';

import { buildEvent, buildTimeSlot } from '../../../../../../../test/factories';
import { useWeeklyEventSelectionModel } from '../useWeeklyEventSelectionModel';

function weeklyEvent() {
    return buildEvent({
        $id: 'weekly-event',
        eventType: 'WEEKLY_EVENT',
        parentEvent: undefined,
        organization: {
            $id: 'org-one',
            name: 'River City Sports Club',
            logoId: 'logo-one',
        } as never,
        timeSlots: [buildTimeSlot({
            $id: 'slot-weekly',
            dayOfWeek: undefined,
            daysOfWeek: [3],
            startDate: '2026-07-15',
            endDate: '2026-08-31',
            startTimeMinutes: 18 * 60,
            endTimeMinutes: 19 * 60,
        })],
    });
}

describe('useWeeklyEventSelectionModel', () => {
    it('builds the public URL and optional organization logo for every event', () => {
        const event = weeklyEvent();
        const { result } = renderHook(() => useWeeklyEventSelectionModel({
            event,
            selectedOccurrence: null,
        }));

        expect(result.current.eventPublicUrl).toContain('/events/weekly-event');
        expect(result.current.organizationLogoId).toBe('logo-one');
        expect(result.current.isWeeklyParentEvent).toBe(true);
    });

    it('requires a weekly selection when no complete occurrence is supplied', () => {
        const event = weeklyEvent();
        const { result } = renderHook(() => useWeeklyEventSelectionModel({
            event,
            selectedOccurrence: { slotId: '  ', occurrenceDate: '2026-07-15' },
        }));

        expect(result.current.selectedWeeklyOccurrence).toBeUndefined();
        expect(result.current.weeklySelectionRequired).toBe(true);
        expect(result.current.weeklySessionOptions.length).toBeGreaterThan(0);
    });

    it('normalizes and resolves a selected weekly occurrence', () => {
        const event = weeklyEvent();
        const { result, rerender } = renderHook(
            ({ selectedOccurrence }) => useWeeklyEventSelectionModel({
                event,
                selectedOccurrence,
            }),
            { initialProps: { selectedOccurrence: null as { slotId: string; occurrenceDate: string } | null } },
        );
        const available = result.current.weeklySessionOptions[0]!;

        rerender({
            selectedOccurrence: {
                slotId: ` ${available.slotId} `,
                occurrenceDate: ` ${available.occurrenceDate} `,
            },
        });

        expect(result.current.selectedWeeklyOccurrenceOption).toMatchObject({
            slotId: available.slotId,
            occurrenceDate: available.occurrenceDate,
        });
        expect(result.current.selectedWeeklyOccurrence).toEqual({
            slotId: available.slotId,
            occurrenceDate: available.occurrenceDate,
        });
        expect(result.current.weeklySelectionRequired).toBe(false);
    });

    it('does not impose weekly selection semantics on ordinary events', () => {
        const event = buildEvent({ eventType: 'TOURNAMENT' });
        const { result } = renderHook(() => useWeeklyEventSelectionModel({
            event,
            selectedOccurrence: null,
        }));

        expect(result.current.isWeeklyParentEvent).toBe(false);
        expect(result.current.weeklySessionOptions).toEqual([]);
        expect(result.current.weeklySelectionRequired).toBe(false);
    });
});
