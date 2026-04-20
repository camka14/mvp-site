import { formatStandingsDelta, formatStandingsPoints } from '@/lib/standingsDisplay';

describe('standingsDisplay', () => {
  describe('formatStandingsPoints', () => {
    it('keeps whole numbers compact', () => {
      expect(formatStandingsPoints(3)).toBe('3');
    });

    it('keeps decimal precision at two places', () => {
      expect(formatStandingsPoints(3.5)).toBe('3.50');
    });
  });

  describe('formatStandingsDelta', () => {
    it('adds a leading plus for positive adjustments', () => {
      expect(formatStandingsDelta(2)).toBe('(+2)');
    });

    it('renders zero without a mojibake glyph', () => {
      expect(formatStandingsDelta(0)).toBe('(0)');
    });

    it('preserves negative signs from the numeric value', () => {
      expect(formatStandingsDelta(-1.5)).toBe('(-1.50)');
    });
  });
});
