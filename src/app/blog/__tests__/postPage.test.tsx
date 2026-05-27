const mockRedirect = jest.fn((url: string) => {
  throw new Error(`redirect:${url}`);
});

jest.mock('next/navigation', () => ({
  notFound: jest.fn(() => {
    throw new Error('not-found');
  }),
  redirect: (url: string) => mockRedirect(url),
}));

import BlogPostPage, { generateStaticParams } from '../[slug]/page';

describe('BlogPostPage', () => {
  beforeEach(() => {
    mockRedirect.mockClear();
  });

  it('keeps guide slugs in static params so old blog URLs can redirect', () => {
    expect(generateStaticParams()).toEqual([
      { slug: 'league-playoffs' },
      { slug: 'league-standings-playoff-seeding' },
      { slug: 'multi-week-league-scheduling' },
      { slug: 'manage-league-in-bracketiq' },
      { slug: 'create-league-in-bracketiq' },
      { slug: 'tournament-results-advancement' },
      { slug: 'tournament-registration' },
      { slug: 'tournament-pool-play' },
      { slug: 'manage-tournament-in-bracketiq' },
      { slug: 'create-tournament-in-bracketiq' },
      { slug: 'paid-pickup-event-payments' },
    ]);
  });

  it('redirects guide slugs to the guide canonical route', async () => {
    await expect(
      BlogPostPage({ params: Promise.resolve({ slug: 'paid-pickup-event-payments' }) }),
    ).rejects.toThrow('redirect:/guides/paid-pickup-event-payments');

    expect(mockRedirect).toHaveBeenCalledWith('/guides/paid-pickup-event-payments');
  });
});
