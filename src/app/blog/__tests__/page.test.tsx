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
  it('separates the blog from BracketIQ guides', () => {
    render(<BlogIndexPage />);

    expect(screen.getByRole('link', { name: 'Info' })).toHaveAttribute('href', '/info');
    expect(
      screen.getAllByRole('link', { name: 'Guides' }).some((link) => link.getAttribute('href') === '/guides'),
    ).toBe(true);
    expect(
      screen.getAllByRole('link', { name: 'Blog' }).some((link) => link.getAttribute('href') === '/blog'),
    ).toBe(true);
    expect(screen.queryByRole('link', { name: 'Platform' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Operations' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Integrations' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Fees' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Resources' })).not.toBeInTheDocument();

    expect(screen.getByRole('heading', { name: /articles for hosting better recreational sports events/i })).toBeInTheDocument();
    expect(screen.getByText(/sport-specific hosting articles are coming soon/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /go to guides/i })).toHaveAttribute('href', '/guides');
    expect(screen.queryByRole('link', { name: /^open guide$/i })).not.toBeInTheDocument();
  });
});
