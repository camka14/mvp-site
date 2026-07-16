const mockListPublicSitemapEntries = jest.fn();

jest.mock('@/server/publicSearchSeo', () => ({
  listPublicSitemapEntries: () => mockListPublicSitemapEntries(),
}));

jest.mock('@/server/publicSearchPages', () => ({
  listPublicSearchSitemapEntries: () => Promise.resolve([]),
  listRegularOrganizationProfileSitemapEntries: () => Promise.resolve([]),
  listRegularPublicEventSitemapEntries: () => Promise.resolve([]),
}));

import sitemap from '../sitemap';

describe('sitemap', () => {
  beforeEach(() => {
    mockListPublicSitemapEntries.mockReset();
    mockListPublicSitemapEntries.mockResolvedValue([]);
  });

  it('includes the blog hub, guide hub, published content, and public catalog canonical routes', async () => {
    mockListPublicSitemapEntries.mockResolvedValue([
      {
        url: 'https://bracket-iq.com/o/river-city/events/event_1',
        lastModified: new Date('2026-06-01T00:00:00.000Z'),
        changeFrequency: 'daily',
        priority: 0.75,
      },
    ]);

    const entries = await sitemap();
    const urls = entries.map((entry) => entry.url);

    expect(urls).toContain('https://bracket-iq.com/blog');
    expect(urls).toContain('https://bracket-iq.com/guides');
    expect(urls).toContain('https://bracket-iq.com/find-events');
    expect(urls).toContain('https://bracket-iq.com/find-clubs');
    expect(urls).toContain('https://bracket-iq.com/find-facilities');
    expect(urls).toContain('https://bracket-iq.com/mobile-app');
    expect(urls).toContain('https://bracket-iq.com/terms');
    expect(urls).toContain('https://bracket-iq.com/guides/event-organizers-one-place');
    expect(urls).toContain('https://bracket-iq.com/guides/facility-rentals-events-payments');
    expect(urls).toContain('https://bracket-iq.com/guides/manage-multiple-sports-facility');
    expect(urls).toContain('https://bracket-iq.com/blog/indoor-volleyball-league');
    expect(urls).toContain('https://bracket-iq.com/blog/indoor-volleyball-tournament');
    expect(urls).toContain('https://bracket-iq.com/blog/outdoor-volleyball-league');
    expect(urls).toContain('https://bracket-iq.com/guides/club-communication');
    expect(urls).toContain('https://bracket-iq.com/guides/manage-sports-club');
    expect(urls).toContain('https://bracket-iq.com/guides/club-players-parents-teams');
    expect(urls).toContain('https://bracket-iq.com/guides/manage-sports-facility');
    expect(urls).toContain('https://bracket-iq.com/guides/organization-payment-processing');
    expect(urls).toContain('https://bracket-iq.com/guides/create-organization-in-bracketiq');
    expect(urls).toContain('https://bracket-iq.com/guides/create-public-page-for-sports-organization');
    expect(urls).toContain('https://bracket-iq.com/guides/registration-league-tournament');
    expect(urls).toContain('https://bracket-iq.com/guides/league-schedule-communication');
    expect(urls).toContain('https://bracket-iq.com/guides/league-registration');
    expect(urls).toContain('https://bracket-iq.com/guides/league-split-divisions');
    expect(urls).toContain('https://bracket-iq.com/guides/league-playoffs');
    expect(urls).toContain('https://bracket-iq.com/guides/league-standings-playoff-seeding');
    expect(urls).toContain('https://bracket-iq.com/guides/multi-week-league-scheduling');
    expect(urls).toContain('https://bracket-iq.com/guides/manage-league-in-bracketiq');
    expect(urls).toContain('https://bracket-iq.com/guides/create-league-in-bracketiq');
    expect(urls).toContain('https://bracket-iq.com/guides/tournament-results-advancement');
    expect(urls).toContain('https://bracket-iq.com/guides/tournament-registration');
    expect(urls).toContain('https://bracket-iq.com/guides/tournament-pool-play');
    expect(urls).toContain('https://bracket-iq.com/guides/manage-tournament-in-bracketiq');
    expect(urls).toContain('https://bracket-iq.com/guides/create-tournament-in-bracketiq');
    expect(urls).toContain('https://bracket-iq.com/guides/paid-pickup-event-payments');
    expect(urls).toContain('https://bracket-iq.com/o/river-city/events/event_1');
    expect(urls).not.toContain('https://bracket-iq.com/blog/manage-tournament-in-bracketiq');
    expect(new Set(urls).size).toBe(urls.length);
    expect(mockListPublicSitemapEntries).toHaveBeenCalledTimes(1);
  });
});
