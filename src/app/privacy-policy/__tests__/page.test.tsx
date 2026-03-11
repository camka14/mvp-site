import { render, screen } from '@testing-library/react';
import PrivacyPolicyPage from '../page';

describe('PrivacyPolicyPage', () => {
  it('renders privacy policy content and links to delete-data', () => {
    render(<PrivacyPolicyPage />);

    expect(screen.getByRole('heading', { name: /privacy policy/i })).toBeInTheDocument();
    expect(screen.getByText(/bracketiq by razumly/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /delete data/i })).toHaveAttribute('href', '/delete-data');
    expect(screen.getByRole('link', { name: /support@bracket-iq\.com/i })).toHaveAttribute(
      'href',
      'mailto:support@bracket-iq.com',
    );
    expect(screen.getByText(/messages and files are retained for 90 days before deletion/i)).toBeInTheDocument();
  });
});
