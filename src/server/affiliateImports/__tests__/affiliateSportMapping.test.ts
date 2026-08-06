import {
  BLACKLISTED_AFFILIATE_SPORT_NAMES,
  isAffiliateSportBlacklisted,
  validateAffiliateAgentSportName,
} from '../affiliateSportMapping';

describe('affiliate sport mapping policy', () => {
  it('accepts the newly supported canonical sports', () => {
    expect([
      'Field Hockey',
      'Lacrosse',
      'Table Tennis',
      'Australian Football',
      'Ball Hockey',
      'Futsal',
    ].map((sportName) => validateAffiliateAgentSportName(sportName, 'sportName'))).toEqual([
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
  });

  it.each(BLACKLISTED_AFFILIATE_SPORT_NAMES)('blacklists %s from executable mappings', (sportName) => {
    expect(isAffiliateSportBlacklisted(sportName)).toBe(true);
    expect(validateAffiliateAgentSportName(sportName, 'sportName')).toEqual(expect.objectContaining({
      code: 'SPORT_NOT_IN_CATALOG',
      sportName,
      canonicalSuggestion: null,
      message: expect.stringContaining('blacklisted'),
    }));
  });
});
