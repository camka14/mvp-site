import {
  CENSUS_CITY_CAMPAIGN_SOURCE,
  US_CITY_DISCOVERY_CAMPAIGN_TEMPLATES,
} from '@/server/affiliateImports/sourceDiscoveryCampaignTemplates';

describe('U.S. city discovery campaign templates', () => {
  it('covers every top-50 city exactly once in Census rank order', () => {
    const covered = US_CITY_DISCOVERY_CAMPAIGN_TEMPLATES
      .flatMap((campaign) => campaign.coveredCities)
      .sort((left, right) => left.rank - right.rank);

    expect(covered.map((entry) => entry.rank)).toEqual(Array.from({ length: 50 }, (_, index) => index + 1));
    expect(new Set(covered.map((entry) => `${entry.city}, ${entry.state}`)).size).toBe(50);
    expect(US_CITY_DISCOVERY_CAMPAIGN_TEMPLATES).toHaveLength(44);
    expect(US_CITY_DISCOVERY_CAMPAIGN_TEMPLATES.map((entry) => entry.priorityRank)).toEqual(
      [...US_CITY_DISCOVERY_CAMPAIGN_TEMPLATES.map((entry) => entry.priorityRank)].sort((left, right) => left - right),
    );
    expect(CENSUS_CITY_CAMPAIGN_SOURCE.vintage).toBe(2025);
  });

  it('consolidates overlapping cities into shared metro campaigns', () => {
    expect(US_CITY_DISCOVERY_CAMPAIGN_TEMPLATES.find((entry) => entry.name === 'San Francisco Bay Area Sports Sources')?.coveredCities)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ city: 'San Jose', rank: 13 }),
        expect.objectContaining({ city: 'San Francisco', rank: 17 }),
        expect.objectContaining({ city: 'Oakland', rank: 45 }),
      ]));
    expect(US_CITY_DISCOVERY_CAMPAIGN_TEMPLATES.find((entry) => entry.name === 'Dallas-Fort Worth Metro Sports Sources')?.coveredCities)
      .toHaveLength(2);
  });
});
