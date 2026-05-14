import {
  calendarDateInTimeZoneToInstant,
  formatDateTimeInTimeZone,
  instantToCalendarDateInTimeZone,
  parseDateTimeInTimeZone,
} from '../dateUtils';

describe('local date/time utilities', () => {
  it('converts Pacific wall-clock datetime strings to UTC with daylight saving time', () => {
    expect(parseDateTimeInTimeZone('2026-05-01T09:00:00', 'America/Los_Angeles')?.toISOString())
      .toBe('2026-05-01T16:00:00.000Z');
    expect(parseDateTimeInTimeZone('2026-12-01T09:00:00', 'America/Los_Angeles')?.toISOString())
      .toBe('2026-12-01T17:00:00.000Z');
  });

  it('preserves explicit UTC instants when a timezone is provided', () => {
    expect(parseDateTimeInTimeZone('2026-05-01T09:00:00.000Z', 'America/Los_Angeles')?.toISOString())
      .toBe('2026-05-01T09:00:00.000Z');
  });

  it('formats UTC instants as wall-clock values in the requested timezone', () => {
    expect(formatDateTimeInTimeZone('2026-05-01T16:00:00.000Z', 'America/Los_Angeles'))
      .toBe('2026-05-01T09:00:00');
  });

  it('converts calendar-local dates back to event-timezone instants', () => {
    const calendarDate = instantToCalendarDateInTimeZone('2026-05-01T16:00:00.000Z', 'America/Los_Angeles');
    expect(calendarDate).not.toBeNull();
    expect(calendarDate?.getFullYear()).toBe(2026);
    expect(calendarDate?.getMonth()).toBe(4);
    expect(calendarDate?.getDate()).toBe(1);
    expect(calendarDate?.getHours()).toBe(9);

    expect(calendarDateInTimeZoneToInstant(calendarDate, 'America/Los_Angeles')?.toISOString())
      .toBe('2026-05-01T16:00:00.000Z');
  });
});
