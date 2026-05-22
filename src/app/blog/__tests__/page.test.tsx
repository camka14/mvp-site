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
  it('lists the published paid pickup event article', () => {
    render(<BlogIndexPage />);

    expect(
      screen.getByRole('heading', {
        name: /how to create a paid pickup sports event with bracketiq/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /read the guide/i })).toHaveAttribute(
      'href',
      '/blog/paid-pickup-event-payments',
    );
  });
});
