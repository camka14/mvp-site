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
  metadata: {
    coveredCities: [
      { city: 'Portland', state: 'Oregon' },
      { city: 'Gresham', state: 'Oregon' },
    ],
  },
};

const sports = [{ id: 'sport_soccer', name: 'Soccer' }];

describe('affiliate source discovery rules', () => {
  it('generates bounded deterministic queries and advances the cursor', () => {
    const first = generateAffiliateSourceDiscoveryQueries(campaign, sports, 0);
    const repeated = generateAffiliateSourceDiscoveryQueries(campaign, sports, 0);
    expect(first).toEqual(repeated);
    expect(first.queries).toHaveLength(3);
    expect(first.queries[0].query).toContain('Portland, Oregon Soccer clubs academies competitive programs official');
    expect(first.queries[1].query).toContain('Gresham, Oregon Soccer clubs academies competitive programs official');
    expect(first.queries.every((query) => query.templateKey !== 'broad-directory')).toBe(true);
    expect(first.nextCursor).toBe(3);

    const final = generateAffiliateSourceDiscoveryQueries(
      { ...campaign, sourceTypeHints: ['CLUB'], maxQueriesPerRun: 3 },
      sports,
      0,
    );
    expect(final.queries.at(-1)).toEqual(expect.objectContaining({ templateKey: 'broad-directory' }));
    expect(final.nextCursor).toBe(0);
  });

  it('rotates across every selected sport before later source-type templates', () => {
    const selectedSports = [
      { id: 'sport_indoor_volleyball', name: 'Indoor Volleyball' },
      { id: 'sport_beach_volleyball', name: 'Beach Volleyball' },
      { id: 'sport_indoor_soccer', name: 'Indoor Soccer' },
      { id: 'sport_grass_soccer', name: 'Grass Soccer' },
      { id: 'sport_basketball', name: 'Basketball' },
    ];
    const generated = generateAffiliateSourceDiscoveryQueries(
      { ...campaign, maxQueriesPerRun: 10 },
      selectedSports,
      0,
    );

    expect(generated.queries.map((query) => [query.targetCity, query.sportName, query.sourceType, query.templateKey])).toEqual([
      ['Portland', 'Indoor Volleyball', 'CLUB', 'PROFILE:clubs-programs'],
      ['Portland', 'Beach Volleyball', 'CLUB', 'PROFILE:clubs-programs'],
      ['Portland', 'Indoor Soccer', 'CLUB', 'PROFILE:clubs-programs'],
      ['Portland', 'Grass Soccer', 'CLUB', 'PROFILE:clubs-programs'],
      ['Portland', 'Basketball', 'CLUB', 'PROFILE:clubs-programs'],
      ['Gresham', 'Indoor Volleyball', 'CLUB', 'PROFILE:clubs-programs'],
      ['Gresham', 'Beach Volleyball', 'CLUB', 'PROFILE:clubs-programs'],
      ['Gresham', 'Indoor Soccer', 'CLUB', 'PROFILE:clubs-programs'],
      ['Gresham', 'Grass Soccer', 'CLUB', 'PROFILE:clubs-programs'],
      ['Gresham', 'Basketball', 'CLUB', 'PROFILE:clubs-programs'],
    ]);
    expect(generated.nextCursor).toBe(10);
    expect(generated.queries.some((query) => query.sportName === 'Basketball')).toBe(true);
    expect(generated.queries[3].query).toContain('outdoor soccer clubs academies competitive programs official');
  });

  it('finishes a query cycle without wrapping and duplicating earlier combinations', () => {
    const nearEnd = generateAffiliateSourceDiscoveryQueries(
      { ...campaign, sourceTypeHints: ['CLUB'], maxQueriesPerRun: 3 },
      sports,
      0,
    );

    expect(nearEnd.queries.map((query) => query.templateKey)).toEqual([
      'PROFILE:clubs-programs',
      'PROFILE:clubs-programs',
      'broad-directory',
    ]);
    expect(nearEnd.nextCursor).toBe(0);
  });

  it('disambiguates American football from soccer in US discovery queries', () => {
    const footballQueries = generateAffiliateSourceDiscoveryQueries(
      campaign,
      [{ id: 'sport_football', name: 'Football' }],
      0,
    );
    expect(footballQueries.queries[0].query).toContain('American football clubs academies competitive programs official');
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
    expect(result.classification).toBe('DIRECT_SOURCE');
    expect(result.autoPromotionEligible).toBe(true);
    expect(result.canonicalUrl).toBe('https://rivercitysoccer.example/tryouts');
    expect(result.reasonCodes).toEqual(expect.arrayContaining(['SELECTED_SPORT', 'PUBLIC_ACTION']));
    expect(result.reasonCodes).not.toContain('CURRENT_YEAR');
  });

  it('keeps directories and marketplaces for review without allowing automatic promotion', () => {
    const query = {
      ...generateAffiliateSourceDiscoveryQueries(campaign, sports, 0).queries[0],
      sourceType: 'EVENT',
      profileSourceTypes: ['EVENT', 'LEAGUE', 'TOURNAMENT'],
    };
    for (const url of [
      'https://www.yelp.com/search?find_desc=Soccer+League&find_loc=Portland%2C+OR',
      'https://www.eventbrite.com/d/or--portland/soccer-league/',
      'https://www.reddit.com/r/Portland/comments/example/soccer_league/',
      'https://www.meetup.com/portland-soccer',
      'https://www.ticketmaster.com/portland-soccer/event/example',
      'https://www.imleagues.com/School/Sport/Home.aspx?Sport=example',
      'https://www.ussportscamps.com/soccer/oregon/portland',
      'https://portland.usetopscore.com/events',
      'https://app.utrsports.net/united-states/oregon/tennis-tournaments',
    ]) {
      const result = evaluateAffiliateSourceDiscoveryResult({
        url,
        title: 'Portland Oregon Soccer League Events Registration 2026',
        description: 'Find local sports clubs, schedules, registration, and events.',
        query,
        campaignRegion: campaign.region,
        selectedSports: sports,
        currentYear: 2026,
      });
      expect(result.status).toBe('REVIEW_REQUIRED');
      expect(result.classification).toBe('INTERMEDIARY');
      expect(result.autoPromotionEligible).toBe(false);
      expect(result.reasonCodes).toContain('INTERMEDIARY_SOURCE');
    }
  });

  it('requires city evidence and matching query intent for automatic promotion', () => {
    const query = {
      ...generateAffiliateSourceDiscoveryQueries(campaign, sports, 0).queries[0],
      sourceType: 'RENTAL',
      profileSourceTypes: ['RENTAL'],
    };
    const remote = evaluateAffiliateSourceDiscoveryResult({
      url: 'https://eugene-soccer.example/rentals',
      title: 'Oregon Soccer Club Field Rentals',
      description: 'Reserve soccer fields for league events.',
      query,
      campaignRegion: campaign.region,
      selectedSports: sports,
      currentYear: 2026,
    });
    expect(remote.status).toBe('REVIEW_REQUIRED');
    expect(remote.autoPromotionEligible).toBe(false);
    expect(remote.reasonCodes).toContain('STATE_ONLY');

    const wrongProfile = evaluateAffiliateSourceDiscoveryResult({
      url: 'https://portland-soccer.example/events',
      title: 'Portland Oregon Soccer Tournament Registration',
      description: 'Upcoming soccer tournament schedule and events.',
      query,
      campaignRegion: campaign.region,
      selectedSports: sports,
      currentYear: 2026,
    });
    expect(wrongProfile.autoPromotionEligible).toBe(false);
    expect(wrongProfile.reasonCodes).toContain('PROFILE_MISMATCH');
  });

  it('recognizes official reservation-detail paths and fields for rent as rentals', () => {
    const selectedSports = [
      { id: 'sport_beach_volleyball', name: 'Beach Volleyball' },
      { id: 'sport_grass_soccer', name: 'Grass Soccer' },
    ];
    const rentalQuery = (sportId: string, sportName: string) => ({
      query: `Houston, Texas ${sportName} field court facility rentals reservations official`,
      sportId,
      sportName,
      sourceType: 'RENTAL',
      profileSourceTypes: ['RENTAL'],
      templateKey: 'PROFILE:facilities-rentals',
      targetCity: 'Houston',
      targetState: 'Texas',
    });
    const reservation = evaluateAffiliateSourceDiscoveryResult({
      url: 'https://anc.apm.activecommunities.com/houstonparks/reservation/search/detail/81',
      title: 'Houston Memorial: Sand Volleyball Court #2',
      description: 'View availability and reserve this public court.',
      query: rentalQuery('sport_beach_volleyball', 'Beach Volleyball'),
      campaignRegion: 'Houston, Texas metropolitan area',
      selectedSports,
      currentYear: 2026,
    });
    expect(reservation.sourceTypeHints).toContain('RENTAL');
    expect(reservation.status).toBe('NEW');

    const forRent = evaluateAffiliateSourceDiscoveryResult({
      url: 'https://www.facilitron.com/tx/houston/soccer-field',
      title: 'Soccer Fields For Rent In Houston, TX',
      description: 'Browse Houston soccer field availability and book online.',
      query: rentalQuery('sport_grass_soccer', 'Grass Soccer'),
      campaignRegion: 'Houston, Texas metropolitan area',
      selectedSports,
      currentYear: 2026,
    });
    expect(forRent.sourceTypeHints).toContain('RENTAL');
    expect(forRent.status).toBe('NEW');
  });

  it('keeps spectator and editorial event pages out of automatic promotion', () => {
    const query = {
      ...generateAffiliateSourceDiscoveryQueries(campaign, sports, 0).queries[0],
      sourceType: 'EVENT',
      profileSourceTypes: ['EVENT', 'LEAGUE', 'TOURNAMENT'],
    };
    const result = evaluateAffiliateSourceDiscoveryResult({
      url: 'https://official-sports.example/press-releases/soccer-showcase',
      title: 'Portland Soccer Showcase Tickets On Sale',
      description: 'Watch live from Portland Oregon. Buy tickets at the box office.',
      query,
      campaignRegion: campaign.region,
      selectedSports: sports,
      currentYear: 2026,
    });

    expect(result.status).toBe('REVIEW_REQUIRED');
    expect(result.classification).toBe('INTERMEDIARY');
    expect(result.autoPromotionEligible).toBe(false);
    expect(result.reasonCodes).toEqual(expect.arrayContaining([
      'EDITORIAL_PAGE',
      'NON_PARTICIPATION_PAGE',
    ]));
  });

  it('maps generic soccer and volleyball language to query-scoped canonical sports', () => {
    const selectedSports = [
      { id: 'sport_grass_soccer', name: 'Grass Soccer' },
      { id: 'sport_indoor_volleyball', name: 'Indoor Volleyball' },
    ];
    const soccer = evaluateAffiliateSourceDiscoveryResult({
      url: 'https://chicago-fire.example/tryouts',
      title: 'Chicago Fire Youth Soccer Club Tryouts',
      description: 'Chicago Illinois competitive soccer academy registration.',
      query: {
        query: 'Chicago, Illinois outdoor soccer tryouts evaluations official',
        sportId: 'sport_grass_soccer',
        sportName: 'Grass Soccer',
        sourceType: 'TRYOUT',
        profileSourceTypes: ['TRYOUT'],
        templateKey: 'PROFILE:tryouts-evaluations',
        targetCity: 'Chicago',
        targetState: 'Illinois',
      },
      campaignRegion: 'Chicago, Illinois metropolitan area',
      selectedSports,
      currentYear: 2026,
    });
    expect(soccer.sportHints).toContain('sport_grass_soccer');

    const volleyball = evaluateAffiliateSourceDiscoveryResult({
      url: 'https://chicago-volleyball.example/',
      title: 'Chicago Elite Volleyball Club',
      description: 'Chicago Illinois volleyball academy and club programs.',
      query: {
        query: 'Chicago, Illinois Indoor Volleyball clubs academies competitive programs official',
        sportId: 'sport_indoor_volleyball',
        sportName: 'Indoor Volleyball',
        sourceType: 'CLUB',
        profileSourceTypes: ['CLUB'],
        templateKey: 'PROFILE:clubs-programs',
        targetCity: 'Chicago',
        targetState: 'Illinois',
      },
      campaignRegion: 'Chicago, Illinois metropolitan area',
      selectedSports,
      currentYear: 2026,
    });
    expect(volleyball.sportHints).toContain('sport_indoor_volleyball');
  });

  it('rejects closed or completed one-time opportunities without penalizing evergreen clubs', () => {
    const query = {
      query: 'Houston, Texas Hockey tryouts evaluations official',
      sportId: 'sport_hockey',
      sportName: 'Hockey',
      sourceType: 'TRYOUT',
      profileSourceTypes: ['TRYOUT'],
      templateKey: 'PROFILE:tryouts-evaluations',
      targetCity: 'Houston',
      targetState: 'Texas',
    };
    const past = evaluateAffiliateSourceDiscoveryResult({
      url: 'https://houston-hockey.example/tryouts',
      title: 'Houston Hockey Tryouts July 20, 2026',
      description: 'Registration closed. Event is over.',
      query,
      campaignRegion: 'Houston, Texas metropolitan area',
      selectedSports: [{ id: 'sport_hockey', name: 'Hockey' }],
      currentYear: 2026,
      now: new Date('2026-07-28T12:00:00Z'),
    });
    expect(past.status).toBe('REJECTED');
    expect(past.autoPromotionEligible).toBe(false);
    expect(past.reasonCodes).toEqual(expect.arrayContaining(['CLOSED_OR_ENDED', 'PAST_DATE']));

    const club = evaluateAffiliateSourceDiscoveryResult({
      url: 'https://houston-hockey.example/',
      title: 'Houston Hockey Club',
      description: 'Serving Houston athletes since 1998 with club programs and registration.',
      query: { ...query, sourceType: 'CLUB', profileSourceTypes: ['CLUB'], templateKey: 'PROFILE:clubs-programs' },
      campaignRegion: 'Houston, Texas metropolitan area',
      selectedSports: [{ id: 'sport_hockey', name: 'Hockey' }],
      currentYear: 2026,
      now: new Date('2026-07-28T12:00:00Z'),
    });
    expect(club.reasonCodes).not.toContain('STALE_YEAR');
    expect(club.status).toBe('NEW');
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
    expect(affiliateDiscoveryPolicyKeyForUrl(
      'https://clubs.bluesombrero.com/Default.aspx?tabid=1460432',
    )).toBe('clubs.bluesombrero.com/tabid:1460432');
  });
});
