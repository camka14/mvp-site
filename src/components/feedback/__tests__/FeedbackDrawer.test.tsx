import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import FeedbackDrawer from '../FeedbackDrawer';
import { createFeedbackSubmission } from '@/lib/feedbackService';
import { trackFeedbackOpened } from '@/lib/analytics/feedbackAnalytics';

jest.mock('@/lib/feedbackService', () => ({
  createFeedbackSubmission: jest.fn(),
}));
jest.mock('@/lib/analytics/feedbackAnalytics', () => ({
  normalizeFeedbackPathCategory: jest.fn(() => 'discover'),
  trackFeedbackOpened: jest.fn(),
  trackFeedbackSubmitted: jest.fn(),
}));

const createFeedbackMock = createFeedbackSubmission as jest.MockedFunction<typeof createFeedbackSubmission>;

const renderDrawer = (opened = true, onClose = jest.fn()) => render(
  <MantineProvider>
    <button type="button">Feedback trigger</button>
    <FeedbackDrawer opened={opened} onClose={onClose} entrySource="desktop_header" />
  </MantineProvider>,
);

describe('FeedbackDrawer', () => {
  beforeEach(() => {
    createFeedbackMock.mockResolvedValue({
      ok: true,
      submission: { id: 'feedback_1', status: 'NEW', createdAt: '2026-08-06T20:00:00.000Z' },
    });
  });

  it('tracks one opened transition and preserves a draft when closed and reopened', async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();
    const view = renderDrawer(true, onClose);

    expect(await screen.findByRole('heading', { name: /send feedback/i })).toBeInTheDocument();
    expect(trackFeedbackOpened).toHaveBeenCalledTimes(1);
    await user.type(screen.getByLabelText(/your feedback/i), 'Keep this draft while I inspect another page.');
    await user.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(onClose).toHaveBeenCalled();

    view.rerender(
      <MantineProvider>
        <button type="button">Feedback trigger</button>
        <FeedbackDrawer opened={false} onClose={onClose} entrySource="desktop_header" />
      </MantineProvider>,
    );
    view.rerender(
      <MantineProvider>
        <button type="button">Feedback trigger</button>
        <FeedbackDrawer opened onClose={onClose} entrySource="desktop_header" />
      </MantineProvider>,
    );

    await waitFor(() => expect(screen.getByLabelText(/your feedback/i)).toHaveValue('Keep this draft while I inspect another page.'));
    await waitFor(() => expect(trackFeedbackOpened).toHaveBeenCalledTimes(2));
  });

  it('supports keyboard close and clears the form after Done', async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();
    renderDrawer(true, onClose);

    await user.type(screen.getByLabelText(/your feedback/i), 'A complete feedback message for the drawer.');
    await user.click(screen.getByRole('button', { name: /send feedback/i }));
    expect(await screen.findByTestId('feedback-confirmation')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^done$/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
