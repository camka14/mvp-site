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

    expect(posts).toHaveLength(12);
    expect(posts.map((post) => post.slug)).toEqual([
      'league-split-divisions',
      'league-playoffs',
      'league-standings-playoff-seeding',
      'multi-week-league-scheduling',
      'manage-league-in-bracketiq',
      'create-league-in-bracketiq',
      'tournament-results-advancement',
      'tournament-registration',
      'tournament-pool-play',
      'manage-tournament-in-bracketiq',
      'create-tournament-in-bracketiq',
      'paid-pickup-event-payments',
    ]);
    expect(posts[0]?.primaryKeyword).toBe('league split playoff divisions');
    expect(posts[0]?.createdAt).toBe('2026-05-27');
    expect(posts[0]?.updatedAt).toBe('2026-05-27');
    expect(posts[0]?.contentType).toBe('guide');
    expect(posts[0]?.guideTopic).toBe('leagues');
    expect(posts[0]?.canonicalPath).toBe('/guides/league-split-divisions');
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
    const leagueTopic = topics.find((topic) => topic.id === 'leagues');

    expect(tournamentTopic?.posts.map((post) => post.slug)).toEqual([
      'create-tournament-in-bracketiq',
      'tournament-registration',
      'manage-tournament-in-bracketiq',
      'tournament-pool-play',
      'tournament-results-advancement',
    ]);
    expect(eventTopic?.posts.map((post) => post.slug)).toEqual([
      'paid-pickup-event-payments',
    ]);
    expect(leagueTopic?.posts.map((post) => post.slug)).toEqual([
      'create-league-in-bracketiq',
      'manage-league-in-bracketiq',
      'multi-week-league-scheduling',
      'league-standings-playoff-seeding',
      'league-playoffs',
      'league-split-divisions',
    ]);
  });

  it('returns sitemap entries for published content at canonical paths', () => {
    expect(getContentSitemapEntries()).toEqual([
      {
        url: 'https://bracket-iq.com/guides/league-split-divisions',
        lastModified: '2026-05-27',
      },
      {
        url: 'https://bracket-iq.com/guides/league-playoffs',
        lastModified: '2026-05-27',
      },
      {
        url: 'https://bracket-iq.com/guides/league-standings-playoff-seeding',
        lastModified: '2026-05-27',
      },
      {
        url: 'https://bracket-iq.com/guides/multi-week-league-scheduling',
        lastModified: '2026-05-27',
      },
      {
        url: 'https://bracket-iq.com/guides/manage-league-in-bracketiq',
        lastModified: '2026-05-27',
      },
      {
        url: 'https://bracket-iq.com/guides/create-league-in-bracketiq',
        lastModified: '2026-05-26',
      },
      {
        url: 'https://bracket-iq.com/guides/tournament-results-advancement',
        lastModified: '2026-05-26',
      },
      {
        url: 'https://bracket-iq.com/guides/tournament-registration',
        lastModified: '2026-05-26',
      },
      {
        url: 'https://bracket-iq.com/guides/tournament-pool-play',
        lastModified: '2026-05-25',
      },
      {
        url: 'https://bracket-iq.com/guides/manage-tournament-in-bracketiq',
        lastModified: '2026-05-25',
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
