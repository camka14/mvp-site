import { calculateAgeOnDate, formatAgeRange, isAgeWithinRange } from '@/lib/age';

describe('age utils', () => {
  describe('calculateAgeOnDate', () => {
    it('returns the expected age before and on the birthday', () => {
      const dob = new Date('2000-02-10T00:00:00.000Z');

      expect(calculateAgeOnDate(dob, new Date('2025-02-09T12:00:00.000Z'))).toBe(24);
      expect(calculateAgeOnDate(dob, new Date('2025-02-10T00:00:00.000Z'))).toBe(25);
    });

    it('handles Feb 29 birthdays in non-leap years (age increments after Feb 28)', () => {
      const dob = new Date('2000-02-29T00:00:00.000Z');

      expect(calculateAgeOnDate(dob, new Date('2025-02-28T23:59:59.000Z'))).toBe(24);
      expect(calculateAgeOnDate(dob, new Date('2025-03-01T00:00:00.000Z'))).toBe(25);
    });

    it('returns NaN for invalid dates', () => {
      expect(calculateAgeOnDate(new Date('nope'), new Date())).toEqual(Number.NaN);
      expect(calculateAgeOnDate(new Date(), new Date('nope'))).toEqual(Number.NaN);
    });
  });

  describe('isAgeWithinRange', () => {
    it('accepts when no limits are set', () => {
      expect(isAgeWithinRange(10, null, null)).toBe(true);
      expect(isAgeWithinRange(10, undefined, undefined)).toBe(true);
    });

    it('enforces min/max bounds', () => {
      expect(isAgeWithinRange(17, 18, null)).toBe(false);
      expect(isAgeWithinRange(18, 18, null)).toBe(true);
      expect(isAgeWithinRange(36, null, 35)).toBe(false);
      expect(isAgeWithinRange(35, null, 35)).toBe(true);
      expect(isAgeWithinRange(20, 18, 35)).toBe(true);
      expect(isAgeWithinRange(40, 18, 35)).toBe(false);
    });
  });

  describe('formatAgeRange', () => {
    it('formats min/max combinations', () => {
      expect(formatAgeRange(18, 35)).toBe('18-35');
      expect(formatAgeRange(18, null)).toBe('18+');
      expect(formatAgeRange(null, 12)).toBe('Up to 12');
      expect(formatAgeRange(undefined, undefined)).toBe('All ages');
    });
  });
});

