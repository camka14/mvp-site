import sitemap from '../sitemap';

describe('sitemap', () => {
  it('includes the blog hub and published articles', () => {
    const entries = sitemap();
    const urls = entries.map((entry) => entry.url);

    expect(urls).toContain('https://bracket-iq.com/blog');
    expect(urls).toContain('https://bracket-iq.com/blog/create-tournament-in-bracketiq');
    expect(urls).toContain('https://bracket-iq.com/blog/paid-pickup-event-payments');
  });
});
