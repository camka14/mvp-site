import { formatBlogDate, getBlogPostBySlug, getBlogSitemapEntries, getPublishedBlogPosts } from '../index';

describe('blog registry', () => {
  it('returns the published paid pickup event article', () => {
    const posts = getPublishedBlogPosts();

    expect(posts).toHaveLength(1);
    expect(posts[0]?.slug).toBe('paid-pickup-event-payments');
    expect(posts[0]?.primaryKeyword).toBe('pickup sports event payments');
  });

  it('returns null for unknown slugs', () => {
    expect(getBlogPostBySlug('missing-post')).toBeNull();
  });

  it('returns sitemap entries for published posts', () => {
    expect(getBlogSitemapEntries()).toEqual([
      {
        url: 'https://bracket-iq.com/blog/paid-pickup-event-payments',
        lastModified: '2026-05-22',
      },
    ]);
  });

  it('formats date-only publish dates without timezone drift', () => {
    expect(formatBlogDate('2026-05-22')).toBe('May 22, 2026');
  });
});
