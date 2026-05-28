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

    const expectedEventGuideOrder = [
      'How to Create a Paid Pickup Sports Event With BracketIQ',
      'How to Set Up Online Registration for a League or Tournament',
    ];
    const renderedEventGuideOrder = screen
      .getAllByRole('link')
      .map((link) => link.textContent?.replace(/\s+/g, ' ').trim())
      .filter((text): text is string => Boolean(text && expectedEventGuideOrder.includes(text)));

    expect(renderedEventGuideOrder).toEqual(expectedEventGuideOrder);

    const expectedTournamentGuideOrder = [
      'How to Create a Tournament in BracketIQ',
      'How to Set Up Tournament Registration for Teams and Players',
      'How to Manage a Tournament in BracketIQ',
      'How to Run a Tournament With Pool Play',
      'How to Manage Tournament Results, Standings, and Advancement',
    ];
    const renderedTournamentGuideOrder = screen
      .getAllByRole('link')
      .map((link) => link.textContent?.replace(/\s+/g, ' ').trim())
      .filter((text): text is string => Boolean(text && expectedTournamentGuideOrder.includes(text)));

    expect(renderedTournamentGuideOrder).toEqual(expectedTournamentGuideOrder);

    const expectedLeagueGuideOrder = [
      'How to Create a League in BracketIQ',
      'How to Set Up League Registration for Teams and Players',
      'How to Manage a League in BracketIQ',
      'How to Schedule a Multi-Week Sports League',
      'How to Communicate Schedule Changes During a League Season',
      'How to Manage League Standings and Playoff Seeding',
      'How to Run a League With Playoffs',
      'How to Run a League With Separate Regular Season and Playoff Divisions',
    ];
    const renderedLeagueGuideOrder = screen
      .getAllByRole('link')
      .map((link) => link.textContent?.replace(/\s+/g, ' ').trim())
      .filter((text): text is string => Boolean(text && expectedLeagueGuideOrder.includes(text)));

    expect(renderedLeagueGuideOrder).toEqual(expectedLeagueGuideOrder);

    expect(
      screen.getAllByRole('link', { name: 'How to Set Up Tournament Registration for Teams and Players' })
        .some((link) => link.getAttribute('href') === '/guides/tournament-registration'),
    ).toBe(true);
    expect(
      screen.getAllByRole('link', { name: 'How to Run a Tournament With Pool Play' })
        .some((link) => link.getAttribute('href') === '/guides/tournament-pool-play'),
    ).toBe(true);
    expect(
      screen.getAllByRole('link', { name: 'How to Manage Tournament Results, Standings, and Advancement' })
        .some((link) => link.getAttribute('href') === '/guides/tournament-results-advancement'),
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
    expect(
      screen.getAllByRole('link', { name: 'How to Set Up Online Registration for a League or Tournament' })
        .some((link) => link.getAttribute('href') === '/guides/registration-league-tournament'),
    ).toBe(true);
    expect(
      screen.getAllByRole('link', { name: 'How to Create a League in BracketIQ' })
        .some((link) => link.getAttribute('href') === '/guides/create-league-in-bracketiq'),
    ).toBe(true);
    expect(
      screen.getAllByRole('link', { name: 'How to Set Up League Registration for Teams and Players' })
        .some((link) => link.getAttribute('href') === '/guides/league-registration'),
    ).toBe(true);
    expect(
      screen.getAllByRole('link', { name: 'How to Manage a League in BracketIQ' })
        .some((link) => link.getAttribute('href') === '/guides/manage-league-in-bracketiq'),
    ).toBe(true);
    expect(
      screen.getAllByRole('link', { name: 'How to Schedule a Multi-Week Sports League' })
        .some((link) => link.getAttribute('href') === '/guides/multi-week-league-scheduling'),
    ).toBe(true);
    expect(
      screen.getAllByRole('link', { name: 'How to Communicate Schedule Changes During a League Season' })
        .some((link) => link.getAttribute('href') === '/guides/league-schedule-communication'),
    ).toBe(true);
    expect(
      screen.getAllByRole('link', { name: 'How to Manage League Standings and Playoff Seeding' })
        .some((link) => link.getAttribute('href') === '/guides/league-standings-playoff-seeding'),
    ).toBe(true);
    expect(
      screen.getAllByRole('link', { name: 'How to Run a League With Playoffs' })
        .some((link) => link.getAttribute('href') === '/guides/league-playoffs'),
    ).toBe(true);
    expect(
      screen.getAllByRole('link', { name: 'How to Run a League With Separate Regular Season and Playoff Divisions' })
        .some((link) => link.getAttribute('href') === '/guides/league-split-divisions'),
    ).toBe(true);
  });
});
