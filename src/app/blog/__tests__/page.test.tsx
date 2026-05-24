import { render, screen } from '@testing-library/react';
import BlogIndexPage from '../page';

jest.mock('@/app/providers', () => ({
  useApp: () => ({
    user: null,
    isAuthenticated: false,
    isGuest: false,
  }),
}));

describe('BlogIndexPage', () => {
  it('lists the published blog articles', () => {
    render(<BlogIndexPage />);

    expect(screen.getByRole('link', { name: 'Info' })).toHaveAttribute('href', '/info');
    expect(
      screen.getAllByRole('link', { name: 'Blog' }).some((link) => link.getAttribute('href') === '/blog'),
    ).toBe(true);
    expect(screen.queryByRole('link', { name: 'Platform' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Operations' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Integrations' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Fees' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Resources' })).not.toBeInTheDocument();

    expect(
      screen.getAllByRole('heading', {
        name: /how to create a tournament in bracketiq/i,
      }),
    ).not.toHaveLength(0);
    expect(
      screen.getByRole('heading', {
        name: /how to create a paid pickup sports event with bracketiq/i,
      }),
    ).toBeInTheDocument();

    const guideHrefs = screen
      .getAllByRole('link', { name: /read the guide/i })
      .map((link) => link.getAttribute('href'));

    expect(guideHrefs).toEqual([
      '/blog/create-tournament-in-bracketiq',
      '/blog/paid-pickup-event-payments',
    ]);
  });
});
