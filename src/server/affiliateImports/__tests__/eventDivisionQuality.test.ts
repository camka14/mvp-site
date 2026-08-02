/** @jest-environment node */

import { analyzeAffiliateEventDivisionQuality } from '../eventDivisionQuality';

const division = {
  key: 'c_skill_open_age_adult',
  name: 'Adult Open',
  gender: 'C',
  ratingType: 'SKILL',
  divisionTypeId: 'skill_open_age_adult',
  skillDivisionTypeId: 'open',
  ageDivisionTypeId: 'adult',
};

const event = (divisions: unknown[]) => ({
  id: 'candidate-1',
  title: 'Summer League',
  rawPayload: { normalizedImport: { divisions } },
});

describe('affiliate event division quality', () => {
  it('accepts an event with a fully classified source division', () => {
    expect(analyzeAffiliateEventDivisionQuality([event([division])])).toEqual({
      checkedEventCount: 1,
      validEventCount: 1,
      issueCount: 0,
      passed: true,
      issues: [],
    });
  });

  it('rejects an event without a division', () => {
    const result = analyzeAffiliateEventDivisionQuality([event([])]);
    expect(result.passed).toBe(false);
    expect(result.issues).toEqual([
      expect.objectContaining({ code: 'EVENT_DIVISION_REQUIRED', candidateId: 'candidate-1' }),
    ]);
  });

  it('rejects incomplete classifications and duplicate division keys', () => {
    const result = analyzeAffiliateEventDivisionQuality([event([
      { ...division, ageDivisionTypeId: null },
      division,
    ])]);
    expect(result.issues.map((issue) => issue.code)).toEqual([
      'EVENT_DIVISION_CLASSIFICATION_INVALID',
      'EVENT_DIVISION_DUPLICATE',
    ]);
  });

  it('does not require divisions for a package with no event candidates', () => {
    expect(analyzeAffiliateEventDivisionQuality([]).passed).toBe(true);
  });
});
