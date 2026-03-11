import { render, screen } from '@testing-library/react';
import BlogIndexPage from '../page';

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
