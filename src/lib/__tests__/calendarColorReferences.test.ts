import { buildUniqueColorReferenceList } from '../calendarColorReferences';

describe('buildUniqueColorReferenceList', () => {
  it('keeps the first normalized occurrence in source order', () => {
    expect(buildUniqueColorReferenceList([' Alpha ', 'beta', 'ALPHA', null, '', 'Gamma'])).toEqual([
      'Alpha',
      'beta',
      'Gamma',
    ]);
  });
});
