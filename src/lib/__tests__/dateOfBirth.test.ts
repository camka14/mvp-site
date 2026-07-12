import { isFutureDateOfBirth, parseDateOfBirth } from '@/lib/dateOfBirth';

describe('date of birth validation', () => {
  it('keeps valid date-only values on their intended UTC calendar day', () => {
    expect(parseDateOfBirth('2012-02-29')?.toISOString()).toBe('2012-02-29T00:00:00.000Z');
    expect(parseDateOfBirth('2012-02-30')).toBeNull();
  });

  it('uses the date portion of ISO input instead of its client timezone', () => {
    expect(parseDateOfBirth('2026-07-12T23:00:00-07:00')?.toISOString()).toBe('2026-07-12T00:00:00.000Z');
  });

  it('allows today but rejects future calendar dates', () => {
    const today = new Date('2026-07-12T23:59:59.000Z');

    expect(isFutureDateOfBirth(new Date('2026-07-12T00:00:00.000Z'), today)).toBe(false);
    expect(isFutureDateOfBirth(new Date('2026-07-13T00:00:00.000Z'), today)).toBe(true);
  });
});
