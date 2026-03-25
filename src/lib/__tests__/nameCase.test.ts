import { formatNameParts, normalizeOptionalName, toNameCase } from '@/lib/nameCase';

describe('nameCase helpers', () => {
  it('uppercases only the first letter of each name token', () => {
    expect(toNameCase('sam raz')).toBe('Sam Raz');
  });

  it('preserves existing inner capitalization', () => {
    expect(toNameCase('sam McDonald')).toBe('Sam McDonald');
  });

  it('normalizes nullable names safely', () => {
    expect(normalizeOptionalName('  sam  ')).toBe('Sam');
    expect(normalizeOptionalName('   ')).toBeNull();
    expect(normalizeOptionalName(undefined)).toBeNull();
  });

  it('formats first and last name parts consistently', () => {
    expect(formatNameParts('sam', 'McDonald')).toBe('Sam McDonald');
  });
});
