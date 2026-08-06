import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import FeedbackForm from '../FeedbackForm';
import { createFeedbackSubmission } from '@/lib/feedbackService';
import { trackFeedbackSubmitted } from '@/lib/analytics/feedbackAnalytics';

jest.mock('@/lib/feedbackService', () => ({
  createFeedbackSubmission: jest.fn(),
}));
jest.mock('@/lib/analytics/feedbackAnalytics', () => ({
  normalizeFeedbackPathCategory: jest.fn(() => 'discover'),
  trackFeedbackSubmitted: jest.fn(),
}));

const createFeedbackMock = createFeedbackSubmission as jest.MockedFunction<typeof createFeedbackSubmission>;

const renderForm = (props: Partial<React.ComponentProps<typeof FeedbackForm>> = {}) => render(
  <MantineProvider>
    <FeedbackForm entrySource="standalone_page" {...props} />
  </MantineProvider>,
);

const successResponse = {
  ok: true as const,
  submission: { id: 'feedback_1', status: 'NEW' as const, createdAt: '2026-08-06T20:00:00.000Z' },
};

describe('FeedbackForm', () => {
  beforeEach(() => {
    createFeedbackMock.mockResolvedValue(successResponse);
  });

  it('shows the correct context field for Bug and Idea types', async () => {
    const user = userEvent.setup();
    renderForm();

    expect(screen.getByLabelText(/what kind of feedback is this/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/what did you expect/i)).not.toBeInTheDocument();
    await user.click(screen.getByText('Bug'));
    expect(screen.getByLabelText(/what did you expect/i)).toBeInTheDocument();
    await user.click(screen.getByText('Idea'));
    expect(screen.getByLabelText(/what are you trying to accomplish/i)).toBeInTheDocument();
  });

  it('uses a unique accessible label id for each form instance', () => {
    render(
      <MantineProvider>
        <FeedbackForm entrySource="standalone_page" />
        <FeedbackForm entrySource="desktop_header" />
      </MantineProvider>,
    );

    const labelIds = screen
      .getAllByLabelText(/what kind of feedback is this/i)
      .map((control) => control.getAttribute('aria-labelledby'));
    expect(new Set(labelIds).size).toBe(2);
  });

  it('does not submit hidden context after switching to General', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByText('Bug'));
    await user.type(screen.getByLabelText(/what did you expect/i), 'I expected the selected court to remain visible.');
    await user.click(screen.getByText('General'));
    await user.type(screen.getByLabelText(/your feedback/i), 'Please make the schedule easier to scan.');
    await user.click(screen.getByRole('button', { name: /send feedback/i }));

    await waitFor(() => expect(createFeedbackMock).toHaveBeenCalled());
    const submittedInput = createFeedbackMock.mock.calls[createFeedbackMock.mock.calls.length - 1]?.[0];
    expect(submittedInput).toEqual(expect.objectContaining({ type: 'GENERAL' }));
    expect(submittedInput).not.toHaveProperty('additionalContext');
  });

  it('keeps fields editable after a recoverable request error', async () => {
    const user = userEvent.setup();
    createFeedbackMock.mockRejectedValue(new Error('Temporary server error'));
    renderForm();

    const message = screen.getByLabelText(/your feedback/i);
    await user.type(message, 'This message should remain after an error.');
    await user.click(screen.getByRole('button', { name: /send feedback/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Temporary server error');
    expect(message).toHaveValue('This message should remain after an error.');
  });

  it('prefills authenticated email and sends it only with consent', async () => {
    const user = userEvent.setup();
    renderForm({ authenticatedEmail: 'member@example.com' });

    await user.click(screen.getByLabelText(/contact me/i));
    expect(screen.getByLabelText(/email address/i)).toHaveValue('member@example.com');
    await user.type(screen.getByLabelText(/your feedback/i), 'Please make the schedule easier to scan.');
    await user.click(screen.getByRole('button', { name: /send feedback/i }));

    await waitFor(() => expect(createFeedbackMock).toHaveBeenCalledWith(expect.objectContaining({
      allowContact: true,
      contactEmail: 'member@example.com',
      sourcePath: '/',
      clientContext: expect.objectContaining({ surface: 'WEB' }),
    })));

    await user.click(screen.getByRole('button', { name: /send another/i }));
    expect(screen.getByLabelText(/contact me/i)).not.toBeChecked();
    await user.type(screen.getByLabelText(/your feedback/i), 'No contact should be included here.');
    await user.click(screen.getByRole('button', { name: /send feedback/i }));
    await waitFor(() => expect(createFeedbackMock).toHaveBeenLastCalledWith(expect.objectContaining({
      allowContact: false,
      contactEmail: undefined,
    })));
  });

  it('applies authenticated email that arrives after the form mounts', async () => {
    const user = userEvent.setup();
    const view = renderForm();

    view.rerender(
      <MantineProvider>
        <FeedbackForm entrySource="standalone_page" authenticatedEmail="member@example.com" />
      </MantineProvider>,
    );
    await user.click(screen.getByLabelText(/contact me/i));

    expect(screen.getByLabelText(/email address/i)).toHaveValue('member@example.com');
  });

  it('shows validation, loading, success, and send-another states', async () => {
    const user = userEvent.setup();
    let resolveRequest: ((value: typeof successResponse) => void) | undefined;
    createFeedbackMock.mockImplementationOnce(() => new Promise((resolve) => {
      resolveRequest = resolve;
    }));
    renderForm();

    await user.click(screen.getByRole('button', { name: /send feedback/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/at least 10 characters/i);

    await user.type(screen.getByLabelText(/your feedback/i), 'This is a valid feedback message.');
    await user.click(screen.getByRole('button', { name: /send feedback/i }));
    expect(screen.getByRole('button', { name: /send feedback/i })).toBeDisabled();
    resolveRequest?.(successResponse);

    expect(await screen.findByTestId('feedback-confirmation')).toBeInTheDocument();
    expect(trackFeedbackSubmitted).toHaveBeenCalledWith(expect.objectContaining({ type: 'GENERAL' }));
    await user.click(screen.getByRole('button', { name: /send another/i }));
    expect(screen.getByLabelText(/your feedback/i)).toHaveValue('');
  });
});
