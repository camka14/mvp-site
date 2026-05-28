import sitemap from '../sitemap';

describe('sitemap', () => {
  it('includes the blog hub, guide hub, and published content canonical routes', () => {
    const entries = sitemap();
    const urls = entries.map((entry) => entry.url);

    expect(urls).toContain('https://bracket-iq.com/blog');
    expect(urls).toContain('https://bracket-iq.com/guides');
    expect(urls).toContain('https://bracket-iq.com/mobile-app');
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
    expect(urls).not.toContain('https://bracket-iq.com/blog/manage-tournament-in-bracketiq');
  });
});
