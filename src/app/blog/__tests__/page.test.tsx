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
  it('lists the published tournament scheduling article', () => {
    render(<BlogIndexPage />);

    expect(
      screen.getByRole('heading', {
        name: /tournament schedule maker: how to build brackets that don’t break on game day/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /read the guide/i })).toHaveAttribute(
      'href',
      '/blog/tournament-schedule-maker',
    );
  });
});
