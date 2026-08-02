/** @jest-environment node */

import { analyzeAffiliateDescriptionQuality } from '../descriptionQuality';

describe('affiliate description quality', () => {
  it('flags discovery narration and a repeated event title', () => {
    expect(analyzeAffiliateDescriptionQuality({
      kind: 'EVENT',
      name: 'Brooklyn Summer Casual Mixed League 2026',
      description: 'Brooklyn Summer Casual Mixed League 2026 is listed by DiscNY as a casual mixed summer ultimate league.',
    })).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'DISCOVERY_NARRATION' }),
      expect.objectContaining({ code: 'TITLE_RESTATEMENT' }),
    ]));
  });

  it('accepts natural source-derived event copy', () => {
    expect(analyzeAffiliateDescriptionQuality({
      kind: 'EVENT',
      name: 'Brooklyn Summer Casual Mixed League 2026',
      description: 'A casual mixed ultimate league with weekly summer play in New York City from June through August.',
    })).toEqual([]);
  });

  it('flags organization discovery narration without rejecting a natural organization name', () => {
    expect(analyzeAffiliateDescriptionQuality({
      kind: 'ORGANIZATION',
      name: 'DiscNY',
      description: 'The official website lists DiscNY as a New York ultimate organization.',
    })).toEqual([expect.objectContaining({ code: 'DISCOVERY_NARRATION' })]);
    expect(analyzeAffiliateDescriptionQuality({
      kind: 'ORGANIZATION',
      name: 'DiscNY',
      description: 'DiscNY organizes leagues, tournaments, and community ultimate programs across New York City.',
    })).toEqual([]);
  });

  it('flags a missing description', () => {
    expect(analyzeAffiliateDescriptionQuality({
      kind: 'EVENT',
      name: 'Summer League',
      description: null,
    })).toEqual([expect.objectContaining({ code: 'MISSING_DESCRIPTION' })]);
  });
});
