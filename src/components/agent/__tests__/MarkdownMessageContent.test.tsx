import { screen } from '@testing-library/react';
import { renderWithMantine } from '../../../../test/utils/renderWithMantine';
import { MarkdownMessageContent } from '../MarkdownMessageContent';

describe('MarkdownMessageContent', () => {
  it('renders assistant markdown lists and bold emphasis', () => {
    renderWithMantine(
      <MarkdownMessageContent
        content={[
          'You can find your teams on the **Teams** page.',
          '',
          'From any page while signed in:',
          '',
          '1. Look at the **top navigation bar**.',
          '2. Click **Teams**.',
          '',
          'On that page you will see:',
          '- Teams you **belong to**',
          '- Teams you **manage**',
        ].join('\n')}
      />,
    );

    expect(screen.getAllByText('Teams').length).toBeGreaterThan(0);
    expect(screen.getByText('top navigation bar').tagName).toBe('STRONG');
    expect(screen.getAllByRole('list')[0].tagName).toBe('OL');
    expect(screen.getAllByRole('list')[1].tagName).toBe('UL');
    expect(screen.getByText('belong to').tagName).toBe('STRONG');
  });

  it('renders safe links and leaves unsafe markdown links as text', () => {
    renderWithMantine(
      <MarkdownMessageContent content="Open [Teams](/teams) or [bad](javascript:alert(1))." />,
    );

    expect(screen.getByRole('link', { name: 'Teams' })).toHaveAttribute('href', '/teams');
    expect(screen.queryByRole('link', { name: 'bad' })).not.toBeInTheDocument();
    expect(screen.getByText(/javascript:alert/)).toBeInTheDocument();
  });
});
