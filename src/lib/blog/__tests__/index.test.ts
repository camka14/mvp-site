import { formatBlogDate, getBlogPostBySlug, getBlogSitemapEntries, getPublishedBlogPosts } from '../index';

describe('blog registry', () => {
  it('returns the published articles newest first', () => {
    const posts = getPublishedBlogPosts();

    expect(posts).toHaveLength(2);
    expect(posts.map((post) => post.slug)).toEqual([
      'create-tournament-in-bracketiq',
      'paid-pickup-event-payments',
    ]);
    expect(posts[0]?.primaryKeyword).toBe('create a sports tournament');
    expect(posts[0]?.createdAt).toBe('2026-05-24');
    expect(posts[0]?.updatedAt).toBe('2026-05-24');
    expect(posts[0]?.author).toEqual({
      name: 'Samuel Razumovskiy',
      image: '/blog/authors/samuel-razumovskiy.jpg',
    });
  });

  it('returns a published post by slug', () => {
    expect(getBlogPostBySlug('create-tournament-in-bracketiq')?.title).toBe(
      'How to Create a Tournament in BracketIQ',
    );
  });

  it('returns null for unknown slugs', () => {
    expect(getBlogPostBySlug('missing-post')).toBeNull();
  });

  it('returns sitemap entries for published posts', () => {
    expect(getBlogSitemapEntries()).toEqual([
      {
        url: 'https://bracket-iq.com/blog/create-tournament-in-bracketiq',
        lastModified: '2026-05-24',
      },
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
