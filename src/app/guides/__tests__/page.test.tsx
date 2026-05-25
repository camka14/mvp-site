import { render, screen } from '@testing-library/react';
import GuidesPage from '../page';

jest.mock('@/app/providers', () => ({
  useApp: () => ({
    user: null,
    isAuthenticated: false,
    isGuest: false,
  }),
}));

describe('GuidesPage', () => {
  it('shows an app overview while guide links stay in the left nav', () => {
    render(<GuidesPage />);

    expect(screen.getByRole('link', { name: 'Info' })).toHaveAttribute('href', '/info');
    expect(
      screen.getAllByRole('link', { name: 'Guides' }).some((link) => link.getAttribute('href') === '/guides'),
    ).toBe(true);
    expect(
      screen.getAllByRole('link', { name: 'Blog' }).some((link) => link.getAttribute('href') === '/blog'),
    ).toBe(true);

    expect(
      screen.getByRole('heading', { name: /learn the bracketiq workflows that run your events/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /guide home/i })).toHaveAttribute('href', '/guides');
    expect(screen.getByText(/use this page to understand what the platform can manage/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /what bracketiq helps you run/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /payments and registration/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /day-of operations/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /facility and club workflows/i })).toBeInTheDocument();
    expect(screen.queryByText(/4 published guides/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /events guides/i })).not.toBeInTheDocument();

    expect(screen.getAllByText('Events').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Tournaments').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Leagues').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Organizations').length).toBeGreaterThan(0);

    expect(
      screen.getAllByRole('link', { name: 'How to Run a Tournament With Pool Play' })
        .some((link) => link.getAttribute('href') === '/guides/tournament-pool-play'),
    ).toBe(true);
    expect(
      screen.getAllByRole('link', { name: 'How to Manage a Tournament in BracketIQ' })
        .some((link) => link.getAttribute('href') === '/guides/manage-tournament-in-bracketiq'),
    ).toBe(true);
    expect(
      screen.getAllByRole('link', { name: 'How to Create a Tournament in BracketIQ' })
        .some((link) => link.getAttribute('href') === '/guides/create-tournament-in-bracketiq'),
    ).toBe(true);
    expect(
      screen.getAllByRole('link', { name: 'How to Create a Paid Pickup Sports Event With BracketIQ' })
        .some((link) => link.getAttribute('href') === '/guides/paid-pickup-event-payments'),
    ).toBe(true);
  });
});
