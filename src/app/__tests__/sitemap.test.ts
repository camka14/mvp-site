import sitemap from '../sitemap';

describe('sitemap', () => {
  it('includes the blog hub and first article', () => {
    const entries = sitemap();
    const urls = entries.map((entry) => entry.url);

    expect(urls).toContain('https://mvp.razumly.com/blog');
    expect(urls).toContain('https://mvp.razumly.com/blog/tournament-schedule-maker');
  });
});
