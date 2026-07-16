/** @jest-environment node */

import { parseAffiliateSourceIntakeDelimitedText } from '@/server/affiliateImports/sourceIntakeImport';

describe('affiliate source intake bulk import parser', () => {
  it('groups repeated TSV source rows into related pages', () => {
    const parsed = parseAffiliateSourceIntakeDelimitedText([
      'Name\tURL\tRegion\tKinds\tRole',
      'SF Glens\thttps://example.com/\tBay Area\tCLUB\tHOME',
      'SF Glens\thttps://example.com/tryouts\tBay Area\tEVENT|CLUB\tREGISTRATION',
    ].join('\n'));

    expect(parsed.rejected).toEqual([]);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]).toEqual(expect.objectContaining({
      sourceKey: 'sf-glens',
      targetKindHints: ['CLUB', 'EVENT'],
      pages: [
        expect.objectContaining({ role: 'HOME' }),
        expect.objectContaining({ role: 'REGISTRATION' }),
      ],
    }));
  });

  it('supports quoted CSV cells and reports incomplete rows', () => {
    const parsed = parseAffiliateSourceIntakeDelimitedText([
      'Name,URL,Notes',
      '"Club, One",https://example.com,"Tryouts, rentals"',
      'Missing URL,,note',
    ].join('\n'));

    expect(parsed.rows[0].name).toBe('Club, One');
    expect(parsed.rows[0].notes).toBe('Tryouts, rentals');
    expect(parsed.rejected).toEqual([{ row: 3, reason: 'Name and URL are required.' }]);
  });
});
