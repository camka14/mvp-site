import { render, screen } from '@testing-library/react';
import SiteFooter from '../SiteFooter';

describe('SiteFooter', () => {
  it('renders legal and support links', () => {
    render(<SiteFooter />);

    expect(screen.getByText(/bracketiq by razumly/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /blog/i })).toHaveAttribute('href', '/blog');
    expect(screen.getByRole('link', { name: /privacy policy/i })).toHaveAttribute('href', '/privacy-policy');
    expect(screen.getByRole('link', { name: /delete data/i })).toHaveAttribute('href', '/delete-data');
    expect(screen.getByRole('link', { name: /support@bracket-iq\.com/i })).toHaveAttribute(
      'href',
      'mailto:support@bracket-iq.com',
    );
  });
});
