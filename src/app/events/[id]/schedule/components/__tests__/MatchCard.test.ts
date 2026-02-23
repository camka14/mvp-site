import { resolveDivisionLabel } from '../MatchCard';

describe('resolveDivisionLabel', () => {
  it('returns explicit division names from hydrated objects', () => {
    const label = resolveDivisionLabel({ name: '  Premier  ' } as any);
    expect(label).toBe('Premier');
  });

  it('infers a display label when division is a string identifier', () => {
    const label = resolveDivisionLabel('open');
    expect(label).not.toBe('TBD');
    expect(label.toLowerCase()).toContain('open');
  });

  it('infers a display label when division object has only an id', () => {
    const label = resolveDivisionLabel({ id: 'rec' } as any);
    expect(label).not.toBe('TBD');
    expect(label.toLowerCase()).toContain('rec');
  });

  it('returns TBD for empty/unsupported values', () => {
    expect(resolveDivisionLabel(undefined)).toBe('TBD');
    expect(resolveDivisionLabel(null)).toBe('TBD');
    expect(resolveDivisionLabel('   ')).toBe('TBD');
  });
});
