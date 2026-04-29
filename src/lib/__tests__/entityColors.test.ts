import {
  getEntityColorPair,
  getIndexedEntityColorPair,
  getOrderedEntityColorPair,
  hashEntityString,
  normalizeEntityColorKey,
  oklchToHex,
} from '../entityColors';

const hexColorPattern = /^#[0-9A-F]{6}$/;

describe('entityColors', () => {
  it('uses the same deterministic hash shape as initials avatars', () => {
    expect(hashEntityString('User')).toBe(2645995);
    expect(hashEntityString('Court Alpha')).toBe(468990537);
  });

  it('converts OKLCH colors to SVG-safe hex colors', () => {
    expect(oklchToHex(1, 0, 0)).toBe('#FFFFFF');
    expect(oklchToHex(0, 0, 0)).toBe('#000000');
  });

  it('generates deterministic seed colors as hex pairs', () => {
    const userColor = getEntityColorPair('User');
    expect(userColor).toEqual(getEntityColorPair('User'));
    expect(userColor).not.toEqual(getEntityColorPair('Court Alpha'));
    expect(userColor.bg).toMatch(hexColorPattern);
    expect(userColor.text).toMatch(hexColorPattern);
  });

  it('falls back to a stable default seed for blank values', () => {
    expect(getEntityColorPair('   ')).toEqual(getEntityColorPair(null));
  });

  it('normalizes ordered color keys with trimmed case-insensitive matching', () => {
    expect(normalizeEntityColorKey('  Court Alpha  ')).toBe('court alpha');
    expect(getOrderedEntityColorPair(['Court Alpha', 'Court Beta'], ' court beta ')).toEqual(getIndexedEntityColorPair(1));
  });

  it('assigns ordered colors by reference-list position', () => {
    expect(getOrderedEntityColorPair(['Court Alpha', 'Court Beta'], 'Court Alpha')).toEqual(getIndexedEntityColorPair(0));
    expect(getOrderedEntityColorPair(['Court Alpha', 'Court Beta'], 'Court Beta')).toEqual(getIndexedEntityColorPair(1));
  });

  it('generates distinct indexed colors for the first sixteen calendar slots', () => {
    const colors = Array.from({ length: 16 }, (_, index) => getIndexedEntityColorPair(index).bg);

    expect(new Set(colors).size).toBe(16);
    colors.forEach((color) => expect(color).toMatch(hexColorPattern));
  });

  it('continues generating indexed colors instead of cycling a fixed palette', () => {
    expect(getIndexedEntityColorPair(16)).not.toEqual(getIndexedEntityColorPair(0));
  });

  it('falls back to hashed colors for unknown or blank ordered match keys', () => {
    expect(getOrderedEntityColorPair(['Court Alpha'], 'Court Gamma')).toEqual(getEntityColorPair('Court Gamma'));
    expect(getOrderedEntityColorPair(['Court Alpha'], '   ')).toEqual(getEntityColorPair('   '));
  });
});
