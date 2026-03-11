import { render, screen } from '@testing-library/react';
import DeleteDataPage from '../page';

describe('Delete data page', () => {
  it('renders support instructions, retention windows, and retained record details', () => {
    render(<DeleteDataPage />);

    expect(
      screen.getByRole('heading', {
        name: /delete your bracketiq account data/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /support@bracket-iq\.com/i })).toHaveAttribute(
      'href',
      'mailto:support@bracket-iq.com',
    );
    expect(screen.getByText(/messages are retained for 90 days before deletion/i)).toBeInTheDocument();
    expect(screen.getByText(/files are retained for 90 days before deletion/i)).toBeInTheDocument();
    expect(
      screen.getByText(/signed documents remain on file as a matter of record/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/pending refund requests owed to you/i),
    ).toBeInTheDocument();
  });
});
