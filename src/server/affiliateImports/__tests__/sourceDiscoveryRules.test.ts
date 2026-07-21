/** @jest-environment node */

import {
  affiliateDiscoveryPolicyKeyForUrl,
  evaluateAffiliateSourceDiscoveryResult,
  generateAffiliateSourceDiscoveryQueries,
} from '@/server/affiliateImports/sourceDiscoveryRules';

const campaign = {
  region: 'Portland, Oregon metropolitan area',
  location: 'Portland, Oregon',
  sourceTypeHints: ['CLUB', 'TRYOUT', 'RENTAL'],
  maxQueriesPerRun: 3,
};

const sports = [{ id: 'sport_soccer', name: 'Soccer' }];

describe('affiliate source discovery rules', () => {
  it('generates bounded deterministic queries and advances the cursor', () => {
    const first = generateAffiliateSourceDiscoveryQueries(campaign, sports, 0);
    const repeated = generateAffiliateSourceDiscoveryQueries(campaign, sports, 0);
    expect(first).toEqual(repeated);
    expect(first.queries).toHaveLength(3);
    expect(first.queries[0].query).toContain('Portland, Oregon Soccer club official');
    expect(first.queries[0].query).not.toContain('"');
    expect(first.nextCursor).toBe(3);
  });

  it('disambiguates American football from soccer in US discovery queries', () => {
    const footballQueries = generateAffiliateSourceDiscoveryQueries(
      campaign,
      [{ id: 'sport_football', name: 'Football' }],
      0,
    );
    expect(footballQueries.queries[0].query).toContain('American football club official');
  });

  it('scores an official current regional club page for automatic intake', () => {
    const result = evaluateAffiliateSourceDiscoveryResult({
      url: 'https://rivercitysoccer.example/tryouts?utm_source=search',
      title: 'River City Soccer Club Tryouts 2026',
      description: 'Portland Oregon competitive soccer academy registration and events',
      query: generateAffiliateSourceDiscoveryQueries(campaign, sports, 0).queries[0],
      campaignRegion: campaign.region,
      selectedSports: sports,
      currentYear: 2026,
    });
    expect(result.status).toBe('NEW');
    expect(result.score).toBeGreaterThanOrEqual(75);
    expect(result.canonicalUrl).toBe('https://rivercitysoccer.example/tryouts');
    expect(result.reasonCodes).toEqual(expect.arrayContaining(['SELECTED_SPORT', 'PUBLIC_ACTION']));
  });

  it('rejects social and stale editorial results', () => {
    const query = generateAffiliateSourceDiscoveryQueries(campaign, sports, 0).queries[0];
    expect(evaluateAffiliateSourceDiscoveryResult({
      url: 'https://facebook.com/rivercitysoccer',
      title: 'River City Soccer',
      query,
      campaignRegion: campaign.region,
      selectedSports: sports,
    })).toEqual(expect.objectContaining({ status: 'REJECTED', reasonCodes: ['SOCIAL_ONLY'] }));

    expect(evaluateAffiliateSourceDiscoveryResult({
      url: 'https://news.example.com/2019-soccer-recap',
      title: 'Portland Soccer Club 2019 season recap article',
      query,
      campaignRegion: campaign.region,
      selectedSports: sports,
      currentYear: 2026,
    }).status).not.toBe('NEW');
  });

  it('rejects non-source hosts and region-only documents without sports signals', () => {
    const query = generateAffiliateSourceDiscoveryQueries(campaign, sports, 0).queries[0];
    expect(evaluateAffiliateSourceDiscoveryResult({
      url: 'https://github.com/example/academy-keywords',
      title: 'Academy keyword list',
      query,
      campaignRegion: campaign.region,
      selectedSports: sports,
    })).toEqual(expect.objectContaining({ status: 'REJECTED', reasonCodes: ['NON_SOURCE_HOST'] }));

    const unrelated = evaluateAffiliateSourceDiscoveryResult({
      url: 'https://example.com/portland-office-report',
      title: 'Portland Oregon metropolitan area annual report',
      query,
      campaignRegion: campaign.region,
      selectedSports: sports,
    });
    expect(unrelated.status).toBe('REJECTED');
    expect(unrelated.reasonCodes).toContain('NO_SPORTS_SIGNAL');
  });

  it('uses registrable domains and isolates shared-platform tenants', () => {
    expect(affiliateDiscoveryPolicyKeyForUrl('https://events.example.co.uk/tryouts')).toBe('example.co.uk');
    expect(affiliateDiscoveryPolicyKeyForUrl('https://stonewallsportssf.leagueapps.com/leagues')).toBe('stonewallsportssf.leagueapps.com');
    expect(affiliateDiscoveryPolicyKeyForUrl('https://facilitron.com/smccd')).toBe('facilitron.com/smccd');
  });
});
