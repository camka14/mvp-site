import {
  formatBlogDate,
  getBlogPostBySlug,
  getContentSitemapEntries,
  getGuidePostBySlug,
  getGuideTopics,
  getPublishedBlogPosts,
  getPublishedGuidePosts,
} from '../index';

describe('blog registry', () => {
  it('returns only non-guide blog articles from the blog list', () => {
    const posts = getPublishedBlogPosts();

    expect(posts).toEqual([]);
  });

  it('returns published guides newest first', () => {
    const posts = getPublishedGuidePosts();

    expect(posts).toHaveLength(3);
    expect(posts.map((post) => post.slug)).toEqual([
      'manage-tournament-in-bracketiq',
      'create-tournament-in-bracketiq',
      'paid-pickup-event-payments',
    ]);
    expect(posts[0]?.primaryKeyword).toBe('manage a sports tournament');
    expect(posts[0]?.createdAt).toBe('2026-05-24');
    expect(posts[0]?.updatedAt).toBe('2026-05-24');
    expect(posts[0]?.contentType).toBe('guide');
    expect(posts[0]?.guideTopic).toBe('tournaments');
    expect(posts[0]?.canonicalPath).toBe('/guides/manage-tournament-in-bracketiq');
    expect(posts[0]?.author).toEqual({
      name: 'Samuel Razumovskiy',
      image: '/blog/authors/samuel-razumovskiy.jpg',
    });
  });

  it('returns a published guide by slug', () => {
    expect(getGuidePostBySlug('manage-tournament-in-bracketiq')?.title).toBe(
      'How to Manage a Tournament in BracketIQ',
    );
  });

  it('keeps guide slugs out of blog lookups', () => {
    expect(getBlogPostBySlug('manage-tournament-in-bracketiq')).toBeNull();
  });

  it('returns null for unknown slugs', () => {
    expect(getBlogPostBySlug('missing-post')).toBeNull();
    expect(getGuidePostBySlug('missing-post')).toBeNull();
  });

  it('groups guides by guide topic', () => {
    const topics = getGuideTopics();
    const tournamentTopic = topics.find((topic) => topic.id === 'tournaments');
    const eventTopic = topics.find((topic) => topic.id === 'events');

    expect(tournamentTopic?.posts.map((post) => post.slug)).toEqual([
      'manage-tournament-in-bracketiq',
      'create-tournament-in-bracketiq',
    ]);
    expect(eventTopic?.posts.map((post) => post.slug)).toEqual([
      'paid-pickup-event-payments',
    ]);
  });

  it('returns sitemap entries for published content at canonical paths', () => {
    expect(getContentSitemapEntries()).toEqual([
      {
        url: 'https://bracket-iq.com/guides/manage-tournament-in-bracketiq',
        lastModified: '2026-05-24',
      },
      {
        url: 'https://bracket-iq.com/guides/create-tournament-in-bracketiq',
        lastModified: '2026-05-24',
      },
      {
        url: 'https://bracket-iq.com/guides/paid-pickup-event-payments',
        lastModified: '2026-05-22',
      },
    ]);
  });

  it('formats date-only publish dates without timezone drift', () => {
    expect(formatBlogDate('2026-05-22')).toBe('May 22, 2026');
  });
});
