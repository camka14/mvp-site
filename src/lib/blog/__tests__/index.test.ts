import { getBlogPostBySlug, getBlogSitemapEntries, getPublishedBlogPosts } from '../index';

describe('blog registry', () => {
  it('returns the published tournament article', () => {
    const posts = getPublishedBlogPosts();

    expect(posts).toHaveLength(1);
    expect(posts[0]?.slug).toBe('tournament-schedule-maker');
    expect(posts[0]?.primaryKeyword).toBe('tournament schedule maker');
  });

  it('returns null for unknown slugs', () => {
    expect(getBlogPostBySlug('missing-post')).toBeNull();
  });

  it('returns sitemap entries for published posts', () => {
    expect(getBlogSitemapEntries()).toEqual([
      {
        url: 'https://mvp.razumly.com/blog/tournament-schedule-maker',
        lastModified: '2026-03-18',
      },
    ]);
  });
});
