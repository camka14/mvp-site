import { render, screen } from '@testing-library/react';
import TermsPage, { metadata } from '../page';

describe('TermsPage', () => {
  it('renders the expanded Terms and EULA content', () => {
    render(<TermsPage />);

    expect(
      screen.getByRole('heading', {
        name: /bracketiq terms of service and end user license agreement/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/last updated: june 10, 2026/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /quickbooks and external services/i })).toBeInTheDocument();
    expect(screen.getByText(/bracketiq is not a payroll provider/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /quickbooks online terms/i })).toHaveAttribute(
      'href',
      'https://www.intuit.com/legal/terms/en-us/quickbooks/online/',
    );
    expect(screen.getByRole('link', { name: /privacy policy/i })).toHaveAttribute('href', '/privacy-policy');
  });

  it('publishes /terms as the canonical agreement URL', () => {
    expect(metadata.alternates).toEqual(expect.objectContaining({ canonical: '/terms' }));
  });
});
